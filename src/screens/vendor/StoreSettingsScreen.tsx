import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { SafeAreaView } from 'react-native-safe-area-context'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/useAuthStore'
import type { VendorStackParamList } from '../../navigation/RootNavigator'

type Props = NativeStackScreenProps<VendorStackParamList, 'StoreSettings'>

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LEBANON_REGIONS = [
  'Beirut',
  'Mount Lebanon',
  'North',
  'South',
  'Bekaa',
  'Nabatieh',
  'Akkar',
  'Baalbek-Hermel',
] as const

type LebanonRegion = typeof LEBANON_REGIONS[number]

function normalizePhone(raw: string): string {
  const cleaned = raw.replace(/[\s\-\(\)\.]/g, '')
  if (!cleaned) return ''
  if (cleaned.startsWith('+'))   return cleaned
  if (cleaned.startsWith('00'))  return '+' + cleaned.slice(2)
  if (cleaned.startsWith('961')) return '+' + cleaned
  if (cleaned.startsWith('0'))   return '+961' + cleaned.slice(1)
  return '+961' + cleaned
}

// ---------------------------------------------------------------------------
// StoreSettingsScreen
// ---------------------------------------------------------------------------

export default function StoreSettingsScreen({ navigation }: Props) {
  const user = useAuthStore(s => s.user)

  const [storeId,     setStoreId]     = useState<string | null>(null)
  const [name,        setName]        = useState('')
  const [description, setDescription] = useState('')
  const [whatsapp,    setWhatsapp]    = useState('')
  const [region,      setRegion]      = useState<LebanonRegion | null>(null)

  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const [logoUrl,       setLogoUrl]       = useState<string | null>(null)
  const [logoUploading, setLogoUploading] = useState(false)
  const [logoError,     setLogoError]     = useState<string | null>(null)

  const normalizedPhone = normalizePhone(whatsapp)

  // ---- Load existing store ----

  useEffect(() => {
    if (!user?.id) return
    let cancelled = false

    async function load() {
      const { data, error: fetchErr } = await supabase
        .from('stores')
        .select('id, name, description, whatsapp, region, logo_url')
        .eq('owner_id', user!.id)
        .maybeSingle()

      if (cancelled) return

      if (fetchErr) {
        setError(fetchErr.message)
        setLoading(false)
        return
      }

      if (data) {
        setStoreId(data.id)
        setName(data.name ?? '')
        setDescription(data.description ?? '')
        setWhatsapp(data.whatsapp ?? '')
        setRegion((data.region as LebanonRegion) ?? null)
        setLogoUrl(data.logo_url)
      }

      setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [user?.id])

  // ---- Save ----

  const canSave = name.trim().length > 0 && !saving

  const handleSave = useCallback(async () => {
    if (!storeId || !canSave) return
    setError(null)
    setSaving(true)

    const { error: updateErr } = await supabase
      .from('stores')
      .update({
        name:        name.trim(),
        description: description.trim() || null,
        whatsapp:    normalizedPhone || null,
        region:      region!,
      })
      .eq('id', storeId)

    if (updateErr) {
      setError(updateErr.message)
    } else {
      setSaved(true)
      setTimeout(() => navigation.goBack(), 900)
    }

    setSaving(false)
  }, [storeId, canSave, name, description, normalizedPhone, region, navigation])

  // ---- Logo upload — stored beside product photos under the store's folder ----

  const handlePickLogo = useCallback(async () => {
    if (!storeId || logoUploading) return
    setLogoError(null)

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      setLogoError('Allow photo library access in Settings to upload a logo.')
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    })
    if (result.canceled || result.assets.length === 0) return

    setLogoUploading(true)
    try {
      const uri  = result.assets[0].uri
      const ext  = uri.split('.').pop()?.toLowerCase() ?? 'jpg'
      const path = `${storeId}/logo-${Date.now()}.${ext}`

      const response = await fetch(uri)
      const blob     = await response.blob()
      const { error: uploadErr } = await supabase.storage
        .from('product-images')
        .upload(path, blob, { contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}` })
      if (uploadErr) throw uploadErr

      const { data: { publicUrl } } = supabase.storage
        .from('product-images')
        .getPublicUrl(path)

      const { error: updateErr } = await supabase
        .from('stores')
        .update({ logo_url: publicUrl })
        .eq('id', storeId)
      if (updateErr) throw updateErr

      setLogoUrl(publicUrl)
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : 'Upload failed. Try again.')
    } finally {
      setLogoUploading(false)
    }
  }, [storeId, logoUploading])

  // ---- Render ----

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, styles.centered]}>
        <ActivityIndicator size="large" color="#D9552B" />
      </SafeAreaView>
    )
  }

  if (!storeId) {
    return (
      <SafeAreaView style={[styles.safe, styles.centered]}>
        <Text style={styles.errorText}>No store found for your account.</Text>
        <TouchableOpacity style={styles.backLink} onPress={() => navigation.goBack()}>
          <Text style={styles.backLinkText}>Go back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Store Settings</Text>
          <View style={styles.headerRight} />
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Logo ── */}
          <Text style={styles.sectionLabel}>STORE LOGO</Text>
          <View style={styles.card}>
            <View style={styles.logoRow}>
              {logoUrl ? (
                <Image source={{ uri: logoUrl }} style={styles.logoPreview} resizeMode="cover" />
              ) : (
                <View style={styles.logoFallback}>
                  <Text style={styles.logoFallbackText}>
                    {name.trim().charAt(0).toUpperCase() || '?'}
                  </Text>
                </View>
              )}
              <View style={styles.logoBody}>
                <Text style={styles.fieldHint}>
                  Shown on your storefront and product pages. Square images look best.
                </Text>
                <TouchableOpacity
                  style={[styles.logoBtn, logoUploading && styles.logoBtnDisabled]}
                  onPress={handlePickLogo}
                  disabled={logoUploading}
                  activeOpacity={0.8}
                >
                  {logoUploading ? (
                    <ActivityIndicator size="small" color="#D9552B" />
                  ) : (
                    <Text style={styles.logoBtnText}>
                      {logoUrl ? 'Change Logo' : 'Upload Logo'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
            {logoError ? <Text style={styles.errorText}>{logoError}</Text> : null}
          </View>

          {/* ── Store Details ── */}
          <Text style={styles.sectionLabel}>STORE DETAILS</Text>
          <View style={styles.card}>
            <Text style={styles.inputLabel}>
              Store Name <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Nour Handmade Jewelry"
              placeholderTextColor="#B0A090"
              returnKeyType="next"
              autoCapitalize="words"
            />

            <Text style={[styles.inputLabel, { marginTop: 4 }]}>
              Description <Text style={styles.optional}>(optional)</Text>
            </Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              value={description}
              onChangeText={setDescription}
              placeholder="Tell shoppers what makes your store special…"
              placeholderTextColor="#B0A090"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>

          {/* ── Contact ── */}
          <Text style={styles.sectionLabel}>WHATSAPP CONTACT</Text>
          <View style={styles.card}>
            <Text style={styles.inputLabel}>
              WhatsApp Number <Text style={styles.optional}>(optional)</Text>
            </Text>
            <Text style={styles.fieldHint}>
              Vendors with a WhatsApp number receive new-order notifications instantly.
            </Text>
            <TextInput
              style={[styles.input, { marginTop: 6 }]}
              value={whatsapp}
              onChangeText={setWhatsapp}
              placeholder="+961 70 123 456 or 03 123 456"
              placeholderTextColor="#B0A090"
              keyboardType="phone-pad"
              returnKeyType="done"
            />
            {whatsapp.trim().length > 0 && (
              <Text style={styles.phonePreview}>
                Saves as: <Text style={styles.phonePreviewValue}>{normalizedPhone}</Text>
              </Text>
            )}
          </View>

          {/* ── Region ── */}
          <Text style={styles.sectionLabel}>REGION</Text>
          <View style={styles.card}>
            <Text style={styles.fieldHint}>
              Select your primary area, or leave blank if you deliver nationwide.
            </Text>
            <View style={styles.pillGrid}>
              {LEBANON_REGIONS.map(r => {
                const selected = region === r
                return (
                  <TouchableOpacity
                    key={r}
                    style={[styles.pill, selected && styles.pillSelected]}
                    onPress={() => setRegion(prev => prev === r ? null : r)}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.pillText, selected && styles.pillTextSelected]}>
                      {r}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>

          {error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : null}

          <View style={{ height: 24 }} />
        </ScrollView>

        {/* ── Sticky save ── */}
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={[styles.saveBtn, !canSave && styles.saveBtnDisabled, saved && styles.saveBtnSaved]}
            onPress={handleSave}
            disabled={!canSave || saved}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.saveBtnText}>{saved ? 'Saved ✓' : 'Save Changes'}</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: '#FFFFFF' },
  flex:    { flex: 1 },
  centered: { justifyContent: 'center', alignItems: 'center' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#ECE6DC',
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
    gap: 8,
  },

  // Section label
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7A6A5A',
    letterSpacing: 0.8,
    paddingHorizontal: 4,
    marginTop: 8,
    marginBottom: 2,
  },

  // Card
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    gap: 8,
    shadowColor: '#1C1612',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },

  // Labels
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1C1612',
  },
  required: { color: '#D9552B' },
  optional: { fontWeight: '400', color: '#7A6A5A' },
  fieldHint: {
    fontSize: 12,
    color: '#7A6A5A',
    lineHeight: 17,
  },

  // Inputs
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#D9CFC4',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#1C1612',
    minHeight: 48,
  },
  inputMultiline: {
    minHeight: 88,
    paddingTop: 12,
  },

  // Phone preview
  phonePreview: {
    fontSize: 12,
    color: '#7A6A5A',
    marginTop: -2,
  },
  phonePreviewValue: {
    fontWeight: '700',
    color: '#1C1612',
  },

  // Region pills
  pillGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  pill: {
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#D9CFC4',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pillSelected:     { backgroundColor: '#D9552B', borderColor: '#D9552B' },
  pillText:         { fontSize: 13, fontWeight: '600', color: '#1C1612' },
  pillTextSelected: { color: '#FFFFFF' },

  // Error
  errorText: {
    fontSize: 13,
    color: '#D9552B',
    textAlign: 'center',
    paddingHorizontal: 8,
  },

  // Back link (no-store state)
  backLink: {
    marginTop: 16,
    height: 44,
    paddingHorizontal: 24,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#D9552B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backLinkText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#D9552B',
  },

  // Sticky bottom
  bottomBar: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#ECE6DC',
  },
  saveBtn: {
    backgroundColor: '#D9552B',
    borderRadius: 28,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.38 },
  saveBtnSaved:    { backgroundColor: '#2D7A4F', opacity: 1 },

  // Logo
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  logoPreview: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F0E9DF',
  },
  logoFallback: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#1C1612',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoFallbackText: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  logoBody: {
    flex: 1,
    gap: 8,
  },
  logoBtn: {
    alignSelf: 'flex-start',
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#D9552B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoBtnDisabled: { opacity: 0.5 },
  logoBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#D9552B',
  },
  saveBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
})
