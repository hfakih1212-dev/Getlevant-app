import React, { useCallback } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { ShopperStackParamList } from '../../navigation/RootNavigator'

type Props = NativeStackScreenProps<ShopperStackParamList, 'OrderConfirmation'>

export default function OrderConfirmationScreen({ route, navigation }: Props) {
  const { orderNumber } = route.params

  const handleContinue = useCallback(() => {
    navigation.navigate('MarketplaceFeed')
  }, [navigation])

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.centered}>
        <View style={styles.iconCircle}>
          <Text style={styles.iconText}>✓</Text>
        </View>

        <Text style={styles.title}>Order Placed!</Text>
        <Text style={styles.orderNumber}>{orderNumber}</Text>

        <Text style={styles.body}>
          Your order is confirmed and the vendor has been notified. You'll receive
          updates as it's prepared and dispatched.
        </Text>

        <TouchableOpacity
          style={styles.btn}
          onPress={handleContinue}
          activeOpacity={0.85}
        >
          <Text style={styles.btnText}>Continue Shopping</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.ordersLink}
          onPress={() => navigation.navigate('MyOrders')}
          activeOpacity={0.7}
        >
          <Text style={styles.ordersLinkText}>View My Orders</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FAF7F2' },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 36,
    gap: 14,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFF3EC',
    borderWidth: 2,
    borderColor: '#C8622A',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  iconText: {
    fontSize: 36,
    color: '#C8622A',
    fontWeight: '700',
    lineHeight: 42,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1C1612',
  },
  orderNumber: {
    fontSize: 17,
    fontWeight: '700',
    color: '#C8622A',
    letterSpacing: 1.2,
  },
  body: {
    fontSize: 14,
    color: '#7A6A5A',
    textAlign: 'center',
    lineHeight: 21,
    marginTop: 2,
    marginBottom: 6,
  },
  btn: {
    marginTop: 4,
    backgroundColor: '#C8622A',
    borderRadius: 12,
    height: 52,
    paddingHorizontal: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FAF7F2',
    letterSpacing: 0.2,
  },
  ordersLink: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ordersLinkText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#C8622A',
  },
})
