import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  ListRenderItem,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native'
import { Image } from 'expo-image'
import { SafeAreaView } from 'react-native-safe-area-context'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import ConditionBadge from '../../components/ConditionBadge'
import { shareLink, storeLink } from '../../lib/share'
import { supabase } from '../../lib/supabase'
import type { ShopperStackParamList } from '../../navigation/RootNavigator'

type Props = NativeStackScreenProps<ShopperStackParamList, 'StoreProfile'>

// ---------------------------------------------------------------------------
// Queries — outside component for stable ReturnType inference
// ---------------------------------------------------------------------------

const fetchStore = (id: string) =>
  supabase
    .from('stores')
    .select('id, name, description, region, rating, logo_url, created_at')
    .eq('id', id)
    .maybeSingle()

const fetchStoreProducts = (storeId: string) =>
  supabase
    .from('products')
    .select('id, name, price_usd, condition, product_images ( url, position )')
    .eq('store_id', storeId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })

const fetchStoreReviews = (storeId: string) =>
  supabase
    .from('reviews')
    .select('id, rating, comment, created_at')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
    .limit(20)

type StoreProfile = NonNullable<Awaited<ReturnType<typeof fetchStore>>['data']>
type StoreProduct = NonNullable<Awaited<ReturnType<typeof fetchStoreProducts>>['data']>[0]
type StoreReview  = NonNullable<Awaited<ReturnType<typeof fetchStoreReviews>>['data']>[0]

function Stars({ rating }: { rating: number }) {
  return (
    <Text style={styles.reviewStars}>
      {'★'.repeat(rating)}
      <Text style={styles.reviewStarsEmpty}>{'★'.repeat(5 - rating)}</Text>
    </Text>
  )
}

// ---------------------------------------------------------------------------
// Layout constants — mirror MarketplaceFeedScreen so the grids feel identical
// ---------------------------------------------------------------------------

const H_PAD = 16
const COL_GAP = 10
const MAX_CONTENT_WIDTH = 560
const IMAGE_RATIO = 1.25

// ---------------------------------------------------------------------------
// ProductCard
// ---------------------------------------------------------------------------

type CardProps = {
  item: StoreProduct
  cardWidth: number
  imageHeight: number
  onPress: (item: StoreProduct) => void
}

const ProductCard = React.memo(function ProductCard({ item, cardWidth, imageHeight, onPress }: CardProps) {
  const coverUrl =
    [...(item.product_images ?? [])].sort((a, b) => a.position - b.position)[0]?.url ?? null

  return (
    <TouchableOpacity
      style={{ width: cardWidth }}
      onPress={() => onPress(item)}
      activeOpacity={0.85}
    >
      <View style={[styles.imageContainer, { height: imageHeight }]}>
        {coverUrl ? (
          <Image source={{ uri: coverUrl }} style={styles.cardImage} contentFit="cover" transition={200} />
        ) : (
          <View style={styles.cardImage} />
        )}
        <View style={styles.cardBadge}>
          <ConditionBadge condition={item.condition} />
        </View>
      </View>
      <View style={styles.cardInfo}>
        <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
        <Text style={styles.price}>${Number(item.price_usd).toFixed(0)}</Text>
      </View>
    </TouchableOpacity>
  )
})

// ---------------------------------------------------------------------------
// StoreProfileScreen
// ---------------------------------------------------------------------------

