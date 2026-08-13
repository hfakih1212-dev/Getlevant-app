import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  ListRenderItem,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import Skeleton from '../../components/Skeleton'
import { CATEGORY_LABEL, CONDITION_OPTIONS, LEBANON_REGIONS, LebanonRegion, ProductCategory } from '../../lib/catalog'
import { TranslationKey, useT } from '../../lib/i18n'
import { supabase } from '../../lib/supabase'
import { pushNotifyStatusChanged } from '../../lib/push'
import { useAuthStore } from '../../store/useAuthStore'
import { Database } from '../../types/supabase'
import type { VendorStackParamList } from '../../navigation/RootNavigator'

type Props = NativeStackScreenProps<VendorStackParamList, 'VendorDashboard'>

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

type OrderStatus = Database['public']['Enums']['order_status']
type ProductCondition = Database['public']['Enums']['product_condition']

// Shape produced by the vendor_analytics() SQL function
interface VendorAnalytics {
  total_revenue_usd: number
  orders_delivered: number
  items_by_condition: Partial<Record<ProductCondition, number>>
  top_categories: { category: string; units: number }[]
  regions: { region: string; orders: number }[]
}

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
      ),
      shipments ( id )
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

const TABS: { key: TabKey; labelKey: TranslationKey }[] = [
  { key: 'pending',   labelKey: 'vendorDash.tabPending'   },
  { key: 'active',    labelKey: 'vendorDash.tabActive'    },
  { key: 'completed', labelKey: 'vendorDash.tabCompleted' },
]

const TAB_EMPTY_KEY: Record<TabKey, TranslationKey> = {
  pending:   'vendorDash.emptyPending',
  active:    'vendorDash.emptyActive',
  completed: 'vendorDash.emptyCompleted',
}

const TAB_STATUSES: Record<TabKey, OrderStatus[]> = {
  pending:   ['placed'],
  active:    ['confirmed', 'preparing', 'ready', 'dispatched'],
  completed: ['delivered', 'cancelled'],
}

// ---------------------------------------------------------------------------
// Status lifecycle: what action advances each state
// ---------------------------------------------------------------------------

const NEXT_ACTION: Partial<
  Record<OrderStatus, { labelKey: TranslationKey; next: OrderStatus }>
> = {
  placed:     { labelKey: 'vendorDash.actionAccept',         next: 'confirmed'  },
  confirmed:  { labelKey: 'vendorDash.actionStartPreparing', next: 'preparing'  },
  preparing:  { labelKey: 'vendorDash.actionMarkReady',      next: 'ready'      },
  ready:      { labelKey: 'vendorDash.actionDispatch',       next: 'dispatched' },
  dispatched: { labelKey: 'vendorDash.actionMarkDelivered',  next: 'delivered'  },
}

// ---------------------------------------------------------------------------
// Status badge styling — labels come from the `status.*` i18n keys
// ---------------------------------------------------------------------------

