type StripeResponse = Record<string, any>

async function stripeRequest(path: string, method = 'GET', body?: Record<string, unknown>, idempotencyKey?: string): Promise<StripeResponse> {
  const secret = process.env.STRIPE_SECRET_KEY
  if (!secret || !secret.startsWith('sk_test_')) throw new Error('A Stripe test secret key is required')
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: { Authorization: `Bearer ${secret}`, ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}), ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
    body: body ? new URLSearchParams(Object.entries(body).flatMap(([key, value]) => {
      if (value === undefined || value === null) return []
      if (typeof value === 'object') return Object.entries(value as Record<string, unknown>).map(([nestedKey, nested]) => [`${key}[${nestedKey}]`, String(nested)] as [string, string])
      return [[key, String(value)] as [string, string]]
    })) : undefined,
  })
  const result = await response.json() as StripeResponse
  if (!response.ok) throw new Error('Stripe request failed')
  return result
}

export async function createPaymentFunction({ amount, currency, patientPaymentId, idempotencyKey }: { amount: number; currency: string; patientPaymentId: string; idempotencyKey: string }) {
  if (!Number.isSafeInteger(amount) || amount < 1) throw new Error('Invalid payment amount')
  const session = await stripeRequest('checkout/sessions', 'POST', {
    mode: 'payment', success_url: `${process.env.PUBLIC_APP_URL}/pay?status=success`, cancel_url: `${process.env.PUBLIC_APP_URL}/pay?status=cancelled`,
    'line_items[0][quantity]': 1, 'line_items[0][price_data][currency]': currency.toLowerCase(),
    'line_items[0][price_data][unit_amount]': amount, 'line_items[0][price_data][product_data][name]': 'Healthcare balance payment',
    'metadata[patientPaymentId]': patientPaymentId, 'payment_intent_data[metadata][patientPaymentId]': patientPaymentId,
  }, idempotencyKey)
  return { id: session.id, clientSecret: session.url, amount, currency: currency.toUpperCase(), status: session.payment_status }
}

export async function capturePaymentFunction({ paymentId, idempotencyKey }: { paymentId: string; idempotencyKey: string }) {
  const intent = await stripeRequest(`payment_intents/${encodeURIComponent(paymentId)}/capture`, 'POST', {}, idempotencyKey)
  return { id: intent.id, status: intent.status, amount: intent.amount_received, currency: intent.currency.toUpperCase() }
}
export async function refundPaymentFunction({ paymentId, amount, idempotencyKey }: { paymentId: string; amount: number; idempotencyKey: string }) {
  const refund = await stripeRequest('refunds', 'POST', { payment_intent: paymentId, amount }, idempotencyKey)
  return { id: refund.id, status: refund.status, amount: refund.amount, currency: refund.currency?.toUpperCase() }
}
export async function getPaymentStatusFunction({ paymentId }: { paymentId: string }) {
  // Bill payments store the Checkout Session id (cs_…); read its PaymentIntent for the money facts.
  if (paymentId.startsWith('cs_')) {
    const session = await stripeRequest(`checkout/sessions/${encodeURIComponent(paymentId)}?expand[]=payment_intent`)
    const intent = session.payment_intent && typeof session.payment_intent === 'object' ? session.payment_intent : null
    const status = session.payment_status === 'paid' && intent?.status === 'succeeded' ? 'succeeded' : session.status === 'expired' ? 'canceled' : (intent?.status || 'requires_payment_method')
    return { id: session.id, paymentIntentId: intent?.id ?? null, url: session.status === 'open' ? session.url : null, status, amount: intent ? (intent.amount_received || intent.amount) : session.amount_total, currency: String(session.currency).toUpperCase() }
  }
  const intent = await stripeRequest(`payment_intents/${encodeURIComponent(paymentId)}`)
  return { id: intent.id, status: intent.status, amount: intent.amount_received || intent.amount, currency: intent.currency.toUpperCase() }
}
export async function generatePaymentLinkFunction({ paymentId }: { paymentId: string }) { return `https://dashboard.stripe.com/test/payments/${encodeURIComponent(paymentId)}` }
export async function handleWebhookFunction({ headers, rawBody }: { headers: Record<string, string>; rawBody: string }) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret || !rawBody) throw new Error('Stripe webhook verification is not configured')
  const signature = headers['stripe-signature']
  if (!signature) throw new Error('Stripe signature is required')
  const { createHmac, timingSafeEqual } = await import('node:crypto')
  const parts = Object.fromEntries(signature.split(',').map(part => part.split('=')))
  const expected = createHmac('sha256', secret).update(`${parts.t}.${rawBody}`).digest('hex')
  const actual = parts.v1 || ''
  if (actual.length !== expected.length || !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) throw new Error('Invalid Stripe signature')
  const event = JSON.parse(rawBody)
  return { isValid: true, event, type: event.type, resource: event.data?.object }
}