export default function StoreProfileScreen({ route, navigation }: Props) {
  const { storeId } = route.params

  const { width: windowWidth } = useWindowDimensions()
  const gridWidth = Math.min(windowWidth, MAX_CONTENT_WIDTH)
  const cardWidth = (gridWidth - H_PAD * 2 - COL_GAP) / 2
  const imageHeight = cardWidth * IMAGE_RATIO

  const [store, setStore] = useState<StoreProfile | null>(null)
  const [products, setProducts] = useState<StoreProduct[]>([])
  const [reviews, setReviews] = useState<StoreReview[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [storeRes, productsRes, reviewsRes] = await Promise.all([
        fetchStore(storeId),
        fetchStoreProducts(storeId),
        fetchStoreReviews(storeId),
      ])
      if (cancelled) return
      if (storeRes.error) {
        setError(storeRes.error.message)
      } else if (productsRes.error) {
        setError(productsRes.error.message)
      } else {
        setStore(storeRes.data)
        setProducts(productsRes.data ?? [])
        setReviews(reviewsRes.data ?? [])
      }
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [storeId])

  const handlePress = useCallback(
    (item: StoreProduct) => navigation.push('ProductDetail', { productId: item.id }),
    [navigation],
  )

  const handleShare = useCallback(async () => {
    if (!store) return
    const outcome = await shareLink(
      `Check out ${store.name} on Souk — local boutiques, delivered`,
      storeLink(store.id),
    )
    if (outcome === 'copied') {
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
    }
  }, [store])

  const renderItem: ListRenderItem<StoreProduct> = useCallback(
    ({ item }) => (
      <ProductCard item={item} cardWidth={cardWidth} imageHeight={imageHeight} onPress={handlePress} />
    ),
    [handlePress, cardWidth, imageHeight],
  )

  const keyExtractor = useCallback((item: StoreProduct) => item.id, [])

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, styles.centered]}>
        <ActivityIndicator size="large" color="#D9552B" />
      </SafeAreaView>
    )
  }

  if (error || !store) {
    return (
      <SafeAreaView style={[styles.safe, styles.centered]}>
        <Text style={styles.errorText}>{error ?? 'Store not found.'}</Text>
      </SafeAreaView>
    )
  }

  const joined = store.created_at
    ? new Date(store.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : null

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.contentWrap}>
        <FlatList
          data={products}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          numColumns={2}
          contentContainerStyle={styles.listContent}
          columnWrapperStyle={styles.columnWrapper}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={styles.hero}>
              <View style={styles.heroTopRow}>
                <TouchableOpacity
                  style={styles.backBtn}
                  onPress={() => navigation.goBack()}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.backBtnText}>←</Text>
                </TouchableOpacity>
                <View style={styles.heroTopSpacer} />
                {linkCopied && <Text style={styles.copiedText}>Link copied</Text>}
                <TouchableOpacity
                  style={styles.backBtn}
                  onPress={handleShare}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.shareBtnText}>↗</Text>
                </TouchableOpacity>
              </View>

              {store.logo_url ? (
                <Image source={{ uri: store.logo_url }} style={styles.storeLogo} contentFit="cover" />
              ) : (
                <View style={styles.storeAvatar}>
                  <Text style={styles.storeAvatarText}>{store.name.charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <Text style={styles.heroName}>{store.name}</Text>

              <View style={styles.heroMetaRow}>
                <Text style={styles.heroRating}>
                  {store.rating != null
                    ? `★ ${store.rating.toFixed(1)}${reviews.length > 0 ? ` (${reviews.length})` : ''}`
                    : '★ New store'}
                </Text>
                {store.region ? (
                  <>
                    <Text style={styles.heroMetaDot}>·</Text>
                    <Text style={styles.heroMeta}>{store.region}</Text>
                  </>
                ) : null}
                <Text style={styles.heroMetaDot}>·</Text>
                <Text style={styles.heroMeta}>
                  {products.length} item{products.length !== 1 ? 's' : ''}
                </Text>
                {joined ? (
                  <>
                    <Text style={styles.heroMetaDot}>·</Text>
                    <Text style={styles.heroMeta}>Since {joined}</Text>
                  </>
                ) : null}
              </View>

              {store.description ? (
                <Text style={styles.heroBio}>{store.description}</Text>
              ) : null}

              <Text style={styles.sectionLabel}>Shop the collection</Text>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No items listed yet</Text>
              <Text style={styles.emptyBody}>
                This boutique hasn't added products to its shelf. Check back soon.
              </Text>
            </View>
          }
          ListFooterComponent={
            reviews.length > 0 ? (
              <View style={styles.reviewsSection}>
                <Text style={styles.sectionLabel}>
                  Reviews ({reviews.length})
                </Text>
                {reviews.map(r => (
                  <View key={r.id} style={styles.reviewCard}>
                    <View style={styles.reviewHeader}>
                      <Stars rating={r.rating} />
                      <Text style={styles.reviewDate}>
                        {r.created_at
                          ? new Date(r.created_at).toLocaleDateString('en-GB', {
                              day: 'numeric', month: 'short', year: 'numeric',
                            })
                          : ''}
                      </Text>
                    </View>
                    {r.comment ? (
                      <Text style={styles.reviewComment}>{r.comment}</Text>
                    ) : null}
                    <Text style={styles.reviewBuyer}>Verified buyer</Text>
                  </View>
                ))}
              </View>
            ) : null
          }
        />
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
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  contentWrap: {
    flex: 1,
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
  },

  // ── Hero ──
  hero: {
    alignItems: 'center',
    paddingBottom: 8,
  },
  heroTopRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F5EFE6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backBtnText: {
    fontSize: 18,
    color: '#1C1612',
    lineHeight: 22,
  },
  heroTopSpacer: {
    flex: 1,
  },
  shareBtnText: {
    fontSize: 18,
    color: '#1C1612',
    lineHeight: 22,
    fontWeight: '700',
  },
  copiedText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#7A6A5A',
    marginRight: 10,
  },
  storeAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#1C1612',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  storeLogo: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#F0E9DF',
    marginBottom: 12,
  },
  storeAvatarText: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  heroName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1C1612',
    letterSpacing: -0.4,
    textAlign: 'center',
    marginBottom: 6,
  },
  heroMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  heroRating: {
    fontSize: 13,
    fontWeight: '700',
    color: '#D9552B',
  },
  heroMeta: {
    fontSize: 13,
    fontWeight: '500',
    color: '#7A6A5A',
  },
  heroMetaDot: {
    fontSize: 13,
    color: '#D9CFC4',
  },
  heroBio: {
    fontSize: 14,
    color: '#5A4A3A',
    lineHeight: 21,
    textAlign: 'center',
    paddingHorizontal: 12,
    marginBottom: 18,
  },
  sectionLabel: {
    alignSelf: 'flex-start',
    fontSize: 12,
    fontWeight: '700',
    color: '#7A6A5A',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    paddingTop: 14,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: '#ECE6DC',
    width: '100%',
  },

  // ── Grid ──
  listContent: {
    paddingHorizontal: H_PAD,
    paddingBottom: 48,
    flexGrow: 1,
  },
  columnWrapper: {
    justifyContent: 'space-between',
    marginBottom: 18,
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

  // ── Reviews ──
  reviewsSection: {
    paddingTop: 8,
    gap: 10,
  },
  reviewCard: {
    backgroundColor: '#F5EFE6',
    borderRadius: 14,
    padding: 14,
    gap: 6,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reviewStars: {
    fontSize: 14,
    color: '#D9552B',
    letterSpacing: 2,
  },
  reviewStarsEmpty: {
    color: '#D9CFC4',
  },
  reviewDate: {
    fontSize: 12,
    color: '#B0A090',
  },
  reviewComment: {
    fontSize: 13,
    color: '#5A4A3A',
    lineHeight: 19,
  },
  reviewBuyer: {
    fontSize: 11,
    fontWeight: '600',
    color: '#7A6A5A',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // ── Empty / error ──
  emptyState: {
    alignItems: 'center',
    paddingTop: 40,
    paddingHorizontal: 36,
    gap: 8,
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
  errorText: {
    fontSize: 14,
    color: '#D9552B',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
})
