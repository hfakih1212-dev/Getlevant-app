import React, { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  ListRenderItem,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/useAuthStore'
import { Database } from '../../types/supabase'
import type { VendorStackParamList } from '../../navigation/RootNavigator'

type Props = NativeStackScreenProps<VendorStackParamList, 'VendorDashboard'>

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

type OrderStatus = Database['public']['Enums']['order_status']

// ---------------------------------------------------------------------------
// Query — outside component for stable ReturnType inference
// ---------------------------------------------------------------------------

const fetchVendorOrders = (storeId: string) =>
  supabase
    .from('orders')
    .select(
      `
      id, order_number, status, payment_method,
      delivery_address, subtotal_usd, delivery_fee_usd, total_usd,
      notes, created_at,
      shopper:users!orders_shopper_id_fkey ( phone, email ),
      order_items (
        id, quantity, unit_price_usd,
        product:products ( name ),
        variant:product_variants ( size, color )
      )
    `,
    )
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })

type VendorOrder = NonNullable<
  Awaited<ReturnType<typeof fetchVendorOrders>>['data']
>[0]

type OrderItem = VendorOrder['order_items'][0]

// ---------------------------------------------------------------------------
// Tab configuration
// ---------------------------------------------------------------------------

type TabKey = 'pending' | 'active' | 'completed'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'pending',   label: 'Pending'   },
  { key: 'active',    label: 'Active'    },
  { key: 'completed', label: 'Completed' },
]

const TAB_STATUSES: Record<TabKey, OrderStatus[]> = {
  pending:   ['placed'],
  active:    ['confirmed', 'preparing', 'ready', 'dispatched'],
  completed: ['delivered', 'cancelled'],
}

// ---------------------------------------------------------------------------
// Status lifecycle: what action advances each state
// ---------------------------------------------------------------------------

const NEXT_ACTION: Partial<
  Record<OrderStatus, { label: string; next: OrderStatus }>
> = {
  placed:     { label: 'Accept Order',      next: 'confirmed'  },
  confirmed:  { label: 'Start Preparing',   next: 'preparing'  },
  preparing:  { label: 'Mark as Ready',     next: 'ready'      },
  ready:      { label: 'Dispatch Order',    next: 'dispatched' },
  dispatched: { label: 'Mark as Delivered', next: 'delivered'  },
}

// ---------------------------------------------------------------------------
// Status badge styling
// ---------------------------------------------------------------------------

const STATUS_BADGE: Record<
  OrderStatus,
  { label: string; color: string; bg: string }
