import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import type { Context } from '.keystone/types'
import {
  lockTransitionOperation,
  recordTransition,
  replayTransition,
  transitionEvidence,
} from '../transitionEvidence'
import {
  appendAudit,
  bounded,
  lockOperation,
  operationEvidence,
  requireSafeCents,
  scopedFacilityPatient,
} from './evidence'
import { getPaymentStatus, refundPayment } from '../../utils/paymentProviderAdapter'
import { isPaymentProviderConfigured } from '../../utils/paymentProviderConfig'
import { HospitalRefusal } from '../../lib/constraint-errors'

function requireBilling(context: Context) {
  const role = context.session?.data.role
  if (!role?.canManageBilling) {
    throw new HospitalRefusal('Not authorized to manage billing operations')
  }
}

function result(row: any, replayed = false) {
  return { id: row.id, status: row.status, transitionVersion: row.transitionVersion, replayed }
}

async function scopedInstallation(context: Context, installationId: string | undefined, facilityId: string, kind: string) {
  if (!installationId) return null
  const installation = await context.query.IntegrationInstallation.findOne({
    where: { id: installationId },
    query: 'id status kind transitionVersion facility { id }',
  }) as any
  if (!installation || installation.status !== 'active' || installation.kind !== kind || installation.facility?.id !== facilityId) {
    throw new HospitalRefusal(`Active ${kind} integration not found in the facility`)
  }
  return installation
}

export async function recordPatientCoverage(_root: unknown, { data }: any, context: Context) {
  requireBilling(context)
  await scopedFacilityPatient(context, data.facilityId, data.patientId)
  const input = {
    ...data,
    payerName: bounded(data.payerName, 'Payer name', 300, true),
    memberId: bounded(data.memberId, 'Member ID', 300, true),
    groupNumber: bounded(data.groupNumber, 'Group number', 300),
  }
  const evidence = operationEvidence(input)
  return context.transaction(async (transactionContext: any) => {
    const prisma = transactionContext.sudo().prisma
    await lockOperation(prisma, 'coverage-create', evidence.operationKeyHash)
    const existing = await prisma.patientCoverage.findUnique({ where: { operationKeyHash: evidence.operationKeyHash } })
    if (existing) {
      if (existing.requestHash !== evidence.requestHash) throw new HospitalRefusal('Operation key was reused with a different payload')
      return result(existing, true)
    }
    const now = new Date()
    const coverage = await prisma.patientCoverage.create({
      data: {
        coverageNumber: `COV-${randomUUID()}`,
        status: 'unverified',
        transitionVersion: 1,
        ...evidence,
        actorReference: context.session!.itemId,
        facilityId: data.facilityId,
        patientId: data.patientId,
        payerName: input.payerName,
        memberId: input.memberId,
        groupNumber: input.groupNumber,
        effectiveAt: data.effectiveAt ? new Date(data.effectiveAt) : null,
        terminatesAt: data.terminatesAt ? new Date(data.terminatesAt) : null,
      },
    })
    await appendAudit(prisma, {
      eventType: 'coverage.recorded',
      aggregateType: 'coverage', aggregateId: coverage.id, facilityId: coverage.facilityId,
      patientId: coverage.patientId, actorReference: context.session!.itemId,
      metadata: { source: 'coverage_workflow', aggregateId: coverage.id, status: coverage.status, transitionVersion: 1 },
      occurredAt: now,
    })
    return result(coverage)
  }, { timeout: 30_000 })
}

