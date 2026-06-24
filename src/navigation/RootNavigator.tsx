import React, { useEffect } from 'react'
import { ActivityIndicator, View, Text, StyleSheet } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { useAuthStore } from '../store/useAuthStore'
import PhoneLoginScreen from '../screens/auth/PhoneLoginScreen'
import OtpVerifyScreen from '../screens/auth/OtpVerifyScreen'
import MarketplaceFeedScreen from '../screens/shopper/MarketplaceFeedScreen'
import ProductDetailScreen from '../screens/shopper/ProductDetailScreen'
import CartScreen from '../screens/shopper/CartScreen'
import CheckoutScreen from '../screens/shopper/CheckoutScreen'
import OrderConfirmationScreen from '../screens/shopper/OrderConfirmationScreen'
import MyOrdersScreen from '../screens/shopper/MyOrdersScreen'
import ShipmentTrackingScreen from '../screens/shopper/ShipmentTrackingScreen'
import VendorDashboardScreen from '../screens/vendor/VendorDashboardScreen'
import ShipmentCreateScreen from '../screens/vendor/ShipmentCreateScreen'
import ProductManagementScreen from '../screens/vendor/ProductManagementScreen'
import StoreOnboardingScreen from '../screens/vendor/StoreOnboardingScreen'
import ProfileScreen from '../screens/shared/ProfileScreen'

// ---------------------------------------------------------------------------
// Param list types — imported by screens for prop typing
// ---------------------------------------------------------------------------

export type AuthStackParamList = {
  PhoneLogin: undefined
  OtpVerify: { phone: string }
}

export type ShopperStackParamList = {
  MarketplaceFeed: undefined
  ProductDetail: { productId: string }
  Cart: undefined
  Checkout: undefined
  OrderConfirmation: { orderNumber: string }
  MyOrders: undefined
  ShipmentTracking: { orderId: string }
  Profile: undefined
}

export type VendorStackParamList = {
  VendorDashboard: undefined
  StoreOnboarding: undefined
  ShipmentCreate: { orderId: string; orderNumber: string }
  ProductManagement: undefined
  Profile: undefined
}

// ---------------------------------------------------------------------------
// Navigator instances
// ---------------------------------------------------------------------------

const AuthNav = createNativeStackNavigator<AuthStackParamList>()
const VendorNav = createNativeStackNavigator<VendorStackParamList>()
const ShopperNav = createNativeStackNavigator<ShopperStackParamList>()

// ---------------------------------------------------------------------------
// Stacks
// ---------------------------------------------------------------------------

function AuthStack() {
  return (
    <AuthNav.Navigator screenOptions={{ headerShown: false }}>
      <AuthNav.Screen name="PhoneLogin" component={PhoneLoginScreen} />
      <AuthNav.Screen name="OtpVerify" component={OtpVerifyScreen} />
    </AuthNav.Navigator>
  )
}

function VendorStack() {
  return (
    <VendorNav.Navigator screenOptions={{ headerShown: false }}>
      <VendorNav.Screen name="VendorDashboard" component={VendorDashboardScreen} />
      <VendorNav.Screen name="StoreOnboarding" component={StoreOnboardingScreen} />
      <VendorNav.Screen name="ShipmentCreate" component={ShipmentCreateScreen} />
      <VendorNav.Screen name="ProductManagement" component={ProductManagementScreen} />
      <VendorNav.Screen name="Profile" component={ProfileScreen} />
    </VendorNav.Navigator>
  )
}


function ShopperStack() {
  return (
    <ShopperNav.Navigator screenOptions={{ headerShown: false }}>
      <ShopperNav.Screen name="MarketplaceFeed" component={MarketplaceFeedScreen} />
      <ShopperNav.Screen name="ProductDetail" component={ProductDetailScreen} />
      <ShopperNav.Screen name="Cart" component={CartScreen} />
      <ShopperNav.Screen name="Checkout" component={CheckoutScreen} />
      <ShopperNav.Screen name="OrderConfirmation" component={OrderConfirmationScreen} />
      <ShopperNav.Screen name="MyOrders" component={MyOrdersScreen} />
      <ShopperNav.Screen name="ShipmentTracking" component={ShipmentTrackingScreen} />
      <ShopperNav.Screen name="Profile" component={ProfileScreen} />
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

  if (loading) {
    return (
      <View style={[styles.center, styles.splash]}>
        <ActivityIndicator size="large" color="#C8622A" />
      </View>
    )
  }

  return (
    <NavigationContainer>
      {session === null ? (
        <AuthStack />
      ) : user?.role === 'vendor' ? (
        <VendorStack />
      ) : (
        <ShopperStack />
      )}
    </NavigationContainer>
  )
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  splash: {
    backgroundColor: '#FAF7F2',
  },
  label: {
    fontSize: 16,
    color: '#1C1612',
  },
})
