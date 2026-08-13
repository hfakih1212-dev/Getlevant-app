import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ---------------------------------------------------------------------------
// Expo push API — no credentials needed for standard send volume
// ---------------------------------------------------------------------------

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

function isExpoToken(token: unknown): token is string {
  return typeof token === 'string' && token.startsWith('ExponentPushToken[')
}

async function sendPush(to: string, title: string, body: string, data: Record<string, unknown>): Promise<void> {
  const res = await fetch(EXPO_PUSH_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, title, body, data, sound: 'default' }),
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Expo push API ${res.status}: ${txt}`)
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

class ForbiddenError extends Error {}

function first<T>(val: T | T[] | null | undefined): T | null {
  if (val == null) return null
  return Array.isArray(val) ? (val[0] ?? null) : val
}

const STATUS_TEXT: Partial<Record<string, string>> = {
  confirmed:  'Your order is confirmed! The vendor is getting it ready.',
  preparing:  'Your order is being prepared.',
  ready:      'Your order is packed and ready for the courier.',
  dispatched: 'Your order is on its way! 🚚',
  delivered:  'Your order has been delivered. Enjoy! 🎉',
  cancelled:  'Your order has been cancelled.',
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

// New order → push to the vendor (store owner). Fires from CheckoutScreen
// right after a shopper places their own order, so the caller must be that
// order's shopper.
async function handleNewOrder(orderId: string, callerId: string, db: ReturnType<typeof createClient>): Promise<void> {
  const { data: order, error } = await db
    .from('orders')
    .select(`
      order_number, total_usd, shopper_id,
      stores ( owner:users!stores_owner_id_fkey ( push_token ) )
    `)
    .eq('id', orderId)
    .single()

  if (error || !order) throw new Error(`Order not found: ${error?.message}`)
  if (order.shopper_id !== callerId) throw new ForbiddenError()

  const store = first((order as Record<string, unknown>).stores as unknown[]) as Record<string, unknown> | null
  const owner = first(store?.owner as unknown[]) as Record<string, unknown> | null
  if (!isExpoToken(owner?.push_token)) return

  await sendPush(
    owner.push_token as string,
    'New order on Getlevant! 🛍',
    `${order.order_number} — $${Number(order.total_usd).toFixed(2)} USD. Open the app to accept it.`,
    { order_id: orderId, event: 'new_order' },
  )
}

// Status change → push to the shopper, respecting order_updates preference.
// Caller must be the shopper or the vendor who owns the store; the message
// always reflects the real DB status, never the payload's claim.
async function handleStatusChanged(
  orderId:  string,
  callerId: string,
  db: ReturnType<typeof createClient>,
): Promise<void> {
  const { data: order, error } = await db
    .from('orders')
    .select(`
      order_number, status, shopper_id,
      stores ( owner_id ),
      shopper:users!orders_shopper_id_fkey ( push_token, notification_prefs )
    `)
    .eq('id', orderId)
    .single()

  if (error || !order) throw new Error(`Order not found: ${error?.message}`)

  const store = first((order as Record<string, unknown>).stores as unknown[]) as Record<string, string> | null
  const isShopper = order.shopper_id === callerId
  const isVendor  = store?.owner_id === callerId
  if (!isShopper && !isVendor) throw new ForbiddenError()

  const body = STATUS_TEXT[order.status as string]
  if (!body) return

  const shopper = first((order as Record<string, unknown>).shopper as unknown[]) as Record<string, unknown> | null
  if (!isExpoToken(shopper?.push_token)) return

  const prefs = (shopper?.notification_prefs ?? {}) as Record<string, boolean>
  if (prefs.order_updates === false) return

  await sendPush(
    shopper!.push_token as string,
    `Order ${order.order_number}`,
    body,
    { order_id: orderId, event: 'status_changed', status: order.status as string },
  )
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS })
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) {
    return new Response('Unauthorized', { status: 401, headers: CORS })
  }
  const token = authHeader.slice('Bearer '.length)

  // Service role — reads push tokens across RLS boundaries
  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: { user: caller }, error: callerErr } = await db.auth.getUser(token)
  if (callerErr || !caller) {
    return new Response('Unauthorized', { status: 401, headers: CORS })
  }

  let payload: { event: string; order_id: string }
  try {
    payload = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400, headers: CORS })
  }

  try {
    if (payload.event === 'new_order') {
      await handleNewOrder(payload.order_id, caller.id, db)
    } else if (payload.event === 'status_changed') {
      await handleStatusChanged(payload.order_id, caller.id, db)
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json', ...CORS },
    })
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Forbidden' }),
        { status: 403, headers: { 'Content-Type': 'application/json', ...CORS } },
      )
    }
    console.error('[push-notify]', err)
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } },
    )
  }
})
