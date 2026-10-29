import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { handleWebhookFunction } from './stripe'

test('Stripe webhook verifies signature over the raw body', async () => {
  const rawBody = JSON.stringify({ id: 'evt_test', type: 'checkout.session.completed', data: { object: { id: 'cs_test' } } })
  const secret = 'whsec_test_secret'
  process.env.STRIPE_WEBHOOK_SECRET = secret
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')
  const parsed = await handleWebhookFunction({ rawBody, headers: { 'stripe-signature': `t=${timestamp},v1=${signature}` } })
  assert.equal(parsed.type, 'checkout.session.completed')
  await assert.rejects(handleWebhookFunction({ rawBody: `${rawBody} `, headers: { 'stripe-signature': `t=${timestamp},v1=${signature}` } }), /Invalid Stripe signature/)
})

test('Stripe payment input admits opaque payment identifier and amount only, no PHI fields', async () => {
  const source = await import('node:fs/promises').then(fs => fs.readFile(new URL('./stripe.ts', import.meta.url), 'utf8'))
  assert.match(source, /metadata\[patientPaymentId\]/)
  assert.doesNotMatch(source, /metadata\[(?:name|email|patientName|diagnosis|procedure)/i)
  assert.match(source, /Healthcare balance payment/)
  assert.doesNotMatch(source, /description:.*(?:patient|diagnosis|procedure)/i)
})