> = {
  placed:     { label: 'Placed',     color: '#92400E', bg: '#FEF3C7' },
  confirmed:  { label: 'Confirmed',  color: '#1E3A8A', bg: '#DBEAFE' },
  preparing:  { label: 'Preparing',  color: '#5B21B6', bg: '#EDE9FE' },
  ready:      { label: 'Ready',      color: '#065F46', bg: '#D1FAE5' },
  dispatched: { label: 'Dispatched', color: '#9A3412', bg: '#FFEDD5' },
  delivered:  { label: 'Delivered',  color: '#166534', bg: '#DCFCE7' },
  cancelled:  { label: 'Cancelled',  color: '#6B7280', bg: '#F3F4F6' },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function resolveOne<T>(val: T | T[] | null | undefined): T | null {
  if (val == null) return null
  return Array.isArray(val) ? (val[0] ?? null) : val
}

function formatItemLine(item: OrderItem): string {
  const product = resolveOne(item.product as { name: string } | { name: string }[] | null)
  const variant = resolveOne(
    item.variant as
      | { size: string | null; color: string | null }
      | { size: string | null; color: string | null }[]
      | null,
  )
  const name = product?.name ?? 'Item'
  const opts = [variant?.size, variant?.color].filter(Boolean).join(' / ')
  return `${item.quantity}× ${name}${opts ? ` (${opts})` : ''}`
}

// ---------------------------------------------------------------------------
// OrderCard
// ---------------------------------------------------------------------------

type CardProps = {
  order: VendorOrder
  onAdvance: (orderId: string, next: OrderStatus) => Promise<void>
  advancing: boolean
  onCreateShipment: (orderId: string, orderNumber: string) => void
}

function OrderCard({ order, onAdvance, advancing, onCreateShipment }: CardProps) {
  const badge  = STATUS_BADGE[order.status]
  const action = NEXT_ACTION[order.status]
  const isPrimary = order.status === 'placed'

  const shopper = resolveOne(
    order.shopper as
      | { phone: string | null; email: string | null }
      | { phone: string | null; email: string | null }[]
      | null,
  )
  const contact = shopper?.phone ?? shopper?.email ?? null

  return (
    <View style={styles.card}>
      {/* ── Header ── */}
      <View style={styles.cardHeader}>
        <Text style={styles.orderNumber}>{order.order_number ?? '—'}</Text>
        <View style={[styles.badge, { backgroundColor: badge.bg }]}>
          <Text style={[styles.badgeText, { color: badge.color }]}>
            {badge.label}
          </Text>
        </View>
      </View>

      <Text style={styles.cardMeta}>{formatDate(order.created_at)}</Text>

      {contact ? (
        <Text style={styles.cardMeta}>📱 {contact}</Text>
      ) : null}

      {order.delivery_address ? (
        <Text style={styles.cardMeta} numberOfLines={2}>
          📍 {order.delivery_address}
        </Text>
      ) : null}

      {/* ── Items ── */}
      <View style={styles.itemsSection}>
        {order.order_items.map(item => (
          <Text key={item.id} style={styles.itemLine}>
            • {formatItemLine(item)}
          </Text>
        ))}
      </View>

      {/* ── Total ── */}
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.totalValue}>
          ${Number(order.total_usd).toFixed(2)} USD
        </Text>
      </View>

      {/* ── Action ── */}
      {action ? (
        <TouchableOpacity
          style={[
            styles.actionBtn,
            isPrimary ? styles.actionBtnFilled : styles.actionBtnOutline,
            advancing && styles.actionBtnDisabled,
          ]}
          onPress={() => onAdvance(order.id, action.next)}
          disabled={advancing}
          activeOpacity={0.8}
        >
          {advancing ? (
            <ActivityIndicator
              size="small"
              color={isPrimary ? '#FAF7F2' : '#C8622A'}
            />
          ) : (
            <Text
              style={[
                styles.actionBtnText,
                !isPrimary && styles.actionBtnTextOutline,
              ]}
            >
              {action.label}
            </Text>
          )}
        </TouchableOpacity>
      ) : null}

      {/* ── Assign Courier — shown on dispatched orders ── */}
      {order.status === 'dispatched' ? (
        <TouchableOpacity
          style={styles.shipmentBtn}
          onPress={() => onCreateShipment(order.id, order.order_number ?? '')}
          activeOpacity={0.8}
        >
          <Text style={styles.shipmentBtnText}>Assign Courier</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  )
}

// ---------------------------------------------------------------------------
// VendorDashboardScreen
// ---------------------------------------------------------------------------

export default function VendorDashboardScreen({ navigation }: Props) {
  const user = useAuthStore(s => s.user)

  const [orders, setOrders]       = useState<VendorOrder[]>([])
  const [storeName, setStoreName] = useState<string>('')
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabKey>('pending')
  const [advancingId, setAdvancingId] = useState<string | null>(null)

  // ---- Fetch ----

  const load = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    setError(null)

    const { data: store, error: storeErr } = await supabase
      .from('stores')
      .select('id, name')
      .eq('owner_id', user.id)
      .single()

    if (storeErr || !store) {
      setError(storeErr?.message ?? 'No store found for this account.')
      setLoading(false)
      return
    }

    setStoreName(store.name)

    const { data, error: ordersErr } = await fetchVendorOrders(store.id)

    if (ordersErr) {
      setError(ordersErr.message)
    } else {
      setOrders(data ?? [])
    }

    setLoading(false)
  }, [user?.id])

  useFocusEffect(useCallback(() => { load() }, [load]))

  // ---- Filtered orders for the active tab ----

  const filteredOrders = useMemo(
    () => orders.filter(o => TAB_STATUSES[activeTab].includes(o.status)),
    [orders, activeTab],
  )

  // ---- Tab badge counts ----

  const tabCounts = useMemo<Record<TabKey, number>>(
    () => ({
      pending:   orders.filter(o => TAB_STATUSES.pending.includes(o.status)).length,
      active:    orders.filter(o => TAB_STATUSES.active.includes(o.status)).length,
      completed: orders.filter(o => TAB_STATUSES.completed.includes(o.status)).length,
    }),
    [orders],
  )

  // ---- Status advancement ----

  const handleAdvance = useCallback(
    async (orderId: string, next: OrderStatus) => {
      setAdvancingId(orderId)

      const { error: updateErr } = await supabase
        .from('orders')
        .update({ status: next })
        .eq('id', orderId)

      if (!updateErr) {
        setOrders(prev =>
          prev.map(o => (o.id === orderId ? { ...o, status: next } : o)),
        )
      }

      setAdvancingId(null)
    },
    [],
  )

  // ---- Shipment creation ----

  const handleCreateShipment = useCallback(
    (orderId: string, orderNumber: string) => {
      navigation.navigate('ShipmentCreate', { orderId, orderNumber })
    },
    [navigation],
  )

  // ---- Render helpers ----

  const renderItem: ListRenderItem<VendorOrder> = useCallback(
    ({ item }) => (
      <OrderCard
        order={item}
        onAdvance={handleAdvance}
        advancing={advancingId === item.id}
        onCreateShipment={handleCreateShipment}
      />
    ),
    [handleAdvance, advancingId, handleCreateShipment],
  )

  const keyExtractor = useCallback((item: VendorOrder) => item.id, [])

  // ---- Guards ----

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, styles.centered]}>
        <ActivityIndicator size="large" color="#C8622A" />
      </SafeAreaView>
    )
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.safe, styles.centered]}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={load}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    )
  }

  // ---- Main render ----

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{storeName}</Text>
        <Text style={styles.headerSub}>Order Management</Text>
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {TABS.map(tab => {
          const isActive = activeTab === tab.key
          const count    = tabCounts[tab.key]
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                {tab.label}
              </Text>
              {count > 0 && (
                <View
                  style={[styles.tabCount, isActive && styles.tabCountActive]}
                >
                  <Text
                    style={[
                      styles.tabCountText,
                      isActive && styles.tabCountTextActive,
                    ]}
                  >
                    {count}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          )
        })}
      </View>

      {/* Order list */}
      <FlatList
        data={filteredOrders}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>
              No {activeTab} orders right now.
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#FAF7F2',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Header
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E8E0D5',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1C1612',
  },
  headerSub: {
    fontSize: 13,
    color: '#7A6A5A',
    marginTop: 2,
  },
  // Tab bar
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E8E0D5',
    backgroundColor: '#FAF7F2',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 48,
    paddingHorizontal: 8,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#C8622A',
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#7A6A5A',
  },
  tabLabelActive: {
    color: '#C8622A',
    fontWeight: '700',
  },
  tabCount: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#E8E0D5',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
  },
  tabCountActive: {
    backgroundColor: '#C8622A',
  },
  tabCountText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7A6A5A',
  },
  tabCountTextActive: {
    color: '#FAF7F2',
  },
  // List
  listContent: {
    padding: 16,
    gap: 12,
  },
  // Order card
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#1C1612',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  orderNumber: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1C1612',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  cardMeta: {
    fontSize: 13,
    color: '#7A6A5A',
    marginTop: 3,
    lineHeight: 18,
  },
  itemsSection: {
    marginTop: 12,
    marginBottom: 8,
    gap: 4,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F0EBE3',
  },
  itemLine: {
    fontSize: 13,
    color: '#1C1612',
    lineHeight: 19,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#F0EBE3',
  },
  totalLabel: {
    fontSize: 13,
    color: '#7A6A5A',
    fontWeight: '500',
  },
  totalValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1612',
  },
  // Action button
  actionBtn: {
    marginTop: 14,
    height: 48,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBtnFilled: {
    backgroundColor: '#C8622A',
  },
  actionBtnOutline: {
    borderWidth: 1.5,
    borderColor: '#C8622A',
    backgroundColor: 'transparent',
  },
  actionBtnDisabled: {
    opacity: 0.5,
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FAF7F2',
    letterSpacing: 0.2,
  },
  actionBtnTextOutline: {
    color: '#C8622A',
  },
  // Empty / error states
  emptyState: {
    paddingTop: 64,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 15,
    color: '#7A6A5A',
  },
  errorText: {
    fontSize: 14,
    color: '#C8622A',
    textAlign: 'center',
    paddingHorizontal: 32,
    marginBottom: 16,
  },
  retryBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#C8622A',
  },
  retryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#C8622A',
  },
  // Assign courier secondary button
  shipmentBtn: {
    marginTop: 8,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#C8622A',
    backgroundColor: '#FFF3EC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shipmentBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#C8622A',
  },
})
