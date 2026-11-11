import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { Prisma } from '@prisma/client'
import type { Context } from '.keystone/types'
import { createPayment, getPaymentStatus } from '../../utils/paymentProviderAdapter'
import { consumeSharedRateLimit, requestIdentity } from '../../security/graphqlSecurity'
import { appendAudit } from '../operational/evidence'
import { advanceTimedStates, PAYMENT_SWEEP_ACTOR, resetExpiredPaymentSession } from '../operational/maintenance'
import { HospitalRefusal } from '../../lib/constraint-errors'

function digest(value: string) { return createHash('sha256').update(value).digest() }
function equal(a: string, b: string) { const left = digest(a); const right = digest(b); return timingSafeEqual(left, right) }

export async function lookupPatientBill(_root: unknown, { paymentNumber, dateOfBirth }: { paymentNumber: string; dateOfBirth: string }, context: Context) {
  // Payment numbers are issued as PAY-<uuid> (lowercase hex); accept either case from the patient.
  const typed = paymentNumber.trim()
  const number = /^pay-/i.test(typed) ? `PAY-${typed.slice(4).toLowerCase()}` : typed
  if (!/^PAY-[A-Z0-9-]{20,80}$/i.test(number) || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) throw new HospitalRefusal('Unable to locate a balance')
  const prisma = context.sudo().prisma as any
  const headers = Object.fromEntries(Object.entries((context.req as any)?.headers || {}).map(([key, value]) => [key.toLowerCase(), value as string]))
  const identity = requestIdentity(headers, (context.req as any)?.socket?.remoteAddress)
  if (!await consumeSharedRateLimit(prisma, 'public-bill-lookup-network', identity, process.env.NODE_ENV === 'production' ? 8 : 100, new Date(), 60)) throw new HospitalRefusal('Unable to locate a balance')
  const match = await prisma.patientPayment.findUnique({ where: { paymentNumber: number }, include: { patient: { select: { dateOfBirth: true } }, facility: { select: { name: true } } } })
  if (!match || match.status !== 'pending' || !match.patient?.dateOfBirth || new Date(match.patient.dateOfBirth).toISOString().slice(0, 10) !== dateOfBirth) throw new HospitalRefusal('Unable to locate a balance')
  const secret = process.env.SESSION_SECRET || ''
  if (secret.length < 32) throw new Error('Bill payment signing key is not configured')
  const token = `${match.id}.${createHmac('sha256', secret).update(`bill:${match.id}`).digest('hex')}`
  return { paymentToken: token, amountCents: match.amountCents, currency: match.currency, facilityName: match.facility?.name || 'Healthcare facility' }
}

export async function initiatePatientBillPayment(_root: unknown, { paymentToken }: { paymentToken: string }, context: Context) {
  if (context.session?.listKey === 'User') throw new HospitalRefusal('Staff should issue this link from the billing workflow')
  const [paymentId, supplied] = paymentToken.split('.')
  const secret = process.env.SESSION_SECRET || ''
  if (!paymentId || !supplied || secret.length < 32 || !equal(supplied, createHmac('sha256', secret).update(`bill:${paymentId}`).digest('hex'))) throw new HospitalRefusal('Payment proof is invalid')
  const prisma = context.sudo().prisma as any
  const payment = await prisma.patientPayment.findUnique({ where: { id: paymentId } })
  const paymentProvider = payment?.paymentProviderId ? await prisma.paymentProvider.findFirst({ where: { id: payment.paymentProviderId, facilityId: payment.facilityId, isInstalled: true } }) : null
  if (!payment || payment.status !== 'pending' || payment.method !== 'card_online' || !paymentProvider) throw new HospitalRefusal('Payment is unavailable')
  if (context.session) throw new HospitalRefusal('Patient portal payment sessions are not supported')
  if (payment.providerPaymentId) {
    // Resume the patient's open Checkout Session instead of creating a second one.
    const existing = await getPaymentStatus({ provider: paymentProvider, paymentId: payment.providerPaymentId })
    return { clientSecret: existing?.url ?? null, amountCents: payment.amountCents, currency: payment.currency }
  }
  const created = await createPayment({ provider: paymentProvider, amount: payment.amountCents, currency: payment.currency, patientPaymentId: payment.id, idempotencyKey: `bill:${payment.id}:v${payment.transitionVersion}` })
  if (created.amount !== payment.amountCents || created.currency !== payment.currency) throw new HospitalRefusal('Payment provider amount mismatch')
  await prisma.patientPayment.update({ where: { id: payment.id }, data: { providerPaymentId: created.id } })
  return { clientSecret: created.clientSecret, amountCents: payment.amountCents, currency: payment.currency }
}

