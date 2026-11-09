import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { Prisma } from '@prisma/client'
import type { Context } from '.keystone/types'
import { appendAudit } from '../operational/evidence'
import { HospitalRefusal } from '../../lib/constraint-errors'

export async function handlePatientPaymentWebhook(providerId: string, event: any, headers: Record<string, string>, rawBody: string, context: Context) {
  const prisma = context.sudo().prisma as any
  const provider = await prisma.paymentProvider.findFirst({ where: { id: providerId, isInstalled: true } })
  if (!provider || provider.code !== 'pp_stripe_hospital') throw new HospitalRefusal('Provider not found')
  const secret = process.env.STRIPE_WEBHOOK_SECRET || ''
  const signature = headers['stripe-signature'] || headers['Stripe-Signature'] || ''
  const parts = Object.fromEntries(signature.split(',').map((part: string) => part.split('=')))
  const expected = createHmac('sha256', secret).update(`${parts.t}.${rawBody}`).digest('hex')
  const actual = parts.v1 || ''
  if (secret.length < 8 || !actual || expected.length !== actual.length || !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) throw new HospitalRefusal('Webhook verification failed')
  const eventId = String(event?.id || '')
  if (!eventId) throw new HospitalRefusal('Webhook event identifier is required')
  const receiptKey = `${provider.id}:${eventId}`
  const existing = await prisma.paymentWebhookReceipt.findUnique({ where: { receiptKey } })
  if (existing?.status === 'processed' || existing?.status === 'ignored') return { success: true, duplicate: true }
  const type = String(event.type || '')
  if (type !== 'checkout.session.completed' || event.data?.object?.payment_status !== 'paid') {
    await prisma.paymentWebhookReceipt.upsert({ where: { receiptKey }, create: { receiptKey, eventId, status: 'ignored', eventType: type, payloadDigest: createHash('sha256').update(rawBody).digest('hex') }, update: {} })
    return { success: true, ignored: true }
  }
  const resource = event.data.object
  const paymentId = resource.metadata?.patientPaymentId
  const providerPaymentId = resource.payment_intent || resource.id
  if (!paymentId || !providerPaymentId) throw new HospitalRefusal('Webhook payment correlation is missing')
  return context.transaction(async (tx: any) => {
    const db = tx.sudo().prisma
    const receipt = await db.paymentWebhookReceipt.upsert({ where: { receiptKey }, create: { receiptKey, eventId, status: 'received', eventType: type, payloadDigest: createHash('sha256').update(rawBody).digest('hex') }, update: {} })
    if (receipt.status === 'processed' || receipt.status === 'ignored') return { success: true, duplicate: true }
    await db.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`payment:${paymentId}`}, 0))::text AS "lock"`)
    const payment = await db.patientPayment.findUnique({ where: { id: paymentId } })
    if (!payment || payment.paymentProviderId !== provider.id || payment.status !== 'pending') throw new HospitalRefusal('Payment correlation is invalid')
    if (resource.amount_total !== payment.amountCents || String(resource.currency).toUpperCase() !== payment.currency) throw new HospitalRefusal('Provider amount/currency mismatch')
    const updated = await db.patientPayment.update({ where: { id: payment.id }, data: { status: 'succeeded', transitionVersion: { increment: 1 }, receivedAt: new Date(), providerPaymentId } })
    await appendAudit(db, { eventType: 'payment.succeeded', aggregateType: 'payment', aggregateId: updated.id, facilityId: updated.facilityId, patientId: updated.patientId, actorReference: 'stripe_webhook', metadata: { source: 'verified_payment_webhook', aggregateId: updated.id, providerPaymentId, transitionVersion: updated.transitionVersion, amountCents: updated.amountCents, currency: updated.currency } })
    await db.paymentWebhookReceipt.update({ where: { id: receipt.id }, data: { status: 'processed', processedAt: new Date() } })
    return { success: true, duplicate: false }
  }, { timeout: 30_000 })
}
