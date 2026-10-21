import { currentHospitalActor, lockCurrentHospitalFacility } from '../../security/currentHospitalActor'
import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import type { Context } from '.keystone/types'

import { lockTransitionOperation, recordTransition, replayTransition, transitionEvidence } from '../transitionEvidence'
import { appendAuditAndOutbox, bounded, lockOperation, operationEvidence } from './evidence'

function requireRetention(context: Context) {
  const role = context.session?.data.role
  if (!role?.canManageRetention) throw new Error('Not authorized to manage retention records')
}

async function scopedFacility(context: Context, facilityId: string) {
  requireRetention(context)
  const facility = await context.query.Facility.findOne({ where: { id: facilityId }, query: 'id status' }) as any
  if (!facility || facility.status !== 'active') throw new Error('Facility not found or not accessible')
}

function result(row: any, replayed = false) {
  return { id: row.id, status: row.status, transitionVersion: row.transitionVersion, replayed }
}

const TARGETS: Record<string, { list: string; query: string }> = {
  patient: { list: 'Patient', query: 'id createdAt facilities { id }' },
  appointment: { list: 'Appointment', query: 'id createdAt facility { id } patient { id }' },
  encounter: { list: 'Encounter', query: 'id createdAt facility { id } patient { id }' },
  clinical_document: { list: 'ClinicalDocument', query: 'id createdAt facility { id } patient { id }' },
  claim: { list: 'InsuranceClaim', query: 'id createdAt facility { id } patient { id }' },
  export_job: { list: 'ExportJob', query: 'id createdAt facility { id }' },
}

async function scopedTarget(context: Context, facilityId: string, aggregateType: string, aggregateId: string) {
  const target = TARGETS[aggregateType]
  if (!target) throw new Error('Retention aggregate type is not supported')
  const row = await (context.query as any)[target.list].findOne({ where: { id: aggregateId }, query: target.query })
  const inFacility = aggregateType === 'patient'
    ? row?.facilities?.some((facility: { id: string }) => facility.id === facilityId)
    : row?.facility?.id === facilityId
  if (!row || !inFacility) throw new Error('Retention target not found in the accessible facility')
  return { ...row, patientId: row.patient?.id || (aggregateType === 'patient' ? row.id : null) }
}

export async function createRetentionPolicy(_root: unknown, { data }: any, context: Context) {
  await scopedFacility(context, data.facilityId)
  const recordType = bounded(data.recordType, 'Retention record type', 80, true)
  const retentionDays = Number(data.retentionDays)
  if (!Number.isSafeInteger(retentionDays) || retentionDays < 1 || retentionDays > 36_500) throw new Error('Retention days must be between 1 and 36500')
  const evidence = operationEvidence({ ...data, recordType, retentionDays })
  return context.transaction(async (transactionContext: any) => {
    const currentContext = await currentHospitalActor(transactionContext, ['canManageRetention'])
    await lockCurrentHospitalFacility(currentContext, data.facilityId)
    const prisma = currentContext.sudo().prisma
    await lockOperation(prisma, 'retention-policy-create', evidence.operationKeyHash)
    const existing = await prisma.retentionPolicy.findUnique({ where: { operationKeyHash: evidence.operationKeyHash } })
    if (existing) {
      if (existing.requestHash !== evidence.requestHash) throw new Error('Operation key was reused with a different payload')
      return result(existing, true)
    }
    if (await prisma.retentionPolicy.findFirst({ where: { facilityId: data.facilityId, recordType } })) throw new Error('Retention policy already exists for this facility record type')
    const now = new Date()
    const policy = await prisma.retentionPolicy.create({ data: {
      recordType, retentionDays, status: 'active', transitionVersion: 1, ...evidence,
      actorReference: context.session!.itemId, facilityId: data.facilityId,
    } })
    await appendAuditAndOutbox(prisma, {
      eventKey: `retention_policy:${policy.id}:v1:active`, eventType: 'retention_policy.created',
      aggregateType: 'retention_policy', aggregateId: policy.id, facilityId: policy.facilityId,
      actorReference: context.session!.itemId,
      metadata: { source: 'retention_workflow', aggregateId: policy.id, recordType, retentionDays, status: 'active', transitionVersion: 1 },
      occurredAt: now,
    })
    return result(policy)
  }, { timeout: 30_000 })
}