export async function transitionPatientCoverage(_root: unknown, args: any, context: Context) {
  requireBilling(context)
  if (!Number.isInteger(args.expectedVersion) || args.expectedVersion < 1) throw new HospitalRefusal('Expected coverage version is invalid')
  const scoped = await context.query.PatientCoverage.findOne({ where: { id: args.coverageId }, query: 'id' })
  if (!scoped) throw new HospitalRefusal('Coverage not found or not accessible')
  const reasonCode = bounded(
    args.reasonCode,
    'Coverage evidence reason',
    80,
    ['active', 'rejected'].includes(args.toStatus),
  )
  const evidence = transitionEvidence(args.operationKey, {
    coverageId: args.coverageId,
    toStatus: args.toStatus,
    expectedVersion: args.expectedVersion,
    reasonCode,
  })
  const allowed: Record<string, string[]> = {
    unverified: ['active', 'rejected', 'inactive'], active: ['inactive'], inactive: [], rejected: ['unverified'],
  }
  return context.transaction(async (transactionContext: any) => {
    const prisma = transactionContext.sudo().prisma
    await lockTransitionOperation(prisma, evidence.operationKeyHash)
    await prisma.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`coverage:${args.coverageId}`}, 0))::text AS "lock"`)
    const replay = await replayTransition(prisma, evidence, 'coverage', args.coverageId)
    if (replay) return replay
    const current = await prisma.patientCoverage.findUnique({ where: { id: args.coverageId } })
    if (!current || current.transitionVersion !== args.expectedVersion) throw new HospitalRefusal('Coverage changed; refresh before retrying')
    if (!allowed[current.status]?.includes(args.toStatus)) throw new HospitalRefusal(`Invalid coverage transition from ${current.status} to ${args.toStatus}`)
    const now = new Date()
    const updated = await prisma.patientCoverage.update({
      where: { id: current.id },
      data: {
        status: args.toStatus,
        transitionVersion: { increment: 1 },
        actorReference: context.session!.itemId,
        ...(args.toStatus === 'active' ? { verifiedAt: now, verifiedById: context.session!.itemId } : {}),
      },
    })
    const events = await appendAudit(prisma, {
      eventType: `coverage.${updated.status}`, aggregateType: 'coverage', aggregateId: updated.id,
      facilityId: updated.facilityId, patientId: updated.patientId, actorReference: context.session!.itemId,
      metadata: { source: 'coverage_workflow', aggregateId: updated.id, fromStatus: current.status, status: updated.status, transitionVersion: updated.transitionVersion, reasonCode },
      occurredAt: now,
    })
    const projected = result(updated)
    await recordTransition(prisma, {
      evidence, aggregateType: 'coverage', aggregateId: updated.id, fromStatus: current.status, toStatus: updated.status,
      fromVersion: current.transitionVersion, toVersion: updated.transitionVersion, actorReference: context.session!.itemId,
      facilityId: updated.facilityId, patientId: updated.patientId, auditLogId: events.audit.id,
      result: projected, occurredAt: now,
    })
    return projected
  }, { timeout: 30_000 })
}

export async function recordPatientPayment(_root: unknown, { data }: any, context: Context) {
  requireBilling(context)
  await scopedFacilityPatient(context, data.facilityId, data.patientId)
  const amountCents = requireSafeCents(data.amountCents, 'Payment amount')
  const method = bounded(data.method, 'Payment method', 40, true)
  if (!['cash', 'check', 'card_external', 'bank_external', 'card_online'].includes(method)) throw new HospitalRefusal('Payment method is invalid')
  const isExternal = method.endsWith('_external')
  const isOnline = method === 'card_online'
  const installation = await scopedInstallation(context, data.installationId, data.facilityId, 'payment')
  if (isExternal && !installation) throw new HospitalRefusal('External payments require an active payment integration')
  if (!isExternal && !isOnline && installation) throw new HospitalRefusal('Manual payments cannot use an external integration')
  let paymentProviderId: string | null = null
  if (isOnline) {
    // Staff pick the facility; its installed Stripe row is the only valid provider.
    const providerId = bounded(data.paymentProviderId, 'Payment provider', 128, false)
    const provider = await (context.sudo().prisma as any).paymentProvider.findFirst({ where: { ...(providerId ? { id: providerId } : { code: 'pp_stripe_hospital' }), facilityId: data.facilityId, isInstalled: true } })
    if (!provider || provider.code !== 'pp_stripe_hospital') throw new HospitalRefusal('An installed Stripe provider for this facility is required')
    paymentProviderId = provider.id
  }
  if (data.claimId) {
    const claim = await context.query.InsuranceClaim.findOne({ where: { id: data.claimId }, query: 'id facility { id } patient { id }' }) as any
    if (!claim || claim.facility?.id !== data.facilityId || claim.patient?.id !== data.patientId) throw new HospitalRefusal('Claim does not match the payment scope')
  }
  const input = { ...data, amountCents, method, currency: bounded(data.currency || 'USD', 'Currency', 3, true).toUpperCase() }
  if (!/^[A-Z]{3}$/.test(input.currency)) throw new HospitalRefusal('Currency is invalid')
  const evidence = operationEvidence(input)
  return context.transaction(async (transactionContext: any) => {
    const prisma = transactionContext.sudo().prisma
    await lockOperation(prisma, 'payment-create', evidence.operationKeyHash)
    const existing = await prisma.patientPayment.findUnique({ where: { operationKeyHash: evidence.operationKeyHash } })
    if (existing) {
      if (existing.requestHash !== evidence.requestHash) throw new HospitalRefusal('Operation key was reused with a different payload')
      return result(existing, true)
    }
    const now = new Date()
    const payment = await prisma.patientPayment.create({
      data: {
        paymentNumber: `PAY-${randomUUID()}`,
        status: isExternal || isOnline ? 'pending' : 'succeeded', transitionVersion: 1, ...evidence,
        actorReference: context.session!.itemId, facilityId: data.facilityId, patientId: data.patientId,
        claimId: data.claimId || null, installationId: installation?.id || null, paymentProviderId,
        amountCents, refundedAmountCents: 0, currency: input.currency, method,
        externalReference: bounded(data.externalReference, 'External reference', 300),
        receivedAt: isExternal ? null : now,
      },
    })
    await appendAudit(prisma, {
      eventType: `payment.${payment.status}`, aggregateType: 'payment', aggregateId: payment.id,
      facilityId: payment.facilityId, patientId: payment.patientId, actorReference: context.session!.itemId,
      metadata: { source: 'payment_workflow', aggregateId: payment.id, status: payment.status, transitionVersion: 1, amountCents, currency: input.currency },
      occurredAt: now,
    })
    return result(payment)
  }, { timeout: 30_000 })
}

async function transitionPaymentLike(
  context: Context,
  options: { model: 'PatientPayment' | 'PatientRefund'; delegate: 'patientPayment' | 'patientRefund'; aggregateType: 'payment' | 'refund'; id: string; expectedVersion: number; toStatus: string; operationKey: string; reasonCode?: string; externalReference?: string },
) {
  requireBilling(context)
  if (!Number.isInteger(options.expectedVersion) || options.expectedVersion < 1) throw new HospitalRefusal('Expected billing version is invalid')
  if (!['succeeded', 'failed', 'cancelled'].includes(options.toStatus)) throw new HospitalRefusal('Billing transition status is invalid')
  // Manual cash/check records complete at creation. Every pending record is
  // externally authoritative, so only the signed integration webhook may
  // assert success. Staff may still fail/cancel a pending request.
  if (options.toStatus === 'succeeded') throw new HospitalRefusal('External billing success requires a verified integration event')
  const scoped = await (context.query as any)[options.model].findOne({ where: { id: options.id }, query: 'id' })
  if (!scoped) throw new HospitalRefusal('Billing record not found or not accessible')
  const reasonCode = bounded(options.reasonCode, 'Billing transition reason', 80, options.toStatus !== 'succeeded')
  const externalReference = bounded(options.externalReference, 'External reference', 300)
  const evidence = transitionEvidence(options.operationKey, {
    aggregateId: options.id, expectedVersion: options.expectedVersion, toStatus: options.toStatus, reasonCode, externalReference,
  })
  return context.transaction(async (transactionContext: any) => {
    const prisma = transactionContext.sudo().prisma
    await lockTransitionOperation(prisma, evidence.operationKeyHash)
    await prisma.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${options.aggregateType}:${options.id}`}, 0))::text AS "lock"`)
    const replay = await replayTransition(prisma, evidence, options.aggregateType, options.id)
    if (replay) return replay
    const current = await prisma[options.delegate].findUnique({ where: { id: options.id } })
    if (!current || current.status !== 'pending' || current.transitionVersion !== options.expectedVersion) throw new HospitalRefusal('Billing record changed or is no longer pending')
    const now = new Date()
    if (options.aggregateType === 'refund') {
      await prisma.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`payment-refund:${current.paymentId}`}, 0))::text AS "lock"`)
    }
    const updated = await prisma[options.delegate].update({ where: { id: current.id }, data: {
      status: options.toStatus,
      transitionVersion: { increment: 1 },
      actorReference: context.session!.itemId,
      ...(externalReference ? { externalReference } : {}),
      ...(options.aggregateType === 'payment' && options.toStatus === 'succeeded' ? { receivedAt: now } : {}),
      ...(options.aggregateType === 'payment' && options.toStatus === 'failed' ? { failedAt: now } : {}),
      ...(options.aggregateType === 'refund' && options.toStatus === 'succeeded' ? { completedAt: now } : {}),
      ...(options.aggregateType === 'refund' && options.toStatus === 'failed' ? { failedAt: now } : {}),
    } })
    if (options.aggregateType === 'refund' && options.toStatus === 'succeeded') {
      await applyRefundToPayment(prisma, current.paymentId, current.amountCents)
    }
    const events = await appendAudit(prisma, {
      eventType: `${options.aggregateType}.${updated.status}`, aggregateType: options.aggregateType, aggregateId: updated.id,
      facilityId: updated.facilityId, patientId: updated.patientId, actorReference: context.session!.itemId,
      metadata: { source: 'billing_workflow', aggregateId: updated.id, fromStatus: current.status, status: updated.status, transitionVersion: updated.transitionVersion, reasonCode },
      occurredAt: now,
    })
    const projected = result(updated)
    await recordTransition(prisma, {
      evidence, aggregateType: options.aggregateType, aggregateId: updated.id, fromStatus: current.status, toStatus: updated.status,
      fromVersion: current.transitionVersion, toVersion: updated.transitionVersion, actorReference: context.session!.itemId,
      facilityId: updated.facilityId, patientId: updated.patientId, auditLogId: events.audit.id, 
      result: projected, occurredAt: now,
    })
    return projected
  }, { timeout: 30_000 })
}

