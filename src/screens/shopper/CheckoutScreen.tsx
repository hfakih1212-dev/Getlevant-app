import React, { useCallback, useEffect, useMemo, useState } from 'react'
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
import { useAuthStore } from '../../store/useAuthStore'
import { useCartStore } from '../../store/useCartStore'
import { Database } from '../../types/supabase'
import type { ShopperStackParamList } from '../../navigation/RootNavigator'
import { notifyNewOrder } from '../../lib/whatsapp'

type Props = NativeStackScreenProps<ShopperStackParamList, 'Checkout'>
type PaymentMethod = Database['public']['Enums']['payment_method']

// ---------------------------------------------------------------------------
// Payment method options
// ---------------------------------------------------------------------------

const PAYMENT_OPTIONS: {
  value: PaymentMethod
  label: string
  description: string
}[] = [
  {
    value: 'whatsapp',
    label: 'WhatsApp',
    description: 'Coordinate payment directly with the vendor over WhatsApp',
  },
  {
    value: 'cash_on_delivery',
    label: 'Cash on Delivery',
    description: 'Pay in cash when your order arrives at your door',
  },
  {
    value: 'bank_transfer',
    label: 'Bank Transfer',
    description: 'Transfer directly to the vendor\'s bank account',
  },
]

// ---------------------------------------------------------------------------
// CheckoutScreen
// ---------------------------------------------------------------------------