export async function transitionRetentionPolicy(_root: unknown, args: any, context: Context) {
  requireRetention(context)
  const scoped = await context.query.RetentionPolicy.findOne({ where: { id: args.policyId }, query: 'id facility { id }' })
  if (!scoped?.facility?.id) throw new Error('Retention policy not found or not accessible')
  if (!Number.isInteger(args.expectedVersion) || args.expectedVersion < 1) throw new Error('Expected policy version is invalid')
  if (!['active', 'inactive'].includes(args.toStatus)) throw new Error('Retention policy status is invalid')
  const evidence = transitionEvidence(args.operationKey, { policyId: args.policyId, expectedVersion: args.expectedVersion, toStatus: args.toStatus })
  return context.transaction(async (transactionContext: any) => {
    const currentContext = await currentHospitalActor(transactionContext, ['canManageRetention'])
    await lockCurrentHospitalFacility(currentContext, scoped.facility.id)
    const prisma = currentContext.sudo().prisma
    await lockTransitionOperation(prisma, evidence.operationKeyHash)
    await prisma.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`retention-policy:${args.policyId}`}, 0))::text AS "lock"`)
    const replay = await replayTransition(prisma, evidence, 'retention_policy', args.policyId)
    if (replay) return replay
    const current = await prisma.retentionPolicy.findUnique({ where: { id: args.policyId } })
    if (!current || current.transitionVersion !== args.expectedVersion || current.status === args.toStatus) throw new Error('Retention policy changed; refresh before retrying')
    const now = new Date()
    const updated = await prisma.retentionPolicy.update({ where: { id: current.id }, data: { status: args.toStatus, transitionVersion: { increment: 1 }, actorReference: context.session!.itemId } })
    const events = await appendAuditAndOutbox(prisma, {
      eventKey: `retention_policy:${updated.id}:v${updated.transitionVersion}:${updated.status}`,
      eventType: `retention_policy.${updated.status}`, aggregateType: 'retention_policy', aggregateId: updated.id,
      facilityId: updated.facilityId, actorReference: context.session!.itemId,
      metadata: { source: 'retention_workflow', aggregateId: updated.id, recordType: updated.recordType, fromStatus: current.status, status: updated.status, transitionVersion: updated.transitionVersion }, occurredAt: now,
    })
    const projected = result(updated)
    await recordTransition(prisma, {
      evidence, aggregateType: 'retention_policy', aggregateId: updated.id, fromStatus: current.status, toStatus: updated.status,
      fromVersion: current.transitionVersion, toVersion: updated.transitionVersion, actorReference: context.session!.itemId,
      facilityId: updated.facilityId, auditLogId: events.audit.id, outboxEventId: events.outbox.id, result: projected, occurredAt: now,
    })
    return projected
  }, { timeout: 30_000 })
}

export async function placeRecordHold(_root: unknown, { data }: any, context: Context) {
  await scopedFacility(context, data.facilityId)
  const aggregateType = bounded(data.aggregateType, 'Hold aggregate type', 80, true)
  const aggregateId = bounded(data.aggregateId, 'Hold aggregate ID', 200, true)
  const reasonCode = bounded(data.reasonCode, 'Hold reason', 80, true)
  const notes = bounded(data.notes, 'Hold notes', 2000)
  const evidence = operationEvidence({ ...data, aggregateType, aggregateId, reasonCode, notes })
  return context.transaction(async (transactionContext: any) => {
    const currentContext = await currentHospitalActor(transactionContext, ['canManageRetention'])
    await lockCurrentHospitalFacility(currentContext, data.facilityId)
    const prisma = currentContext.sudo().prisma
    await lockOperation(prisma, 'record-hold-create', evidence.operationKeyHash)
    const existing = await prisma.recordHold.findUnique({ where: { operationKeyHash: evidence.operationKeyHash } })
    if (existing) {
      if (existing.requestHash !== evidence.requestHash) throw new Error('Operation key was reused with a different payload')
      return result(existing, true)
    }
    await prisma.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`retention-target:${data.facilityId}:${aggregateType}:${aggregateId}`}, 0))::text AS "lock"`)
    const target = await scopedTarget(currentContext, data.facilityId, aggregateType, aggregateId)
    if (await prisma.recordHold.findFirst({ where: { facilityId: data.facilityId, aggregateType, aggregateId, status: 'active' } })) throw new Error('An active hold already exists for this record')
    const now = new Date()
    const hold = await prisma.recordHold.create({ data: {
      holdNumber: `HOLD-${randomUUID()}`, aggregateType, aggregateId, status: 'active', transitionVersion: 1,
      ...evidence, facilityId: data.facilityId, patientId: target.patientId, reasonCode, notes,
      actorReference: context.session!.itemId, placedAt: now,
    } })
    await appendAuditAndOutbox(prisma, {
      eventKey: `record_hold:${hold.id}:v1:active`, eventType: 'record_hold.placed',
      aggregateType: 'record_hold', aggregateId: hold.id, facilityId: hold.facilityId, patientId: hold.patientId,
      actorReference: context.session!.itemId,
      metadata: { source: 'retention_workflow', aggregateId: hold.id, heldAggregateType: aggregateType, heldAggregateId: aggregateId, reasonCode, status: 'active', transitionVersion: 1 }, occurredAt: now,
    })
    return result(hold)
  }, { timeout: 30_000 })
}

