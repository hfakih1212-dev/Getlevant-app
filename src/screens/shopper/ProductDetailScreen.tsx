import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Dimensions,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import ConditionBadge from '../../components/ConditionBadge'
import { CATEGORY_LABEL } from '../../lib/catalog'
import { useT } from '../../lib/i18n'
import { productLink, shareLink } from '../../lib/share'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/useAuthStore'
import { useCartStore } from '../../store/useCartStore'
import { useFavoritesStore } from '../../store/useFavoritesStore'
import type { ShopperStackParamList } from '../../navigation/RootNavigator'

type Props = NativeStackScreenProps<ShopperStackParamList, 'ProductDetail'>

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const CAROUSEL_HEIGHT = SCREEN_WIDTH * (4 / 3)

// ---------------------------------------------------------------------------
// Query — outside component for stable ReturnType inference
// ---------------------------------------------------------------------------

const fetchProduct = (id: string) =>
  supabase
    .from('products')
    .select(
      `
      id, name, description, price_usd, store_id, category, condition,
      stores ( name, description, region, whatsapp, rating, logo_url ),
      product_images ( id, url, position ),
      product_variants ( id, size, color, color_hex, stock )
    `,
    )
    .eq('id', id)
    .maybeSingle()

type ProductDetail = NonNullable<Awaited<ReturnType<typeof fetchProduct>>['data']>
type Variant = ProductDetail['product_variants'][0]
type StoreShape = {
  name: string
  description: string | null
  region: string | null
  whatsapp: string | null
  rating: number | null
  logo_url: string | null
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function ProductDetailScreen({ route, navigation }: Props) {
  const { productId } = route.params
  const insets = useSafeAreaInsets()
  const t = useT()

  const [product, setProduct] = useState<ProductDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedSize, setSelectedSize] = useState<string | null>(null)
  const [selectedColor, setSelectedColor] = useState<string | null>(null)
  const [currentImageIndex, setCurrentImageIndex] = useState(0)

  // ---- Fetch ----

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data, error: fetchError } = await fetchProduct(productId)
      if (cancelled) return
      if (fetchError) {
        setError(fetchError.message)
      } else {
        setProduct(data)
        // Auto-select when only a single variant exists
        if (data?.product_variants.length === 1) {
          const v = data.product_variants[0]
          if (v.size) setSelectedSize(v.size)
          if (v.color) setSelectedColor(v.color)
        }
      }
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [productId])

  // ---- Derived data ----

  const variants: Variant[] = product?.product_variants ?? []

  const images = useMemo(
    () =>
      [...(product?.product_images ?? [])].sort((a, b) => a.position - b.position),
    [product],
  )

  const sizes = useMemo(() => {
    const seen = new Set<string>()
    const result: string[] = []
    for (const v of variants) {
      if (v.size && !seen.has(v.size)) {
        seen.add(v.size)
        result.push(v.size)
      }
    }
    return result
  }, [variants])

  const colors = useMemo(() => {
    const seen = new Set<string>()
    const result: { color: string; color_hex: string | null }[] = []
    for (const v of variants) {
      if (v.color && !seen.has(v.color)) {
        seen.add(v.color)
        result.push({ color: v.color, color_hex: v.color_hex })
      }
    }
    return result
  }, [variants])

  // Normalise stores — PostgREST returns a single object for a many-to-one FK
  const store = useMemo<StoreShape | null>(() => {
    if (!product?.stores) return null
    return (
      Array.isArray(product.stores)
        ? (product.stores[0] as StoreShape)
        : (product.stores as unknown as StoreShape)
    ) ?? null
  }, [product])

  // ---- Availability helpers ----

  const isSizeAvailable = useCallback(
    (size: string) =>
      variants
        .filter(v => v.size === size && (!selectedColor || v.color === selectedColor))
        .some(v => v.stock > 0),
    [variants, selectedColor],
  )

  const isColorAvailable = useCallback(
    (color: string) =>
      variants
        .filter(v => v.color === color && (!selectedSize || v.size === selectedSize))
        .some(v => v.stock > 0),
    [variants, selectedSize],
  )

  const selectedVariant = useMemo<Variant | null>(() => {
    const match = variants.find(v => {
      const sizeOk = !selectedSize || v.size === selectedSize
      const colorOk = !selectedColor || v.color === selectedColor
      return sizeOk && colorOk
    })
    return match ?? null
  }, [variants, selectedSize, selectedColor])

  const canOrder = !!(selectedVariant && selectedVariant.stock > 0)

  const addItem = useCartStore((s) => s.addItem)
  const [added, setAdded] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)

  const user      = useAuthStore(s => s.user)
  const favorite  = useFavoritesStore(s => s.ids.has(productId))
  const toggleFav = useFavoritesStore(s => s.toggle)

  const handleToggleFav = useCallback(() => {
    if (!user?.id) {
      navigation.navigate('Login')
      return
    }
    void toggleFav(user.id, productId)
  }, [user?.id, toggleFav, productId, navigation])

  // ---- Handlers ----

  const handleScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH)
      setCurrentImageIndex(idx)
    },
    [],
  )

  const handleSizePress = useCallback(
    (size: string) => {
      if (!isSizeAvailable(size)) return
      setSelectedSize(prev => (prev === size ? null : size))
    },
    [isSizeAvailable],
  )

  const handleColorPress = useCallback(
    (color: string) => {
      if (!isColorAvailable(color)) return
      setSelectedColor(prev => (prev === color ? null : color))
    },
    [isColorAvailable],
  )

  const handleAddToCart = useCallback(() => {
    if (!selectedVariant || !product || added) return

    addItem({
      productId: product.id,
      variantId: selectedVariant.id,
      storeId: product.store_id,
      name: product.name,
      storeName: store?.name ?? '',
      imageUrl: images[0]?.url ?? null,
      priceUsd: product.price_usd,
      size: selectedVariant.size,
      color: selectedVariant.color,
      colorHex: selectedVariant.color_hex,
    })

    setAdded(true)
    setTimeout(() => navigation.goBack(), 1200)
  }, [addItem, product, selectedVariant, store, images, navigation, added])

  const handleShare = useCallback(async () => {
    if (!product) return
    const price = `$${Number(product.price_usd).toFixed(0)}`
    const message = store
      ? `${product.name} — ${price} at ${store.name} on Souk`
      : `${product.name} — ${price} on Souk`
    const outcome = await shareLink(message, productLink(product.id))
    if (outcome === 'copied') {
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
    }
  }, [product, store])

  // ---- Loading / error guards ----

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, styles.centered]}>
        <ActivityIndicator size="large" color="#D9552B" />
      </SafeAreaView>
    )
  }

  if (error || !product) {
    return (
      <SafeAreaView style={[styles.safe, styles.centered]}>
        <Text style={styles.errorText}>{error ?? t('product.notFound')}</Text>
      </SafeAreaView>
    )
  }

  // ---- Render ----

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {/* Scrollable body */}
      <ScrollView style={styles.flex} showsVerticalScrollIndicator={false}>

        {/* ── Image carousel ── */}
        <View>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={handleScrollEnd}
          >
            {images.length > 0 ? (
              images.map(img => (
                <Image
                  key={img.id}
                  source={{ uri: img.url }}
                  style={styles.carouselImage}
                  resizeMode="cover"
                />
              ))
            ) : (
              <View style={[styles.carouselImage, styles.imagePlaceholder]} />
            )}
          </ScrollView>

          {/* Back button — floats over carousel, top offset = status bar height */}
          <TouchableOpacity
            style={[styles.backBtn, { top: insets.top + 8 }]}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <View style={styles.backBtnInner}>
              <Text style={styles.backBtnText}>←</Text>
            </View>
          </TouchableOpacity>

          {/* Share button — mirrors the back button on the right edge */}
          <TouchableOpacity
            style={[styles.shareBtn, { top: insets.top + 8 }]}
            onPress={handleShare}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <View style={styles.backBtnInner}>
              <Text style={styles.shareBtnText}>↗</Text>
            </View>
          </TouchableOpacity>

          {/* Favorite heart — inboard of the share button */}
          <TouchableOpacity
            style={[styles.favBtn, { top: insets.top + 8 }]}
            onPress={handleToggleFav}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <View style={styles.backBtnInner}>
              <Text style={favorite ? styles.favFilled : styles.favEmpty}>
                {favorite ? '♥' : '♡'}
              </Text>
            </View>
          </TouchableOpacity>
          {linkCopied && (
            <View style={[styles.copiedToast, { top: insets.top + 56 }]}>
              <Text style={styles.copiedToastText}>{t('product.linkCopied')}</Text>
            </View>
          )}

          {/* Pagination dots */}
          {images.length > 1 && (
            <View style={styles.dotsRow}>
              {images.map((_, i) => (
                <View
                  key={i}
                  style={[styles.dot, i === currentImageIndex && styles.dotActive]}
                />
              ))}
            </View>
          )}
        </View>

        {/* ── Product info ── */}
        <View style={styles.content}>
          <View style={styles.badgeRow}>
            <ConditionBadge condition={product.condition} size="md" />
            {product.category ? (
              <Text style={styles.categoryLabel}>{CATEGORY_LABEL[product.category]}</Text>
            ) : null}
          </View>

          {store && <Text style={styles.storeName}>{store.name}</Text>}

          <Text style={styles.productName}>{product.name}</Text>
          <Text style={styles.price}>${Number(product.price_usd).toFixed(0)}</Text>

          {product.description ? (
            <Text style={styles.description}>{product.description}</Text>
          ) : null}

          {/* ── Size picker ── */}
          {sizes.length > 0 && (
            <View style={styles.pickerSection}>
              <Text style={styles.pickerLabel}>{t('product.size')}</Text>
              <View style={styles.pillRow}>
                {sizes.map(size => {
                  const available = isSizeAvailable(size)
                  const selected = selectedSize === size
                  return (
                    <TouchableOpacity
                      key={size}
                      style={[
                        styles.pill,
                        selected && styles.pillSelected,
                        !available && styles.pillUnavailable,
                      ]}
                      onPress={() => handleSizePress(size)}
                      activeOpacity={available ? 0.8 : 1}
                    >
                      <Text
                        style={[
                          styles.pillText,
                          selected && styles.pillTextSelected,
                          !available && styles.pillTextUnavailable,
                        ]}
                      >
                        {size}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </View>
          )}

          {/* ── Color picker ── */}
          {colors.length > 0 && (
            <View style={styles.pickerSection}>
              <Text style={styles.pickerLabel}>
                {selectedColor ? t('product.colorNamed', { name: selectedColor }) : t('product.color')}
              </Text>
              <View style={styles.swatchRow}>
                {colors.map(({ color, color_hex }) => {
                  const available = isColorAvailable(color)
                  const selected = selectedColor === color
                  return (
                    <TouchableOpacity
                      key={color}
                      style={[
                        styles.swatchWrapper,
                        selected && styles.swatchWrapperSelected,
                        !available && styles.swatchWrapperUnavailable,
                      ]}
                      onPress={() => handleColorPress(color)}
                      activeOpacity={available ? 0.8 : 1}
                    >
                      <View
                        style={[
                          styles.swatch,
                          { backgroundColor: color_hex ?? '#D9CFC4' },
                        ]}
                      />
                    </TouchableOpacity>
                  )
                })}
              </View>
            </View>
          )}

          {/* ── Vendor store card ── */}
          {store && (
            <TouchableOpacity
              style={styles.storeCard}
              onPress={() => navigation.navigate('StoreProfile', { storeId: product.store_id })}
              activeOpacity={0.85}
            >
              {store.logo_url ? (
                <Image source={{ uri: store.logo_url }} style={styles.storeAvatarImg} resizeMode="cover" />
              ) : (
                <View style={styles.storeAvatar}>
                  <Text style={styles.storeAvatarText}>{store.name.charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <View style={styles.storeCardBody}>
                <Text style={styles.storeCardName} numberOfLines={1}>{store.name}</Text>
                <Text style={styles.storeCardMeta} numberOfLines={1}>
                  {store.rating != null ? `★ ${store.rating.toFixed(1)}` : t('product.newStore')}
                  {store.region ? `  ·  ${store.region}` : ''}
                </Text>
                {store.description ? (
                  <Text style={styles.storeCardBio} numberOfLines={2}>{store.description}</Text>
                ) : null}
              </View>
              <View style={styles.storeCardCta}>
                <Text style={styles.storeCardCtaText}>{t('feed.visit')}</Text>
              </View>
            </TouchableOpacity>
          )}

          <View style={styles.bottomSpacer} />
        </View>
      </ScrollView>

      {/* ── Sticky action bar ── */}
      <View style={styles.actionBar}>
        <TouchableOpacity
          style={[styles.orderBtn, (!canOrder || added) && styles.orderBtnMuted, added && styles.orderBtnAdded]}
          onPress={handleAddToCart}
          disabled={!canOrder || added}
          activeOpacity={0.85}
        >
          <Text style={styles.orderBtnText}>
            {added ? t('product.addedToBag') : canOrder ? t('product.addToBag') : t('product.selectOptions')}
          </Text>
        </TouchableOpacity>
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
  flex: { flex: 1 },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Carousel
  carouselImage: {
    width: SCREEN_WIDTH,
    height: CAROUSEL_HEIGHT,
  },
  imagePlaceholder: {
    backgroundColor: '#ECE6DC',
  },
  backBtn: {
    position: 'absolute',
    left: 16,
  },
  backBtnInner: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(250,247,242,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backBtnText: {
    fontSize: 18,
    color: '#1C1612',
    lineHeight: 22,
  },
  shareBtn: {
    position: 'absolute',
    right: 16,
  },
  favBtn: {
    position: 'absolute',
    right: 64,
  },
  favFilled: {
    fontSize: 18,
    color: '#D9552B',
    lineHeight: 22,
  },
  favEmpty: {
    fontSize: 18,
    color: '#1C1612',
    lineHeight: 22,
  },
  shareBtnText: {
    fontSize: 18,
    color: '#1C1612',
    lineHeight: 22,
    fontWeight: '700',
  },
  copiedToast: {
    position: 'absolute',
    right: 16,
    backgroundColor: '#1C1612',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  copiedToastText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  dotsRow: {
    position: 'absolute',
    bottom: 14,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(28,22,18,0.25)',
  },
  dotActive: {
    width: 18,
    borderRadius: 3,
    backgroundColor: '#D9552B',
  },
  // Content
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  categoryLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7A6A5A',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  storeName: {
    fontSize: 11,
    fontWeight: '600',
    color: '#7A6A5A',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: 4,
  },
  productName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1C1612',
    lineHeight: 30,
    marginBottom: 8,
  },
  price: {
    fontSize: 22,
    fontWeight: '700',
    color: '#D9552B',
    marginBottom: 16,
  },
  description: {
    fontSize: 14,
    lineHeight: 22,
    color: '#5A4A3A',
    marginBottom: 24,
  },
  // Variant pickers
  pickerSection: {
    marginBottom: 24,
  },
  pickerLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1C1612',
    marginBottom: 10,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    minWidth: 56,
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#D9CFC4',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pillSelected: {
    backgroundColor: '#D9552B',
    borderColor: '#D9552B',
  },
  pillUnavailable: {
    opacity: 0.45,
    backgroundColor: '#F5EFE6',
    borderColor: '#E0D8CF',
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1C1612',
  },
  pillTextSelected: {
    color: '#FFFFFF',
  },
  pillTextUnavailable: {
    textDecorationLine: 'line-through',
    color: '#7A6A5A',
  },
  swatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  swatchWrapper: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2.5,
    borderColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  swatchWrapperSelected: {
    borderColor: '#D9552B',
  },
  swatchWrapperUnavailable: {
    opacity: 0.3,
  },
  swatch: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  // Vendor store card
  storeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F5EFE6',
    borderRadius: 16,
    padding: 14,
    marginBottom: 8,
  },
  storeAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#1C1612',
    justifyContent: 'center',
    alignItems: 'center',
  },
  storeAvatarText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  storeAvatarImg: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F0E9DF',
  },
  storeCardBody: {
    flex: 1,
    gap: 2,
  },
  storeCardName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1C1612',
  },
  storeCardMeta: {
    fontSize: 12,
    fontWeight: '600',
    color: '#D9552B',
  },
  storeCardBio: {
    fontSize: 12,
    color: '#7A6A5A',
    lineHeight: 17,
  },
  storeCardCta: {
    paddingLeft: 4,
  },
  storeCardCtaText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1C1612',
  },
  bottomSpacer: { height: 16 },
  // Action bar
  actionBar: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#ECE6DC',
  },
  orderBtn: {
    backgroundColor: '#D9552B',
    borderRadius: 28,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  orderBtnMuted: {
    opacity: 0.45,
  },
  orderBtnAdded: {
    backgroundColor: '#2D7A4F',
    opacity: 1,
  },
  orderBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  errorText: {
    fontSize: 14,
    color: '#D9552B',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
})
