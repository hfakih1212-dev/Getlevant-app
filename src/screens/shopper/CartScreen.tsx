import React, { useCallback, useMemo } from 'react'
import {
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
import { useT } from '../../lib/i18n'
import { useAuthStore } from '../../store/useAuthStore'
import { useCartStore, CartItem } from '../../store/useCartStore'
import type { ShopperStackParamList } from '../../navigation/RootNavigator'

type Props = NativeStackScreenProps<ShopperStackParamList, 'Cart'>

// ---------------------------------------------------------------------------
// CartItemRow
// ---------------------------------------------------------------------------

type RowProps = {
  item: CartItem
  onUpdateQty: (productId: string, variantId: string, qty: number) => void
  onRemove: (productId: string, variantId: string) => void
}

function CartItemRow({ item, onUpdateQty, onRemove }: RowProps) {
  return (
    <View style={styles.itemCard}>
      {/* Thumbnail */}
      {item.imageUrl ? (
        <Image
          source={{ uri: item.imageUrl }}
          style={styles.thumb}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.thumb, styles.thumbPlaceholder]} />
      )}

      {/* Body */}
      <View style={styles.itemBody}>
        <Text style={styles.itemName} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={styles.itemStore} numberOfLines={1}>
          {item.storeName}
        </Text>

        {/* Variant chips */}
        {(item.size || item.color) ? (
          <View style={styles.chipRow}>
            {item.size ? (
              <View style={styles.chip}>
                <Text style={styles.chipText}>{item.size}</Text>
              </View>
            ) : null}
            {item.color ? (
              <View style={styles.chip}>
                {item.colorHex ? (
                  <View
                    style={[styles.colorDot, { backgroundColor: item.colorHex }]}
                  />
                ) : null}
                <Text style={styles.chipText}>{item.color}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Price + quantity stepper */}
        <View style={styles.priceStepper}>
          <Text style={styles.itemPrice}>
            ${(item.priceUsd * item.quantity).toFixed(0)}
          </Text>
          <View style={styles.stepper}>
            <TouchableOpacity
              style={styles.stepBtn}
              onPress={() => onUpdateQty(item.productId, item.variantId, item.quantity - 1)}
              activeOpacity={0.7}
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            >
              <Text style={styles.stepSign}>−</Text>
            </TouchableOpacity>
            <Text style={styles.qty}>{item.quantity}</Text>
            <TouchableOpacity
              style={styles.stepBtn}
              onPress={() => onUpdateQty(item.productId, item.variantId, item.quantity + 1)}
              activeOpacity={0.7}
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            >
              <Text style={styles.stepSign}>+</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Remove */}
      <TouchableOpacity
        style={styles.removeBtn}
        onPress={() => onRemove(item.productId, item.variantId)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={styles.removeIcon}>×</Text>
      </TouchableOpacity>
    </View>
  )
}

// ---------------------------------------------------------------------------
// CartScreen
// ---------------------------------------------------------------------------

export default function CartScreen({ navigation }: Props) {
  const session = useAuthStore((s) => s.session)
  const items = useCartStore((s) => s.items)
  const t = useT()
  const updateQuantity = useCartStore((s) => s.updateQuantity)
  const removeItem = useCartStore((s) => s.removeItem)

  const totalQty = useMemo(
    () => items.reduce((sum, i) => sum + i.quantity, 0),
    [items],
  )

  const subtotal = useMemo(
    () => items.reduce((sum, i) => sum + i.priceUsd * i.quantity, 0),
    [items],
  )

  const handleUpdateQty = useCallback(
    (productId: string, variantId: string, qty: number) => {
      updateQuantity(productId, variantId, qty)
    },
    [updateQuantity],
  )

  const handleRemove = useCallback(
    (productId: string, variantId: string) => {
      removeItem(productId, variantId)
    },
    [removeItem],
  )

  const renderItem: ListRenderItem<CartItem> = useCallback(
    ({ item }) => (
      <CartItemRow
        item={item}
        onUpdateQty={handleUpdateQty}
        onRemove={handleRemove}
      />
    ),
    [handleUpdateQty, handleRemove],
  )

  const keyExtractor = useCallback(
    (item: CartItem) => `${item.productId}__${item.variantId}`,
    [],
  )

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{t('cart.title')}</Text>
          {totalQty > 0 && (
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{totalQty}</Text>
            </View>
          )}
        </View>

        {/* Spacer keeps title visually centred */}
        <View style={styles.headerRight} />
      </View>

      {/* Item list */}
      <FlatList
        data={items}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🛍</Text>
            <Text style={styles.emptyTitle}>{t('cart.empty')}</Text>
            <Text style={styles.emptyBody}>
              {t('cart.emptyBody')}
            </Text>
            <TouchableOpacity
              style={styles.browseBtn}
              onPress={() => navigation.navigate('MarketplaceFeed')}
              activeOpacity={0.8}
            >
              <Text style={styles.browseBtnText}>{t('cart.browse')}</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {/* Sticky bottom bar */}
      <View style={styles.bottomBar}>
        <View style={styles.subtotalRow}>
          <Text style={styles.subtotalLabel}>{t('cart.subtotal')}</Text>
          <Text style={styles.subtotalValue}>${subtotal.toFixed(2)} USD</Text>
        </View>
        {session === null && totalQty > 0 && (
          <Text style={styles.guestHint}>{t('cart.guestHint')}</Text>
        )}
        <TouchableOpacity
          style={[styles.checkoutBtn, totalQty === 0 && styles.checkoutBtnDisabled]}
          onPress={() => navigation.navigate(session === null ? 'Login' : 'Checkout')}
          disabled={totalQty === 0}
          activeOpacity={0.85}
        >
          <Text style={styles.checkoutBtnText}>
            {session === null ? t('cart.signInToCheckout') : t('cart.checkout')}
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
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#ECE6DC',
  },
  backBtn: {
    width: 40,
    height: 44,
    justifyContent: 'center',
  },
  backIcon: {
    fontSize: 22,
    color: '#1C1612',
    lineHeight: 26,
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1612',
  },
  countBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#D9552B',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  countBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerRight: {
    width: 40,
  },
  // List
  listContent: {
    padding: 16,
    gap: 12,
    flexGrow: 1,
  },
  // Cart item card
  itemCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    gap: 12,
    shadowColor: '#1C1612',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  thumb: {
    width: 80,
    height: 80,
    borderRadius: 8,
  },
  thumbPlaceholder: {
    backgroundColor: '#ECE6DC',
  },
  itemBody: {
    flex: 1,
    gap: 4,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1612',
    lineHeight: 19,
  },
  itemStore: {
    fontSize: 11,
    fontWeight: '600',
    color: '#7A6A5A',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  // Variant chips
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#F5EFE6',
  },
  chipText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#5A4A3A',
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  // Price + stepper row
  priceStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  itemPrice: {
    fontSize: 15,
    fontWeight: '700',
    color: '#D9552B',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#D9CFC4',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepSign: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1C1612',
    lineHeight: 22,
  },
  qty: {
    width: 32,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '700',
    color: '#1C1612',
  },
  // Remove button
  removeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F5EFE6',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  removeIcon: {
    fontSize: 18,
    fontWeight: '400',
    color: '#7A6A5A',
    lineHeight: 22,
    textAlign: 'center',
  },
  // Empty state
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
    gap: 12,
  },
  emptyIcon: {
    fontSize: 52,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1C1612',
  },
  emptyBody: {
    fontSize: 14,
    color: '#7A6A5A',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 32,
  },
  browseBtn: {
    marginTop: 8,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#D9552B',
  },
  browseBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#D9552B',
  },
  // Sticky bottom bar
  bottomBar: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#ECE6DC',
    gap: 14,
  },
  subtotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  subtotalLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#7A6A5A',
  },
  subtotalValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1C1612',
  },
  guestHint: {
    fontSize: 12,
    color: '#7A6A5A',
    textAlign: 'center',
    marginTop: -6,
  },
  checkoutBtn: {
    backgroundColor: '#D9552B',
    borderRadius: 28,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkoutBtnDisabled: {
    opacity: 0.38,
  },
  checkoutBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
})