export function transitionPatientPayment(_root: unknown, args: any, context: Context) {
  return transitionPaymentLike(context, {
    model: 'PatientPayment', delegate: 'patientPayment', aggregateType: 'payment', id: args.paymentId,
    expectedVersion: args.expectedVersion, toStatus: args.toStatus, operationKey: args.operationKey,
    reasonCode: args.reasonCode, externalReference: args.externalReference,
  })
}

export function transitionPatientRefund(_root: unknown, args: any, context: Context) {
  return transitionPaymentLike(context, {
    model: 'PatientRefund', delegate: 'patientRefund', aggregateType: 'refund', id: args.refundId,
    expectedVersion: args.expectedVersion, toStatus: args.toStatus, operationKey: args.operationKey,
    reasonCode: args.reasonCode, externalReference: args.externalReference,
  })
}

export async function requestPatientRefund(_root: unknown, { data }: any, context: Context) {
  requireBilling(context)
  const amountCents = requireSafeCents(data.amountCents, 'Refund amount')
  const reasonCode = bounded(data.reasonCode, 'Refund reason', 80, true)
  const scoped = await context.query.PatientPayment.findOne({ where: { id: data.paymentId }, query: 'id' })
  if (!scoped) throw new HospitalRefusal('Payment not found or not accessible')
  const evidence = operationEvidence({ ...data, amountCents, reasonCode })
  const created: any = await context.transaction(async (transactionContext: any) => {
    const prisma = transactionContext.sudo().prisma
    await lockOperation(prisma, 'refund-create', evidence.operationKeyHash)
    const existing = await prisma.patientRefund.findUnique({ where: { operationKeyHash: evidence.operationKeyHash } })
    if (existing) {
      if (existing.requestHash !== evidence.requestHash) throw new HospitalRefusal('Operation key was reused with a different payload')
      return { ...result(existing, true), online: existing.status === 'pending' && !existing.installationId }
    }
    await prisma.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`payment-refund:${data.paymentId}`}, 0))::text AS "lock"`)
    const payment = await prisma.patientPayment.findUnique({ where: { id: data.paymentId } })
    if (!payment || payment.status !== 'succeeded') throw new HospitalRefusal('Only a succeeded payment can be refunded')
    const reserved = await prisma.patientRefund.aggregate({
      where: { paymentId: payment.id, status: { in: ['pending', 'succeeded'] } },
      _sum: { amountCents: true },
    })
    if (Number(reserved._sum.amountCents || 0) + amountCents > payment.amountCents) throw new HospitalRefusal('Refund would exceed the captured payment amount')
    const isExternal = ['card_external', 'bank_external'].includes(payment.method)
    const isOnline = payment.method === 'card_online'
    if (isExternal && !payment.installationId) throw new HospitalRefusal('External payment is missing its payment integration')
    const paymentInstallation = isExternal ? await prisma.integrationInstallation.findUnique({ where: { id: payment.installationId } }) : null
    const paymentProvider = isOnline ? await prisma.paymentProvider.findFirst({ where: { id: payment.paymentProviderId, facilityId: payment.facilityId, isInstalled: true } }) : null
    if (isExternal && (!paymentInstallation || paymentInstallation.status !== 'active' || paymentInstallation.facilityId !== payment.facilityId)) {
      throw new HospitalRefusal('External payment integration is no longer active')
    }
    if (isOnline && !paymentProvider) throw new HospitalRefusal('Online payment provider is no longer active')
    const now = new Date()
    const refund = await prisma.patientRefund.create({
      data: {
        refundNumber: `REF-${randomUUID()}`,
        status: isExternal || isOnline ? 'pending' : 'succeeded', transitionVersion: 1, ...evidence,
        actorReference: context.session!.itemId, facilityId: payment.facilityId, patientId: payment.patientId,
        paymentId: payment.id, installationId: payment.installationId, amountCents, reasonCode,
        completedAt: isExternal || isOnline ? null : now,
      },
    })
    if (!isExternal && !isOnline) {
      await applyRefundToPayment(prisma, payment.id, amountCents)
    }
    await appendAudit(prisma, {
      eventType: `refund.${refund.status}`, aggregateType: 'refund', aggregateId: refund.id,
      facilityId: refund.facilityId, patientId: refund.patientId, actorReference: context.session!.itemId,
      metadata: { source: 'refund_workflow', aggregateId: refund.id, paymentId: payment.id, status: refund.status, transitionVersion: 1, amountCents },
      occurredAt: now,
    })
    return { ...result(refund), online: isOnline }
  }, { timeout: 30_000 })
  if (!created.online || created.replayed && created.status !== 'pending') return result(created, created.replayed)
  return settleOnlineRefund(context, created.id)
}

// Card refunds go to Stripe right away; the refund settles only on Stripe's answer.
async function settleOnlineRefund(context: Context, refundId: string) {
  const prisma = context.sudo().prisma as any
  const refund = await prisma.patientRefund.findUnique({ where: { id: refundId } })
  if (!refund || refund.status !== 'pending') return result(refund)
  const payment = await prisma.patientPayment.findUnique({ where: { id: refund.paymentId } })
  const provider = payment?.paymentProviderId ? await prisma.paymentProvider.findFirst({ where: { id: payment.paymentProviderId, facilityId: payment.facilityId, isInstalled: true } }) : null
  if (!payment?.providerPaymentId || !provider) throw new HospitalRefusal('Online payment provider is no longer active')
  const status = await getPaymentStatus({ provider, paymentId: payment.providerPaymentId })
  const intentId = status.paymentIntentId || (String(status.id).startsWith('pi_') ? status.id : null)
  if (!intentId) throw new HospitalRefusal('Card payment has no settled charge to refund')
  const providerRefund = await refundPayment({ provider, paymentId: intentId, amount: refund.amountCents, idempotencyKey: `hospital-refund:${refund.id}` })
  if (!['succeeded', 'pending'].includes(providerRefund.status) || providerRefund.amount !== refund.amountCents) throw new HospitalRefusal('Card refund was not accepted; reconcile before retrying')
  return context.transaction(async (tx: any) => {
    const db = tx.sudo().prisma
    await db.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`payment-refund:${payment.id}`}, 0))::text AS "lock"`)
    const current = await db.patientRefund.findUnique({ where: { id: refund.id } })
    if (!current || current.status !== 'pending') return result(current)
    const now = new Date()
    const updated = await db.patientRefund.update({ where: { id: current.id }, data: { status: 'succeeded', transitionVersion: { increment: 1 }, completedAt: now, externalReference: providerRefund.id } })
    await applyRefundToPayment(db, payment.id, current.amountCents)
    await appendAudit(db, {
      eventType: 'refund.succeeded', aggregateType: 'refund', aggregateId: updated.id,
      facilityId: updated.facilityId, patientId: updated.patientId, actorReference: context.session!.itemId,
      metadata: { source: 'card_refund', aggregateId: updated.id, paymentId: payment.id, providerRefundId: providerRefund.id, status: 'succeeded', transitionVersion: updated.transitionVersion, amountCents: updated.amountCents },
      occurredAt: now,
    })
    return result(updated)
  }, { timeout: 30_000 })
}

