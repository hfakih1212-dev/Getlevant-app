import React, { useCallback, useMemo, useState } from 'react'
import {
  FlatList,
  ListRenderItem,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native'
import { Image } from 'expo-image'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import ConditionBadge from '../../components/ConditionBadge'
import Skeleton from '../../components/Skeleton'
import { CATEGORY_OPTIONS, LEBANON_REGIONS, LebanonRegion, ProductCategory } from '../../lib/catalog'
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
      category,
      condition,
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
// Layout constants  (8pt grid)
// ---------------------------------------------------------------------------

const H_PAD   = 16
const COL_GAP = 10
// Content never grows past phone scale — wide displays get a centered column
const MAX_CONTENT_WIDTH = 560
const IMAGE_RATIO       = 1.25   // 4:5 portrait — premium product feel
const SKELETON_COUNT    = 6

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

type CardProps = {
  item: FeedProduct
  cardWidth: number
  imageHeight: number
  onPress: (item: FeedProduct) => void
}

const ProductCard = React.memo(function ProductCard({ item, cardWidth, imageHeight, onPress }: CardProps) {
  const images = Array.isArray(item.product_images) ? item.product_images : []
  const coverUrl = [...images].sort((a, b) => a.position - b.position)[0]?.url ?? null

  const store = resolveStore(item.stores)
  const price = `$${Number(item.price_usd).toFixed(0)}`

  return (
    <TouchableOpacity
      style={[styles.card, { width: cardWidth }]}
      onPress={() => onPress(item)}
      activeOpacity={0.85}
    >
      {/* Rounded standalone image — flat, image-first card */}
      <View style={[styles.imageContainer, { height: imageHeight }]}>
        {coverUrl ? (
          <Image
            source={{ uri: coverUrl }}
            style={styles.cardImage}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View style={styles.cardImage} />
        )}
        <View style={styles.cardBadge}>
          <ConditionBadge condition={item.condition} />
        </View>
      </View>

      {/* Text block */}
      <View style={styles.cardInfo}>
        {store ? (
          <Text style={styles.storeName} numberOfLines={1}>{store.name}</Text>
        ) : null}
        <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
        <Text style={styles.price}>{price}</Text>
      </View>
    </TouchableOpacity>
  )
})

// ---------------------------------------------------------------------------
// FeedSkeleton — pulsing placeholder grid shown while the feed loads
// ---------------------------------------------------------------------------

function FeedSkeleton({ cardWidth, imageHeight }: { cardWidth: number; imageHeight: number }) {
  return (
    <View style={styles.skeletonGrid}>
      {Array.from({ length: SKELETON_COUNT }, (_, i) => (
        <View key={i} style={[styles.skeletonCard, { width: cardWidth }]}>
          <Skeleton style={[styles.skeletonImage, { height: imageHeight }]} />
          <View style={styles.skeletonInfo}>
            <Skeleton style={styles.skeletonLineShort} />
            <Skeleton style={styles.skeletonLineLong} />
          </View>
        </View>
      ))}
    </View>
  )
}

// ---------------------------------------------------------------------------
// MarketplaceFeedScreen
// ---------------------------------------------------------------------------

export default function MarketplaceFeedScreen({ navigation }: Props) {
  const user      = useAuthStore(s => s.user)
  const session   = useAuthStore(s => s.session)
  const initial   = (user?.phone ?? user?.email ?? '?').replace(/^\+/, '').charAt(0).toUpperCase()
  const cartCount = useCartStore(s => s.items.reduce((sum, i) => sum + i.quantity, 0))

  // Card size tracks the window so the grid stays fluid on rotation and
  // never balloons on tablets / web — content is capped and centered instead.
  const { width: windowWidth } = useWindowDimensions()
  const gridWidth   = Math.min(windowWidth, MAX_CONTENT_WIDTH)
  const cardWidth   = (gridWidth - H_PAD * 2 - COL_GAP) / 2
  const imageHeight = cardWidth * IMAGE_RATIO

  const [products,       setProducts]       = useState<FeedProduct[]>([])
  const [loading,        setLoading]        = useState(true)
  const [refreshing,     setRefreshing]     = useState(false)
  const [error,          setError]          = useState<string | null>(null)
  const [searchText,       setSearchText]       = useState('')
  const [selectedRegion,   setSelectedRegion]   = useState<LebanonRegion | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<ProductCategory | null>(null)
  const [sortBy,           setSortBy]           = useState<SortOption>('newest')

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

    if (selectedCategory) {
      result = result.filter(p => p.category === selectedCategory)
    }

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
  }, [products, searchText, selectedRegion, selectedCategory, sortBy])

  // ---- Handlers ----

  const handlePress = useCallback(
    (item: FeedProduct) => navigation.navigate('ProductDetail', { productId: item.id }),
    [navigation],
  )

  const handleRegionPress = useCallback((region: LebanonRegion) => {
    setSelectedRegion(prev => (prev === region ? null : region))
  }, [])

  const handleCategoryPress = useCallback((category: ProductCategory | null) => {
    setSelectedCategory(prev => (prev === category ? null : category))
  }, [])

  const clearFilters = useCallback(() => {
    setSearchText('')
    setSelectedRegion(null)
    setSelectedCategory(null)
    setSortBy('newest')
  }, [])

  const renderItem: ListRenderItem<FeedProduct> = useCallback(
    ({ item }) => (
      <ProductCard
        item={item}
        cardWidth={cardWidth}
        imageHeight={imageHeight}
        onPress={handlePress}
      />
    ),
    [handlePress, cardWidth, imageHeight],
  )

  const keyExtractor = useCallback((item: FeedProduct) => item.id, [])

  const isFiltering =
    searchText.trim().length > 0 ||
    selectedRegion !== null ||
    selectedCategory !== null ||
    sortBy !== 'newest'

  return (
    <SafeAreaView style={styles.safe}>
    <View style={styles.contentWrap}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.brandName}>Souk</Text>
          <Text style={styles.brandSub}>Local boutiques, delivered</Text>
        </View>
        <View style={styles.headerActions}>
          {session !== null && (
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => navigation.navigate('MyOrders')}
              activeOpacity={0.75}
            >
              <Text style={styles.iconBtnText}>📋</Text>
            </TouchableOpacity>
          )}
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
          {session !== null ? (
            <TouchableOpacity
              style={styles.avatarBtn}
              onPress={() => navigation.navigate('Profile')}
              activeOpacity={0.8}
            >
              <Text style={styles.avatarBtnText}>{initial}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.signInBtn}
              onPress={() => navigation.navigate('Login')}
              activeOpacity={0.8}
            >
              <Text style={styles.signInBtnText}>Sign in</Text>
            </TouchableOpacity>
          )}
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

      {/* ── Category strip ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoryStrip}
        style={styles.categoryBar}
      >
        <TouchableOpacity
          style={[styles.categoryPill, selectedCategory === null && styles.categoryPillActive]}
          onPress={() => setSelectedCategory(null)}
          activeOpacity={0.75}
        >
          <Text
            style={[
              styles.categoryPillText,
              selectedCategory === null && styles.categoryPillActiveText,
            ]}
          >
            All
          </Text>
        </TouchableOpacity>
        {CATEGORY_OPTIONS.map(opt => {
          const active = selectedCategory === opt.value
          return (
            <TouchableOpacity
              key={opt.value}
              style={[styles.categoryPill, active && styles.categoryPillActive]}
              onPress={() => handleCategoryPress(opt.value)}
              activeOpacity={0.75}
            >
              <Text style={[styles.categoryPillText, active && styles.categoryPillActiveText]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>

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
        {LEBANON_REGIONS.map(region => {
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

      {/* ── Body: skeleton grid / error / product grid ── */}
      {loading ? (
        <FeedSkeleton cardWidth={cardWidth} imageHeight={imageHeight} />
      ) : error ? (
        <View style={styles.errorState}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => load()} activeOpacity={0.8}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
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
              tintColor="#D9552B"
              colors={['#D9552B']}
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
                  ? 'Try a different search, category, or region.'
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
      )}
    </View>
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
  contentWrap: {
    flex: 1,
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
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
    backgroundColor: '#F5EFE6',
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
    backgroundColor: '#D9552B',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  cartBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
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
    color: '#FFFFFF',
  },
  signInBtn: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#1C1612',
    justifyContent: 'center',
    alignItems: 'center',
  },
  signInBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
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
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: '#ECE6DC',
    paddingHorizontal: 16,
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

  // ── Category strip ──
  categoryBar: {
    flexGrow: 0,
  },
  categoryStrip: {
    paddingHorizontal: H_PAD,
    paddingBottom: 10,
    gap: 7,
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoryPill: {
    height: 36,
    paddingHorizontal: 16,
    borderRadius: 18,
    backgroundColor: '#F5EFE6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#7A6A5A',
  },
  categoryPillActive: {
    backgroundColor: '#D9552B',
  },
  categoryPillActiveText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  // ── Filter strip (sort + region combined) ──
  filterBar: {
    flexGrow: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#ECE6DC',
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
    backgroundColor: '#FFFFFF',
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
    color: '#FFFFFF',
  },
  pillRegionActive: {
    backgroundColor: '#D9552B',
    borderColor: '#D9552B',
  },
  pillRegionActiveText: {
    color: '#FFFFFF',
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
    marginBottom: 18,
  },

  // ── Product card (flat, image-first) ──
  card: {
    backgroundColor: 'transparent',
  },
  imageContainer: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#F0E9DF',
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  cardBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
  },
  cardInfo: {
    paddingHorizontal: 2,
    paddingTop: 8,
    gap: 2,
  },
  storeName: {
    fontSize: 10,
    fontWeight: '700',
    color: '#D9552B',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  productName: {
    fontSize: 13,
    fontWeight: '500',
    color: '#1C1612',
    lineHeight: 18,
  },
  price: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1C1612',
    marginTop: 2,
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
    color: '#FFFFFF',
  },

  // ── Skeleton grid ──
  skeletonGrid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: H_PAD,
    paddingTop: 16,
  },
  skeletonCard: {
    marginBottom: 18,
  },
  skeletonImage: {
    width: '100%',
    borderRadius: 16,
  },
  skeletonInfo: {
    paddingHorizontal: 2,
    paddingTop: 8,
    gap: 6,
  },
  skeletonLineShort: {
    width: '45%',
    height: 10,
  },
  skeletonLineLong: {
    width: '85%',
    height: 12,
  },

  // ── Error ──
  errorState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 14,
    color: '#D9552B',
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
    color: '#FFFFFF',
  },
})
