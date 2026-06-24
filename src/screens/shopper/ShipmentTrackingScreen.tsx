import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { supabase } from '../../lib/supabase'
import { Database } from '../../types/supabase'
import type { ShopperStackParamList } from '../../navigation/RootNavigator'

type Props = NativeStackScreenProps<ShopperStackParamList, 'ShipmentTracking'>
type OrderStatus    = Database['public']['Enums']['order_status']
type ShipmentStatus = Database['public']['Enums']['shipment_status']
type CourierType    = Database['public']['Enums']['courier_type']

// ---------------------------------------------------------------------------
// Queries — outside component for stable ReturnType inference
// ---------------------------------------------------------------------------

const fetchOrderDetail = (orderId: string) =>
  supabase
    .from('orders')
    .select(`
      id, order_number, status, total_usd, delivery_address, created_at,
      stores ( name )
    `)
    .eq('id', orderId)
    .single()

type OrderDetail = NonNullable<Awaited<ReturnType<typeof fetchOrderDetail>>['data']>

const fetchShipmentForOrder = (orderId: string) =>
  supabase
    .from('shipments')
    .select('id, tracking_id, courier_name, courier_phone, courier_type, status')
    .eq('order_id', orderId)
    .maybeSingle()

type Shipment = NonNullable<
  Awaited<ReturnType<typeof fetchShipmentForOrder>>['data']
>

const fetchShipmentEvents = (shipmentId: string) =>
  supabase
    .from('shipment_events')
    .select('id, event_type, description, location, occurred_at')
    .eq('shipment_id', shipmentId)
    .order('occurred_at', { ascending: true })

type ShipmentEvent = NonNullable<
  Awaited<ReturnType<typeof fetchShipmentEvents>>['data']
>[0]

// ---------------------------------------------------------------------------
// Badge / label maps
// ---------------------------------------------------------------------------

const ORDER_STATUS_BADGE: Record<
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

const SHIPMENT_STATUS_BADGE: Record<
  ShipmentStatus,
  { label: string; color: string; bg: string }
> = {
  pending:          { label: 'Pending',          color: '#92400E', bg: '#FEF3C7' },
  picked_up:        { label: 'Picked Up',        color: '#1E3A8A', bg: '#DBEAFE' },
  in_transit:       { label: 'In Transit',       color: '#5B21B6', bg: '#EDE9FE' },
  out_for_delivery: { label: 'Out for Delivery', color: '#9A3412', bg: '#FFEDD5' },
  delivered:        { label: 'Delivered',        color: '#166534', bg: '#DCFCE7' },
  failed:           { label: 'Delivery Failed',  color: '#991B1B', bg: '#FEE2E2' },
  returned:         { label: 'Returned',         color: '#6B7280', bg: '#F3F4F6' },
}

