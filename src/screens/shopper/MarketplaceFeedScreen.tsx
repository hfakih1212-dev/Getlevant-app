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
import { useT } from '../../lib/i18n'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/useAuthStore'
import { useCartStore } from '../../store/useCartStore'
import { useFavoritesStore } from '../../store/useFavoritesStore'
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
      created_at,
      is_promoted,
      promotion_expires_at,
      stores!inner ( id, name, region, rating, logo_url ),
      product_images ( url, position ),
      product_variants ( size, color, color_hex, stock )
    `,
    )
    .eq('status', 'active')
    .eq('stores.status', 'active')
    // Promoted rows first at the source too; the client-side stable sort
    // below is what actually enforces this once expiry is accounted for.
    .order('is_promoted', { ascending: false })
    .order('created_at', { ascending: false })

type FeedProduct = NonNullable<Awaited<ReturnType<typeof fetchFeed>>['data']>[0]

// ---------------------------------------------------------------------------
// Sort options
// ---------------------------------------------------------------------------

type SortOption = 'newest' | 'price_asc' | 'price_desc'

const SORT_OPTIONS: { value: SortOption; labelKey: 'feed.sortNewest' | 'feed.sortPriceAsc' | 'feed.sortPriceDesc' }[] = [
  { value: 'newest',     labelKey: 'feed.sortNewest'   },
  { value: 'price_asc',  labelKey: 'feed.sortPriceAsc' },
  { value: 'price_desc', labelKey: 'feed.sortPriceDesc' },
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

type FeedStore = {
  id: string
  name: string
  region: string | null
  rating: number | null
  logo_url: string | null
}

function resolveStore(stores: FeedProduct['stores']): FeedStore | null {
  if (!stores) return null
  return (Array.isArray(stores) ? stores[0] : stores) as FeedStore | null
}

// is_promoted can outlive its paid window — always gate on expiry too.
// Setting these columns is service-role-only (see the products_guard_promotion
// trigger); nothing in this screen writes them.
function isEffectivelyPromoted(p: { is_promoted: boolean; promotion_expires_at: string | null }): boolean {
  if (!p.is_promoted) return false
  if (!p.promotion_expires_at) return true
  return new Date(p.promotion_expires_at).getTime() > Date.now()
}

// ---------------------------------------------------------------------------
// In-feed ad slots — one full-width placeholder inserted after every
// AD_INTERVAL organic cards. Rows are chunked manually (rather than relying
// on FlatList's numColumns) so a slot can span both grid columns cleanly.
// ---------------------------------------------------------------------------

const AD_INTERVAL = 8 // organic cards shown between each in-feed ad slot

type FeedRow =
  | { type: 'products'; key: string; items: FeedProduct[] }
  | { type: 'ad'; key: string }

function buildFeedRows(items: FeedProduct[]): FeedRow[] {
  const rows: FeedRow[] = []
  let sinceAd = 0
  for (let i = 0; i < items.length; i += 2) {
    const pair = items.slice(i, i + 2)
    rows.push({ type: 'products', key: `row-${i}`, items: pair })
    sinceAd += pair.length
    // Skip a trailing ad slot right at the tail of the list
    if (sinceAd >= AD_INTERVAL && i + 2 < items.length) {
      rows.push({ type: 'ad', key: `ad-${i}` })
      sinceAd = 0
    }
  }
  return rows
}

// ---------------------------------------------------------------------------
// ProductCard
// ---------------------------------------------------------------------------

type CardProps = {
  item: FeedProduct
  cardWidth: number
  imageHeight: number
  favorite: boolean
  promoted: boolean
  onPress: (item: FeedProduct) => void
  onToggleFav: (productId: string) => void
}

const ProductCard = React.memo(function ProductCard({
  item, cardWidth, imageHeight, favorite, promoted, onPress, onToggleFav,
}: CardProps) {
  const t = useT()
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
        <TouchableOpacity
          style={styles.heartBtn}
          onPress={() => onToggleFav(item.id)}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Text style={favorite ? styles.heartFilled : styles.heartEmpty}>
            {favorite ? '♥' : '♡'}
          </Text>
        </TouchableOpacity>
        {/* Vendor-paid boost — visually distinct from the ConditionBadge so
            shoppers can't mistake a paid placement for a catalog fact */}
        {promoted && (
          <View style={styles.sponsoredStrip}>
            <Text style={styles.sponsoredStripText}>✦ {t('feed.sponsored')}</Text>
          </View>
        )}
      </View>

      {/* Text block */}
      <View style={styles.cardInfo}>
        <View style={styles.storeRow}>
          {store ? (
            <Text style={styles.storeName} numberOfLines={1}>{store.name}</Text>
          ) : null}
          {store?.rating != null && (
            <Text style={styles.cardRating}>★ {store.rating.toFixed(1)}</Text>
          )}
        </View>
        <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
        <Text style={styles.price}>{price}</Text>
      </View>
    </TouchableOpacity>
  )
})

// ---------------------------------------------------------------------------
// AdSlotCard — full-width programmatic ad placeholder
// Integration point: mount <BannerAd .../> from react-native-google-mobile-ads
// (or expo-ads-admob) here once an AdMob app ID / ad unit ID is available —
// neither is configured yet, so this renders a clean reserved-space
// placeholder instead of a live ad network call.
// ---------------------------------------------------------------------------

const AD_SLOT_HEIGHT = 100 // ~ standard mobile banner aspect

function AdSlotCard({ width }: { width: number }) {
  const t = useT()
  return (
    <View style={[styles.adCard, { width, height: AD_SLOT_HEIGHT }]}>
      <View style={styles.adTag}>
        <Text style={styles.adTagText}>{t('feed.adLabel')}</Text>
      </View>
      <Text style={styles.adPlaceholderText}>{t('feed.adPlaceholder')}</Text>
      <Text style={styles.adPlaceholderSub}>{t('feed.adSubtext')}</Text>
    </View>
  )
}

// ---------------------------------------------------------------------------
// RailCard — compact product card for horizontal editorial rails
// ---------------------------------------------------------------------------

const RAIL_CARD_WIDTH = 124
const RAIL_IMAGE_HEIGHT = 150

const RailCard = React.memo(function RailCard({
  item, onPress,
}: { item: FeedProduct; onPress: (item: FeedProduct) => void }) {
  const coverUrl =
    [...(Array.isArray(item.product_images) ? item.product_images : [])]
      .sort((a, b) => a.position - b.position)[0]?.url ?? null
  return (
    <TouchableOpacity
      style={styles.railCard}
      onPress={() => onPress(item)}
      activeOpacity={0.85}
    >
      <View style={styles.railImageContainer}>
        {coverUrl ? (
          <Image source={{ uri: coverUrl }} style={styles.cardImage} contentFit="cover" transition={200} />
        ) : (
          <View style={styles.cardImage} />
        )}
      </View>
      <Text style={styles.railName} numberOfLines={1}>{item.name}</Text>
      <Text style={styles.railPrice}>${Number(item.price_usd).toFixed(0)}</Text>
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
  const favIds    = useFavoritesStore(s => s.ids)
  const toggleFav = useFavoritesStore(s => s.toggle)
  const t         = useT()

  // Card size tracks the window so the grid stays fluid on rotation and
  // never balloons on tablets / web — content is capped and centered instead.
  const { width: windowWidth } = useWindowDimensions()
  const gridWidth   = Math.min(windowWidth, MAX_CONTENT_WIDTH)
  const cardWidth   = (gridWidth - H_PAD * 2 - COL_GAP) / 2
  const imageHeight = cardWidth * IMAGE_RATIO
  const rowWidth    = cardWidth * 2 + COL_GAP // exact width of a 2-up row — what the ad slot spans

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

    // Promoted items always float to the top of the (already filtered and
    // sorted) list. Array.sort is stable, so this only reorders across the
    // promoted/non-promoted boundary — everything else keeps its position.
    result = [...result].sort(
      (a, b) => Number(isEffectivelyPromoted(b)) - Number(isEffectivelyPromoted(a)),
    )

    return result
  }, [products, searchText, selectedRegion, selectedCategory, sortBy])

  const feedRows = useMemo(() => buildFeedRows(filteredProducts), [filteredProducts])

  // ---- Handlers ----

  const handlePress = useCallback(
    (item: FeedProduct) => navigation.navigate('ProductDetail', { productId: item.id }),
    [navigation],
  )

  // Guests tapping a heart are routed to sign-in — favorites are account-backed
  const handleToggleFav = useCallback(
    (productId: string) => {
      if (!user?.id) {
        navigation.navigate('Login')
        return
      }
      void toggleFav(user.id, productId)
    },
    [user?.id, toggleFav, navigation],
  )

  // ---- Editorial rails (hidden while filtering/searching) ----

  const newThisWeek = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
    return products
      .filter(p => p.created_at && new Date(p.created_at).getTime() >= cutoff)
      .slice(0, 10)
  }, [products])

  const thriftedPicks = useMemo(
    () => products.filter(p => p.condition === 'thrifted').slice(0, 10),
    [products],
  )

  // Highest-rated store in the feed, falling back to the most recent one
  const featuredStore = useMemo<FeedStore | null>(() => {
    let best: FeedStore | null = null
    for (const p of products) {
      const s = resolveStore(p.stores)
      if (!s) continue
      if (!best || (s.rating ?? -1) > (best.rating ?? -1)) best = s
    }
    return best
  }, [products])

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

  const renderRow: ListRenderItem<FeedRow> = useCallback(
    ({ item: row }) => {
      if (row.type === 'ad') {
        return (
          <View style={styles.adRow}>
            <AdSlotCard width={rowWidth} />
          </View>
        )
      }
      return (
        <View style={styles.productRow}>
          {row.items.map(p => (
            <ProductCard
              key={p.id}
              item={p}
              cardWidth={cardWidth}
              imageHeight={imageHeight}
              favorite={favIds.has(p.id)}
              promoted={isEffectivelyPromoted(p)}
              onPress={handlePress}
              onToggleFav={handleToggleFav}
            />
          ))}
        </View>
      )
    },
    [handlePress, handleToggleFav, cardWidth, imageHeight, rowWidth, favIds],
  )

  const rowKeyExtractor = useCallback((row: FeedRow) => row.key, [])

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
          <Text style={styles.brandName}>Levant</Text>
          <Text style={styles.brandSub}>{t('feed.tagline')}</Text>
        </View>
        <View style={styles.headerActions}>
          {session !== null && (
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => navigation.navigate('Favorites')}
              activeOpacity={0.75}
            >
              <Text style={styles.heartIconText}>♡</Text>
            </TouchableOpacity>
          )}
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
              <Text style={styles.signInBtnText}>{t('common.signIn')}</Text>
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
            placeholder={t('feed.searchPlaceholder')}
            placeholderTextColor="#B0A090"
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
        </View>
      </View>

      {/* ── Body: skeleton grid / error / product grid ── */}
      {loading ? (
        <FeedSkeleton cardWidth={cardWidth} imageHeight={imageHeight} />
      ) : error ? (
        <View style={styles.errorState}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => load()} activeOpacity={0.8}>
            <Text style={styles.retryBtnText}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={feedRows}
          keyExtractor={rowKeyExtractor}
          renderItem={renderRow}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View>
              {/* Category + Sort/Region pills — always rendered (even while a
                  filter is active) and now part of the list's own scroll
                  content, not a fixed sibling, so they can never collide with
                  it and simply scroll away as the user browses. */}
              <View style={styles.filtersWrap}>
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
                      {t('feed.all')}
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
                          {t(opt.labelKey)}
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
              </View>

              {!isFiltering && products.length > 0 && (
              <View style={styles.railsWrap}>
                {/* Featured boutique */}
                {featuredStore && (
                  <TouchableOpacity
                    style={styles.featuredCard}
                    onPress={() => navigation.navigate('StoreProfile', { storeId: featuredStore.id })}
                    activeOpacity={0.85}
                  >
                    {featuredStore.logo_url ? (
                      <Image source={{ uri: featuredStore.logo_url }} style={styles.featuredLogo} contentFit="cover" />
                    ) : (
                      <View style={styles.featuredLogoFallback}>
                        <Text style={styles.featuredLogoInitial}>
                          {featuredStore.name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <View style={styles.featuredBody}>
                      <Text style={styles.featuredLabel}>{t('feed.featuredBoutique')}</Text>
                      <Text style={styles.featuredName} numberOfLines={1}>{featuredStore.name}</Text>
                      <Text style={styles.featuredMeta} numberOfLines={1}>
                        {featuredStore.rating != null ? `★ ${featuredStore.rating.toFixed(1)}` : t('product.newStore')}
                        {featuredStore.region ? `  ·  ${featuredStore.region}` : ''}
                      </Text>
                    </View>
                    <Text style={styles.featuredCta}>{t('feed.visit')}</Text>
                  </TouchableOpacity>
                )}

                {/* New this week */}
                {newThisWeek.length > 0 && (
                  <View style={styles.rail}>
                    <Text style={styles.railTitle}>{t('feed.newThisWeek')}</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.railStrip}
                    >
                      {newThisWeek.map(p => (
                        <RailCard key={p.id} item={p} onPress={handlePress} />
                      ))}
                    </ScrollView>
                  </View>
                )}

                {/* Thrifted picks */}
                {thriftedPicks.length > 0 && (
                  <View style={styles.rail}>
                    <Text style={styles.railTitle}>{t('feed.thriftedPicks')}</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.railStrip}
                    >
                      {thriftedPicks.map(p => (
                        <RailCard key={p.id} item={p} onPress={handlePress} />
                      ))}
                    </ScrollView>
                  </View>
                )}

                <Text style={styles.railTitle}>{t('feed.allProducts')}</Text>
              </View>
              )}
            </View>
          }
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
                {isFiltering ? t('feed.noMatches') : t('feed.nothingYet')}
              </Text>
              <Text style={styles.emptyBody}>
                {isFiltering
                  ? t('feed.tryDifferent')
                  : t('feed.newBoutiques')}
              </Text>
              {isFiltering && (
                <TouchableOpacity style={styles.clearBtn} onPress={clearFilters} activeOpacity={0.8}>
                  <Text style={styles.clearBtnText}>{t('feed.clearFilters')}</Text>
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
  heartIconText: {
    fontSize: 19,
    color: '#D9552B',
    fontWeight: '700',
    lineHeight: 22,
  },
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

  // ── Category + Sort/Region pill rows ──
  // Single vertical container for both horizontal pill scrollers. Explicit
  // `gap` gives clean, guaranteed separation between the two rows — no
  // reliance on margins that could be squeezed out under flex-shrink.
  filtersWrap: {
    gap: 12,
    marginBottom: 8,
  },

  // ── Category strip ──
  // flexShrink: 0 + an explicit height lock this row's height regardless of
  // available space — without it a horizontal ScrollView's height depends
  // entirely on its children, and can collapse toward 0 under flex-shrink,
  // which is what caused the category/filter rows to overlap each other.
  categoryBar: {
    flexShrink: 0,
    height: 46,
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
    flexShrink: 0,
    height: 44,
    borderBottomWidth: 1,
    borderBottomColor: '#ECE6DC',
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
  productRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  adRow: {
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
  heartBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heartFilled: {
    fontSize: 16,
    color: '#D9552B',
    lineHeight: 19,
  },
  heartEmpty: {
    fontSize: 16,
    color: '#7A6A5A',
    lineHeight: 19,
  },
  // Vendor-paid "Sponsored" strip — sits along the bottom edge of the image
  // so it never collides with the condition badge or heart button.
  sponsoredStrip: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 22,
    backgroundColor: 'rgba(217,85,43,0.94)', // terracotta, slightly translucent
    justifyContent: 'center',
    alignItems: 'center',
  },
  sponsoredStripText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  cardInfo: {
    paddingHorizontal: 2,
    paddingTop: 8,
    gap: 2,
  },
  storeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  cardRating: {
    fontSize: 10,
    fontWeight: '700',
    color: '#7A6A5A',
  },
  storeName: {
    flexShrink: 1,
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

  // ── In-feed ad slot (programmatic placeholder) ──
  adCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#D9CFC4',
    borderStyle: 'dashed',
    backgroundColor: '#F5EFE6',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 2,
  },
  adTag: {
    position: 'absolute',
    top: 8,
    left: 8,
    height: 18,
    paddingHorizontal: 8,
    borderRadius: 9,
    backgroundColor: '#D9CFC4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  adTagText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#5A4A3A',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  adPlaceholderText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#7A6A5A',
  },
  adPlaceholderSub: {
    fontSize: 11,
    color: '#B0A090',
  },

  // ── Editorial rails ──
  railsWrap: {
    gap: 14,
    marginBottom: 18,
  },
  featuredCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F5EFE6',
    borderRadius: 16,
    padding: 14,
  },
  featuredLogo: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#F0E9DF',
  },
  featuredLogoFallback: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#1C1612',
    justifyContent: 'center',
    alignItems: 'center',
  },
  featuredLogoInitial: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  featuredBody: { flex: 1, gap: 1 },
  featuredLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#7A6A5A',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  featuredName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1C1612',
  },
  featuredMeta: {
    fontSize: 12,
    fontWeight: '600',
    color: '#D9552B',
  },
  featuredCta: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1C1612',
    paddingLeft: 4,
  },
  rail: {
    gap: 10,
  },
  railTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1C1612',
    letterSpacing: -0.2,
  },
  railStrip: {
    gap: 10,
    flexDirection: 'row',
  },
  railCard: {
    width: RAIL_CARD_WIDTH,
  },
  railImageContainer: {
    width: '100%',
    height: RAIL_IMAGE_HEIGHT,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#F0E9DF',
  },
  railName: {
    fontSize: 12,
    fontWeight: '500',
    color: '#1C1612',
    paddingTop: 6,
  },
  railPrice: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1C1612',
    paddingTop: 1,
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