export async function releaseRecordHold(_root: unknown, args: any, context: Context) {
  requireRetention(context)
  const scoped = await context.query.RecordHold.findOne({ where: { id: args.holdId }, query: 'id facility { id }' })
  if (!scoped?.facility?.id) throw new Error('Record hold not found or not accessible')
  if (!Number.isInteger(args.expectedVersion) || args.expectedVersion < 1) throw new Error('Expected hold version is invalid')
  const reasonCode = bounded(args.reasonCode, 'Hold release reason', 80, true)
  const evidence = transitionEvidence(args.operationKey, { holdId: args.holdId, expectedVersion: args.expectedVersion, reasonCode })
  return context.transaction(async (transactionContext: any) => {
    const currentContext = await currentHospitalActor(transactionContext, ['canManageRetention'])
    await lockCurrentHospitalFacility(currentContext, scoped.facility.id)
    const prisma = currentContext.sudo().prisma
    await lockTransitionOperation(prisma, evidence.operationKeyHash)
    await prisma.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`record-hold:${args.holdId}`}, 0))::text AS "lock"`)
    const replay = await replayTransition(prisma, evidence, 'record_hold', args.holdId)
    if (replay) return replay
    const current = await prisma.recordHold.findUnique({ where: { id: args.holdId } })
    if (!current || current.status !== 'active' || current.transitionVersion !== args.expectedVersion) throw new Error('Record hold changed or is no longer active')
    await prisma.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`retention-target:${current.facilityId}:${current.aggregateType}:${current.aggregateId}`}, 0))::text AS "lock"`)
    const refreshed = await prisma.recordHold.findUnique({ where: { id: current.id } })
    if (!refreshed || refreshed.status !== 'active' || refreshed.transitionVersion !== args.expectedVersion) throw new Error('Record hold changed or is no longer active')
    const now = new Date()
    const updated = await prisma.recordHold.update({ where: { id: current.id }, data: { status: 'released', transitionVersion: { increment: 1 }, reasonCode, actorReference: context.session!.itemId, releasedAt: now } })
    const events = await appendAuditAndOutbox(prisma, {
      eventKey: `record_hold:${updated.id}:v${updated.transitionVersion}:released`, eventType: 'record_hold.released',
      aggregateType: 'record_hold', aggregateId: updated.id, facilityId: updated.facilityId, patientId: updated.patientId,
      actorReference: context.session!.itemId,
      metadata: { source: 'retention_workflow', aggregateId: updated.id, heldAggregateType: updated.aggregateType, heldAggregateId: updated.aggregateId, status: 'released', transitionVersion: updated.transitionVersion, reasonCode }, occurredAt: now,
    })
    const projected = result(updated)
    await recordTransition(prisma, {
      evidence, aggregateType: 'record_hold', aggregateId: updated.id, fromStatus: current.status, toStatus: updated.status,
      fromVersion: current.transitionVersion, toVersion: updated.transitionVersion, actorReference: context.session!.itemId,
      facilityId: updated.facilityId, patientId: updated.patientId, auditLogId: events.audit.id, outboxEventId: events.outbox.id, result: projected, occurredAt: now,
    })
    return projected
  }, { timeout: 30_000 })
}

