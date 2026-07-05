import React, { useCallback, useState } from 'react'
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
import { useFocusEffect } from '@react-navigation/native'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import ConditionBadge from '../../components/ConditionBadge'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/useAuthStore'
import { useFavoritesStore } from '../../store/useFavoritesStore'
import type { ShopperStackParamList } from '../../navigation/RootNavigator'

type Props = NativeStackScreenProps<ShopperStackParamList, 'Favorites'>

// Inactive products embed as null under RLS — filtered out after fetch
const fetchFavorites = (userId: string) =>
  supabase
    .from('favorites')
    .select(`
      product_id,
      product:products (
        id, name, price_usd, condition,
        stores ( name ),
        product_images ( url, position )
      )
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

type FavoriteRow = NonNullable<Awaited<ReturnType<typeof fetchFavorites>>['data']>[0]
type FavoriteProduct = NonNullable<FavoriteRow['product']>

const H_PAD = 16
const COL_GAP = 10
const MAX_CONTENT_WIDTH = 560
const IMAGE_RATIO = 1.25

function resolveProduct(row: FavoriteRow): FavoriteProduct | null {
  const p = row.product as FavoriteProduct | FavoriteProduct[] | null
  if (p == null) return null
  return Array.isArray(p) ? (p[0] ?? null) : p
}

export default function FavoritesScreen({ navigation }: Props) {
  const user = useAuthStore(s => s.user)
  const toggle = useFavoritesStore(s => s.toggle)

  const { width: windowWidth } = useWindowDimensions()
  const gridWidth = Math.min(windowWidth, MAX_CONTENT_WIDTH)
  const cardWidth = (gridWidth - H_PAD * 2 - COL_GAP) / 2
  const imageHeight = cardWidth * IMAGE_RATIO

  const [products, setProducts] = useState<FavoriteProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!user?.id) return
    setError(null)
    const { data, error: fetchErr } = await fetchFavorites(user.id)
    if (fetchErr) {
      setError(fetchErr.message)
    } else {
      setProducts(
        (data ?? [])
          .map(resolveProduct)
          .filter((p): p is FavoriteProduct => p !== null),
      )
    }
    setLoading(false)
  }, [user?.id])

  useFocusEffect(useCallback(() => { load() }, [load]))

  const handleUnfavorite = useCallback(
    (productId: string) => {
      if (!user?.id) return
      setProducts(prev => prev.filter(p => p.id !== productId))
      void toggle(user.id, productId)
    },
    [user?.id, toggle],
  )

  const renderItem: ListRenderItem<FavoriteProduct> = useCallback(
    ({ item }) => {
      const coverUrl =
        [...(item.product_images ?? [])].sort((a, b) => a.position - b.position)[0]?.url ?? null
      const store = Array.isArray(item.stores) ? item.stores[0] : item.stores
      return (
        <TouchableOpacity
          style={{ width: cardWidth }}
          onPress={() => navigation.navigate('ProductDetail', { productId: item.id })}
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
            <TouchableOpacity
              style={styles.heartBtn}
              onPress={() => handleUnfavorite(item.id)}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Text style={styles.heartFilled}>♥</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.cardInfo}>
            {store ? <Text style={styles.storeName} numberOfLines={1}>{store.name}</Text> : null}
            <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
            <Text style={styles.price}>${Number(item.price_usd).toFixed(0)}</Text>
          </View>
        </TouchableOpacity>
      )
    },
    [cardWidth, imageHeight, navigation, handleUnfavorite],
  )

  const keyExtractor = useCallback((item: FavoriteProduct) => item.id, [])

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.contentWrap}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Saved Items</Text>
          <View style={styles.headerRight} />
        </View>

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#D9552B" />
          </View>
        ) : error ? (
          <View style={styles.centered}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={load}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={products}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            numColumns={2}
            contentContainerStyle={styles.listContent}
            columnWrapperStyle={styles.columnWrapper}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyEmoji}>♡</Text>
                <Text style={styles.emptyTitle}>Nothing saved yet</Text>
                <Text style={styles.emptyBody}>
                  Tap the heart on any product to keep it here for later.
                </Text>
              </View>
            }
          />
        )}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contentWrap: {
    flex: 1,
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: H_PAD,
    paddingVertical: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F5EFE6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backIcon: { fontSize: 18, color: '#1C1612', lineHeight: 22 },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1612',
  },
  headerRight: { width: 40 },
  listContent: {
    paddingHorizontal: H_PAD,
    paddingTop: 12,
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
  emptyState: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 72,
    paddingHorizontal: 36,
    gap: 8,
  },
  emptyEmoji: { fontSize: 40, color: '#D9CFC4', marginBottom: 4 },
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
    marginBottom: 16,
  },
  retryBtn: {
    height: 44,
    paddingHorizontal: 24,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#D9552B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  retryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#D9552B',
  },
})
