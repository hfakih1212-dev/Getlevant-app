import React, { useCallback, useEffect, useState } from 'react'
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
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/useAuthStore'
import { Database } from '../../types/supabase'
import type { ShopperStackParamList } from '../../navigation/RootNavigator'

type Props = NativeStackScreenProps<ShopperStackParamList, 'MyOrders'>
type OrderStatus = Database['public']['Enums']['order_status']

// ---------------------------------------------------------------------------
// Query — outside component for stable ReturnType inference
// ---------------------------------------------------------------------------

const fetchMyOrders = (userId: string) =>
  supabase
    .from('orders')
    .select(`
      id, order_number, status, total_usd, created_at,
      stores ( name )
    `)
    .eq('shopper_id', userId)
    .order('created_at', { ascending: false })

type MyOrder = NonNullable<Awaited<ReturnType<typeof fetchMyOrders>>['data']>[0]

// ---------------------------------------------------------------------------
// Status badge config
// ---------------------------------------------------------------------------

const STATUS_BADGE: Record<OrderStatus, { label: string; color: string; bg: string }> = {
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

function resolveStoreName(stores: unknown): string {
  if (!stores) return ''
  const s = Array.isArray(stores) ? stores[0] : stores
  return (s as { name?: string })?.name ?? ''
}

// ---------------------------------------------------------------------------
// OrderCard
// ---------------------------------------------------------------------------

type CardProps = {
  order: MyOrder
  onViewDetails: (orderId: string) => void
}

function OrderCard({ order, onViewDetails }: CardProps) {
  const badge = STATUS_BADGE[order.status]
  const storeName = resolveStoreName(order.stores)

  return (
    <View style={styles.card}>
      {/* Order number + status badge */}
      <View style={styles.cardHeader}>
        <Text style={styles.orderNumber}>{order.order_number ?? '—'}</Text>
        <View style={[styles.badge, { backgroundColor: badge.bg }]}>
          <Text style={[styles.badgeText, { color: badge.color }]}>
            {badge.label}
          </Text>
        </View>
      </View>

      {/* Store + date */}
      {storeName ? (
        <Text style={styles.storeName}>{storeName}</Text>
      ) : null}
      <Text style={styles.date}>{formatDate(order.created_at)}</Text>

      {/* Total + action */}
      <View style={styles.cardFooter}>
        <Text style={styles.total}>
          ${Number(order.total_usd).toFixed(2)} USD
        </Text>
        <TouchableOpacity
          style={styles.detailBtn}
          onPress={() => onViewDetails(order.id)}
          activeOpacity={0.8}
        >
          <Text style={styles.detailBtnText}>View Details</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

// ---------------------------------------------------------------------------
// MyOrdersScreen
// ---------------------------------------------------------------------------

export default function MyOrdersScreen({ navigation }: Props) {
  const user = useAuthStore((s) => s.user)
  const [orders,  setOrders]  = useState<MyOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    setError(null)
    const { data, error: fetchErr } = await fetchMyOrders(user.id)
    if (fetchErr) {
      setError(fetchErr.message)
    } else {
      setOrders(data ?? [])
    }
    setLoading(false)
  }, [user?.id])

  useEffect(() => {
    load()
  }, [load])

  const handleViewDetails = useCallback(
    (orderId: string) => navigation.navigate('ShipmentTracking', { orderId }),
    [navigation],
  )

  const renderItem: ListRenderItem<MyOrder> = useCallback(
    ({ item }) => (
      <OrderCard order={item} onViewDetails={handleViewDetails} />
    ),
    [handleViewDetails],
  )

  const keyExtractor = useCallback((item: MyOrder) => item.id, [])

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

  return (
    <SafeAreaView style={styles.safe}>
      <FlatList
        data={orders}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.headerRow}>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => navigation.goBack()}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.backIcon}>←</Text>
            </TouchableOpacity>
            <Text style={styles.heading}>My Orders</Text>
            <View style={styles.headerRight} />
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No orders yet</Text>
            <Text style={styles.emptyBody}>
              Your past and active orders will appear here once you've placed one.
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
  safe:    { flex: 1, backgroundColor: '#FAF7F2' },
  centered: { justifyContent: 'center', alignItems: 'center' },
  // Header embedded in FlatList
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 20,
  },
  backBtn:    { width: 40, height: 44, justifyContent: 'center' },
  backIcon:   { fontSize: 22, color: '#1C1612', lineHeight: 26 },
  heading: {
    flex: 1,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '700',
    color: '#1C1612',
  },
  headerRight: { width: 40 },
  // List
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    flexGrow: 1,
  },
  // Order card
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
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
    letterSpacing: 0.4,
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
  storeName: {
    fontSize: 11,
    fontWeight: '600',
    color: '#7A6A5A',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  date: {
    fontSize: 12,
    color: '#7A6A5A',
    marginBottom: 14,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0EBE3',
  },
  total: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1C1612',
  },
  detailBtn: {
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#C8622A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#C8622A',
  },
  // Empty state
  emptyState: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 80,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1612',
  },
  emptyBody: {
    fontSize: 14,
    color: '#7A6A5A',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 32,
  },
  // Error
  errorText: {
    fontSize: 14,
    color: '#C8622A',
    textAlign: 'center',
    paddingHorizontal: 32,
    marginBottom: 16,
  },
  retryBtn: {
    height: 44,
    paddingHorizontal: 24,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#C8622A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  retryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#C8622A',
  },
})
