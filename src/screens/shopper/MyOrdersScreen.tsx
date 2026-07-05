import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  ListRenderItem,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/useAuthStore'
import { Database } from '../../types/supabase'
import type { ShopperStackParamList } from '../../navigation/RootNavigator'

type Props = NativeStackScreenProps<ShopperStackParamList, 'MyOrders'>
type OrderStatus = Database['public']['Enums']['order_status']

// ---------------------------------------------------------------------------
// Query — includes order_items for the snippet
// ---------------------------------------------------------------------------

const fetchMyOrders = (userId: string) =>
  supabase
    .from('orders')
    .select(`
      id, order_number, status, total_usd, created_at, store_id,
      stores ( name ),
      reviews ( id ),
      order_items (
        quantity,
        product:products ( name )
      )
    `)
    .eq('shopper_id', userId)
    .order('created_at', { ascending: false })

type MyOrder    = NonNullable<Awaited<ReturnType<typeof fetchMyOrders>>['data']>[0]
type OrderItem  = MyOrder['order_items'][0]

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

// Active statuses get a "Track" CTA; completed/cancelled get "View"
const ACTIVE_STATUSES: OrderStatus[] = ['placed', 'confirmed', 'preparing', 'ready', 'dispatched']

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function resolveOne<T>(val: T | T[] | null | undefined): T | null {
  if (val == null) return null
  return Array.isArray(val) ? (val[0] ?? null) : val
}

function resolveStoreName(stores: unknown): string {
  const s = resolveOne(stores as { name?: string } | { name?: string }[] | null)
  return s?.name ?? ''
}

function buildItemSnippet(items: OrderItem[]): string {
  if (!items || items.length === 0) return ''
  const parts = items.map((item) => {
    const product = resolveOne(
      item.product as { name: string } | { name: string }[] | null,
    )
    const name = product?.name ?? 'Item'
    return `${name} ×${item.quantity}`
  })

  const joined = parts.join(', ')
  // Truncate at ~72 chars to keep the card tidy
  if (joined.length <= 72) return joined
  return joined.slice(0, 69).replace(/,?\s*\w*$/, '') + '…'
}

// ---------------------------------------------------------------------------
// ReviewBlock — inline star-rating form shown on delivered, unreviewed orders
// ---------------------------------------------------------------------------

type ReviewBlockProps = {
  orderId:   string
  storeId:   string
  shopperId: string
  onDone:    (orderId: string) => void
}

