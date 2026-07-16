import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { LEBANON_REGIONS, LebanonRegion } from '../../lib/catalog'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/useAuthStore'
import { useCartStore } from '../../store/useCartStore'
import { Database } from '../../types/supabase'
import type { ShopperStackParamList } from '../../navigation/RootNavigator'
import { notifyNewOrder } from '../../lib/whatsapp'
import { pushNotifyNewOrder } from '../../lib/push'

type Props = NativeStackScreenProps<ShopperStackParamList, 'Checkout'>
type PaymentMethod = Database['public']['Enums']['payment_method']

// ---------------------------------------------------------------------------
// Payment method options
// ---------------------------------------------------------------------------

interface Voucher {
  id: string
  code: string
  discount_pct: number
}

// Labels come from the `payment.*` / `payment.*Desc` i18n keys
const PAYMENT_OPTIONS: { value: PaymentMethod }[] = [
  { value: 'whatsapp' },
  { value: 'cash_on_delivery' },
  { value: 'bank_transfer' },
]

// ---------------------------------------------------------------------------
// CheckoutScreen
// ---------------------------------------------------------------------------

export default function CheckoutScreen({ navigation }: Props) {
  const t = useT()
  const user      = useAuthStore((s) => s.user)
  const items     = useCartStore((s) => s.items)
  const clearCart = useCartStore((s) => s.clearCart)

  const [street,        setStreet]        = useState('')
  const [landmark,      setLandmark]      = useState('')
  const [region,        setRegion]        = useState<LebanonRegion | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null)
  const [placing,       setPlacing]       = useState(false)
  const [orderError,    setOrderError]    = useState<string | null>(null)
  const orderPlacedRef = useRef(false)

  // Vouchers — active rewards selectable as one-tap discounts
  const [vouchers,        setVouchers]        = useState<Voucher[]>([])
  const [selectedVoucher, setSelectedVoucher] = useState<Voucher | null>(null)

  // Referral — first-time buyers can enter a friend's code
  const [showReferral,    setShowReferral]    = useState(false)
  const [referralInput,   setReferralInput]   = useState('')
  const [referralApplied, setReferralApplied] = useState(false)
  const [referralBusy,    setReferralBusy]    = useState(false)
  const [referralError,   setReferralError]   = useState<string | null>(null)

  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    async function loadPerks() {
      const [rewardsRes, userRes] = await Promise.all([
        supabase
          .from('rewards')
          .select('id, code, discount_pct')
          .eq('user_id', user!.id)
          .eq('status', 'active')
          .order('discount_pct', { ascending: false }),
        supabase
          .from('users')
          .select('completed_orders_count, referred_by')
          .eq('id', user!.id)
          .maybeSingle(),
      ])
      if (cancelled) return
      setVouchers(rewardsRes.data ?? [])
      // Referral entry only makes sense before the first completed order
      setShowReferral(
        userRes.data?.completed_orders_count === 0 && userRes.data?.referred_by === null,
      )
    }
    loadPerks()
    return () => { cancelled = true }
  }, [user?.id])

  const handleApplyReferral = useCallback(async () => {
    const code = referralInput.trim()
    if (!code || referralBusy) return
    setReferralBusy(true)
    setReferralError(null)
    const { error } = await supabase.rpc('redeem_referral', { p_code: code })
    if (error) {
      setReferralError(error.message)
    } else {
      setReferralApplied(true)
      setShowReferral(false)
    }
    setReferralBusy(false)
  }, [referralInput, referralBusy])

  // Navigate back if bag is somehow empty (e.g. cleared externally),
  // but NOT after we just placed an order (clearCart fires mid-navigation).
  useEffect(() => {
    if (items.length === 0 && !orderPlacedRef.current) navigation.goBack()
  }, [items.length])

  const subtotal = useMemo(
    () => items.reduce((sum, i) => sum + i.priceUsd * i.quantity, 0),
    [items],
  )

  // Preview only — the orders_apply_voucher trigger does the authoritative math
  const discount = selectedVoucher
    ? Math.round(subtotal * selectedVoucher.discount_pct) / 100
    : 0
  const total = subtotal - discount

  const canPlace =
    street.trim().length > 0 &&
    region !== null &&
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
      setOrderError(
        'Your bag contains items from different stores. Please keep items from one store per order.',
      )
      return
    }

    setPlacing(true)
    setOrderError(null)

    try {
      // Step A — insert the order header; the voucher trigger recomputes
      // discount_usd and total_usd server-side and burns the voucher
      const { data: order, error: insertError } = await supabase
        .from('orders')
        .insert({
          shopper_id:       user.id,
          store_id:         items[0].storeId,
          status:           'placed',
          payment_method:   paymentMethod!,
          payment_status:   'pending',
          subtotal_usd:     subtotal,
          delivery_fee_usd: 0,
          total_usd:        total,
          voucher_code:     selectedVoucher?.code ?? null,
          delivery_address: buildAddress(),
          delivery_region:  region,
          whatsapp_sent:    false,
        })
        .select('id, order_number')
        .single()

      if (insertError) throw insertError

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
      pushNotifyNewOrder(order.id)
      orderPlacedRef.current = true
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

      setOrderError(
        isStockError
          ? t('checkout.outOfStock')
          : msg,
      )
      setPlacing(false)
    }
  }, [canPlace, user, items, paymentMethod, region, subtotal, total, selectedVoucher, buildAddress, clearCart, navigation])

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
          <Text style={styles.headerTitle}>{t('checkout.title')}</Text>
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
            <Text style={styles.sectionTitle}>{t('checkout.orderSummary')}</Text>

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
              <Text style={styles.subtotalLabel}>{t('checkout.subtotal')}</Text>
              <Text style={styles.subtotalValue}>${subtotal.toFixed(2)} USD</Text>
            </View>
          </View>

          {/* ── Delivery Details ── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('checkout.deliveryDetails')}</Text>

            <Text style={styles.inputLabel}>{t('checkout.region')}</Text>
            <View style={styles.regionRow}>
              {LEBANON_REGIONS.map(r => {
                const selected = region === r
                return (
                  <TouchableOpacity
                    key={r}
                    style={[styles.regionChip, selected && styles.regionChipSelected]}
                    onPress={() => setRegion(r)}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.regionChipText, selected && styles.regionChipTextSelected]}>
                      {r}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            <Text style={styles.inputLabel}>{t('checkout.street')}</Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              value={street}
              onChangeText={setStreet}
              placeholder={t('checkout.streetPlaceholder')}
              placeholderTextColor="#B0A090"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              returnKeyType="next"
            />

            <Text style={styles.inputLabel}>
              {t('checkout.landmark')}{' '}
              <Text style={styles.inputLabelAccent}>{t('checkout.landmarkCritical')}</Text>
            </Text>
            <TextInput
              style={styles.input}
              value={landmark}
              onChangeText={setLandmark}
              placeholder={t('checkout.landmarkPlaceholder')}
              placeholderTextColor="#B0A090"
              returnKeyType="done"
            />
            <Text style={styles.inputHint}>
              {t('checkout.landmarkHint')}
            </Text>
          </View>

          {/* ── Payment Method ── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('checkout.payment')}</Text>

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
                      {t(`payment.${opt.value}`)}
                    </Text>
                    <Text
                      style={[
                        styles.paymentDesc,
                        isSelected && styles.paymentDescSelected,
                      ]}
                    >
                      {t(`payment.${opt.value}Desc`)}
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

          {/* ── Vouchers & referral ── */}
          {(vouchers.length > 0 || showReferral || referralApplied) && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('checkout.discounts')}</Text>

              {vouchers.map(v => {
                const selected = selectedVoucher?.id === v.id
                return (
                  <TouchableOpacity
                    key={v.id}
                    style={[styles.voucherRow, selected && styles.voucherRowSelected]}
                    onPress={() => setSelectedVoucher(selected ? null : v)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.voucherBody}>
                      <Text style={styles.voucherCode}>{v.code}</Text>
                      <Text style={styles.voucherPct}>{t('checkout.voucherOff', { pct: v.discount_pct })}</Text>
                    </View>
                    <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
                      {selected && <View style={styles.radioInner} />}
                    </View>
                  </TouchableOpacity>
                )
              })}

              {showReferral && (
                <View style={styles.referralBlock}>
                  <Text style={styles.inputLabel}>
                    {t('checkout.referralQuestion')}{' '}
                    <Text style={styles.inputLabelAccent}>{t('checkout.referralFirstOrder')}</Text>
                  </Text>
                  <View style={styles.referralRow}>
                    <TextInput
                      style={[styles.input, styles.referralInput]}
                      value={referralInput}
                      onChangeText={t => { setReferralError(null); setReferralInput(t.toUpperCase()) }}
                      placeholder="e.g. 3F9A21BC"
                      placeholderTextColor="#B0A090"
                      autoCapitalize="characters"
                      autoCorrect={false}
                    />
                    <TouchableOpacity
                      style={[styles.referralBtn, (!referralInput.trim() || referralBusy) && styles.referralBtnDisabled]}
                      onPress={handleApplyReferral}
                      disabled={!referralInput.trim() || referralBusy}
                      activeOpacity={0.8}
                    >
                      {referralBusy
                        ? <ActivityIndicator size="small" color="#FFFFFF" />
                        : <Text style={styles.referralBtnText}>{t('checkout.apply')}</Text>
                      }
                    </TouchableOpacity>
                  </View>
                  {referralError ? (
                    <Text style={styles.referralError}>{referralError}</Text>
                  ) : null}
                  <Text style={styles.inputHint}>
                    {t('checkout.referralHint')}
                  </Text>
                </View>
              )}

              {referralApplied && (
                <Text style={styles.referralSuccess}>
                  {t('checkout.referralApplied')}
                </Text>
              )}
            </View>
          )}
        </ScrollView>

        {/* ── Sticky bottom bar ── */}
        <View style={styles.bottomBar}>
          {selectedVoucher && (
            <View style={styles.totalRow}>
              <Text style={styles.discountLabel}>{t('checkout.voucher')} {selectedVoucher.code}</Text>
              <Text style={styles.discountValue}>−${discount.toFixed(2)}</Text>
            </View>
          )}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>{t('checkout.total')}</Text>
            <Text style={styles.totalValue}>${total.toFixed(2)} USD</Text>
          </View>
          {orderError ? (
            <Text style={styles.orderError}>{orderError}</Text>
          ) : null}
          <TouchableOpacity
            style={[styles.placeBtn, !canPlace && styles.placeBtnDisabled]}
            onPress={handlePlaceOrder}
            disabled={!canPlace}
            activeOpacity={0.85}
          >
            <Text style={styles.placeBtnText}>
              {placing ? t('checkout.placing') : t('checkout.placeOrder')}
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
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  flex: { flex: 1 },
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
    backgroundColor: '#F5EFE6',
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
    color: '#D9552B',
    fontStyle: 'italic',
  },
  regionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  regionChip: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#D9CFC4',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  regionChipSelected: {
    backgroundColor: '#D9552B',
    borderColor: '#D9552B',
  },
  regionChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#7A6A5A',
  },
  regionChipTextSelected: {
    color: '#FFFFFF',
  },
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
    borderColor: '#ECE6DC',
    backgroundColor: '#FFFFFF',
    minHeight: 60,
  },
  paymentOptionSelected: {
    borderColor: '#D9552B',
    backgroundColor: '#FFF8F4',
  },
  paymentBody:  { flex: 1 },
  paymentLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1612',
  },
  paymentLabelSelected: { color: '#D9552B' },
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
  radioOuterSelected: { borderColor: '#D9552B' },
  radioInner: {
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: '#D9552B',
  },
  // Vouchers & referral
  voucherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#ECE6DC',
    backgroundColor: '#FFFFFF',
  },
  voucherRowSelected: {
    borderColor: '#D9552B',
    backgroundColor: '#FFF8F4',
  },
  voucherBody: { flex: 1 },
  voucherCode: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1C1612',
    letterSpacing: 1,
    fontVariant: ['tabular-nums'],
  },
  voucherPct: {
    fontSize: 12,
    fontWeight: '600',
    color: '#D9552B',
    marginTop: 2,
  },
  referralBlock: {
    gap: 8,
    paddingTop: 4,
  },
  referralRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  referralInput: {
    flex: 1,
    letterSpacing: 1.5,
  },
  referralBtn: {
    height: 48,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: '#1C1612',
    justifyContent: 'center',
    alignItems: 'center',
  },
  referralBtnDisabled: { opacity: 0.4 },
  referralBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  referralError: {
    fontSize: 12,
    color: '#D9552B',
    lineHeight: 17,
  },
  referralSuccess: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2D7A4F',
    lineHeight: 18,
  },
  discountLabel: { fontSize: 13, fontWeight: '600', color: '#2D7A4F' },
  discountValue: { fontSize: 14, fontWeight: '700', color: '#2D7A4F' },
  orderError: {
    fontSize: 13,
    color: '#D9552B',
    textAlign: 'center',
    lineHeight: 18,
  },

  // Bottom bar
  bottomBar: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#ECE6DC',
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
    backgroundColor: '#D9552B',
    borderRadius: 28,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeBtnDisabled: { opacity: 0.38 },
  placeBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
})
