import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/useAuthStore'
import type { Json } from '../../types/supabase'

// ---------------------------------------------------------------------------
// Notification preference types
// ---------------------------------------------------------------------------

interface NotifPrefs {
  order_updates:      boolean
  promotions:         boolean
  whatsapp_reminders: boolean
}

const DEFAULT_PREFS: NotifPrefs = {
  order_updates:      true,
  promotions:         false,
  whatsapp_reminders: true,
}

function parseNotifPrefs(raw: Json): NotifPrefs {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ...DEFAULT_PREFS }
  }
  const obj = raw as Record<string, Json>
  return {
    order_updates:
      typeof obj.order_updates === 'boolean'
        ? obj.order_updates
        : DEFAULT_PREFS.order_updates,
    promotions:
      typeof obj.promotions === 'boolean'
        ? obj.promotions
        : DEFAULT_PREFS.promotions,
    whatsapp_reminders:
      typeof obj.whatsapp_reminders === 'boolean'
        ? obj.whatsapp_reminders
        : DEFAULT_PREFS.whatsapp_reminders,
  }
}

// ---------------------------------------------------------------------------
// Mock Expo push token generator
// Produces a realistic ExponentPushToken[…] string for DB testing
// ---------------------------------------------------------------------------

function normalizePhone(raw: string): string {
  const cleaned = raw.replace(/[\s\-\(\)\.]/g, '')
  if (!cleaned) return ''
  if (cleaned.startsWith('+'))   return cleaned
  if (cleaned.startsWith('00'))  return '+' + cleaned.slice(2)
  if (cleaned.startsWith('961')) return '+' + cleaned
  if (cleaned.startsWith('0'))   return '+961' + cleaned.slice(1)
  return '+961' + cleaned
}

function generateMockExpoToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'
  let body = ''
  for (let i = 0; i < 22; i++) {
    body += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return `ExponentPushToken[${body}]`
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionCard({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>
}

function SectionLabel({ text }: { text: string }) {
  return <Text style={styles.sectionLabel}>{text}</Text>
}

type ToggleRowProps = {
  label: string
  hint?: string
  value: boolean
  onValueChange: (v: boolean) => void
  loading?: boolean
  isLast?: boolean
}

function ToggleRow({ label, hint, value, onValueChange, loading, isLast }: ToggleRowProps) {
  return (
    <View style={[styles.row, !isLast && styles.rowBorder]}>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      </View>
      {loading ? (
        <ActivityIndicator size="small" color="#C8622A" style={styles.rowSpinner} />
      ) : (
        <Switch
          value={value}
          onValueChange={onValueChange}
          trackColor={{ false: '#D9CFC4', true: '#C8622A' }}
          thumbColor={Platform.OS === 'android' ? '#FAF7F2' : undefined}
          ios_backgroundColor="#D9CFC4"
        />
      )}
    </View>
  )
}

type InfoRowProps = {
  label: string
  value: string
  isLast?: boolean
}

function InfoRow({ label, value, isLast }: InfoRowProps) {
  return (
    <View style={[styles.row, !isLast && styles.rowBorder]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  )
}

// ---------------------------------------------------------------------------
// ProfileScreen
// ---------------------------------------------------------------------------

export default function ProfileScreen() {
  const navigation  = useNavigation()
  const user        = useAuthStore(s => s.user)
  const signOut     = useAuthStore(s => s.signOut)
  const refreshUser = useAuthStore(s => s.refreshUser)

  // Fresh user row from DB (notification_prefs and push_token may have changed)
  const [prefs,       setPrefs]       = useState<NotifPrefs>(DEFAULT_PREFS)
  const [pushToken,   setPushToken]   = useState<string | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [savingPref,  setSavingPref]  = useState<keyof NotifPrefs | null>(null)
  const [registering,   setRegistering]   = useState(false)
  const [becomingVendor,   setBecomingVendor]   = useState(false)
  const [confirmSignOut,   setConfirmSignOut]   = useState(false)
  const [signingOut,       setSigningOut]       = useState(false)

  // Phone number
  const [phoneInput,  setPhoneInput]  = useState('')
  const [savedPhone,  setSavedPhone]  = useState<string | null>(null)
  const [savingPhone, setSavingPhone] = useState(false)
  const normalizedPhone = normalizePhone(phoneInput)

  // ---- Load fresh user row ----

  useEffect(() => {
    if (!user?.id) return
    let cancelled = false

    async function fetchUser() {
      const { data } = await supabase
        .from('users')
        .select('notification_prefs, push_token, phone')
        .eq('id', user!.id)
        .maybeSingle()

      if (cancelled) return
      if (!data) { setLoading(false); return }
      setPrefs(parseNotifPrefs(data.notification_prefs))
      setPushToken(data.push_token)
      const p = data.phone ?? null
      setSavedPhone(p)
      setPhoneInput(p ?? '')
      setLoading(false)
    }

    fetchUser()
    return () => { cancelled = true }
  }, [user?.id])

  // ---- Toggle a notification preference ----

  const handleToggle = useCallback(
    async (key: keyof NotifPrefs, value: boolean) => {
      if (!user?.id) return

      const next: NotifPrefs = { ...prefs, [key]: value }
      setPrefs(next)          // optimistic
      setSavingPref(key)

      const { error } = await supabase
        .from('users')
        .update({ notification_prefs: next as unknown as Json })
        .eq('id', user.id)

      if (error) {
        setPrefs(prefs)       // roll back
        Alert.alert('Update Failed', error.message)
      }

      setSavingPref(null)
    },
    [prefs, user?.id],
  )

  // ---- Save phone number ----

  const handleSavePhone = useCallback(async () => {
    if (!user?.id) return
    const phone = normalizedPhone || null
    setSavingPhone(true)
    const { error } = await supabase
      .from('users')
      .update({ phone })
      .eq('id', user.id)
    if (error) {
      Alert.alert('Update Failed', error.message)
    } else {
      setSavedPhone(phone)
    }
    setSavingPhone(false)
  }, [user?.id, normalizedPhone])

  // ---- Re-register push token ----

  const handleReregister = useCallback(async () => {
    if (!user?.id) return
    setRegistering(true)

    const token = generateMockExpoToken()

    const { error } = await supabase
      .from('users')
      .update({ push_token: token })
      .eq('id', user.id)

    if (error) {
      Alert.alert('Registration Failed', error.message)
    } else {
      setPushToken(token)
      Alert.alert('Device Registered', 'Push token updated successfully.')
    }

    setRegistering(false)
  }, [user?.id])

  // ---- Become a vendor ----

  const handleBecomeVendor = useCallback(() => {
    Alert.alert(
      'Start Selling on Souk',
      "You'll be taken to set up your store. Your account will switch to Vendor mode.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          onPress: async () => {
            setBecomingVendor(true)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase.rpc as any)('become_vendor')
            if (error) {
              Alert.alert('Error', error.message)
              setBecomingVendor(false)
              return
            }
            await refreshUser()
            // Navigator auto-switches to VendorStack once user.role === 'vendor'
          },
        },
      ],
    )
  }, [refreshUser])

  // ---- Sign out ----

  const handleSignOut = useCallback(async () => {
    if (!confirmSignOut) {
      setConfirmSignOut(true)
      return
    }
    setSigningOut(true)
    await signOut()
  }, [confirmSignOut, signOut])

  // ---- Avatar initial ----

  const contact = user?.phone ?? user?.email ?? ''
  const initial = contact.trim().replace(/^\+/, '').charAt(0).toUpperCase() || '?'
  const roleLabel = user?.role === 'vendor' ? 'Vendor' : 'Shopper'

  // ---- Render ----

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={styles.headerRight} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#C8622A" />
        </View>
      ) : (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Account card ── */}
          <SectionCard>
            <View style={styles.avatarRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initial}</Text>
              </View>
              <View style={styles.avatarInfo}>
                <Text style={styles.contactText} numberOfLines={1}>
                  {contact || '—'}
                </Text>
                <View style={[styles.roleBadge, user?.role === 'vendor' ? styles.roleBadgeVendor : styles.roleBadgeShopper]}>
                  <Text style={[styles.roleBadgeText, user?.role === 'vendor' ? styles.roleBadgeVendorText : styles.roleBadgeShopperText]}>
                    {roleLabel}
                  </Text>
                </View>
              </View>
            </View>
          </SectionCard>

          {/* ── Phone number ── */}
          <SectionLabel text="WhatsApp Contact" />
          <SectionCard>
            <View style={styles.phoneRow}>
              <View style={styles.phoneLabelCol}>
                <Text style={styles.rowLabel}>Phone Number</Text>
                <Text style={styles.rowHint}>Used to send you order updates via WhatsApp</Text>
                {phoneInput.trim().length > 0 && (
                  <Text style={styles.phonePreview}>
                    Saves as: <Text style={styles.phonePreviewValue}>{normalizedPhone}</Text>
                  </Text>
                )}
              </View>
            </View>
            <View style={styles.phoneInputRow}>
              <TextInput
                style={styles.phoneInput}
                value={phoneInput}
                onChangeText={setPhoneInput}
                placeholder="+961 70 123 456 or 03 123 456"
                placeholderTextColor="#B0A090"
                keyboardType="phone-pad"
                returnKeyType="done"
              />
              <TouchableOpacity
                style={[
                  styles.phoneSaveBtn,
                  (savingPhone || normalizedPhone === savedPhone) && styles.phoneSaveBtnDisabled,
                ]}
                onPress={handleSavePhone}
                disabled={savingPhone || normalizedPhone === savedPhone}
                activeOpacity={0.8}
              >
                {savingPhone ? (
                  <ActivityIndicator size="small" color="#FAF7F2" />
                ) : (
                  <Text style={styles.phoneSaveBtnText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </SectionCard>

          {/* ── Notification preferences ── */}
          <SectionLabel text="Notification Preferences" />
          <SectionCard>
            <ToggleRow
              label="Order Updates"
              hint="Shipping and status changes for your orders"
              value={prefs.order_updates}
              onValueChange={v => handleToggle('order_updates', v)}
              loading={savingPref === 'order_updates'}
            />
            <ToggleRow
              label="Promotional Offers"
              hint="Deals, new arrivals, and curated picks"
              value={prefs.promotions}
              onValueChange={v => handleToggle('promotions', v)}
              loading={savingPref === 'promotions'}
            />
            <ToggleRow
              label="WhatsApp Reminders"
              hint="Order confirmations and delivery alerts via WhatsApp"
              value={prefs.whatsapp_reminders}
              onValueChange={v => handleToggle('whatsapp_reminders', v)}
              loading={savingPref === 'whatsapp_reminders'}
              isLast
            />
          </SectionCard>

          {/* ── Device / Push token ── */}
          <SectionLabel text="Device Notifications" />
          <SectionCard>
            <InfoRow
              label="Push Token"
              value={pushToken ? 'Registered' : 'Not registered'}
            />
            {pushToken ? (
              <View style={[styles.row, styles.rowBorder]}>
                <Text style={styles.tokenPreview} numberOfLines={1} ellipsizeMode="middle">
                  {pushToken}
                </Text>
              </View>
            ) : null}
            <View style={[styles.row, styles.rowSingle]}>
              <TouchableOpacity
                style={[styles.reregisterBtn, registering && styles.reregisterBtnDisabled]}
                onPress={handleReregister}
                disabled={registering}
                activeOpacity={0.8}
              >
                {registering ? (
                  <ActivityIndicator size="small" color="#C8622A" />
                ) : (
                  <Text style={styles.reregisterBtnText}>Re-register Device Notifications</Text>
                )}
              </TouchableOpacity>
            </View>
          </SectionCard>

          {/* ── Become a vendor (shoppers only) ── */}
          {user?.role === 'shopper' && (
            <>
              <SectionLabel text="Sell on Souk" />
              <SectionCard>
                <View style={styles.vendorPromo}>
                  <Text style={styles.vendorPromoTitle}>Become a Vendor</Text>
                  <Text style={styles.vendorPromoHint}>
                    List your products and reach shoppers across your region.
                  </Text>
                </View>
                <View style={[styles.row, styles.rowSingle]}>
                  <TouchableOpacity
                    style={[styles.vendorBtn, becomingVendor && styles.vendorBtnDisabled]}
                    onPress={handleBecomeVendor}
                    disabled={becomingVendor}
                    activeOpacity={0.8}
                  >
                    {becomingVendor ? (
                      <ActivityIndicator size="small" color="#FAF7F2" />
                    ) : (
                      <Text style={styles.vendorBtnText}>Start Selling</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </SectionCard>
            </>
          )}

          {/* ── Sign out ── */}
          <SectionLabel text="Account" />
          <SectionCard>
            {confirmSignOut ? (
              <View style={styles.signOutConfirmRow}>
                <TouchableOpacity
                  style={styles.signOutCancelBtn}
                  onPress={() => setConfirmSignOut(false)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.signOutCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.signOutConfirmBtn}
                  onPress={handleSignOut}
                  disabled={signingOut}
                  activeOpacity={0.8}
                >
                  {signingOut
                    ? <ActivityIndicator size="small" color="#FAF7F2" />
                    : <Text style={styles.signOutConfirmText}>Yes, sign out</Text>
                  }
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.signOutBtn}
                onPress={handleSignOut}
                activeOpacity={0.8}
              >
                <Text style={styles.signOutText}>Sign Out</Text>
              </TouchableOpacity>
            )}
          </SectionCard>

          <View style={{ height: 32 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FAF7F2' },
  flex: { flex: 1 },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E8E0D5',
  },
  backBtn:     { width: 40, height: 44, justifyContent: 'center' },
  backIcon:    { fontSize: 22, color: '#1C1612', lineHeight: 26 },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: '#1C1612',
  },
  headerRight: { width: 40 },

  // Scroll
  scrollContent: {
    padding: 16,
    gap: 6,
  },

  // Section label (above cards)
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7A6A5A',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 4,
    marginTop: 12,
    marginBottom: 4,
  },

  // Card shell
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#1C1612',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },

  // Avatar / account row
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 14,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#C8622A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FAF7F2',
  },
  avatarInfo: {
    flex: 1,
    gap: 6,
  },
  contactText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1C1612',
  },
  roleBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
  },
  roleBadgeVendor:      { backgroundColor: '#FFEDD5' },
  roleBadgeShopper:     { backgroundColor: '#DBEAFE' },
  roleBadgeVendorText:  { fontSize: 11, fontWeight: '700', color: '#9A3412' },
  roleBadgeShopperText: { fontSize: 11, fontWeight: '700', color: '#1E3A8A' },
  roleBadgeText:        { fontSize: 11, fontWeight: '700' },

  // Generic rows inside cards
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 56,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F0EBE3',
  },
  rowSingle: {
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    paddingRight: 12,
    gap: 2,
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1612',
  },
  rowHint: {
    fontSize: 12,
    color: '#7A6A5A',
    lineHeight: 16,
  },
  rowValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#7A6A5A',
  },
  rowSpinner: {
    width: 51,    // same width as a Switch to prevent layout shift
    alignItems: 'flex-end',
  },

  // Push token display
  tokenPreview: {
    flex: 1,
    fontSize: 11,
    color: '#7A6A5A',
    fontVariant: ['tabular-nums'],
  },

  // Re-register button
  reregisterBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#C8622A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  reregisterBtnDisabled: { opacity: 0.4 },
  reregisterBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#C8622A',
  },

  // Phone section
  phoneRow: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  phoneLabelCol: {
    gap: 3,
  },
  phonePreview: {
    fontSize: 12,
    color: '#7A6A5A',
    marginTop: 2,
  },
  phonePreviewValue: {
    fontWeight: '700',
    color: '#1C1612',
  },
  phoneInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 10,
  },
  phoneInput: {
    flex: 1,
    backgroundColor: '#FAF7F2',
    borderWidth: 1.5,
    borderColor: '#D9CFC4',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#1C1612',
    minHeight: 48,
  },
  phoneSaveBtn: {
    height: 48,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: '#C8622A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  phoneSaveBtnDisabled: { opacity: 0.38 },
  phoneSaveBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FAF7F2',
  },

  // Become a vendor
  vendorPromo: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 4,
  },
  vendorPromoTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1C1612',
  },
  vendorPromoHint: {
    fontSize: 13,
    color: '#7A6A5A',
    lineHeight: 18,
  },
  vendorBtn: {
    flex: 1,
    height: 48,
    borderRadius: 10,
    backgroundColor: '#C8622A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  vendorBtnDisabled: { opacity: 0.4 },
  vendorBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FAF7F2',
  },

  // Sign out
  signOutBtn: {
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  signOutText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#C8622A',
  },
  signOutConfirmRow: {
    flexDirection: 'row',
    padding: 12,
    gap: 10,
  },
  signOutCancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#D9CFC4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  signOutCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#7A6A5A',
  },
  signOutConfirmBtn: {
    flex: 1,
    height: 48,
    borderRadius: 10,
    backgroundColor: '#C8622A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  signOutConfirmText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FAF7F2',
  },
})
