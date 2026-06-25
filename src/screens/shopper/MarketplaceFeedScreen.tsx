import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  ListRenderItem,
  RefreshControl,
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
import type { ShopperStackParamList } from '../../navigation/RootNavigator'

type Props = NativeStackScreenProps<ShopperStackParamList, 'MarketplaceFeed'>

// ---------------------------------------------------------------------------
// Query helper — defined outside component so ReturnType inference is stable
// ---------------------------------------------------------------------------

const fetchFeed = () =>
  supabase
    .from('products')
    .select(
      `
      id,
      name,
      price_usd,
      stores!inner ( name, region ),
      product_images!inner ( url, position ),
      product_variants ( size, color, color_hex, stock )
    `,
    )
    .eq('status', 'active')
    .eq('stores.status', 'active')
    .eq('product_images.position', 0)
    .order('created_at', { ascending: false })

type FeedProduct = NonNullable<Awaited<ReturnType<typeof fetchFeed>>['data']>[0]

// ---------------------------------------------------------------------------
// Region filter constants
// ---------------------------------------------------------------------------

const ALL_REGIONS = [
  'Beirut',
  'Mount Lebanon',
  'North',
  'South',
  'Bekaa',
  'Nabatieh',
  'Akkar',
  'Baalbek-Hermel',
] as const

type LebanonRegion = typeof ALL_REGIONS[number]

// ---------------------------------------------------------------------------
// Layout constants  (8pt grid)
// ---------------------------------------------------------------------------

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const H_PAD      = 16
const COL_GAP    = 12
const CARD_WIDTH = (SCREEN_WIDTH - H_PAD * 2 - COL_GAP) / 2
const IMAGE_HEIGHT = CARD_WIDTH * (4 / 3)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveStore(stores: FeedProduct['stores']): { name: string; region: string | null } | null {
  if (!stores) return null
  return (Array.isArray(stores) ? stores[0] : stores) as { name: string; region: string | null } | null
}

// ---------------------------------------------------------------------------
// ProductCard
// ---------------------------------------------------------------------------

type CardProps = { item: FeedProduct; onPress: (item: FeedProduct) => void }

function ProductCard({ item, onPress }: CardProps) {
  const coverUrl = Array.isArray(item.product_images)
    ? item.product_images[0]?.url
    : (item.product_images as { url: string } | null)?.url

  const store = resolveStore(item.stores)

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onPress(item)}
      activeOpacity={0.88}
    >
      {coverUrl ? (
        <Image
          source={{ uri: coverUrl }}
          style={styles.cardImage}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.cardImage, styles.imagePlaceholder]} />
      )}

      <View style={styles.cardInfo}>
        {store ? (
          <Text style={styles.storeName} numberOfLines={1}>{store.name}</Text>
        ) : null}
        <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
        <Text style={styles.price}>${Number(item.price_usd).toFixed(0)}</Text>
      </View>
    </TouchableOpacity>
  )
}

// ---------------------------------------------------------------------------
// MarketplaceFeedScreen
// ---------------------------------------------------------------------------