function ReviewBlock({ orderId, storeId, shopperId, onDone }: ReviewBlockProps) {
  const [rating,     setRating]     = useState(0)
  const [comment,    setComment]    = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  const handleSubmit = useCallback(async () => {
    if (rating === 0 || submitting) return
    setSubmitting(true)
    setError(null)
    const { error: insertErr } = await supabase.from('reviews').insert({
      order_id:   orderId,
      store_id:   storeId,
      shopper_id: shopperId,
      rating,
      comment: comment.trim() || null,
    })
    if (insertErr) {
      setError(insertErr.message)
      setSubmitting(false)
      return
    }
    onDone(orderId)
  }, [rating, comment, submitting, orderId, storeId, shopperId, onDone])

  return (
    <View style={styles.reviewBlock}>
      <Text style={styles.reviewPromptLabel}>How was this order?</Text>
      <View style={styles.starRow}>
        {[1, 2, 3, 4, 5].map(n => (
          <TouchableOpacity
            key={n}
            onPress={() => setRating(n)}
            hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
            activeOpacity={0.7}
          >
            <Text style={n <= rating ? styles.starFilled : styles.starEmpty}>★</Text>
          </TouchableOpacity>
        ))}
      </View>
      {rating > 0 && (
        <>
          <TextInput
            style={styles.reviewInput}
            value={comment}
            onChangeText={setComment}
            placeholder="Add a comment (optional)"
            placeholderTextColor="#B0A090"
            multiline
          />
          {error ? <Text style={styles.reviewError}>{error}</Text> : null}
          <TouchableOpacity
            style={[styles.reviewSubmitBtn, submitting && styles.reviewSubmitBtnDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.85}
          >
            {submitting
              ? <ActivityIndicator size="small" color="#FFFFFF" />
              : <Text style={styles.reviewSubmitText}>Submit Review</Text>
            }
          </TouchableOpacity>
        </>
      )}
    </View>
  )
}

// ---------------------------------------------------------------------------
// OrderCard — entire card is a tap target
// ---------------------------------------------------------------------------

type CardProps = {
  order:      MyOrder
  shopperId:  string
  reviewed:   boolean
  onPress:    (orderId: string) => void
  onReviewed: (orderId: string) => void
}

function OrderCard({ order, shopperId, reviewed, onPress, onReviewed }: CardProps) {
  const badge     = STATUS_BADGE[order.status]
  const storeName = resolveStoreName(order.stores)
  const snippet   = buildItemSnippet(order.order_items)
  const isActive  = ACTIVE_STATUSES.includes(order.status)
  const ctaLabel  = isActive ? 'Track Order →' : 'View Details →'
  const canReview = order.status === 'delivered' && !reviewed

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onPress(order.id)}
      activeOpacity={0.85}
    >
      {/* ── Row 1: order number + status badge ── */}
      <View style={styles.cardHeader}>
        <Text style={styles.orderNumber}>{order.order_number ?? '—'}</Text>
        <View style={[styles.badge, { backgroundColor: badge.bg }]}>
          <Text style={[styles.badgeText, { color: badge.color }]}>
            {badge.label}
          </Text>
        </View>
      </View>

      {/* ── Row 2: store name + date ── */}
      <View style={styles.metaRow}>
        {storeName ? (
          <Text style={styles.storeName} numberOfLines={1}>{storeName}</Text>
        ) : null}
        <Text style={styles.date}>{formatDate(order.created_at)}</Text>
      </View>

      {/* ── Row 3: item snippet ── */}
      {snippet ? (
        <Text style={styles.snippet} numberOfLines={2}>{snippet}</Text>
      ) : null}

      {/* ── Row 4: total + CTA ── */}
      <View style={styles.cardFooter}>
        <Text style={styles.total}>
          ${Number(order.total_usd).toFixed(2)} USD
        </Text>
        <Text style={[styles.cta, isActive && styles.ctaActive]}>
          {ctaLabel}
        </Text>
      </View>

      {/* ── Review: prompt on delivered orders, thanks once submitted ── */}
      {canReview && (
        <ReviewBlock
          orderId={order.id}
          storeId={order.store_id}
          shopperId={shopperId}
          onDone={onReviewed}
        />
      )}
      {order.status === 'delivered' && reviewed && (
        <Text style={styles.reviewedHint}>★ Thanks for your review</Text>
      )}
    </TouchableOpacity>
  )
}

// ---------------------------------------------------------------------------
// MyOrdersScreen
// ---------------------------------------------------------------------------

