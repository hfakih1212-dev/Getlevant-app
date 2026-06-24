import React, { useCallback, useState } from 'react'
import {
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
    region !== null &&
    !saving

  // ---- Submit ----
  const handleSubmit = useCallback(async () => {
    setFormError(null)

    if (!name.trim()) {
      setFormError('Store name is required.')
      return
    }
    if (!region) {
      setFormError('Please select a region.')
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
  }, [name, description, normalizedPhone, region, user?.id, navigation])

  // ---- Render ----
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
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
            <Text style={styles.welcomeTitle}>Open Your Store</Text>
            <Text style={styles.welcomeBody}>
              You're one step away from reaching customers across Lebanon.
              Fill in your store details to get started.
            </Text>
          </View>

          {/* ── Store details ── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Store Details</Text>

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

            <Text style={styles.inputLabel}>
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
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Contact</Text>

            <Text style={styles.inputLabel}>
              WhatsApp Number <Text style={styles.optional}>(optional)</Text>
            </Text>
            <TextInput
              style={styles.input}
              value={whatsapp}
              onChangeText={setWhatsapp}
              placeholder="+961 70 123 456 or 03 123 456"
              placeholderTextColor="#B0A090"
              keyboardType="phone-pad"
              returnKeyType="done"
            />
            {/* Live normalization preview */}
            {whatsapp.trim().length > 0 && (
              <Text style={styles.phonePreview}>
                Saved as: <Text style={styles.phonePreviewValue}>{normalizedPhone}</Text>
              </Text>
            )}
            <Text style={styles.fieldHint}>
              Local formats (03…, 70…) are automatically converted to international format.
            </Text>
          </View>

          {/* ── Region ── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Region <Text style={styles.required}>*</Text>
            </Text>
            <Text style={styles.fieldHint}>
              Where are your products primarily shipped from?
            </Text>

            <View style={styles.pillGrid}>
              {LEBANON_REGIONS.map(r => {
                const selected = region === r
                return (
                  <TouchableOpacity
                    key={r}
                    style={[styles.pill, selected && styles.pillSelected]}
                    onPress={() => setRegion(r)}
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
            <Text style={styles.submitBtnText}>
              {saving ? 'Opening your store…' : 'Open My Store'}
            </Text>
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
  safe: { flex: 1, backgroundColor: '#FAF7F2' },
  flex: { flex: 1 },

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
    backgroundColor: '#C8622A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  brandMarkText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FAF7F2',
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
  required:     { color: '#C8622A' },
  optional:     { fontWeight: '400', color: '#7A6A5A' },
  fieldHint: {
    fontSize: 12,
    color: '#7A6A5A',
    lineHeight: 17,
    marginTop: -4,
  },

  // Inputs
  input: {
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
    backgroundColor: '#FAF7F2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pillSelected: {
    backgroundColor: '#C8622A',
    borderColor:     '#C8622A',
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1C1612',
  },
  pillTextSelected: {
    color: '#FAF7F2',
  },

  // Inline error
  formError: {
    fontSize: 13,
    color: '#C8622A',
    textAlign: 'center',
    paddingHorizontal: 8,
  },

  // Sticky bottom
  bottomBar: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    backgroundColor: '#FAF7F2',
    borderTopWidth: 1,
    borderTopColor: '#E8E0D5',
  },
  submitBtn: {
    backgroundColor: '#C8622A',
    borderRadius: 12,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitBtnDisabled: { opacity: 0.38 },
  submitBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FAF7F2',
    letterSpacing: 0.3,
  },
})
