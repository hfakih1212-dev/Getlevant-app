// Auth Send Email Hook — intercepts Supabase auth emails, sends OTP code via Resend.
// Payload: https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook
Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const RESEND_KEY = Deno.env.get('RESEND_API_KEY')
  if (!RESEND_KEY) {
    console.error('[send-otp-email] RESEND_API_KEY not set')
    return new Response(JSON.stringify({ error: 'Email service not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let payload: {
    user: { email: string; id: string }
    email_data: {
      token: string
      token_hash: string
      email_action_type: string
      redirect_to?: string
      site_url?: string
    }
  }

  try {
    payload = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { user, email_data } = payload
  const otp = email_data?.token

  if (!user?.email || !otp) {
    console.error('[send-otp-email] Missing email or token in payload', payload)
    return new Response(JSON.stringify({ error: 'Invalid hook payload' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') ?? 'Souk <onboarding@resend.dev>'

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;background:#FAF7F2;margin:0;padding:40px 20px">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:40px;box-shadow:0 2px 8px rgba(0,0,0,.08)">
    <h1 style="color:#1C1612;font-size:24px;margin:0 0 8px">Your Souk sign-in code</h1>
    <p style="color:#7A6A5A;margin:0 0 32px">Enter this code in the app to sign in.</p>
    <div style="background:#FAF7F2;border-radius:12px;padding:24px;text-align:center;margin-bottom:32px">
      <span style="font-size:48px;font-weight:700;letter-spacing:16px;color:#1C1612;font-family:monospace">${otp}</span>
    </div>
    <p style="color:#7A6A5A;font-size:13px;margin:0">This code expires in 10 minutes and can only be used once.<br>If you didn't request this, you can safely ignore this email.</p>
  </div>
</body>
</html>`

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [user.email],
        subject: `${otp} is your Souk sign-in code`,
        html,
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      console.error(`[send-otp-email] Resend error ${res.status}:`, body)
      return new Response(JSON.stringify({ error: `Email send failed: ${body}` }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    console.log(`[send-otp-email] OTP sent to ${user.email}`)
    // Supabase expects an empty JSON object on success
    return new Response('{}', { headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('[send-otp-email] Fetch error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
