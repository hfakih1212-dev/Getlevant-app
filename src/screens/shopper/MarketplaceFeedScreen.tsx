import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  ListRenderItem,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/useAuthStore'
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

type FeedProduct = NonNullable<
  Awaited<ReturnType<typeof fetchFeed>>['data']
>[0]

// ---------------------------------------------------------------------------
// Layout constants  (8pt grid)
// ---------------------------------------------------------------------------

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const H_PAD = 16
const COL_GAP = 12
const CARD_WIDTH = (SCREEN_WIDTH - H_PAD * 2 - COL_GAP) / 2
const IMAGE_HEIGHT = CARD_WIDTH * (4 / 3) // 3 : 4 portrait aspect ratio

// ---------------------------------------------------------------------------
// ProductCard
// ---------------------------------------------------------------------------

type CardProps = { item: FeedProduct; onPress: (item: FeedProduct) => void }

function ProductCard({ item, onPress }: CardProps) {
  const coverUrl = Array.isArray(item.product_images)
    ? item.product_images[0]?.url
    : (item.product_images as { url: string } | null)?.url

  const store = Array.isArray(item.stores)
    ? item.stores[0]
    : (item.stores as { name: string; region: string | null } | null)

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
          <Text style={styles.storeName} numberOfLines={1}>
            {store.name}
          </Text>
        ) : null}

        <Text style={styles.productName} numberOfLines={2}>
          {item.name}
        </Text>

        <Text style={styles.price}>
          ${Number(item.price_usd).toFixed(0)}
        </Text>
      </View>
    </TouchableOpacity>
  )
}

// ---------------------------------------------------------------------------
// MarketplaceFeedScreen
// ---------------------------------------------------------------------------

export default function MarketplaceFeedScreen({ navigation }: Props) {
  const user = useAuthStore(s => s.user)
  const initial = (user?.phone ?? user?.email ?? '?').replace(/^\+/, '').charAt(0).toUpperCase()

  const [products, setProducts] = useState<FeedProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data, error: fetchError } = await fetchFeed()
      if (cancelled) return
      if (fetchError) {
        setError(fetchError.message)
      } else {
        setProducts(data ?? [])
      }
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [])

  const handlePress = useCallback(
    (item: FeedProduct) => {
      navigation.navigate('ProductDetail', { productId: item.id })
    },
    [navigation],
  )

  const renderItem: ListRenderItem<FeedProduct> = useCallback(
    ({ item }) => <ProductCard item={item} onPress={handlePress} />,
    [handlePress],
  )

  const keyExtractor = useCallback((item: FeedProduct) => item.id, [])

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

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.heading}>Marketplace</Text>
        <TouchableOpacity
          style={styles.profileBtn}
          onPress={() => navigation.navigate('Profile')}
          activeOpacity={0.8}
        >
          <Text style={styles.profileBtnText}>{initial}</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={products}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        numColumns={2}
        contentContainerStyle={styles.listContent}
        columnWrapperStyle={styles.row}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={styles.emptyText}>No products available yet.</Text>
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
  // Top header row
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: H_PAD,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E8E0D5',
  },
  heading: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1C1612',
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
  listContent: {
    paddingHorizontal: H_PAD,
    paddingTop: 16,
    paddingBottom: 40,
  },
  row: {
    justifyContent: 'space-between',
    marginBottom: COL_GAP,
  },
  // Card
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
  // States
  errorText: {
    fontSize: 14,
    color: '#C8622A',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 15,
    color: '#7A6A5A',
    textAlign: 'center',
  },
})
