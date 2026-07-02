import React, { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  ListRenderItem,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
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
      product_images ( url, position ),
      product_variants ( size, color, color_hex, stock )
    `,
    )
    .eq('status', 'active')
    .eq('stores.status', 'active')
    .order('created_at', { ascending: false })

type FeedProduct = NonNullable<Awaited<ReturnType<typeof fetchFeed>>['data']>[0]

// ---------------------------------------------------------------------------
// Sort options
// ---------------------------------------------------------------------------

type SortOption = 'newest' | 'price_asc' | 'price_desc'

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'newest',     label: 'Newest'  },
  { value: 'price_asc',  label: 'Price ↑' },
  { value: 'price_desc', label: 'Price ↓' },
]

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
const COL_GAP    = 10
const CARD_WIDTH = (SCREEN_WIDTH - H_PAD * 2 - COL_GAP) / 2
const IMAGE_HEIGHT = CARD_WIDTH * 1.25   // 4:5 portrait — premium product feel

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
  const images = Array.isArray(item.product_images) ? item.product_images : []
  const coverUrl = [...images].sort((a, b) => a.position - b.position)[0]?.url ?? null

  const store = resolveStore(item.stores)
  const price = `$${Number(item.price_usd).toFixed(0)}`

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onPress(item)}
      activeOpacity={0.92}
    >
      {/* Image + gradient overlay */}
      <View style={styles.imageContainer}>
        {coverUrl ? (
          <Image
            source={{ uri: coverUrl }}
            style={styles.cardImage}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View style={[styles.cardImage, styles.imagePlaceholder]} />
        )}
        <LinearGradient
          colors={['transparent', 'rgba(28,22,18,0.62)']}
          style={styles.imageGradient}
        />
        {/* Price badge pinned to bottom-right of image */}
        <View style={styles.priceBadge}>
          <Text style={styles.priceBadgeText}>{price}</Text>
        </View>
      </View>

      {/* Text block */}
      <View style={styles.cardInfo}>
        {store ? (
          <Text style={styles.storeName} numberOfLines={1}>{store.name}</Text>
        ) : null}
        <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
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
  const [sortBy,         setSortBy]         = useState<SortOption>('newest')

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

  useFocusEffect(useCallback(() => { load() }, [load]))

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
        return r === selectedRegion || r == null
      })
    }

    const q = searchText.trim().toLowerCase()
    if (q) {
      result = result.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (resolveStore(p.stores)?.name ?? '').toLowerCase().includes(q),
      )
    }

    if (sortBy === 'price_asc') {
      result = [...result].sort((a, b) => Number(a.price_usd) - Number(b.price_usd))
    } else if (sortBy === 'price_desc') {
      result = [...result].sort((a, b) => Number(b.price_usd) - Number(a.price_usd))
    }

    return result
  }, [products, searchText, selectedRegion, sortBy])

  // ---- Handlers ----

  const handlePress = useCallback(
    (item: FeedProduct) => navigation.navigate('ProductDetail', { productId: item.id }),
    [navigation],
  )

  const handleRegionPress = useCallback((region: LebanonRegion) => {
    setSelectedRegion(prev => (prev === region ? null : region))
  }, [])

  const clearFilters = useCallback(() => {
    setSearchText('')
    setSelectedRegion(null)
    setSortBy('newest')
  }, [])

  const renderItem: ListRenderItem<FeedProduct> = useCallback(
    ({ item }) => <ProductCard item={item} onPress={handlePress} />,
    [handlePress],
  )

  const keyExtractor = useCallback((item: FeedProduct) => item.id, [])

  const isFiltering = searchText.trim().length > 0 || selectedRegion !== null || sortBy !== 'newest'

  // ---- Loading / error ----

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
        <TouchableOpacity style={styles.retryBtn} onPress={() => load()} activeOpacity={0.8}>
          <Text style={styles.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.brandName}>Souk</Text>
          <Text style={styles.brandSub}>Local boutiques, delivered</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => navigation.navigate('MyOrders')}
            activeOpacity={0.75}
          >
            <Text style={styles.iconBtnText}>📋</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => navigation.navigate('Cart')}
            activeOpacity={0.75}
          >
            <Text style={styles.iconBtnText}>🛍</Text>
            {cartCount > 0 && (
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeText}>{cartCount > 9 ? '9+' : cartCount}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.avatarBtn}
            onPress={() => navigation.navigate('Profile')}
            activeOpacity={0.8}
          >
            <Text style={styles.avatarBtnText}>{initial}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Search bar ── */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>⌕</Text>
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

      {/* ── Sort + Region strip ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterStrip}
        style={styles.filterBar}
      >
        {/* Sort pills */}
        {SORT_OPTIONS.map(opt => {
          const active = sortBy === opt.value
          return (
            <TouchableOpacity
              key={opt.value}
              style={[styles.pill, active && styles.pillSortActive]}
              onPress={() => setSortBy(opt.value)}
              activeOpacity={0.75}
            >
              <Text style={[styles.pillText, active && styles.pillSortActiveText]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          )
        })}

        {/* Divider */}
        <View style={styles.pillDivider} />

        {/* Region pills */}
        {ALL_REGIONS.map(region => {
          const active = selectedRegion === region
          return (
            <TouchableOpacity
              key={region}
              style={[styles.pill, active && styles.pillRegionActive]}
              onPress={() => handleRegionPress(region)}
              activeOpacity={0.75}
            >
              <Text style={[styles.pillText, active && styles.pillRegionActiveText]}>
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
        columnWrapperStyle={styles.columnWrapper}
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
            <Text style={styles.emptyEmoji}>🛍</Text>
            <Text style={styles.emptyTitle}>
              {isFiltering ? 'No matches' : 'Nothing here yet'}
            </Text>
            <Text style={styles.emptyBody}>
              {isFiltering
                ? 'Try a different search or region.'
                : 'New boutiques are joining Souk every day.'}
            </Text>
            {isFiltering && (
              <TouchableOpacity style={styles.clearBtn} onPress={clearFilters} activeOpacity={0.8}>
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
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: H_PAD,
    paddingTop: 6,
    paddingBottom: 14,
  },
  brandName: {
    fontSize: 30,
    fontWeight: '800',
    color: '#1C1612',
    letterSpacing: -0.5,
  },
  brandSub: {
    fontSize: 12,
    color: '#7A6A5A',
    fontWeight: '500',
    marginTop: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F0EBE3',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconBtnText: { fontSize: 18 },
  cartBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#C8622A',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  cartBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FAF7F2',
    lineHeight: 11,
  },
  avatarBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1C1612',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FAF7F2',
  },

  // ── Search ──
  searchRow: {
    paddingHorizontal: H_PAD,
    paddingBottom: 10,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E8E0D5',
    paddingHorizontal: 14,
    height: 48,
    gap: 8,
    shadowColor: '#1C1612',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  searchIcon: {
    fontSize: 18,
    color: '#7A6A5A',
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#1C1612',
    paddingVertical: 0,
  },

  // ── Filter strip (sort + region combined) ──
  filterBar: {
    borderBottomWidth: 1,
    borderBottomColor: '#E8E0D5',
    marginBottom: 2,
  },
  filterStrip: {
    paddingHorizontal: H_PAD,
    paddingBottom: 12,
    gap: 7,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pill: {
    height: 32,
    paddingHorizontal: 13,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#D9CFC4',
    backgroundColor: '#FAF7F2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#7A6A5A',
  },
  pillSortActive: {
    backgroundColor: '#1C1612',
    borderColor: '#1C1612',
  },
  pillSortActiveText: {
    color: '#FAF7F2',
  },
  pillRegionActive: {
    backgroundColor: '#C8622A',
    borderColor: '#C8622A',
  },
  pillRegionActiveText: {
    color: '#FAF7F2',
  },
  pillDivider: {
    width: 1,
    height: 20,
    backgroundColor: '#D9CFC4',
    marginHorizontal: 2,
  },

  // ── Product grid ──
  listContent: {
    paddingHorizontal: H_PAD,
    paddingTop: 16,
    paddingBottom: 48,
    flexGrow: 1,
  },
  columnWrapper: {
    justifyContent: 'space-between',
    marginBottom: COL_GAP,
  },

  // ── Product card ──
  card: {
    width: CARD_WIDTH,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    shadowColor: '#1C1612',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.09,
    shadowRadius: 12,
    elevation: 3,
  },
  imageContainer: {
    width: CARD_WIDTH,
    height: IMAGE_HEIGHT,
  },
  cardImage: {
    width: CARD_WIDTH,
    height: IMAGE_HEIGHT,
  },
  imagePlaceholder: {
    backgroundColor: '#EDE6DC',
  },
  imageGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: IMAGE_HEIGHT * 0.45,
  },
  priceBadge: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  priceBadgeText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1C1612',
  },
  cardInfo: {
    paddingHorizontal: 11,
    paddingTop: 9,
    paddingBottom: 11,
    gap: 3,
  },
  storeName: {
    fontSize: 10,
    fontWeight: '700',
    color: '#C8622A',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  productName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1C1612',
    lineHeight: 18,
  },

  // ── Empty state ──
  emptyState: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 72,
    paddingHorizontal: 36,
    gap: 8,
  },
  emptyEmoji: {
    fontSize: 40,
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1612',
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: 14,
    color: '#7A6A5A',
    textAlign: 'center',
    lineHeight: 21,
  },
  clearBtn: {
    marginTop: 8,
    height: 44,
    paddingHorizontal: 28,
    borderRadius: 22,
    backgroundColor: '#1C1612',
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FAF7F2',
  },

  // ── Error ──
  errorText: {
    fontSize: 14,
    color: '#C8622A',
    textAlign: 'center',
    paddingHorizontal: 32,
    marginBottom: 16,
  },
  retryBtn: {
    height: 44,
    paddingHorizontal: 28,
    borderRadius: 22,
    backgroundColor: '#1C1612',
    justifyContent: 'center',
    alignItems: 'center',
  },
  retryBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FAF7F2',
  },
})
