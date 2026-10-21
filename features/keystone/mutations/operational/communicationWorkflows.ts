import { narrativeText } from '../../../lib/narrativeText'
import { Prisma } from '@prisma/client'
import type { Context } from '.keystone/types'

import { lockTransitionOperation, recordTransition, replayTransition, transitionEvidence } from '../transitionEvidence'
import { appendAuditAndOutbox, bounded, lockOperation, operationEvidence, scopedFacilityPatient } from './evidence'

function requireCommunications(context: Context) {
  const role = context.session?.data.role
  if (!role?.canManageCommunications) throw new Error('Not authorized to manage communications')
}

async function scopedFacility(context: Context, facilityId: string) {
  requireCommunications(context)
  const facility = await context.query.Facility.findOne({ where: { id: facilityId }, query: 'id status' }) as any
  if (!facility || facility.status !== 'active') throw new Error('Facility not found or not accessible')
}

function result(row: any, replayed = false) {
  return { id: row.id, status: row.status, transitionVersion: row.transitionVersion, replayed }
}

export async function createCommunicationTemplate(_root: unknown, { data }: any, context: Context) {
  await scopedFacility(context, data.facilityId)
  const templateKey = bounded(data.templateKey, 'Template key', 100, true).toLowerCase()
  const name = bounded(data.name, 'Template name', 200, true)
  const channel = bounded(data.channel, 'Template channel', 20, true)
  if (!['sms', 'email'].includes(channel)) throw new Error('Template channel must be sms or email')
  const subjectTemplate = bounded(data.subjectTemplate, 'Subject template', 300)
  const bodyTemplate = narrativeText(data.bodyTemplate, 'Body template', 4000, true)
  const evidence = operationEvidence({ ...data, templateKey, name, channel, subjectTemplate, bodyTemplate })
  return context.transaction(async (transactionContext: any) => {
    const prisma = transactionContext.sudo().prisma
    await lockOperation(prisma, 'communication-template-create', evidence.operationKeyHash)
    const existing = await prisma.communicationTemplate.findUnique({ where: { operationKeyHash: evidence.operationKeyHash } })
    if (existing) {
      if (existing.requestHash !== evidence.requestHash) throw new Error('Operation key was reused with a different payload')
      return result(existing, true)
    }
    if (await prisma.communicationTemplate.findFirst({ where: { facilityId: data.facilityId, templateKey } })) throw new Error('Template key already exists in the facility')
    const now = new Date()
    const template = await prisma.communicationTemplate.create({ data: {
      templateKey, name, channel, status: 'active', version: 1, transitionVersion: 1,
      ...evidence, actorReference: context.session!.itemId, facilityId: data.facilityId,
      subjectTemplate, bodyTemplate,
    } })
    await appendAuditAndOutbox(prisma, {
      eventKey: `communication_template:${template.id}:v1:active`, eventType: 'communication_template.created',
      aggregateType: 'communication_template', aggregateId: template.id, facilityId: template.facilityId,
      actorReference: context.session!.itemId,
      metadata: { source: 'communication_workflow', aggregateId: template.id, channel, status: template.status, templateVersion: 1, transitionVersion: 1 },
      occurredAt: now,
    })
    return result(template)
  }, { timeout: 30_000 })
}

