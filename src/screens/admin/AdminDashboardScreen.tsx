import React, { useCallback, useState } from 'react'
import {
  ActivityIndicator,
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
import { useT } from '../../lib/i18n'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/useAuthStore'
import type { AdminStackParamList } from '../../navigation/RootNavigator'

type Props = NativeStackScreenProps<AdminStackParamList, 'AdminDashboard'>

// ---------------------------------------------------------------------------
// Domain types — shape produced by the admin_vendor_analytics() SQL function
// ---------------------------------------------------------------------------

interface MonthCount {
  month: string
  count: number
}

interface TopVendorByProducts {
  store_id: string
  name: string
  product_count: number
}

interface TopVendorByActivity {
  store_id: string
  name: string
  last_order_at: string | null
}

interface AdminVendorAnalytics {
  total_vendors: number
  vendors_by_status: Record<string, number>
  new_vendors_by_month: MonthCount[]
  top_vendors_by_products: TopVendorByProducts[]
  top_vendors_by_recent_activity: TopVendorByActivity[]
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

function monthLabel(yyyyMm: string): string {
  return new Date(`${yyyyMm}-01`).toLocaleDateString('en-GB', { month: 'short' })
}

const STATUS_COLOR: Record<string, string> = {
  active: '#166534',
  pending: '#92400E',
  suspended: '#991B1B',
  inactive: '#6B7280',
}

function statusColor(status: string): string {
  return STATUS_COLOR[status] ?? '#6B7280'
}

// ---------------------------------------------------------------------------
// AdminDashboardScreen
// ---------------------------------------------------------------------------

export default function AdminDashboardScreen({ navigation }: Props) {
  const user = useAuthStore(s => s.user)
  const t = useT()

  const [stats, setStats]     = useState<AdminVendorAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    const { data, error: rpcErr } = await supabase.rpc('admin_vendor_analytics')

    if (rpcErr) {
      setError(rpcErr.message)
    } else {
      // Shape is fixed by the SQL function; Json → typed view of it
      setStats((data as unknown as AdminVendorAnalytics) ?? null)
    }

    setLoading(false)
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load]))

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
        <Text style={styles.errorText}>{t('adminDash.analyticsError', { msg: error })}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={load}>
          <Text style={styles.retryText}>{t('common.retry')}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    )
  }

  const statusEntries = Object.entries(stats?.vendors_by_status ?? {}).sort((a, b) => b[1] - a[1])
  const months         = stats?.new_vendors_by_month ?? []
  const maxMonthCount  = Math.max(1, ...months.map(m => m.count))
  const byProducts     = stats?.top_vendors_by_products ?? []
  const byActivity     = stats?.top_vendors_by_recent_activity ?? []

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>{t('adminDash.title')}</Text>
          <Text style={styles.headerSub}>{t('adminDash.subtitle')}</Text>
        </View>
        <TouchableOpacity
          style={styles.vendorsBtn}
          onPress={() => navigation.navigate('VendorList')}
          activeOpacity={0.8}
        >
          <Text style={styles.vendorsBtnText}>{t('adminDash.vendorCards')}</Text>
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

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Total vendors + status mix */}
        <View style={styles.row}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>{t('adminDash.statTotalVendors')}</Text>
            <Text style={styles.statValue}>{stats?.total_vendors ?? 0}</Text>
          </View>

          <View style={[styles.statCard, styles.statCardWide]}>
            <Text style={styles.statLabel}>{t('adminDash.statByStatus')}</Text>
            {statusEntries.length === 0 ? (
              <Text style={styles.statSub}>{t('adminDash.noVendorsYet')}</Text>
            ) : (
              statusEntries.map(([status, count]) => (
                <View key={status} style={styles.breakdownRow}>
                  <View style={[styles.statusDot, { backgroundColor: statusColor(status) }]} />
                  <Text style={styles.breakdownName} numberOfLines={1}>{status}</Text>
                  <Text style={styles.breakdownUnits}>{count}</Text>
                </View>
              ))
            )}
          </View>
        </View>

        {/* New vendors over time */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('adminDash.statNewVendors')}</Text>
          {months.every(m => m.count === 0) ? (
            <Text style={styles.statSub}>{t('adminDash.noVendorsYet')}</Text>
          ) : (
            <View style={styles.barChart}>
              {months.map(m => (
                <View key={m.month} style={styles.barColumn}>
                  <Text style={styles.barCount}>{m.count}</Text>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        { height: `${Math.max(4, (m.count / maxMonthCount) * 100)}%` },
                      ]}
                    />
                  </View>
                  <Text style={styles.barLabel}>{monthLabel(m.month)}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Top vendors by products listed */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('adminDash.statTopByProducts')}</Text>
          {byProducts.length === 0 ? (
            <Text style={styles.statSub}>{t('adminDash.noVendorsYet')}</Text>
          ) : (
            byProducts.map((v, i) => (
              <View key={v.store_id} style={styles.listRow}>
                <Text style={styles.listRank}>{i + 1}</Text>
                <Text style={styles.listName} numberOfLines={1}>{v.name}</Text>
                <Text style={styles.listValue}>{t('adminDash.productsCount', { count: v.product_count })}</Text>
              </View>
            ))
          )}
        </View>

        {/* Top vendors by recent activity */}
        <View style={[styles.section, styles.sectionLast]}>
          <Text style={styles.sectionTitle}>{t('adminDash.statTopByActivity')}</Text>
          {byActivity.length === 0 ? (
            <Text style={styles.statSub}>{t('adminDash.noActivityYet')}</Text>
          ) : (
            byActivity.map((v, i) => (
              <View key={v.store_id} style={styles.listRow}>
                <Text style={styles.listRank}>{i + 1}</Text>
                <Text style={styles.listName} numberOfLines={1}>{v.name}</Text>
                <Text style={styles.listValue}>{formatDate(v.last_order_at)}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

// ---------------------------------------------------------------------------
// Styles — palette matches VendorDashboardScreen
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
  vendorsBtn: {
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#D9552B',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  vendorsBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#D9552B',
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
  // Content
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  statCard: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: '#F5EFE6',
    padding: 14,
    gap: 4,
  },
  statCardWide: {
    flex: 2,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#7A6A5A',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  statValue: {
    fontSize: 30,
    fontWeight: '800',
    color: '#1C1612',
    letterSpacing: -0.5,
  },
  statSub: {
    fontSize: 12,
    color: '#7A6A5A',
    fontWeight: '500',
    marginTop: 2,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  breakdownName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#1C1612',
    textTransform: 'capitalize',
  },
  breakdownUnits: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1C1612',
  },
  // Sections
  section: {
    borderRadius: 16,
    backgroundColor: '#F5EFE6',
    padding: 16,
  },
  sectionLast: {
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1C1612',
    marginBottom: 12,
  },
  // Bar chart
  barChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 120,
    gap: 8,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
    justifyContent: 'flex-end',
  },
  barCount: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1C1612',
    marginBottom: 4,
  },
  barTrack: {
    width: '60%',
    flex: 1,
    justifyContent: 'flex-end',
  },
  barFill: {
    width: '100%',
    backgroundColor: '#D9552B',
    borderRadius: 6,
    minHeight: 4,
  },
  barLabel: {
    fontSize: 11,
    color: '#7A6A5A',
    fontWeight: '600',
    marginTop: 6,
  },
  // Lists
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#ECE6DC',
  },
  listRank: {
    width: 18,
    fontSize: 13,
    fontWeight: '800',
    color: '#D9552B',
  },
  listName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1612',
  },
  listValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#7A6A5A',
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
})