// Billing staff turn on online card payments for one of their facilities.
export async function enableFacilityCardPayments(_root: unknown, { facilityId }: { facilityId: string }, context: Context) {
  requireBilling(context)
  const facility = await context.query.Facility.findOne({ where: { id: facilityId }, query: 'id status' }) as any
  if (!facility || facility.status !== 'active') throw new HospitalRefusal('Facility not found or not accessible')
  if (!isPaymentProviderConfigured('pp_stripe_hospital')) throw new HospitalRefusal('Card payments are not configured for this workspace')
  const prisma = context.sudo().prisma as any
  const functions = { createPaymentFunction: 'stripe', capturePaymentFunction: 'stripe', refundPaymentFunction: 'stripe', getPaymentStatusFunction: 'stripe', generatePaymentLinkFunction: 'stripe', handleWebhookFunction: 'stripe' }
  const row = await prisma.paymentProvider.upsert({
    where: { facilityId_code: { facilityId, code: 'pp_stripe_hospital' } },
    create: { name: 'Card payments (Stripe)', code: 'pp_stripe_hospital', isInstalled: true, facilityId, ...functions },
    update: { isInstalled: true, ...functions },
  })
  return { id: row.id, isInstalled: row.isInstalled }
}


// Adds a completed refund to its payment; a payment refunded in full becomes 'refunded' instead of staying 'succeeded'.
export async function applyRefundToPayment(db: any, paymentId: string, amountCents: number) {
  const payment = await db.patientPayment.update({ where: { id: paymentId }, data: { refundedAmountCents: { increment: amountCents } } })
  if (payment.status === 'succeeded' && payment.refundedAmountCents >= payment.amountCents) {
    await db.patientPayment.update({ where: { id: paymentId }, data: { status: 'refunded', transitionVersion: { increment: 1 } } })
  }
}