export default function MyOrdersScreen({ navigation }: Props) {
  const user = useAuthStore((s) => s.user)

  const [orders,      setOrders]      = useState<MyOrder[]>([])
  const [loading,     setLoading]     = useState(true)
  const [refreshing,  setRefreshing]  = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  // Orders reviewed in this session — merged with the reviews embed on fetch
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set())

  const load = useCallback(async (isRefresh = false) => {
    if (!user?.id) return
    if (isRefresh) setRefreshing(true)
    else           setLoading(true)
    setError(null)

    const { data, error: fetchErr } = await fetchMyOrders(user.id)
    if (fetchErr) {
      setError(fetchErr.message)
    } else {
      setOrders(data ?? [])
    }

    if (isRefresh) setRefreshing(false)
    else           setLoading(false)
  }, [user?.id])

  useFocusEffect(useCallback(() => { load() }, [load]))

  // Realtime — patch status badges live when vendor advances an order
  useEffect(() => {
    if (!user?.id) return

    const channel = supabase
      .channel(`my-orders-${user.id}`)
      .on(
        'postgres_changes',
        {
          event:  'UPDATE',
          schema: 'public',
          table:  'orders',
          filter: `shopper_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as { id: string; status: OrderStatus }
          setOrders(prev =>
            prev.map(o => (o.id === row.id ? { ...o, status: row.status } : o)),
          )
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user?.id])

  const handleRefresh    = useCallback(() => load(true), [load])
  const handlePressOrder = useCallback(
    (orderId: string) => navigation.navigate('ShipmentTracking', { orderId }),
    [navigation],
  )

  const handleReviewed = useCallback((orderId: string) => {
    setReviewedIds(prev => new Set(prev).add(orderId))
  }, [])

  // PostgREST returns the one-to-one reviews embed as object or array
  // depending on client version — treat any non-empty value as reviewed
  const hasReview = useCallback(
    (order: MyOrder): boolean => {
      if (reviewedIds.has(order.id)) return true
      const r = order.reviews as unknown
      return Array.isArray(r) ? r.length > 0 : r != null
    },
    [reviewedIds],
  )

  const renderItem: ListRenderItem<MyOrder> = useCallback(
    ({ item }) => (
      <OrderCard
        order={item}
        shopperId={user?.id ?? ''}
        reviewed={hasReview(item)}
        onPress={handlePressOrder}
        onReviewed={handleReviewed}
      />
    ),
    [handlePressOrder, handleReviewed, hasReview, user?.id],
  )

  const keyExtractor = useCallback((item: MyOrder) => item.id, [])

  // ---- Loading state ----

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, styles.centered]}>
        <ActivityIndicator size="large" color="#D9552B" />
      </SafeAreaView>
    )
  }

  // ---- Error state ----

  if (error) {
    return (
      <SafeAreaView style={[styles.safe, styles.centered]}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => load()}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    )
  }

  // ---- Main ----

  return (
    <SafeAreaView style={styles.safe}>
      <FlatList
        data={orders}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#D9552B"
            colors={['#D9552B']}
          />
        }
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
            <Text style={styles.emptyIcon}>🛍</Text>
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
  safe:     { flex: 1, backgroundColor: '#FFFFFF' },
  centered: { justifyContent: 'center', alignItems: 'center' },

  // Header inside FlatList
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 20,
  },
  backBtn:     { width: 44, height: 44, justifyContent: 'center' },
  backIcon:    { fontSize: 22, color: '#1C1612', lineHeight: 26 },
  heading: {
    flex: 1,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '700',
    color: '#1C1612',
  },
  headerRight: { width: 44 },

  // List
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    flexGrow: 1,
  },

  // Card
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
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
    marginBottom: 8,
  },
  orderNumber: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1C1612',
    letterSpacing: 0.4,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },

  // Meta row (store + date side-by-side)
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
    flexWrap: 'wrap',
  },
  storeName: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7A6A5A',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    flexShrink: 1,
  },
  date: {
    fontSize: 12,
    color: '#B0A090',
  },

  // Item snippet
  snippet: {
    fontSize: 13,
    color: '#5A4A3A',
    lineHeight: 18,
    marginBottom: 12,
  },

  // Footer row
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F5EFE6',
    minHeight: 44,
  },
  total: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1C1612',
  },
  cta: {
    fontSize: 13,
    fontWeight: '600',
    color: '#7A6A5A',
  },
  ctaActive: {
    color: '#D9552B',
    fontWeight: '700',
  },

  // Review block
  reviewBlock: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F5EFE6',
    gap: 8,
  },
  reviewPromptLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1C1612',
  },
  starRow: {
    flexDirection: 'row',
    gap: 6,
  },
  starFilled: {
    fontSize: 26,
    color: '#D9552B',
  },
  starEmpty: {
    fontSize: 26,
    color: '#D9CFC4',
  },
  reviewInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#D9CFC4',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#1C1612',
    minHeight: 64,
    textAlignVertical: 'top',
  },
  reviewError: {
    fontSize: 12,
    color: '#D9552B',
  },
  reviewSubmitBtn: {
    height: 44,
    borderRadius: 22,
    backgroundColor: '#D9552B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  reviewSubmitBtnDisabled: { opacity: 0.5 },
  reviewSubmitText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  reviewedHint: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F5EFE6',
    fontSize: 12,
    fontWeight: '600',
    color: '#2D7A4F',
  },

  // Empty state
  emptyState: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 80,
    gap: 10,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 4,
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

  // Error state
  errorText: {
    fontSize: 14,
    color: '#D9552B',
    textAlign: 'center',
    paddingHorizontal: 32,
    marginBottom: 16,
  },
  retryBtn: {
    height: 44,
    paddingHorizontal: 24,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#D9552B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  retryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#D9552B',
  },
})
