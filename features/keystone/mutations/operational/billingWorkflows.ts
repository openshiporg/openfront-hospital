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
  appendAuditAndOutbox,
  bounded,
  lockOperation,
  operationEvidence,
  requireSafeCents,
  scopedFacilityPatient,
} from './evidence'

function requireBilling(context: Context) {
  const role = context.session?.data.role
  if (!role?.canManageBilling) {
    throw new Error('Not authorized to manage billing operations')
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
    throw new Error(`Active ${kind} integration not found in the facility`)
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
      if (existing.requestHash !== evidence.requestHash) throw new Error('Operation key was reused with a different payload')
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
    await appendAuditAndOutbox(prisma, {
      eventKey: `coverage:${coverage.id}:v1:recorded`, eventType: 'coverage.recorded',
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
  if (!Number.isInteger(args.expectedVersion) || args.expectedVersion < 1) throw new Error('Expected coverage version is invalid')
  const scoped = await context.query.PatientCoverage.findOne({ where: { id: args.coverageId }, query: 'id' })
  if (!scoped) throw new Error('Coverage not found or not accessible')
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
    if (!current || current.transitionVersion !== args.expectedVersion) throw new Error('Coverage changed; refresh before retrying')
    if (!allowed[current.status]?.includes(args.toStatus)) throw new Error(`Invalid coverage transition from ${current.status} to ${args.toStatus}`)
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
    const events = await appendAuditAndOutbox(prisma, {
      eventKey: `coverage:${updated.id}:v${updated.transitionVersion}:${updated.status}`,
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
      outboxEventId: events.outbox.id, result: projected, occurredAt: now,
    })
    return projected
  }, { timeout: 30_000 })
}

export async function recordPatientPayment(_root: unknown, { data }: any, context: Context) {
  requireBilling(context)
  await scopedFacilityPatient(context, data.facilityId, data.patientId)
  const amountCents = requireSafeCents(data.amountCents, 'Payment amount')
  const method = bounded(data.method, 'Payment method', 40, true)
  if (!['cash', 'check', 'card_external', 'bank_external'].includes(method)) throw new Error('Payment method is invalid')
  const isExternal = method.endsWith('_external')
  const installation = await scopedInstallation(context, data.installationId, data.facilityId, 'payment')
  if (isExternal && !installation) throw new Error('External payments require an active payment integration')
  if (!isExternal && installation) throw new Error('Manual payments cannot use an external integration')
  if (data.claimId) {
    const claim = await context.query.InsuranceClaim.findOne({ where: { id: data.claimId }, query: 'id facility { id } patient { id }' }) as any
    if (!claim || claim.facility?.id !== data.facilityId || claim.patient?.id !== data.patientId) throw new Error('Claim does not match the payment scope')
  }
  const input = { ...data, amountCents, method, currency: bounded(data.currency || 'USD', 'Currency', 3, true).toUpperCase() }
  if (!/^[A-Z]{3}$/.test(input.currency)) throw new Error('Currency is invalid')
  const evidence = operationEvidence(input)
  return context.transaction(async (transactionContext: any) => {
    const prisma = transactionContext.sudo().prisma
    await lockOperation(prisma, 'payment-create', evidence.operationKeyHash)
    const existing = await prisma.patientPayment.findUnique({ where: { operationKeyHash: evidence.operationKeyHash } })
    if (existing) {
      if (existing.requestHash !== evidence.requestHash) throw new Error('Operation key was reused with a different payload')
      return result(existing, true)
    }
    const now = new Date()
    const payment = await prisma.patientPayment.create({
      data: {
        paymentNumber: `PAY-${randomUUID()}`,
        status: isExternal ? 'pending' : 'succeeded', transitionVersion: 1, ...evidence,
        actorReference: context.session!.itemId, facilityId: data.facilityId, patientId: data.patientId,
        claimId: data.claimId || null, installationId: installation?.id || null,
        amountCents, refundedAmountCents: 0, currency: input.currency, method,
        externalReference: bounded(data.externalReference, 'External reference', 300),
        receivedAt: isExternal ? null : now,
      },
    })
    await appendAuditAndOutbox(prisma, {
      eventKey: `payment:${payment.id}:v1:${payment.status}`,
      eventType: `payment.${payment.status}`, aggregateType: 'payment', aggregateId: payment.id,
      facilityId: payment.facilityId, patientId: payment.patientId, actorReference: context.session!.itemId,
      deliveryMode: isExternal ? 'external' : 'internal', installationId: installation?.id,
      installationVersion: installation?.transitionVersion,
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
  if (!Number.isInteger(options.expectedVersion) || options.expectedVersion < 1) throw new Error('Expected billing version is invalid')
  if (!['succeeded', 'failed', 'cancelled'].includes(options.toStatus)) throw new Error('Billing transition status is invalid')
  // Manual cash/check records complete at creation. Every pending record is
  // externally authoritative, so only the signed integration webhook may
  // assert success. Staff may still fail/cancel a pending request.
  if (options.toStatus === 'succeeded') throw new Error('External billing success requires a verified integration event')
  const scoped = await (context.query as any)[options.model].findOne({ where: { id: options.id }, query: 'id' })
  if (!scoped) throw new Error('Billing record not found or not accessible')
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
    if (!current || current.status !== 'pending' || current.transitionVersion !== options.expectedVersion) throw new Error('Billing record changed or is no longer pending')
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
      await prisma.patientPayment.update({ where: { id: current.paymentId }, data: { refundedAmountCents: { increment: current.amountCents } } })
    }
    const events = await appendAuditAndOutbox(prisma, {
      eventKey: `${options.aggregateType}:${updated.id}:v${updated.transitionVersion}:${updated.status}`,
      eventType: `${options.aggregateType}.${updated.status}`, aggregateType: options.aggregateType, aggregateId: updated.id,
      facilityId: updated.facilityId, patientId: updated.patientId, actorReference: context.session!.itemId,
      metadata: { source: 'billing_workflow', aggregateId: updated.id, fromStatus: current.status, status: updated.status, transitionVersion: updated.transitionVersion, reasonCode },
      occurredAt: now,
    })
    const projected = result(updated)
    await recordTransition(prisma, {
      evidence, aggregateType: options.aggregateType, aggregateId: updated.id, fromStatus: current.status, toStatus: updated.status,
      fromVersion: current.transitionVersion, toVersion: updated.transitionVersion, actorReference: context.session!.itemId,
      facilityId: updated.facilityId, patientId: updated.patientId, auditLogId: events.audit.id, outboxEventId: events.outbox.id,
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
  if (!scoped) throw new Error('Payment not found or not accessible')
  const evidence = operationEvidence({ ...data, amountCents, reasonCode })
  return context.transaction(async (transactionContext: any) => {
    const prisma = transactionContext.sudo().prisma
    await lockOperation(prisma, 'refund-create', evidence.operationKeyHash)
    const existing = await prisma.patientRefund.findUnique({ where: { operationKeyHash: evidence.operationKeyHash } })
    if (existing) {
      if (existing.requestHash !== evidence.requestHash) throw new Error('Operation key was reused with a different payload')
      return result(existing, true)
    }
    await prisma.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`payment-refund:${data.paymentId}`}, 0))::text AS "lock"`)
    const payment = await prisma.patientPayment.findUnique({ where: { id: data.paymentId } })
    if (!payment || payment.status !== 'succeeded') throw new Error('Only a succeeded payment can be refunded')
    const reserved = await prisma.patientRefund.aggregate({
      where: { paymentId: payment.id, status: { in: ['pending', 'succeeded'] } },
      _sum: { amountCents: true },
    })
    if (Number(reserved._sum.amountCents || 0) + amountCents > payment.amountCents) throw new Error('Refund would exceed the captured payment amount')
    const isExternal = ['card_external', 'bank_external'].includes(payment.method)
    if (isExternal && !payment.installationId) throw new Error('External payment is missing its payment integration')
    const paymentInstallation = isExternal ? await prisma.integrationInstallation.findUnique({ where: { id: payment.installationId } }) : null
    if (isExternal && (!paymentInstallation || paymentInstallation.status !== 'active' || paymentInstallation.facilityId !== payment.facilityId)) {
      throw new Error('External payment integration is no longer active')
    }
    const now = new Date()
    const refund = await prisma.patientRefund.create({
      data: {
        refundNumber: `REF-${randomUUID()}`,
        status: isExternal ? 'pending' : 'succeeded', transitionVersion: 1, ...evidence,
        actorReference: context.session!.itemId, facilityId: payment.facilityId, patientId: payment.patientId,
        paymentId: payment.id, installationId: payment.installationId, amountCents, reasonCode,
        completedAt: isExternal ? null : now,
      },
    })
    if (!isExternal) {
      await prisma.patientPayment.update({ where: { id: payment.id }, data: { refundedAmountCents: { increment: amountCents } } })
    }
    await appendAuditAndOutbox(prisma, {
      eventKey: `refund:${refund.id}:v1:${refund.status}`,
      eventType: `refund.${refund.status}`, aggregateType: 'refund', aggregateId: refund.id,
      facilityId: refund.facilityId, patientId: refund.patientId, actorReference: context.session!.itemId,
      deliveryMode: isExternal ? 'external' : 'internal', installationId: payment.installationId,
      installationVersion: paymentInstallation?.transitionVersion,
      metadata: { source: 'refund_workflow', aggregateId: refund.id, paymentId: payment.id, status: refund.status, transitionVersion: 1, amountCents },
      occurredAt: now,
    })
    return result(refund)
  }, { timeout: 30_000 })
}
