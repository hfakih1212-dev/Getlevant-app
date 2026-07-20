import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ---------------------------------------------------------------------------
// WhatsApp Cloud API
// ---------------------------------------------------------------------------

const GRAPH_URL = 'https://graph.facebook.com/v20.0'

async function sendText(to: string, body: string): Promise<void> {
  const phoneId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID')
  const token   = Deno.env.get('WHATSAPP_API_TOKEN')
  if (!phoneId || !token) throw new Error('WhatsApp credentials not configured')

  const digits = to.replace(/\D/g, '')
  const res = await fetch(`${GRAPH_URL}/${phoneId}/messages`, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type:    'individual',
      to:                digits,
      type:              'text',
      text:              { preview_url: false, body },
    }),
  })

  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`WhatsApp API ${res.status}: ${txt}`)
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function first<T>(val: T | T[] | null | undefined): T | null {
  if (val == null) return null
  return Array.isArray(val) ? (val[0] ?? null) : val
}

const PAYMENT_LABEL: Record<string, string> = {
  whatsapp:         'WhatsApp',
  cash_on_delivery: 'Cash on Delivery',
  bank_transfer:    'Bank Transfer',
}

// ---------------------------------------------------------------------------
// Message builders
// ---------------------------------------------------------------------------

function buildNewOrderMessage(order: Record<string, unknown>): string {
  const shopper = first(order.shopper as unknown[]) as Record<string, string> | null
  const contact = shopper?.phone ?? shopper?.email ?? 'Unknown'

  const items = ((order.order_items as unknown[]) ?? [])
    .map((item) => {
      const i = item as Record<string, unknown>
      const p = first(i.product as unknown[]) as Record<string, string> | null
      const v = first(i.variant as unknown[]) as Record<string, string | null> | null
      const opts = [v?.size, v?.color].filter(Boolean).join(' / ')
      return `  • ${i.quantity}× ${p?.name ?? 'Item'}${opts ? ` (${opts})` : ''}`
    })
    .join('\n')

  return [
    '🛍 *New Order on Levant!*',
    '',
    `Order: *${order.order_number}*`,
    `Customer: ${contact}`,
    `Total: *$${Number(order.total_usd).toFixed(2)} USD*`,
    `Payment: ${PAYMENT_LABEL[order.payment_method as string] ?? order.payment_method}`,
    '',
    'Items:',
    items,
    '',
    order.delivery_address ? `📍 Deliver to:\n${order.delivery_address}` : null,
    '',
    'Open the Levant app to accept this order.',
  ].filter((l) => l !== null).join('\n').trim()
}

function buildStatusMessage(order: Record<string, unknown>, newStatus: string): string | null {
  const num = order.order_number as string

  if (newStatus === 'dispatched') {
    const shipment = first(order.shipments as unknown[]) as Record<string, string | null> | null
    const lines = [`🚚 Your Levant order *${num}* is on its way!`]
    if (shipment?.courier_name)  lines.push(`Courier: ${shipment.courier_name}`)
    if (shipment?.tracking_id)   lines.push(`Tracking: ${shipment.tracking_id}`)
    if (shipment?.courier_phone) lines.push(`Courier phone: ${shipment.courier_phone}`)
    lines.push('', 'Track your delivery in the Levant app.')
    return lines.join('\n')
  }

  const STATIC: Partial<Record<string, string>> = {
    confirmed: `✅ Your Levant order *${num}* is confirmed! The vendor is getting it ready.`,
    preparing: `⏳ Your Levant order *${num}* is being prepared.`,
    ready:     `📦 Your Levant order *${num}* is packed and ready for the courier.`,
    delivered: `🎉 Your Levant order *${num}* has been delivered! Enjoy your purchase.`,
    cancelled: `❌ Your Levant order *${num}* has been cancelled. Questions? Contact the vendor directly.`,
  }
  return STATIC[newStatus] ?? null
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleNewOrder(orderId: string, db: ReturnType<typeof createClient>): Promise<void> {
  const { data: order, error } = await db
    .from('orders')
    .select(`
      order_number, total_usd, payment_method, delivery_address,
      stores ( whatsapp ),
      shopper:users!orders_shopper_id_fkey ( phone, email ),
      order_items (
        quantity,
        product:products ( name ),
        variant:product_variants ( size, color )
      )
    `)
    .eq('id', orderId)
    .single()

  if (error || !order) throw new Error(`Order not found: ${error?.message}`)

  const store = first((order as Record<string, unknown>).stores as unknown[]) as Record<string, string> | null
  if (!store?.whatsapp) return  // vendor has no WhatsApp on file — skip silently

  await sendText(store.whatsapp, buildNewOrderMessage(order as Record<string, unknown>))

  await db.from('orders').update({ whatsapp_sent: true }).eq('id', orderId)
}

async function handleStatusChanged(
  orderId:   string,
  newStatus: string,
  db: ReturnType<typeof createClient>,
): Promise<void> {
  const { data: order, error } = await db
    .from('orders')
    .select(`
      order_number,
      shopper:users!orders_shopper_id_fkey ( phone, notification_prefs ),
      shipments ( courier_name, courier_phone, tracking_id )
    `)
    .eq('id', orderId)
    .single()

  if (error || !order) throw new Error(`Order not found: ${error?.message}`)

  const shopper = first((order as Record<string, unknown>).shopper as unknown[]) as Record<string, unknown> | null
  if (!shopper?.phone) return  // no phone set — skip

  const prefs = (shopper.notification_prefs ?? {}) as Record<string, boolean>
  if (prefs.whatsapp_reminders === false) return  // user opted out

  const message = buildStatusMessage(order as Record<string, unknown>, newStatus)
  if (!message) return

  await sendText(shopper.phone as string, message)
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

  // Always use service role so we can read across RLS boundaries
  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  let payload: { event: string; order_id: string; new_status?: string }
  try {
    payload = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400, headers: CORS })
  }

  try {
    if (payload.event === 'new_order') {
      await handleNewOrder(payload.order_id, db)
    } else if (payload.event === 'status_changed' && payload.new_status) {
      await handleStatusChanged(payload.order_id, payload.new_status, db)
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json', ...CORS },
    })
  } catch (err) {
    console.error('[whatsapp-notify]', err)
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } },
    )
  }
})
