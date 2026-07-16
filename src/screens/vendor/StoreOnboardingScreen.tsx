import React, { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useT } from '../../lib/i18n'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/useAuthStore'
import type { VendorStackParamList } from '../../navigation/RootNavigator'

type Props = NativeStackScreenProps<VendorStackParamList, 'StoreOnboarding'>

// ---------------------------------------------------------------------------
// Lebanon region options
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

// ---------------------------------------------------------------------------
// Phone normalization — handles common Lebanese formats
// ---------------------------------------------------------------------------

function normalizePhone(raw: string): string {
  // Strip whitespace, dashes, dots, parens
  const cleaned = raw.replace(/[\s\-\(\)\.]/g, '')
  if (!cleaned) return ''
  if (cleaned.startsWith('+'))    return cleaned           // already E.164
  if (cleaned.startsWith('00'))   return '+' + cleaned.slice(2)
  if (cleaned.startsWith('961'))  return '+' + cleaned     // missing leading +
  if (cleaned.startsWith('0'))    return '+961' + cleaned.slice(1)
  return '+961' + cleaned                                  // bare local digits
}

// ---------------------------------------------------------------------------
// StoreOnboardingScreen
// ---------------------------------------------------------------------------

export default function StoreOnboardingScreen({ navigation }: Props) {
  const user = useAuthStore(s => s.user)
  const t = useT()

  const [name,        setName]        = useState('')
  const [description, setDescription] = useState('')
  const [whatsapp,    setWhatsapp]    = useState('')
  const [region,      setRegion]      = useState<LebanonRegion | null>(null)
  const [saving,      setSaving]      = useState(false)
  const [formError,   setFormError]   = useState<string | null>(null)

  // ---- Derived phone preview ----
  const normalizedPhone = normalizePhone(whatsapp)

  // ---- Validation ----
  const canSubmit =
    name.trim().length > 0 &&
    !saving

  // ---- Submit ----
  const handleSubmit = useCallback(async () => {
    setFormError(null)

    if (!name.trim()) {
      setFormError(t('onboarding.nameRequired'))
      return
    }
    if (!user?.id) return

    setSaving(true)

    const { error } = await supabase
      .from('stores')
      .insert({
        owner_id:    user.id,
        name:        name.trim(),
        description: description.trim() || null,
        whatsapp:    normalizedPhone || null,
        region:      region,
        status:      'active',
      })

    if (error) {
      setFormError(error.message)
      setSaving(false)
      return
    }

    // Replace this screen with a fresh VendorDashboard — store now exists
    navigation.replace('VendorDashboard')
  }, [name, description, normalizedPhone, region, user?.id, navigation, t])

  // ---- Render ----
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.contentWrap}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Brand header ── */}
          <View style={styles.brand}>
            <View style={styles.brandMark}>
              <Text style={styles.brandMarkText}>S</Text>
            </View>
            <Text style={styles.brandName}>Souk</Text>
          </View>

          {/* ── Welcome copy ── */}
          <View style={styles.welcome}>
            <Text style={styles.welcomeTitle}>{t('onboarding.title')}</Text>
            <Text style={styles.welcomeBody}>{t('onboarding.body')}</Text>
          </View>

          {/* ── Store details ── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('onboarding.storeDetails')}</Text>

            <Text style={styles.inputLabel}>
              {t('onboarding.storeName')} <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder={t('onboarding.storeNamePlaceholder')}
              placeholderTextColor="#B0A090"
              returnKeyType="next"
              autoCapitalize="words"
            />

            <Text style={styles.inputLabel}>
              {t('onboarding.description')} <Text style={styles.optional}>{t('common.optional')}</Text>
            </Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              value={description}
              onChangeText={setDescription}
              placeholder={t('onboarding.descriptionPlaceholder')}
              placeholderTextColor="#B0A090"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>

          {/* ── Contact ── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('onboarding.contact')}</Text>

            <Text style={styles.inputLabel}>
              {t('onboarding.whatsappNumber')} <Text style={styles.optional}>{t('common.optional')}</Text>
            </Text>
            <TextInput
              style={styles.input}
              value={whatsapp}
              onChangeText={setWhatsapp}
              placeholder="+961 70 123 456 / 03 123 456"
              placeholderTextColor="#B0A090"
              keyboardType="phone-pad"
              returnKeyType="done"
            />
            {/* Live normalization preview */}
            {whatsapp.trim().length > 0 && (
              <Text style={styles.phonePreview}>
                {t('onboarding.savedAs')} <Text style={styles.phonePreviewValue}>{normalizedPhone}</Text>
              </Text>
            )}
            <Text style={styles.fieldHint}>{t('onboarding.phoneHint')}</Text>
          </View>

          {/* ── Region ── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {t('onboarding.region')} <Text style={styles.optional}>{t('common.optional')}</Text>
            </Text>
            <Text style={styles.fieldHint}>{t('onboarding.regionHint')}</Text>

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
                      {t(`region.${r}`)}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>

          {/* Inline error */}
          {formError ? (
            <Text style={styles.formError}>{formError}</Text>
          ) : null}

          {/* Bottom padding so sticky bar doesn't cover content */}
          <View style={{ height: 24 }} />
        </ScrollView>

        {/* ── Sticky submit ── */}
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={!canSubmit}
            activeOpacity={0.85}
          >
            {saving
              ? <ActivityIndicator color="#FFFFFF" />
              : <Text style={styles.submitBtnText}>{t('onboarding.submit')}</Text>
            }
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
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  flex: { flex: 1 },
  // Cap content at phone scale on wide displays
  contentWrap: {
    flex: 1,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },

  scrollContent: {
    padding: 20,
    gap: 16,
  },

  // Brand header
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
    marginTop: 8,
  },
  brandMark: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#D9552B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  brandMarkText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 28,
  },
  brandName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1C1612',
    letterSpacing: -0.5,
  },

  // Welcome
  welcome: {
    gap: 8,
    marginBottom: 4,
  },
  welcomeTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1C1612',
    letterSpacing: -0.5,
  },
  welcomeBody: {
    fontSize: 15,
    color: '#7A6A5A',
    lineHeight: 22,
  },

  // Section cards
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    gap: 10,
    shadowColor: '#1C1612',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1C1612',
    marginBottom: 2,
  },

  // Labels / hints
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1C1612',
  },
  required:     { color: '#D9552B' },
  optional:     { fontWeight: '400', color: '#7A6A5A' },
  fieldHint: {
    fontSize: 12,
    color: '#7A6A5A',
    lineHeight: 17,
    marginTop: -4,
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

  // Phone normalization preview
  phonePreview: {
    fontSize: 12,
    color: '#7A6A5A',
    marginTop: -4,
  },
  phonePreviewValue: {
    fontWeight: '700',
    color: '#1C1612',
  },

  // Region pill grid
  pillGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
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
  pillSelected: {
    backgroundColor: '#D9552B',
    borderColor:     '#D9552B',
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1C1612',
  },
  pillTextSelected: {
    color: '#FFFFFF',
  },

  // Inline error
  formError: {
    fontSize: 13,
    color: '#D9552B',
    textAlign: 'center',
    paddingHorizontal: 8,
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
  submitBtn: {
    backgroundColor: '#D9552B',
    borderRadius: 28,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitBtnDisabled: { opacity: 0.38 },
  submitBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
})
