import { Platform } from 'react-native'
import Constants from 'expo-constants'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import { supabase } from './supabase'

const FUNCTION_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/push-notify`

// ---------------------------------------------------------------------------
// Token registration
// ---------------------------------------------------------------------------

export interface PushRegistration {
  token: string | null
  error: string | null
}

function projectId(): string | undefined {
  const id: unknown = Constants.expoConfig?.extra?.eas?.projectId
  return typeof id === 'string' ? id : undefined
}

async function getExpoToken(): Promise<PushRegistration> {
  if (Platform.OS === 'web') {
    return { token: null, error: 'Push notifications are available in the mobile app only.' }
  }
  if (!Device.isDevice) {
    return { token: null, error: 'Push notifications need a physical device.' }
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Order updates',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#D9552B',
    })
  }

  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId: projectId() })
    return { token: data, error: null }
  } catch (err) {
    return { token: null, error: err instanceof Error ? err.message : 'Could not get a push token.' }
  }
}

// Full registration — prompts for permission if not yet decided.
// Persists the token on the user row and returns it for display.
export async function registerForPushNotifications(userId: string): Promise<PushRegistration> {
  if (Platform.OS === 'web') {
    return { token: null, error: 'Push notifications are available in the mobile app only.' }
  }

  const existing = await Notifications.getPermissionsAsync()
  let status = existing.status
  if (status !== 'granted') {
    status = (await Notifications.requestPermissionsAsync()).status
  }
  if (status !== 'granted') {
    return { token: null, error: 'Notification permission was declined. Enable it in Settings to get order updates.' }
  }

  const reg = await getExpoToken()
  if (!reg.token) return reg

  const { error } = await supabase
    .from('users')
    .update({ push_token: reg.token })
    .eq('id', userId)
  if (error) return { token: null, error: error.message }

  return reg
}

// Silent refresh on app start — never prompts; only re-saves the token when
// the user already granted permission on this device.
export async function syncPushToken(userId: string): Promise<void> {
  try {
    if (Platform.OS === 'web' || !Device.isDevice) return
    const { status } = await Notifications.getPermissionsAsync()
    if (status !== 'granted') return
    const { token } = await getExpoToken()
    if (!token) return
    await supabase.from('users').update({ push_token: token }).eq('id', userId)
  } catch {
    // Non-fatal — push is best-effort
  }
}

// ---------------------------------------------------------------------------
// Fire-and-forget notification triggers
// ---------------------------------------------------------------------------

async function call(payload: Record<string, unknown>): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    await fetch(FUNCTION_URL, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:  `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(payload),
    })
  } catch {
    // Non-fatal — never block the caller
  }
}

export function pushNotifyNewOrder(orderId: string): void {
  void call({ event: 'new_order', order_id: orderId })
}

export function pushNotifyStatusChanged(orderId: string, newStatus: string): void {
  void call({ event: 'status_changed', order_id: orderId, new_status: newStatus })
}