const STATUS_BADGE: Record<OrderStatus, { color: string; bg: string }> = {
  placed:     { color: '#92400E', bg: '#FEF3C7' },
  confirmed:  { color: '#1E3A8A', bg: '#DBEAFE' },
  preparing:  { color: '#5B21B6', bg: '#EDE9FE' },
  ready:      { color: '#065F46', bg: '#D1FAE5' },
  dispatched: { color: '#9A3412', bg: '#FFEDD5' },
  delivered:  { color: '#166534', bg: '#DCFCE7' },
  cancelled:  { color: '#6B7280', bg: '#F3F4F6' },
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

function formatItemLine(item: OrderItem, fallbackName: string): string {
  const product = resolveOne(item.product as { name: string } | { name: string }[] | null)
  const variant = resolveOne(
    item.variant as
      | { size: string | null; color: string | null }
      | { size: string | null; color: string | null }[]
      | null,
  )
  const name = product?.name ?? fallbackName
  const opts = [variant?.size, variant?.color].filter(Boolean).join(' / ')
  return `${item.quantity}× ${name}${opts ? ` (${opts})` : ''}`
}

// ---------------------------------------------------------------------------
// AnalyticsStrip — horizontally scrolling stat cards above the order tabs
// ---------------------------------------------------------------------------

function isKnownCategory(value: string): value is ProductCategory {
  return value in CATEGORY_LABEL
}

function isKnownRegion(value: string): value is LebanonRegion {
  return (LEBANON_REGIONS as readonly string[]).includes(value)
}

function pct(part: number, total: number): string {
  if (total <= 0) return '0%'
  return `${Math.round((part / total) * 100)}%`
}

type AnalyticsStripProps = {
  stats: VendorAnalytics | null
  loading: boolean
  error: string | null
}

function AnalyticsStrip({ stats, loading, error }: AnalyticsStripProps) {
  const t = useT()
  if (loading) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.statsStrip}
        style={styles.statsBar}
      >
        {Array.from({ length: 4 }, (_, i) => (
          <View key={i} style={styles.statCard}>
            <Skeleton style={styles.statSkeletonLabel} />
            <Skeleton style={styles.statSkeletonValue} />
            <Skeleton style={styles.statSkeletonSub} />
          </View>
        ))}
      </ScrollView>
    )
  }

  if (error) {
    return <Text style={styles.statsError}>{t('vendorDash.analyticsError', { msg: error })}</Text>
  }
  if (!stats) return null

  const conditionEntries = CONDITION_OPTIONS.map(o => ({
    label: t(`condition.${o.value}`),
    units: stats.items_by_condition[o.value] ?? 0,
  }))
  const itemsTotal    = conditionEntries.reduce((sum, e) => sum + e.units, 0)
  const categoryTotal = stats.top_categories.reduce((sum, c) => sum + c.units, 0)
  const regionTotal   = stats.regions.reduce((sum, r) => sum + r.orders, 0)

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.statsStrip}
      style={styles.statsBar}
    >
      {/* Total revenue */}
      <View style={styles.statCard}>
        <Text style={styles.statLabel}>{t('vendorDash.statRevenue')}</Text>
        <Text style={styles.statValue}>${Number(stats.total_revenue_usd).toFixed(0)}</Text>
        <Text style={styles.statSub}>{t('vendorDash.statRevenueSub')}</Text>
      </View>

      {/* Orders processed */}
      <View style={styles.statCard}>
        <Text style={styles.statLabel}>{t('vendorDash.statOrders')}</Text>
        <Text style={styles.statValue}>{stats.orders_delivered}</Text>
        <Text style={styles.statSub}>{t('vendorDash.statOrdersSub')}</Text>
      </View>

      {/* Brand New vs Thrifted */}
      <View style={[styles.statCard, styles.statCardWide]}>
        <Text style={styles.statLabel}>{t('vendorDash.statItemsSold')}</Text>
        {itemsTotal === 0 ? (
          <Text style={styles.statSub}>{t('vendorDash.noSalesYet')}</Text>
        ) : (
          conditionEntries.map(e => (
            <View key={e.label} style={styles.breakdownRow}>
              <Text style={styles.breakdownName}>{e.label}</Text>
              <Text style={styles.breakdownUnits}>{e.units}</Text>
              <Text style={styles.breakdownPct}>{pct(e.units, itemsTotal)}</Text>
            </View>
          ))
        )}
      </View>

      {/* Top categories */}
      <View style={[styles.statCard, styles.statCardWide]}>
        <Text style={styles.statLabel}>{t('vendorDash.statTopCategories')}</Text>
        {stats.top_categories.length === 0 ? (
          <Text style={styles.statSub}>{t('vendorDash.noSalesYet')}</Text>
        ) : (
          stats.top_categories.slice(0, 3).map((c, i) => (
            <View key={c.category} style={styles.breakdownRow}>
              <Text style={styles.breakdownName} numberOfLines={1}>
                {i + 1}. {isKnownCategory(c.category) ? t(`catalog.${c.category}`) : t('vendorDash.uncategorized')}
              </Text>
              <Text style={styles.breakdownUnits}>{c.units}</Text>
              <Text style={styles.breakdownPct}>{pct(c.units, categoryTotal)}</Text>
            </View>
          ))
        )}
      </View>

      {/* Regional reach */}
      <View style={[styles.statCard, styles.statCardWide]}>
        <Text style={styles.statLabel}>{t('vendorDash.statRegionalReach')}</Text>
        {stats.regions.length === 0 ? (
          <Text style={styles.statSub}>{t('vendorDash.noOrdersYet')}</Text>
        ) : (
          stats.regions.slice(0, 3).map(r => (
            <View key={r.region} style={styles.breakdownRow}>
              <Text style={styles.breakdownName} numberOfLines={1}>
                {isKnownRegion(r.region) ? t(`region.${r.region}`) : r.region}
              </Text>
              <Text style={styles.breakdownUnits}>{r.orders}</Text>
              <Text style={styles.breakdownPct}>{pct(r.orders, regionTotal)}</Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  )
}

// ---------------------------------------------------------------------------
// OrderCard
// ---------------------------------------------------------------------------

type CardProps = {
  order: VendorOrder
  onAdvance: (orderId: string, next: OrderStatus) => Promise<void>
  advancing: boolean
  onCreateShipment: (orderId: string, orderNumber: string) => void
  onCancel: (orderId: string) => void
  cancelConfirming: boolean
}

function OrderCard({ order, onAdvance, advancing, onCreateShipment, onCancel, cancelConfirming }: CardProps) {
  const t = useT()
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
            {t(`status.${order.status}`)}
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
            • {formatItemLine(item, t('vendorDash.item'))}
          </Text>
        ))}
      </View>

      {/* ── Total ── */}
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>{t('vendorDash.total')}</Text>
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
              color={isPrimary ? '#FFFFFF' : '#D9552B'}
            />
          ) : (
            <Text
              style={[
                styles.actionBtnText,
                !isPrimary && styles.actionBtnTextOutline,
              ]}
            >
              {t(action.labelKey)}
            </Text>
          )}
        </TouchableOpacity>
      ) : null}

      {/* ── Assign Courier — shown on dispatched orders without a shipment yet ── */}
      {order.status === 'dispatched' && !order.shipments?.length ? (
        <TouchableOpacity
          style={styles.shipmentBtn}
          onPress={() => onCreateShipment(order.id, order.order_number ?? '')}
          activeOpacity={0.8}
        >
          <Text style={styles.shipmentBtnText}>{t('vendorDash.assignCourier')}</Text>
        </TouchableOpacity>
      ) : null}

      {/* ── Cancel — inline two-tap confirm (Alert is a no-op on web) ── */}
      {(order.status === 'placed' || order.status === 'confirmed' || order.status === 'preparing') ? (
        <TouchableOpacity
          style={[styles.cancelBtn, cancelConfirming && styles.cancelBtnConfirming]}
          onPress={() => onCancel(order.id)}
          activeOpacity={0.8}
        >
          <Text style={[styles.cancelBtnText, cancelConfirming && styles.cancelBtnTextConfirming]}>
            {cancelConfirming ? t('vendorDash.cancelConfirm') : t('vendorDash.cancelOrder')}
          </Text>
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
  const t = useT()

  const [orders, setOrders]       = useState<VendorOrder[]>([])
  const [storeName, setStoreName] = useState<string>('')
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabKey>('pending')
  const [advancingId, setAdvancingId] = useState<string | null>(null)
  const [confirmingCancelId, setConfirmingCancelId] = useState<string | null>(null)

  // Analytics — loads independently of orders so skeletons cover the RPC
  const [stats,        setStats]        = useState<VendorAnalytics | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [statsError,   setStatsError]   = useState<string | null>(null)

  // ---- Fetch ----

  const load = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    setError(null)

    const { data: store, error: storeErr } = await supabase
      .from('stores')
      .select('id, name')
      .eq('owner_id', user.id)
      .maybeSingle()

    if (storeErr) {
      setError(storeErr.message)
      setLoading(false)
      return
    }

    if (!store) {
      navigation.replace('StoreOnboarding')
      setLoading(false)
      return
    }

    setStoreName(store.name)

    // Fire the aggregation RPC without blocking the order list — the strip
    // shows skeleton cards until it resolves
    setStatsLoading(true)
    setStatsError(null)
    supabase.rpc('vendor_analytics').then(({ data: statsData, error: statsErr }) => {
      if (statsErr) {
        setStatsError(statsErr.message)
      } else {
        // Shape is fixed by the SQL function; Json → typed view of it
        setStats((statsData as unknown as VendorAnalytics) ?? null)
      }
      setStatsLoading(false)
    })

    const { data, error: ordersErr } = await fetchVendorOrders(store.id)

    if (ordersErr) {
      setError(ordersErr.message)
    } else {
      setOrders(data ?? [])
    }

    setLoading(false)
  }, [user?.id])

  useFocusEffect(useCallback(() => { load() }, [load]))

  // ---- Realtime: auto-reload when a new order arrives for this store ----

  useEffect(() => {
    let storeId: string | null = null

    // Fetch storeId once so we can scope the subscription
    supabase
      .from('stores')
      .select('id')
      .eq('owner_id', user?.id ?? '')
      .maybeSingle()
      .then(({ data }) => {
        if (!data?.id) return
        storeId = data.id

        const channel = supabase
          .channel(`vendor-orders-${storeId}`)
          .on(
            'postgres_changes',
            {
              event:  'INSERT',
              schema: 'public',
              table:  'orders',
              filter: `store_id=eq.${storeId}`,
            },
            () => load(),
          )
          .subscribe()

        return () => { supabase.removeChannel(channel) }
      })
  }, [user?.id, load])

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
        pushNotifyStatusChanged(orderId, next)
        setOrders(prev =>
          prev.map(o => (o.id === orderId ? { ...o, status: next } : o)),
        )
      }

      setAdvancingId(null)
    },
    [],
  )

  // ---- Order cancellation — first tap arms, second tap executes ----

  const handleCancel = useCallback(
    async (orderId: string) => {
      if (confirmingCancelId !== orderId) {
        setConfirmingCancelId(orderId)
        return
      }
      setConfirmingCancelId(null)

      const { error: updateErr } = await supabase
        .from('orders')
        .update({ status: 'cancelled' })
        .eq('id', orderId)

      if (!updateErr) {
        setOrders(prev =>
          prev.map(o => (o.id === orderId ? { ...o, status: 'cancelled' } : o)),
        )
      }
    },
    [confirmingCancelId],
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
        onCancel={handleCancel}
        cancelConfirming={confirmingCancelId === item.id}
      />
    ),
    [handleAdvance, advancingId, handleCreateShipment, handleCancel, confirmingCancelId],
  )

  const keyExtractor = useCallback((item: VendorOrder) => item.id, [])

  // ---- Guards ----

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, styles.centered]}>
        <ActivityIndicator size="large" color="#D9552B" />
      </SafeAreaView>
    )
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.safe, styles.centered]}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={load}>
          <Text style={styles.retryText}>{t('common.retry')}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    )
  }

  // ---- Main render ----

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>{storeName}</Text>
          <Text style={styles.headerSub}>{t('vendorDash.orderManagement')}</Text>
        </View>
        <TouchableOpacity
          style={styles.inventoryBtn}
          onPress={() => navigation.navigate('ProductManagement')}
          activeOpacity={0.8}
        >
          <Text style={styles.inventoryBtnText}>{t('vendorDash.inventory')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.settingsBtn}
          onPress={() => navigation.navigate('StoreSettings')}
          activeOpacity={0.8}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
        >
          <Text style={styles.settingsBtnText}>⚙</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.profileBtn}
          onPress={() => navigation.navigate('Profile')}
          activeOpacity={0.8}
        >
          <Text style={styles.profileBtnText}>
            {(user?.phone ?? user?.email ?? '?').replace(/^\+/, '').charAt(0).toUpperCase()}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Analytics strip */}
      <AnalyticsStrip stats={stats} loading={statsLoading} error={statsError} />

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
                {t(tab.labelKey)}
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
              {t(TAB_EMPTY_KEY[activeTab])}
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
    backgroundColor: '#FFFFFF',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#ECE6DC',
  },
  headerText: {
    flex: 1,
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
  inventoryBtn: {
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#D9552B',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  inventoryBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#D9552B',
  },
  settingsBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },
  settingsBtnText: {
    fontSize: 22,
    color: '#7A6A5A',
  },
  profileBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#D9552B',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },
  profileBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  // Analytics strip
  statsBar: {
    flexGrow: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#ECE6DC',
  },
  statsStrip: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
    flexDirection: 'row',
  },
  statCard: {
    width: 150,
    borderRadius: 16,
    backgroundColor: '#F5EFE6',
    padding: 14,
    gap: 4,
  },
  statCardWide: {
    width: 210,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#7A6A5A',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  statValue: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1C1612',
    letterSpacing: -0.5,
  },
  statSub: {
    fontSize: 11,
    color: '#7A6A5A',
    fontWeight: '500',
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  breakdownName: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#1C1612',
  },
  breakdownUnits: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1C1612',
  },
  breakdownPct: {
    fontSize: 11,
    fontWeight: '800',
    color: '#D9552B',
    minWidth: 32,
    textAlign: 'right',
  },
  statSkeletonLabel: {
    width: '55%',
    height: 9,
  },
  statSkeletonValue: {
    width: '70%',
    height: 22,
    marginTop: 6,
  },
  statSkeletonSub: {
    width: '80%',
    height: 9,
    marginTop: 6,
  },
  statsError: {
    fontSize: 12,
    color: '#D9552B',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  // Tab bar
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#ECE6DC',
    backgroundColor: '#FFFFFF',
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
    borderBottomColor: '#D9552B',
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#7A6A5A',
  },
  tabLabelActive: {
    color: '#D9552B',
    fontWeight: '700',
  },
  tabCount: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#ECE6DC',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
  },
  tabCountActive: {
    backgroundColor: '#D9552B',
  },
  tabCountText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7A6A5A',
  },
  tabCountTextActive: {
    color: '#FFFFFF',
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
    borderTopColor: '#F5EFE6',
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
    borderTopColor: '#F5EFE6',
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
    backgroundColor: '#D9552B',
  },
  actionBtnOutline: {
    borderWidth: 1.5,
    borderColor: '#D9552B',
    backgroundColor: 'transparent',
  },
  actionBtnDisabled: {
    opacity: 0.5,
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  actionBtnTextOutline: {
    color: '#D9552B',
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
    color: '#D9552B',
    textAlign: 'center',
    paddingHorizontal: 32,
    marginBottom: 16,
  },
  retryBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#D9552B',
  },
  retryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#D9552B',
  },
  // Cancel order button
  cancelBtn: {
    marginTop: 8,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#9CA3AF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  cancelBtnConfirming: {
    borderColor: '#D9552B',
    backgroundColor: '#FFF3EC',
  },
  cancelBtnTextConfirming: {
    color: '#D9552B',
  },
  // Assign courier secondary button
  shipmentBtn: {
    marginTop: 8,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D9552B',
    backgroundColor: '#FFF3EC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shipmentBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#D9552B',
  },
})