const COURIER_LABEL: Record<CourierType, string> = {
  aramex:        'Aramex',
  dhl:           'DHL',
  fedex:         'FedEx',
  tnt:           'TNT',
  local_courier: 'Local Courier',
  internal:      'Internal',
  other:         'Other',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatEventType(raw: string): string {
  return raw
    .split(/[_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function resolveStoreName(stores: unknown): string {
  if (!stores) return ''
  const s = Array.isArray(stores) ? stores[0] : stores
  return (s as { name?: string })?.name ?? ''
}

// ---------------------------------------------------------------------------
// TimelineItem
// ---------------------------------------------------------------------------

const DOT_SIZE   = 14
const LINE_WIDTH = 2

type TimelineItemProps = {
  event:    ShipmentEvent
  isLatest: boolean
  isLast:   boolean
}

function TimelineItem({ event, isLatest, isLast }: TimelineItemProps) {
  return (
    <View style={tlStyles.row}>
      {/* Left rail: dot + connecting line */}
      <View style={tlStyles.rail}>
        <View style={[tlStyles.dot, isLatest && tlStyles.dotLatest]} />
        {!isLast && <View style={tlStyles.line} />}
      </View>

      {/* Right: event content */}
      <View style={[tlStyles.content, isLast && tlStyles.contentLast]}>
        <Text style={[tlStyles.eventType, isLatest && tlStyles.eventTypeLatest]}>
          {formatEventType(event.event_type)}
        </Text>
        {event.description ? (
          <Text style={tlStyles.eventDesc}>{event.description}</Text>
        ) : null}
        {event.location ? (
          <Text style={tlStyles.eventLocation}>📍 {event.location}</Text>
        ) : null}
        <Text style={tlStyles.eventTime}>{formatDateTime(event.occurred_at)}</Text>
      </View>
    </View>
  )
}

const tlStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  rail: {
    width: DOT_SIZE,
    alignItems: 'center',
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    borderWidth: 2,
    borderColor: '#D9CFC4',
    backgroundColor: '#FFFFFF',
  },
  dotLatest: {
    borderColor: '#C8622A',
    backgroundColor: '#C8622A',
  },
  line: {
    width: LINE_WIDTH,
    flex: 1,
    backgroundColor: '#E8E0D5',
    marginTop: 3,
    minHeight: 24,
  },
  content: {
    flex: 1,
    paddingBottom: 22,
    gap: 3,
  },
  contentLast: {
    paddingBottom: 0,
  },
  eventType: {
    fontSize: 14,
    fontWeight: '600',
    color: '#7A6A5A',
  },
  eventTypeLatest: {
    color: '#1C1612',
    fontWeight: '700',
  },
  eventDesc: {
    fontSize: 13,
    color: '#5A4A3A',
    lineHeight: 18,
  },
  eventLocation: {
    fontSize: 12,
    color: '#7A6A5A',
  },
  eventTime: {
    fontSize: 11,
    color: '#B0A090',
    marginTop: 1,
  },
})

// ---------------------------------------------------------------------------
// ShipmentTrackingScreen
// ---------------------------------------------------------------------------

export default function ShipmentTrackingScreen({ route, navigation }: Props) {
  const { orderId } = route.params

  const [order,    setOrder]    = useState<OrderDetail | null>(null)
  const [shipment, setShipment] = useState<Shipment | null>(null)
  const [events,   setEvents]   = useState<ShipmentEvent[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    // 1 — order details (required; defines the screen context)
    const { data: orderData, error: orderErr } = await fetchOrderDetail(orderId)
    if (orderErr || !orderData) {
      setError(orderErr?.message ?? 'Order not found.')
      setLoading(false)
      return
    }
    setOrder(orderData)

    // 2 — shipment (optional: may not exist until vendor dispatches)
    const { data: shipmentData, error: shipmentErr } = await fetchShipmentForOrder(orderId)
    if (shipmentErr) {
      setError(shipmentErr.message)
      setLoading(false)
      return
    }
    setShipment(shipmentData ?? null)

    // 3 — events (only when a shipment row exists)
    if (shipmentData?.id) {
      const { data: eventsData } = await fetchShipmentEvents(shipmentData.id)
      setEvents(eventsData ?? [])
    }

    setLoading(false)
  }, [orderId])

  useEffect(() => {
    load()
  }, [load])

  const storeName = useMemo(() => resolveStoreName(order?.stores), [order])

  // ---- Guards ----

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, styles.centered]}>
        <ActivityIndicator size="large" color="#C8622A" />
      </SafeAreaView>
    )
  }

  if (error || !order) {
    return (
      <SafeAreaView style={[styles.safe, styles.centered]}>
        <Text style={styles.errorText}>{error ?? 'Order not found.'}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={load}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    )
  }

  const orderBadge    = ORDER_STATUS_BADGE[order.status]
  const shipmentBadge = shipment ? SHIPMENT_STATUS_BADGE[shipment.status] : null

  // ---- Render ----

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Order Tracking</Text>
          {order.order_number ? (
            <Text style={styles.headerSub}>{order.order_number}</Text>
          ) : null}
        </View>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Order info card ── */}
        <View style={styles.card}>
          <View style={styles.cardRow}>
            {storeName ? (
              <Text style={styles.cardStoreName}>{storeName}</Text>
            ) : null}
            <View style={[styles.badge, { backgroundColor: orderBadge.bg }]}>
              <Text style={[styles.badgeText, { color: orderBadge.color }]}>
                {orderBadge.label}
              </Text>
            </View>
          </View>

          <Text style={styles.cardTotal}>
            ${Number(order.total_usd).toFixed(2)} USD
          </Text>

          {order.delivery_address ? (
            <Text style={styles.cardAddress} numberOfLines={4}>
              📍 {order.delivery_address}
            </Text>
          ) : null}
        </View>

        {/* ── Shipment info card ── */}
        {shipment ? (
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <Text style={styles.cardSectionTitle}>Shipment</Text>
              {shipmentBadge && (
                <View style={[styles.badge, { backgroundColor: shipmentBadge.bg }]}>
                  <Text style={[styles.badgeText, { color: shipmentBadge.color }]}>
                    {shipmentBadge.label}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Courier</Text>
              <Text style={styles.metaValue}>
                {COURIER_LABEL[shipment.courier_type]} — {shipment.courier_name}
              </Text>
            </View>

            {shipment.tracking_id ? (
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Tracking ID</Text>
                <Text style={[styles.metaValue, styles.trackingId]}>
                  {shipment.tracking_id}
                </Text>
              </View>
            ) : null}

            {shipment.courier_phone ? (
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Courier Phone</Text>
                <Text style={styles.metaValue}>{shipment.courier_phone}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* ── Timeline card ── */}
        <View style={styles.card}>
          <Text style={styles.cardSectionTitle}>Timeline</Text>

          {events.length > 0 ? (
            <View style={styles.timeline}>
              {events.map((event, index) => (
                <TimelineItem
                  key={event.id}
                  event={event}
                  isLatest={index === events.length - 1}
                  isLast={index === events.length - 1}
                />
              ))}
            </View>
          ) : (
            <View style={styles.noEvents}>
              <Text style={styles.noEventsIcon}>📦</Text>
              <Text style={styles.noEventsText}>
                {shipment
                  ? 'No tracking events yet. Check back soon.'
                  : 'Tracking will appear here once your order is dispatched by the vendor.'}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: '#FAF7F2' },
  centered: { justifyContent: 'center', alignItems: 'center' },
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
    paddingBottom: 48,
  },
  // Cards
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
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardStoreName: {
    fontSize: 11,
    fontWeight: '600',
    color: '#7A6A5A',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardTotal: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1C1612',
  },
  cardAddress: {
    fontSize: 13,
    color: '#7A6A5A',
    lineHeight: 19,
  },
  cardSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1C1612',
  },
  // Badge
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  // Shipment meta rows
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingTop: 2,
    gap: 8,
  },
  metaLabel: {
    fontSize: 12,
    color: '#7A6A5A',
    fontWeight: '500',
    flex: 0.38,
  },
  metaValue: {
    fontSize: 13,
    color: '#1C1612',
    fontWeight: '500',
    flex: 0.62,
    textAlign: 'right',
  },
  trackingId: {
    color: '#C8622A',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  // Timeline
  timeline: {
    marginTop: 6,
  },
  // No events / no shipment state
  noEvents: {
    alignItems: 'center',
    paddingVertical: 28,
    gap: 10,
  },
  noEventsIcon: {
    fontSize: 36,
  },
  noEventsText: {
    fontSize: 13,
    color: '#7A6A5A',
    textAlign: 'center',
    lineHeight: 19,
    paddingHorizontal: 12,
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
