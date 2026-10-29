import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { Prisma } from '@prisma/client'
import type { Context } from '.keystone/types'
import { createPayment, getPaymentStatus } from '../../utils/paymentProviderAdapter'
import { consumeSharedRateLimit, requestIdentity } from '../../security/graphqlSecurity'
import { appendAuditAndOutbox } from '../operational/evidence'

function digest(value: string) { return createHash('sha256').update(value).digest() }
function equal(a: string, b: string) { const left = digest(a); const right = digest(b); return timingSafeEqual(left, right) }

export async function lookupPatientBill(_root: unknown, { paymentNumber, dateOfBirth }: { paymentNumber: string; dateOfBirth: string }, context: Context) {
  const number = paymentNumber.trim().toUpperCase()
  if (!/^PAY-[A-F0-9-]{20,60}$/.test(number) || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) throw new Error('Unable to locate a balance')
  const prisma = context.sudo().prisma as any
  const identity = requestIdentity(context.req as any)
  if (!await consumeSharedRateLimit(prisma, 'public-bill-lookup-network', identity, process.env.NODE_ENV === 'production' ? 8 : 100, new Date(), 60)) throw new Error('Unable to locate a balance')
  const match = await prisma.patientPayment.findUnique({ where: { paymentNumber: number }, include: { patient: { select: { dateOfBirth: true } }, facility: { select: { name: true } } } })
  if (!match || match.status !== 'pending' || !match.patient?.dateOfBirth || !equal(new Date(match.patient.dateOfBirth).toISOString().slice(0, 10), dateOfBirth)) throw new Error('Unable to locate a balance')
  const secret = process.env.SESSION_SECRET || ''
  if (secret.length < 32) throw new Error('Bill payment signing key is not configured')
  const token = `${match.id}.${createHmac('sha256', secret).update(`bill:${match.id}`).digest('hex')}`
  return { paymentToken: token, amountCents: match.amountCents, currency: match.currency, facilityName: match.facility?.name || 'Healthcare facility' }
}

export async function initiatePatientBillPayment(_root: unknown, { paymentToken }: { paymentToken: string }, context: Context) {
  const [paymentId, supplied] = paymentToken.split('.')
  const secret = process.env.SESSION_SECRET || ''
  if (!paymentId || !supplied || secret.length < 32 || !equal(supplied, createHmac('sha256', secret).update(`bill:${paymentId}`).digest('hex'))) throw new Error('Payment proof is invalid')
  const prisma = context.sudo().prisma as any
  const payment = await prisma.patientPayment.findUnique({ where: { id: paymentId }, include: { paymentProvider: true } })
  if (!payment || payment.status !== 'pending' || payment.method !== 'card_online' || !payment.paymentProvider?.isInstalled || payment.providerPaymentId) throw new Error('Payment is unavailable')
  if (context.session) throw new Error('Patient portal payment sessions are not supported')
  const created = await createPayment({ provider: payment.paymentProvider, amount: payment.amountCents, currency: payment.currency, patientPaymentId: payment.id, idempotencyKey: `bill:${payment.id}:v${payment.transitionVersion}` })
  if (created.amount !== payment.amountCents || created.currency !== payment.currency) throw new Error('Payment provider amount mismatch')
  await prisma.patientPayment.update({ where: { id: payment.id }, data: { providerPaymentId: created.id } })
  return { clientSecret: created.clientSecret, amountCents: payment.amountCents, currency: payment.currency }
}

export async function reconcilePatientBillPayment(paymentId: string, context: Context) {
  if (!context.session?.data.role?.canManageBilling) throw new Error('Not authorized to manage billing operations')
  const prisma = context.sudo().prisma as any
  const payment = await prisma.patientPayment.findUnique({ where: { id: paymentId }, include: { paymentProvider: true } })
  if (!payment?.providerPaymentId || !payment.paymentProvider) throw new Error('Provider payment is unavailable')
  const status = await getPaymentStatus({ provider: payment.paymentProvider, paymentId: payment.providerPaymentId })
  if (status.amount !== payment.amountCents || status.currency !== payment.currency) throw new Error('Provider amount mismatch; reconciliation required')
  if (status.status !== 'succeeded') return { status: payment.status }
  const operationKey = `provider:${payment.id}:${payment.providerPaymentId}:succeeded`
  const operationKeyHash = createHash('sha256').update(operationKey).digest('hex')
  return context.transaction(async (tx: any) => {
    const db = tx.sudo().prisma
    await db.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`payment:${payment.id}`}, 0))::text AS "lock"`)
    const current = await db.patientPayment.findUnique({ where: { id: payment.id } })
    if (!current || current.status !== 'pending') return { status: current?.status || 'missing' }
    const nextVersion = current.transitionVersion + 1
    const updated = await db.patientPayment.update({ where: { id: current.id }, data: { status: 'succeeded', transitionVersion: nextVersion, receivedAt: new Date() } })
    await appendAuditAndOutbox(db, { eventKey: `payment:${updated.id}:v${nextVersion}:succeeded`, eventType: 'payment.succeeded', aggregateType: 'payment', aggregateId: updated.id, facilityId: updated.facilityId, patientId: updated.patientId, actorReference: context.session!.itemId, deliveryMode: 'internal', metadata: { source: 'payment_reconciliation', aggregateId: updated.id, providerPaymentId: updated.providerPaymentId, transitionVersion: nextVersion, amountCents: updated.amountCents, currency: updated.currency } })
    return { status: updated.status }
  }, { timeout: 30_000 })
}
