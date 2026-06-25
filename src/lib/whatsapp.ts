import { supabase } from './supabase'

const FUNCTION_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/whatsapp-notify`

async function call(payload: Record<string, unknown>): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    await fetch(FUNCTION_URL, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        Authorization:   `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(payload),
    })
  } catch {
    // Non-fatal — never block the caller
  }
}

export function notifyNewOrder(orderId: string): void {
  void call({ event: 'new_order', order_id: orderId })
}

export function notifyStatusChanged(orderId: string, newStatus: string): void {
  void call({ event: 'status_changed', order_id: orderId, new_status: newStatus })
}
