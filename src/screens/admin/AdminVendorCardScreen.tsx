import React, { useCallback, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useT } from '../../lib/i18n'
import { supabase } from '../../lib/supabase'
import type { AdminStackParamList } from '../../navigation/RootNavigator'

type Props = NativeStackScreenProps<AdminStackParamList, 'VendorCard'>

interface VendorCard {
  store_id: string
  name: string
  logo_url: string | null
  region: string | null
  rating: number | null
  review_count: number
  member_since: string | null
  products_listed: number
  orders_delivered: number
  total_revenue_usd: number
}

function formatMemberSince(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

export default function AdminVendorCardScreen({ route, navigation }: Props) {
  const { storeId, name } = route.params
  const t = useT()

  const [card, setCard]       = useState<VendorCard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    const { data, error: rpcErr } = await supabase.rpc('admin_vendor_card', { p_store_id: storeId })

    if (rpcErr) {
      setError(rpcErr.message)
    } else {
      setCard((data as unknown as VendorCard) ?? null)
    }

    setLoading(false)
  }, [storeId])

  useFocusEffect(useCallback(() => { load() }, [load]))

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, styles.centered]}>
        <ActivityIndicator size="large" color="#D9552B" />
      </SafeAreaView>
    )
  }

  if (error || !card) {
    return (
      <SafeAreaView style={[styles.safe, styles.centered]}>
        <Text style={styles.errorText}>
          {error ? t('adminVendorCard.error', { msg: error }) : t('adminVendorCard.notFound')}
        </Text>
        <TouchableOpacity style={styles.retryBtn} onPress={load}>
          <Text style={styles.retryText}>{t('common.retry')}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <LinearGradient
          colors={['#E4693C', '#B8431F']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}
        >
          {card.logo_url ? (
            <Image source={{ uri: card.logo_url }} style={styles.logo} contentFit="cover" />
          ) : (
            <View style={styles.logoFallback}>
              <Text style={styles.logoFallbackText}>{(card.name ?? name).charAt(0).toUpperCase()}</Text>
            </View>
          )}

          <Text style={styles.vendorName}>{card.name ?? name}</Text>
          <Text style={styles.onGetlevant}>{t('adminVendorCard.onGetlevant')}</Text>

          {card.region ? (
            <View style={styles.regionPill}>
              <Text style={styles.regionPillText}>{card.region}</Text>
            </View>
          ) : null}

          {card.rating != null ? (
            <Text style={styles.rating}>
              {`★ ${card.rating.toFixed(1)}`}
              {card.review_count > 0 ? ` · ${t('adminVendorCard.reviews', { count: card.review_count })}` : ''}
            </Text>
          ) : null}

          <View style={styles.divider} />

          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{card.products_listed}</Text>
              <Text style={styles.statLabel}>{t('adminVendorCard.productsListed')}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{card.orders_delivered}</Text>
              <Text style={styles.statLabel}>{t('adminVendorCard.ordersDelivered')}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>${Number(card.total_revenue_usd).toFixed(0)}</Text>
              <Text style={styles.statLabel}>{t('adminVendorCard.totalEarned')}</Text>
            </View>
          </View>

          {card.member_since ? (
            <Text style={styles.memberSince}>
              {t('adminVendorCard.memberSince', { date: formatMemberSince(card.member_since) })}
            </Text>
          ) : null}

          <Text style={styles.brandFooter}>{t('adminVendorCard.brandFooter')}</Text>
        </LinearGradient>

        <Text style={styles.hint}>{t('adminVendorCard.screenshotHint')}</Text>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#FFF3EC',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  topBar: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  backBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backBtnText: {
    fontSize: 20,
    color: '#1C1612',
  },
  scrollContent: {
    padding: 20,
    paddingTop: 12,
    alignItems: 'center',
    gap: 16,
  },
  card: {
    width: '100%',
    borderRadius: 28,
    paddingVertical: 36,
    paddingHorizontal: 24,
    alignItems: 'center',
    shadowColor: '#1C1612',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 6,
  },
  logo: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  logoFallback: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoFallbackText: {
    fontSize: 34,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  vendorName: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 18,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  onGetlevant: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.85)',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginTop: 4,
  },
  regionPill: {
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  regionPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  rating: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFE9DE',
    marginTop: 10,
  },
  divider: {
    width: '100%',
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginTop: 24,
    marginBottom: 20,
  },
  statsGrid: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  memberSince: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.75)',
    marginTop: 26,
  },
  brandFooter: {
    fontSize: 12,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.9)',
    marginTop: 6,
    letterSpacing: 0.3,
  },
  hint: {
    fontSize: 12,
    color: '#7A6A5A',
    textAlign: 'center',
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
})