export async function recordRetentionDisposition(_root: unknown, { data }: any, context: Context) {
  await scopedFacility(context, data.facilityId)
  const aggregateType = bounded(data.aggregateType, 'Disposition aggregate type', 80, true)
  const aggregateId = bounded(data.aggregateId, 'Disposition aggregate ID', 200, true)
  const reasonCode = bounded(data.reasonCode, 'Disposition reason', 80, true)
  const requestedDecision = bounded(data.decision, 'Disposition decision', 40, true)
  if (!['retain', 'review'].includes(requestedDecision)) throw new Error('Physical record disposal is not supported by this workflow')
  const evidence = operationEvidence({ ...data, aggregateType, aggregateId, reasonCode, requestedDecision })
  return context.transaction(async (transactionContext: any) => {
    const currentContext = await currentHospitalActor(transactionContext, ['canManageRetention'])
    await lockCurrentHospitalFacility(currentContext, data.facilityId)
    const prisma = currentContext.sudo().prisma
    await lockOperation(prisma, 'retention-disposition-create', evidence.operationKeyHash)
    const existing = await prisma.retentionDisposition.findUnique({ where: { operationKeyHash: evidence.operationKeyHash } })
    if (existing) {
      if (existing.requestHash !== evidence.requestHash) throw new Error('Operation key was reused with a different payload')
      if (existing.actorReference !== currentContext.session!.itemId || existing.facilityId !== data.facilityId) throw new Error('Original disposition owner could not be verified')
      await scopedTarget(currentContext, data.facilityId, aggregateType, aggregateId)
      return { id: existing.id, decision: existing.decision, replayed: true }
    }
    await prisma.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`retention-target:${data.facilityId}:${aggregateType}:${aggregateId}`}, 0))::text AS "lock"`)
    await prisma.$queryRaw(Prisma.sql`SELECT "id" FROM "RetentionPolicy" WHERE "id" = ${data.policyId} FOR SHARE`)
    const policy = await currentContext.query.RetentionPolicy.findOne({ where: { id: data.policyId }, query: 'id status recordType retentionDays transitionVersion facility { id }' }) as any
    if (!policy || policy.status !== 'active' || policy.facility?.id !== data.facilityId || policy.recordType !== aggregateType) throw new Error('Active retention policy does not match the record')
    const table = TARGETS[aggregateType]?.list
    if (!table) throw new Error('Retention aggregate type is not supported')
    await prisma.$queryRaw(Prisma.sql`SELECT "id" FROM ${Prisma.raw(`"${table}"`)} WHERE "id" = ${aggregateId} FOR SHARE`)
    const target = await scopedTarget(currentContext, data.facilityId, aggregateType, aggregateId)
    const calculatedAt = new Date()
    const cutoffAt = new Date(calculatedAt.getTime() - policy.retentionDays * 24 * 60 * 60_000)
    const activeHold = await prisma.recordHold.findFirst({ where: { facilityId: data.facilityId, aggregateType, aggregateId, status: 'active' } })
    const targetCreatedAt = new Date(target.createdAt)
    const decision = activeHold ? 'blocked_by_hold' : targetCreatedAt > cutoffAt || requestedDecision === 'retain' ? 'retained' : 'eligible_for_review'
    const now = new Date()
    const disposition = await prisma.retentionDisposition.create({ data: {
      dispositionNumber: `DISP-${randomUUID()}`, ...evidence,
      facilityId: data.facilityId, patientId: target.patientId, policyId: policy.id,
      recordType: policy.recordType, aggregateType, aggregateId, decision, reasonCode,
      actorReference: context.session!.itemId, cutoffAt, reviewedAt: now,
    } })
    await appendAuditAndOutbox(prisma, {
      eventKey: `retention_disposition:${disposition.id}:${decision}`, eventType: 'retention.disposition_reviewed',
      aggregateType: 'retention_disposition', aggregateId: disposition.id, facilityId: disposition.facilityId,
      patientId: disposition.patientId, actorReference: context.session!.itemId,
      metadata: { source: 'retention_workflow', aggregateId: disposition.id, reviewedAggregateType: aggregateType, reviewedAggregateId: aggregateId, decision, reasonCode, policyId: policy.id, policyRevision: policy.transitionVersion, retentionDays: policy.retentionDays, calculatedAt: calculatedAt.toISOString(), cutoffAt: cutoffAt.toISOString(), physicalDeletion: false }, occurredAt: now,
    })
    return { id: disposition.id, decision, replayed: false }
  }, { timeout: 30_000 })
}
