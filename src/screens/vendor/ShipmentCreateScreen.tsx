import React, { useCallback, useState } from 'react'
import {
  Alert,
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
import { Database } from '../../types/supabase'
import type { VendorStackParamList } from '../../navigation/RootNavigator'

type Props = NativeStackScreenProps<VendorStackParamList, 'ShipmentCreate'>
type CourierType = Database['public']['Enums']['courier_type']

// ---------------------------------------------------------------------------
// Courier options
// ---------------------------------------------------------------------------

const COURIER_OPTIONS: { value: CourierType; label: string }[] = [
  { value: 'aramex',        label: 'Aramex'        },
  { value: 'dhl',           label: 'DHL'           },
  { value: 'fedex',         label: 'FedEx'         },
  { value: 'tnt',           label: 'TNT'           },
  { value: 'local_courier', label: 'Local Courier' },
  { value: 'internal',      label: 'Internal'      },
  { value: 'other',         label: 'Other'         },
]

// ---------------------------------------------------------------------------
// ShipmentCreateScreen
// ---------------------------------------------------------------------------

export default function ShipmentCreateScreen({ route, navigation }: Props) {
  const { orderId, orderNumber } = route.params

  const [courierType,   setCourierType]   = useState<CourierType | null>(null)
  const [courierName,   setCourierName]   = useState('')
  const [trackingId,    setTrackingId]    = useState('')
  const [courierPhone,  setCourierPhone]  = useState('')
  const [submitting,    setSubmitting]    = useState(false)

  const canSubmit =
    courierType !== null &&
    courierName.trim().length > 0 &&
    !submitting

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return
    setSubmitting(true)

    const { error } = await supabase
      .from('shipments')
      .insert({
        order_id:      orderId,
        courier_type:  courierType!,
        courier_name:  courierName.trim(),
        tracking_id:   trackingId.trim()   || null,
        courier_phone: courierPhone.trim() || null,
        status:        'pending',
      })

    if (error) {
      Alert.alert('Failed to Create Shipment', error.message)
      setSubmitting(false)
      return
    }

    navigation.goBack()
  }, [canSubmit, orderId, courierType, courierName, trackingId, courierPhone, navigation])

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
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Assign Courier</Text>
            <Text style={styles.headerSub}>{orderNumber}</Text>
          </View>
          <View style={styles.headerRight} />
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Courier type ── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Courier Service</Text>
            <View style={styles.pillGrid}>
              {COURIER_OPTIONS.map((opt) => {
                const selected = courierType === opt.value
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.pill, selected && styles.pillSelected]}
                    onPress={() => setCourierType(opt.value)}
                    activeOpacity={0.75}
                  >
                    <Text
                      style={[styles.pillText, selected && styles.pillTextSelected]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>

          {/* ── Courier details ── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Courier Details</Text>

            <Text style={styles.inputLabel}>
              Courier Name <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={styles.input}
              value={courierName}
              onChangeText={setCourierName}
              placeholder="Full name or branch (e.g. John — Beirut Hub)"
              placeholderTextColor="#B0A090"
              returnKeyType="next"
            />

            <Text style={styles.inputLabel}>Tracking ID <Text style={styles.optional}>(optional)</Text></Text>
            <TextInput
              style={[styles.input, styles.inputMono]}
              value={trackingId}
              onChangeText={setTrackingId}
              placeholder="e.g. 1Z999AA10123456784"
              placeholderTextColor="#B0A090"
              autoCapitalize="characters"
              returnKeyType="next"
            />

            <Text style={styles.inputLabel}>Courier Phone <Text style={styles.optional}>(optional)</Text></Text>
            <TextInput
              style={styles.input}
              value={courierPhone}
              onChangeText={setCourierPhone}
              placeholder="+961 XX XXX XXX"
              placeholderTextColor="#B0A090"
              keyboardType="phone-pad"
              returnKeyType="done"
            />
          </View>
        </ScrollView>

        {/* ── Sticky bottom ── */}
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={!canSubmit}
            activeOpacity={0.85}
          >
            <Text style={styles.submitBtnText}>
              {submitting ? 'Assigning…' : 'Assign Courier'}
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
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E8E0D5',
  },
  backBtn:      { width: 40, height: 44, justifyContent: 'center' },
  backIcon:     { fontSize: 22, color: '#1C1612', lineHeight: 26 },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1C1612',
  },
  headerSub: {
    fontSize: 12,
    color: '#7A6A5A',
    letterSpacing: 0.5,
    marginTop: 1,
  },
  headerRight: { width: 40 },
  // Scroll
  scrollContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 24,
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
  // Courier type pill grid
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
    backgroundColor: '#C8622A',
    borderColor: '#C8622A',
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1C1612',
  },
  pillTextSelected: {
    color: '#FAF7F2',
  },
  // Inputs
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1C1612',
  },
  required: {
    color: '#C8622A',
  },
  optional: {
    fontWeight: '400',
    color: '#7A6A5A',
  },
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
  inputMono: {
    letterSpacing: 0.5,
  },
  // Bottom bar
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
