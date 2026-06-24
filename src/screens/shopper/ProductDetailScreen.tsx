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
import { supabase } from '../../lib/supabase'
import { useCartStore } from '../../store/useCartStore'
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
      id, name, description, price_usd, store_id,
      stores ( name, region, whatsapp ),
      product_images ( id, url, position ),
      product_variants ( id, size, color, color_hex, stock )
    `,
    )
    .eq('id', id)
    .single()

type ProductDetail = NonNullable<Awaited<ReturnType<typeof fetchProduct>>['data']>
type Variant = ProductDetail['product_variants'][0]
type StoreShape = { name: string; region: string | null; whatsapp: string | null }

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function ProductDetailScreen({ route, navigation }: Props) {
  const { productId } = route.params
  const insets = useSafeAreaInsets()

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
    if (!selectedVariant || !product) return

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

    navigation.navigate('Cart')
  }, [addItem, product, selectedVariant, store, images, navigation])

  // ---- Loading / error guards ----

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, styles.centered]}>
        <ActivityIndicator size="large" color="#C8622A" />
      </SafeAreaView>
    )
  }

  if (error || !product) {
    return (
      <SafeAreaView style={[styles.safe, styles.centered]}>
        <Text style={styles.errorText}>{error ?? 'Product not found.'}</Text>
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
          {store && <Text style={styles.storeName}>{store.name}</Text>}

          <Text style={styles.productName}>{product.name}</Text>
          <Text style={styles.price}>${Number(product.price_usd).toFixed(0)}</Text>

          {product.description ? (
            <Text style={styles.description}>{product.description}</Text>
          ) : null}

          {/* ── Size picker ── */}
          {sizes.length > 0 && (
            <View style={styles.pickerSection}>
              <Text style={styles.pickerLabel}>Size</Text>
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
                {selectedColor ? `Color — ${selectedColor}` : 'Color'}
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

          <View style={styles.bottomSpacer} />
        </View>
      </ScrollView>

      {/* ── Sticky action bar ── */}
      <View style={styles.actionBar}>
        <TouchableOpacity
          style={[styles.orderBtn, !canOrder && styles.orderBtnMuted]}
          onPress={handleAddToCart}
          disabled={!canOrder}
          activeOpacity={0.85}
        >
          <Text style={styles.orderBtnText}>
            {canOrder ? 'Add to Bag' : 'Select options'}
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
    backgroundColor: '#FAF7F2',
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
    backgroundColor: '#E8E0D5',
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
    backgroundColor: '#C8622A',
  },
  // Content
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
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
    color: '#C8622A',
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
    backgroundColor: '#C8622A',
    borderColor: '#C8622A',
  },
  pillUnavailable: {
    opacity: 0.45,
    backgroundColor: '#F0EBE3',
    borderColor: '#E0D8CF',
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1C1612',
  },
  pillTextSelected: {
    color: '#FAF7F2',
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
    borderColor: '#C8622A',
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
  bottomSpacer: { height: 16 },
  // Action bar
  actionBar: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    backgroundColor: '#FAF7F2',
    borderTopWidth: 1,
    borderTopColor: '#E8E0D5',
  },
  orderBtn: {
    backgroundColor: '#C8622A',
    borderRadius: 12,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  orderBtnMuted: {
    opacity: 0.45,
  },
  orderBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FAF7F2',
    letterSpacing: 0.3,
  },
  errorText: {
    fontSize: 14,
    color: '#C8622A',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
})
