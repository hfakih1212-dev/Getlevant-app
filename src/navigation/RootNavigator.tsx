import React, { useEffect } from 'react'
import { ActivityIndicator, View, StyleSheet } from 'react-native'
import { NavigationContainer, LinkingOptions } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import * as Linking from 'expo-linking'
import { useAuthStore } from '../store/useAuthStore'
import { syncPushToken } from '../lib/push'
import PhoneLoginScreen from '../screens/auth/PhoneLoginScreen'
import MarketplaceFeedScreen from '../screens/shopper/MarketplaceFeedScreen'
import ProductDetailScreen from '../screens/shopper/ProductDetailScreen'
import StoreProfileScreen from '../screens/shopper/StoreProfileScreen'
import CartScreen from '../screens/shopper/CartScreen'
import CheckoutScreen from '../screens/shopper/CheckoutScreen'
import OrderConfirmationScreen from '../screens/shopper/OrderConfirmationScreen'
import MyOrdersScreen from '../screens/shopper/MyOrdersScreen'
import ShipmentTrackingScreen from '../screens/shopper/ShipmentTrackingScreen'
import VendorDashboardScreen from '../screens/vendor/VendorDashboardScreen'
import ShipmentCreateScreen from '../screens/vendor/ShipmentCreateScreen'
import ProductManagementScreen from '../screens/vendor/ProductManagementScreen'
import StoreOnboardingScreen from '../screens/vendor/StoreOnboardingScreen'
import StoreSettingsScreen from '../screens/vendor/StoreSettingsScreen'
import ProfileScreen from '../screens/shared/ProfileScreen'
import RewardCelebration from '../components/RewardCelebration'

// ---------------------------------------------------------------------------
// Param list types — imported by screens for prop typing
// ---------------------------------------------------------------------------

export type ShopperStackParamList = {
  MarketplaceFeed: undefined
  ProductDetail: { productId: string }
  StoreProfile: { storeId: string }
  Cart: undefined
  Checkout: undefined
  OrderConfirmation: { orderNumber: string }
  MyOrders: undefined
  ShipmentTracking: { orderId: string }
  Profile: undefined
  Login: undefined
}

export type VendorStackParamList = {
  VendorDashboard: undefined
  StoreOnboarding: undefined
  StoreSettings: undefined
  ShipmentCreate: { orderId: string; orderNumber: string }
  ProductManagement: { productId?: string } | undefined
  Profile: undefined
}

// ---------------------------------------------------------------------------
// Deep links — souk://product/<id> on native, /product/<id> on web.
// Vendor screens are deliberately unmapped; shared links always target the
// shopper surface.
// ---------------------------------------------------------------------------

const linking: LinkingOptions<ShopperStackParamList> = {
  prefixes: [Linking.createURL('/')],
  config: {
    // Deep links mount on top of the feed so back navigation always works —
    // without this a shared product link opens a stack of one stranded screen
    initialRouteName: 'MarketplaceFeed',
    screens: {
      MarketplaceFeed: '',
      ProductDetail: 'product/:productId',
      StoreProfile: 'store/:storeId',
      Cart: 'cart',
      MyOrders: 'orders',
      ShipmentTracking: 'orders/:orderId',
      Profile: 'profile',
      Login: 'login',
    },
  },
}

// ---------------------------------------------------------------------------
// Navigator instances
// ---------------------------------------------------------------------------

const VendorNav = createNativeStackNavigator<VendorStackParamList>()
const ShopperNav = createNativeStackNavigator<ShopperStackParamList>()

// ---------------------------------------------------------------------------
// Stacks
// ---------------------------------------------------------------------------

function VendorStack() {
  return (
    <VendorNav.Navigator screenOptions={{ headerShown: false }}>
      <VendorNav.Screen name="VendorDashboard" component={VendorDashboardScreen} />
      <VendorNav.Screen name="StoreOnboarding" component={StoreOnboardingScreen} />
      <VendorNav.Screen name="StoreSettings" component={StoreSettingsScreen} />
      <VendorNav.Screen name="ShipmentCreate" component={ShipmentCreateScreen} />
      <VendorNav.Screen name="ProductManagement" component={ProductManagementScreen} />
      <VendorNav.Screen name="Profile" component={ProfileScreen} />
    </VendorNav.Navigator>
  )
}

// Guests and shoppers share this stack — browsing is open to everyone.
// Account-only screens are registered only when signed in, so guests can't
// reach them (even via deep link); Login exists only for guests and is
// removed from the stack automatically the moment a session appears.
function ShopperStack({ signedIn }: { signedIn: boolean }) {
  return (
    <ShopperNav.Navigator screenOptions={{ headerShown: false }}>
      <ShopperNav.Screen name="MarketplaceFeed" component={MarketplaceFeedScreen} />
      <ShopperNav.Screen name="ProductDetail" component={ProductDetailScreen} />
      <ShopperNav.Screen name="StoreProfile" component={StoreProfileScreen} />
      <ShopperNav.Screen name="Cart" component={CartScreen} />
      {signedIn ? (
        <>
          <ShopperNav.Screen name="Checkout" component={CheckoutScreen} />
          <ShopperNav.Screen name="OrderConfirmation" component={OrderConfirmationScreen} />
          <ShopperNav.Screen name="MyOrders" component={MyOrdersScreen} />
          <ShopperNav.Screen name="ShipmentTracking" component={ShipmentTrackingScreen} />
          <ShopperNav.Screen name="Profile" component={ProfileScreen} />
        </>
      ) : (
        <ShopperNav.Screen name="Login" component={PhoneLoginScreen} />
      )}
    </ShopperNav.Navigator>
  )
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export default function RootNavigator() {
  const { user, session, loading, initialize } = useAuthStore()

  useEffect(() => {
    initialize()
  }, [])

  // Keep the stored Expo push token fresh without prompting — only refreshes
  // when notification permission was already granted on this device.
  useEffect(() => {
    if (user?.id) void syncPushToken(user.id)
  }, [user?.id])

  if (loading) {
    return (
      <View style={[styles.center, styles.splash]}>
        <ActivityIndicator size="large" color="#D9552B" />
      </View>
    )
  }

  return (
    <View style={styles.flex}>
      <NavigationContainer linking={linking}>
        {user?.role === 'vendor' ? <VendorStack /> : <ShopperStack signedIn={session !== null} />}
      </NavigationContainer>
      {/* Celebratory pop-up for freshly minted loyalty rewards */}
      {session !== null && <RewardCelebration />}
    </View>
  )
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  splash: {
    backgroundColor: '#FFFFFF',
  },
})