export default function CheckoutScreen({ navigation }: Props) {
  const user      = useAuthStore((s) => s.user)
  const items     = useCartStore((s) => s.items)
  const clearCart = useCartStore((s) => s.clearCart)

  const [street,        setStreet]        = useState('')
  const [landmark,      setLandmark]      = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null)
  const [placing,       setPlacing]       = useState(false)

  // Navigate back if bag is somehow empty (e.g. cleared externally)
  useEffect(() => {
    if (items.length === 0) navigation.goBack()
  }, [items.length])

  const subtotal = useMemo(
    () => items.reduce((sum, i) => sum + i.priceUsd * i.quantity, 0),
    [items],
  )

  const canPlace =
    street.trim().length > 0 &&
    paymentMethod !== null &&
    items.length > 0 &&
    !placing

  const buildAddress = useCallback((): string => {
    const parts = [street.trim()]
    if (landmark.trim()) parts.push(`Landmark: ${landmark.trim()}`)
    return parts.join('\n')
  }, [street, landmark])

  // ---- Order placement ----

  const handlePlaceOrder = useCallback(async () => {
    if (!canPlace || !user) return

    // Single-store constraint: one order = one store
    const storeIds = new Set(items.map((i) => i.storeId))
    if (storeIds.size > 1) {
      Alert.alert(
        'Multiple Stores',
        'Your bag contains items from different stores. Please keep items from one store per order.',
      )
      return
    }

    setPlacing(true)

    try {
      // Step A — insert the order header
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          shopper_id:       user.id,
          store_id:         items[0].storeId,
          status:           'placed',
          payment_method:   paymentMethod!,
          payment_status:   'pending',
          subtotal_usd:     subtotal,
          delivery_fee_usd: 0,
          total_usd:        subtotal,
          delivery_address: buildAddress(),
          whatsapp_sent:    false,
        })
        .select('id, order_number')
        .single()

      if (orderError) throw orderError

      // Step B — insert line items, snapshotting the current unit price
      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(
          items.map((i) => ({
            order_id:       order.id,
            product_id:     i.productId,
            variant_id:     i.variantId,
            quantity:       i.quantity,
            unit_price_usd: i.priceUsd,
          })),
        )

      if (itemsError) throw itemsError

      notifyNewOrder(order.id)
      clearCart()
      navigation.navigate('OrderConfirmation', {
        orderNumber: order.order_number ?? '',
      })
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Something went wrong. Please try again.'

      const isStockError =
        msg.includes('P0001') ||
        /out.of.stock/i.test(msg) ||
        /insufficient.stock/i.test(msg)

      Alert.alert(
        isStockError ? 'Out of Stock' : 'Order Failed',
        isStockError
          ? 'One or more items in your bag are out of stock. Please review your cart and try again.'
          : msg,
      )
      setPlacing(false)
    }
  }, [canPlace, user, items, paymentMethod, subtotal, buildAddress, clearCart, navigation])

  // ---- Render ----

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Checkout</Text>
          <View style={styles.headerRight} />
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Order Summary ── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Order Summary</Text>

            {items.map((item) => {
              const variant = [item.size, item.color].filter(Boolean).join(' · ')
              return (
                <View
                  key={`${item.productId}__${item.variantId}`}
                  style={styles.summaryRow}
                >
                  <View style={styles.summaryLeft}>
                    <Text style={styles.summaryName} numberOfLines={1}>
                      {item.quantity}× {item.name}
                    </Text>
                    {variant ? (
                      <Text style={styles.summaryVariant}>{variant}</Text>
                    ) : null}
                  </View>
                  <Text style={styles.summaryPrice}>
                    ${(item.priceUsd * item.quantity).toFixed(0)}
                  </Text>
                </View>
              )
            })}

            <View style={styles.divider} />

            <View style={styles.summaryRow}>
              <Text style={styles.subtotalLabel}>Subtotal</Text>
              <Text style={styles.subtotalValue}>${subtotal.toFixed(2)} USD</Text>
            </View>
          </View>

          {/* ── Delivery Details ── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Delivery Details</Text>

            <Text style={styles.inputLabel}>Street / Area</Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              value={street}
              onChangeText={setStreet}
              placeholder="Building name, floor, street name, and neighbourhood"
              placeholderTextColor="#B0A090"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              returnKeyType="next"
            />

            <Text style={styles.inputLabel}>
              Landmark{' '}
              <Text style={styles.inputLabelAccent}>(critical for local couriers)</Text>
            </Text>
            <TextInput
              style={styles.input}
              value={landmark}
              onChangeText={setLandmark}
              placeholder="e.g. opposite the blue mosque, next to ABC pharmacy"
              placeholderTextColor="#B0A090"
              returnKeyType="done"
            />
            <Text style={styles.inputHint}>
              A precise landmark greatly speeds up delivery and reduces missed drops.
            </Text>
          </View>

          {/* ── Payment Method ── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Payment Method</Text>

            {PAYMENT_OPTIONS.map((opt) => {
              const isSelected = paymentMethod === opt.value
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.paymentOption,
                    isSelected && styles.paymentOptionSelected,
                  ]}
                  onPress={() => setPaymentMethod(opt.value)}
                  activeOpacity={0.8}
                >
                  <View style={styles.paymentBody}>
                    <Text
                      style={[
                        styles.paymentLabel,
                        isSelected && styles.paymentLabelSelected,
                      ]}
                    >
                      {opt.label}
                    </Text>
                    <Text
                      style={[
                        styles.paymentDesc,
                        isSelected && styles.paymentDescSelected,
                      ]}
                    >
                      {opt.description}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.radioOuter,
                      isSelected && styles.radioOuterSelected,
                    ]}
                  >
                    {isSelected && <View style={styles.radioInner} />}
                  </View>
                </TouchableOpacity>
              )
            })}
          </View>
        </ScrollView>

        {/* ── Sticky bottom bar ── */}
        <View style={styles.bottomBar}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>${subtotal.toFixed(2)} USD</Text>
          </View>
          <TouchableOpacity
            style={[styles.placeBtn, !canPlace && styles.placeBtnDisabled]}
            onPress={handlePlaceOrder}
            disabled={!canPlace}
            activeOpacity={0.85}
          >
            <Text style={styles.placeBtnText}>
              {placing ? 'Placing Order…' : 'Place Order'}
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
  backBtn:     { width: 40, height: 44, justifyContent: 'center' },
  backIcon:    { fontSize: 22, color: '#1C1612', lineHeight: 26 },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1612',
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
  divider: {
    height: 1,
    backgroundColor: '#F0EBE3',
    marginVertical: 2,
  },
  // Order summary
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  summaryLeft:  { flex: 1 },
  summaryName: {
    fontSize: 13,
    fontWeight: '500',
    color: '#1C1612',
    lineHeight: 18,
  },
  summaryVariant: {
    fontSize: 11,
    color: '#7A6A5A',
    marginTop: 1,
  },
  summaryPrice: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1C1612',
  },
  subtotalLabel: { fontSize: 13, fontWeight: '600', color: '#7A6A5A' },
  subtotalValue: { fontSize: 14, fontWeight: '700', color: '#1C1612' },
  // Address inputs
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1C1612',
  },
  inputLabelAccent: {
    fontWeight: '400',
    color: '#C8622A',
    fontStyle: 'italic',
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
  inputMultiline: {
    minHeight: 88,
    paddingTop: 12,
  },
  inputHint: {
    fontSize: 11,
    color: '#7A6A5A',
    lineHeight: 15,
    marginTop: -2,
  },
  // Payment options
  paymentOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E8E0D5',
    backgroundColor: '#FAF7F2',
    minHeight: 60,
  },
  paymentOptionSelected: {
    borderColor: '#C8622A',
    backgroundColor: '#FFF8F4',
  },
  paymentBody:  { flex: 1 },
  paymentLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1612',
  },
  paymentLabelSelected: { color: '#C8622A' },
  paymentDesc: {
    fontSize: 11,
    color: '#7A6A5A',
    marginTop: 2,
    lineHeight: 15,
  },
  paymentDescSelected: { color: '#A0522D' },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#D9CFC4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioOuterSelected: { borderColor: '#C8622A' },
  radioInner: {
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: '#C8622A',
  },
  // Bottom bar
  bottomBar: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 16,
    backgroundColor: '#FAF7F2',
    borderTopWidth: 1,
    borderTopColor: '#E8E0D5',
    gap: 14,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: { fontSize: 14, fontWeight: '500', color: '#7A6A5A' },
  totalValue: { fontSize: 22, fontWeight: '700', color: '#1C1612' },
  placeBtn: {
    backgroundColor: '#C8622A',
    borderRadius: 12,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeBtnDisabled: { opacity: 0.38 },
  placeBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FAF7F2',
    letterSpacing: 0.3,
  },
})