export async function reviseCommunicationTemplate(_root: unknown, args: any, context: Context) {
  requireCommunications(context)
  const scoped = await context.query.CommunicationTemplate.findOne({ where: { id: args.templateId }, query: 'id' })
  if (!scoped) throw new Error('Communication template not found or not accessible')
  if (!Number.isInteger(args.expectedVersion) || args.expectedVersion < 1) throw new Error('Expected template version is invalid')
  const name = bounded(args.name, 'Template name', 200, true)
  const subjectTemplate = bounded(args.subjectTemplate, 'Subject template', 300)
  const bodyTemplate = narrativeText(args.bodyTemplate, 'Body template', 4000, true)
  const toStatus = bounded(args.toStatus, 'Template status', 20, true)
  if (!['active', 'inactive'].includes(toStatus)) throw new Error('Template status is invalid')
  const evidence = transitionEvidence(args.operationKey, { templateId: args.templateId, expectedVersion: args.expectedVersion, name, subjectTemplate, bodyTemplate, toStatus })
  return context.transaction(async (transactionContext: any) => {
    const prisma = transactionContext.sudo().prisma
    await lockTransitionOperation(prisma, evidence.operationKeyHash)
    await prisma.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`communication-template:${args.templateId}`}, 0))::text AS "lock"`)
    const replay = await replayTransition(prisma, evidence, 'communication_template', args.templateId)
    if (replay) return replay
    const current = await prisma.communicationTemplate.findUnique({ where: { id: args.templateId } })
    if (!current || current.transitionVersion !== args.expectedVersion) throw new Error('Communication template changed; refresh before retrying')
    const now = new Date()
    const updated = await prisma.communicationTemplate.update({ where: { id: current.id }, data: {
      name, subjectTemplate, bodyTemplate, status: toStatus, version: { increment: 1 },
      transitionVersion: { increment: 1 }, actorReference: context.session!.itemId,
    } })
    const events = await appendAuditAndOutbox(prisma, {
      eventKey: `communication_template:${updated.id}:v${updated.transitionVersion}:${updated.status}`,
      eventType: 'communication_template.revised', aggregateType: 'communication_template', aggregateId: updated.id,
      facilityId: updated.facilityId, actorReference: context.session!.itemId,
      metadata: { source: 'communication_workflow', aggregateId: updated.id, fromStatus: current.status, status: updated.status, templateVersion: updated.version, transitionVersion: updated.transitionVersion },
      occurredAt: now,
    })
    const projected = result(updated)
    await recordTransition(prisma, {
      evidence, aggregateType: 'communication_template', aggregateId: updated.id, fromStatus: current.status, toStatus: updated.status,
      fromVersion: current.transitionVersion, toVersion: updated.transitionVersion, actorReference: context.session!.itemId,
      facilityId: updated.facilityId, auditLogId: events.audit.id, outboxEventId: events.outbox.id, result: projected, occurredAt: now,
    })
    return projected
  }, { timeout: 30_000 })
}

export async function setCommunicationPreference(_root: unknown, { data }: any, context: Context) {
  requireCommunications(context)
  await scopedFacilityPatient(context, data.facilityId, data.patientId)
  const channel = bounded(data.channel, 'Preference channel', 20, true)
  const purpose = bounded(data.purpose, 'Preference purpose', 40, true)
  const status = bounded(data.status, 'Preference status', 20, true)
  const reasonCode = bounded(data.reasonCode, 'Preference reason', 80, true)
  if (!['sms', 'email'].includes(channel) || !['care_operations', 'billing', 'general'].includes(purpose) || !['allowed', 'opted_out'].includes(status)) {
    throw new Error('Communication preference is invalid')
  }
  const expectedVersion = data.expectedVersion == null ? null : Number(data.expectedVersion)
  if (expectedVersion !== null && (!Number.isInteger(expectedVersion) || expectedVersion < 1)) throw new Error('Expected preference version is invalid')
  const payload = { facilityId: data.facilityId, patientId: data.patientId, channel, purpose, status, reasonCode, expectedVersion }
  const creation = operationEvidence({ operationKey: data.operationKey, ...payload })
  const transition = transitionEvidence(data.operationKey, payload)

  return context.transaction(async (transactionContext: any) => {
    const prisma = transactionContext.sudo().prisma
    await lockTransitionOperation(prisma, transition.operationKeyHash)
    await prisma.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`communication-preference:${data.facilityId}:${data.patientId}:${channel}:${purpose}`}, 0))::text AS "lock"`)
    const current = await prisma.communicationPreference.findFirst({ where: { facilityId: data.facilityId, patientId: data.patientId, channel, purpose } })
    if (!current) {
      if (expectedVersion !== null) throw new Error('Communication preference does not exist; refresh before retrying')
      const now = new Date()
      const created = await prisma.communicationPreference.create({ data: {
        channel, purpose, status, transitionVersion: 1, ...creation,
        facilityId: data.facilityId, patientId: data.patientId, actorReference: context.session!.itemId,
        reasonCode, changedAt: now,
      } })
      await appendAuditAndOutbox(prisma, {
        eventKey: `communication_preference:${created.id}:v1:${created.status}`, eventType: 'communication_preference.recorded',
        aggregateType: 'communication_preference', aggregateId: created.id, facilityId: created.facilityId,
        patientId: created.patientId, actorReference: context.session!.itemId,
        metadata: { source: 'communication_workflow', aggregateId: created.id, channel, purpose, status, transitionVersion: 1, reasonCode },
        occurredAt: now,
      })
      return result(created)
    }
    if (current.operationKeyHash === creation.operationKeyHash) {
      if (current.requestHash !== creation.requestHash) throw new Error('Operation key was reused with a different payload')
      return result(current, true)
    }
    const replay = await replayTransition(prisma, transition, 'communication_preference', current.id)
    if (replay) return replay
    if (expectedVersion === null || current.transitionVersion !== expectedVersion) throw new Error('Communication preference changed; refresh before retrying')
    if (current.status === status) throw new Error('Communication preference is already in that state')
    const now = new Date()
    const updated = await prisma.communicationPreference.update({ where: { id: current.id }, data: {
      status, transitionVersion: { increment: 1 }, actorReference: context.session!.itemId, reasonCode, changedAt: now,
    } })
    const events = await appendAuditAndOutbox(prisma, {
      eventKey: `communication_preference:${updated.id}:v${updated.transitionVersion}:${updated.status}`,
      eventType: `communication_preference.${updated.status}`, aggregateType: 'communication_preference', aggregateId: updated.id,
      facilityId: updated.facilityId, patientId: updated.patientId, actorReference: context.session!.itemId,
      metadata: { source: 'communication_workflow', aggregateId: updated.id, channel, purpose, fromStatus: current.status, status, transitionVersion: updated.transitionVersion, reasonCode },
      occurredAt: now,
    })
    const projected = result(updated)
    await recordTransition(prisma, {
      evidence: transition, aggregateType: 'communication_preference', aggregateId: updated.id,
      fromStatus: current.status, toStatus: updated.status, fromVersion: current.transitionVersion, toVersion: updated.transitionVersion,
      actorReference: context.session!.itemId, facilityId: updated.facilityId, patientId: updated.patientId,
      auditLogId: events.audit.id, outboxEventId: events.outbox.id, result: projected, occurredAt: now,
    })
    return projected
  }, { timeout: 30_000 })
}