export default function MarketplaceFeedScreen({ navigation }: Props) {
  const user      = useAuthStore(s => s.user)
  const initial   = (user?.phone ?? user?.email ?? '?').replace(/^\+/, '').charAt(0).toUpperCase()
  const cartCount = useCartStore(s => s.items.reduce((sum, i) => sum + i.quantity, 0))

  const [products,       setProducts]       = useState<FeedProduct[]>([])
  const [loading,        setLoading]        = useState(true)
  const [refreshing,     setRefreshing]     = useState(false)
  const [error,          setError]          = useState<string | null>(null)
  const [searchText,     setSearchText]     = useState('')
  const [selectedRegion, setSelectedRegion] = useState<LebanonRegion | null>(null)

  // ---- Fetch ----

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true)
    setError(null)
    const { data, error: fetchError } = await fetchFeed()
    if (fetchError) {
      setError(fetchError.message)
    } else {
      setProducts(data ?? [])
    }
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleRefresh = useCallback(() => {
    setRefreshing(true)
    load(true)
  }, [load])

  // ---- Client-side filtering ----

  const filteredProducts = useMemo(() => {
    let result = products

    if (selectedRegion) {
      result = result.filter(p => {
        const r = resolveStore(p.stores)?.region
        return r === selectedRegion || r == null  // null = delivers nationwide
      })
    }

    const q = searchText.trim().toLowerCase()
    if (q) {
      result = result.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (resolveStore(p.stores)?.name ?? '').toLowerCase().includes(q),
      )
    }

    return result
  }, [products, searchText, selectedRegion])

  // ---- Handlers ----

  const handlePress = useCallback(
    (item: FeedProduct) => navigation.navigate('ProductDetail', { productId: item.id }),
    [navigation],
  )

  const handleRegionPress = useCallback((region: LebanonRegion) => {
    setSelectedRegion(prev => (prev === region ? null : region))
  }, [])

  const renderItem: ListRenderItem<FeedProduct> = useCallback(
    ({ item }) => <ProductCard item={item} onPress={handlePress} />,
    [handlePress],
  )

  const keyExtractor = useCallback((item: FeedProduct) => item.id, [])

  // ---- States ----

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
      </SafeAreaView>
    )
  }

  const isFiltering = searchText.trim().length > 0 || selectedRegion !== null

  return (
    <SafeAreaView style={styles.safe}>

      {/* ── Top header row ── */}
      <View style={styles.header}>
        <Text style={styles.heading}>Marketplace</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.cartBtn}
            onPress={() => navigation.navigate('Cart')}
            activeOpacity={0.8}
          >
            <Text style={styles.cartIcon}>🛍</Text>
            {cartCount > 0 && (
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeText}>{cartCount > 9 ? '9+' : cartCount}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.ordersBtn}
            onPress={() => navigation.navigate('MyOrders')}
            activeOpacity={0.8}
          >
            <Text style={styles.ordersIcon}>📋</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.profileBtn}
            onPress={() => navigation.navigate('Profile')}
            activeOpacity={0.8}
          >
            <Text style={styles.profileBtnText}>{initial}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Search bar ── */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Search products or stores…"
            placeholderTextColor="#B0A090"
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
        </View>
      </View>

      {/* ── Region filter pills ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.regionScroll}
        style={styles.regionBar}
      >
        {ALL_REGIONS.map(region => {
          const active = selectedRegion === region
          return (
            <TouchableOpacity
              key={region}
              style={[styles.regionPill, active && styles.regionPillActive]}
              onPress={() => handleRegionPress(region)}
              activeOpacity={0.75}
            >
              <Text style={[styles.regionPillText, active && styles.regionPillTextActive]}>
                {region}
              </Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      {/* ── Product grid ── */}
      <FlatList
        data={filteredProducts}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        numColumns={2}
        contentContainerStyle={styles.listContent}
        columnWrapperStyle={styles.row}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#C8622A"
            colors={['#C8622A']}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>
              {isFiltering ? 'No matches found' : 'No products available yet'}
            </Text>
            <Text style={styles.emptyBody}>
              {isFiltering
                ? 'Try adjusting your search or selecting a different region.'
                : 'Check back soon — new boutiques are joining Souk every day.'}
            </Text>
            {isFiltering && (
              <TouchableOpacity
                style={styles.clearBtn}
                onPress={() => { setSearchText(''); setSelectedRegion(null) }}
                activeOpacity={0.8}
              >
                <Text style={styles.clearBtnText}>Clear filters</Text>
              </TouchableOpacity>
            )}
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
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: H_PAD,
    paddingTop: 8,
    paddingBottom: 12,
  },
  heading: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1C1612',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cartBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ordersBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ordersIcon: { fontSize: 22 },
  cartIcon: { fontSize: 24 },
  cartBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#C8622A',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  cartBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FAF7F2',
    lineHeight: 12,
  },
  profileBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#C8622A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FAF7F2',
  },

  // ── Search bar ──
  searchRow: {
    paddingHorizontal: H_PAD,
    paddingBottom: 10,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E8E0D5',
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
    shadowColor: '#1C1612',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  searchIcon: {
    fontSize: 15,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#1C1612',
    paddingVertical: 0,
  },

  // ── Region pill bar ──
  regionBar: {
    borderBottomWidth: 1,
    borderBottomColor: '#E8E0D5',
    marginBottom: 2,
  },
  regionScroll: {
    paddingHorizontal: H_PAD,
    paddingBottom: 10,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  regionPill: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: '#D9CFC4',
    backgroundColor: '#FAF7F2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  regionPillActive: {
    backgroundColor: '#C8622A',
    borderColor: '#C8622A',
  },
  regionPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1C1612',
  },
  regionPillTextActive: {
    color: '#FAF7F2',
  },

  // ── Product grid ──
  listContent: {
    paddingHorizontal: H_PAD,
    paddingTop: 14,
    paddingBottom: 40,
    flexGrow: 1,
  },
  row: {
    justifyContent: 'space-between',
    marginBottom: COL_GAP,
  },
  card: {
    width: CARD_WIDTH,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    shadowColor: '#1C1612',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
  },
  cardImage: {
    width: CARD_WIDTH,
    height: IMAGE_HEIGHT,
  },
  imagePlaceholder: {
    backgroundColor: '#E8E0D5',
  },
  cardInfo: {
    padding: 10,
    gap: 3,
  },
  storeName: {
    fontSize: 10,
    fontWeight: '600',
    color: '#7A6A5A',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  productName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1C1612',
    lineHeight: 18,
  },
  price: {
    fontSize: 14,
    fontWeight: '700',
    color: '#C8622A',
    marginTop: 2,
  },

  // ── Empty state ──
  emptyState: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 64,
    paddingHorizontal: 32,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1C1612',
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: 14,
    color: '#7A6A5A',
    textAlign: 'center',
    lineHeight: 20,
  },
  clearBtn: {
    marginTop: 6,
    height: 44,
    paddingHorizontal: 24,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#C8622A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#C8622A',
  },

  // ── Error ──
  errorText: {
    fontSize: 14,
    color: '#C8622A',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
})