export async function reconcilePatientBillPayment(paymentId: string, context: Context) {
  if (!context.session?.data.role?.canManageBilling) throw new HospitalRefusal('Not authorized to manage billing operations')
  return settleFromProvider(context, { id: paymentId }, context.session!.itemId)
}

// The patient returns from Stripe Checkout with its session id; Stripe is asked
// directly, so the browser can only confirm what Stripe already reports as paid.
export async function confirmPatientBillPayment(_root: unknown, { sessionId }: { sessionId: string }, context: Context) {
  if (!/^cs_(test|live)_[A-Za-z0-9]{10,200}$/.test(String(sessionId || ''))) throw new HospitalRefusal('Payment confirmation is invalid')
  const result = await settleFromProvider(context, { providerPaymentId: sessionId }, 'patient_checkout_return')
  const prisma = context.sudo().prisma as any
  const payment = await prisma.patientPayment.findUnique({ where: { providerPaymentId: sessionId }, include: { facility: { select: { name: true } } } })
  return { status: result.status, amountCents: payment?.amountCents ?? null, currency: payment?.currency ?? null, facilityName: payment?.facility?.name ?? null, reference: payment?.paymentNumber ? payment.paymentNumber.slice(0, 12).toUpperCase() : null }
}

export async function settleFromProvider(context: Context, where: { id?: string; providerPaymentId?: string }, actorReference: string) {
  const prisma = context.sudo().prisma as any
  const payment = await prisma.patientPayment.findUnique({ where })
  const paymentProvider = payment?.paymentProviderId ? await prisma.paymentProvider.findFirst({ where: { id: payment.paymentProviderId, facilityId: payment.facilityId, isInstalled: true } }) : null
  if (!payment?.providerPaymentId || !paymentProvider) throw new HospitalRefusal('Provider payment is unavailable')
  const status = await getPaymentStatus({ provider: paymentProvider, paymentId: payment.providerPaymentId })
  if (status.amount !== payment.amountCents || status.currency !== payment.currency) throw new HospitalRefusal('Provider amount mismatch; reconciliation required')
  if (status.status === 'canceled' && payment.status === 'pending') {
    // The Checkout Session expired at the provider and nothing was charged: free the bill for a fresh session.
    await resetExpiredPaymentSession(prisma, payment.id, payment.providerPaymentId, new Date(), actorReference)
    return { status: 'pending' }
  }
  if (status.status !== 'succeeded') return { status: payment.status }
  const operationKey = `provider:${payment.id}:${payment.providerPaymentId}:succeeded`
  const operationKeyHash = createHash('sha256').update(operationKey).digest('hex')
  return context.transaction(async (tx: any) => {
    const db = tx.sudo().prisma
    await db.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`payment:${payment.id}`}, 0))::text AS "lock"`)
    const current = await db.patientPayment.findUnique({ where: { id: payment.id } })
    if (!current || current.status !== 'pending') return { status: current?.status || 'missing' }
    if (current.transitionVersion !== payment.transitionVersion) throw new HospitalRefusal('Payment changed; reconcile again')
    const nextVersion = current.transitionVersion + 1
    const updated = await db.patientPayment.update({ where: { id: current.id }, data: { status: 'succeeded', transitionVersion: nextVersion, receivedAt: new Date(), externalReference: payment.providerPaymentId } })
    await appendAudit(db, { eventType: 'payment.succeeded', aggregateType: 'payment', aggregateId: updated.id, facilityId: updated.facilityId, patientId: updated.patientId, actorReference, metadata: { source: 'payment_reconciliation', aggregateId: updated.id, providerPaymentId: updated.providerPaymentId, transitionVersion: nextVersion, amountCents: updated.amountCents, currency: updated.currency } })
    return { status: updated.status }
  }, { timeout: 30_000 })
}

/** Staff Refresh button: expired bed holds and unconfirmed requests are closed, and card payments left unconfirmed are checked with the provider. */
export async function refreshTimedStates(_root: unknown, _args: unknown, context: Context) {
  if (context.session?.listKey !== 'User') throw new HospitalRefusal('Staff sign-in required')
  const result = await advanceTimedStates(context.sudo().prisma, { force: true, settle: paymentId => settleFromProvider(context, { id: paymentId }, PAYMENT_SWEEP_ACTOR) })
  return result ?? { bedReservations: 0, appointments: 0, payments: 0 }
}
