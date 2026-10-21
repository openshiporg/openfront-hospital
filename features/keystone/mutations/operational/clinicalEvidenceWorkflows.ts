import { narrativeText } from '../../../lib/narrativeText'
import { createHash, randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import type { Context } from '.keystone/types'
import { lockTransitionOperation, recordTransition, replayTransition, transitionEvidence } from '../transitionEvidence'
import { appendAuditAndOutbox, bounded, lockOperation, operationEvidence, scopedFacilityPatient } from './evidence'
import { currentEpisodeActor, currentEpisodeChild, guardEpisodeChild } from '../clinical/episodeFence'
import { recheckEpisodeRelated } from '../clinical/episodeRelatedScope'

function requireClinical(context: Context) {
  const role = context.session?.data.role
  if (!role?.canManagePatients && !role?.canAccessAllClinicalData) throw new Error('Not authorized to manage clinical evidence')
}

function result(row: any, replayed = false) {
  return { id: row.id, status: row.status, transitionVersion: row.transitionVersion, replayed }
}

async function validateEncounterProvider(context: Context, data: any) {
  await scopedFacilityPatient(context, data.facilityId, data.patientId)
  const [encounter, provider] = await Promise.all([
    context.query.Encounter.findOne({ where: { id: data.encounterId }, query: 'id status facility { id } patient { id }' }),
    data.providerId ? context.query.Provider.findOne({ where: { id: data.providerId }, query: 'id status facilities { id }' }) : null,
  ]) as any[]
  if (!encounter || encounter.facility?.id !== data.facilityId || encounter.patient?.id !== data.patientId) {
    throw new Error('Active encounter does not match the patient and facility')
  }
  if (data.providerId && (provider?.status !== 'active' || !provider.facilities?.some((item: any) => item.id === data.facilityId))) {
    throw new Error('Provider does not match the active facility')
  }
}

export async function createClinicalDocument(_root: unknown, { data }: any, context: Context) {
  requireClinical(context)
  await validateEncounterProvider(context, data)
  const title = bounded(data.title, 'Document title', 300, true)
  const documentType = bounded(data.documentType, 'Document type', 80, true)
  const content = narrativeText(data.content, 'Document content', 50_000, true)
  const evidence = operationEvidence({ ...data, title, documentType, content })
  return context.transaction(async (transactionContext: any) => {
    const fresh = await currentEpisodeActor(transactionContext)
    const prior = await fresh.prisma.clinicalDocument.findUnique({ where: { operationKeyHash: evidence.operationKeyHash }, select: { actorReference: true } })
    if (prior && prior.actorReference !== fresh.session.itemId) throw new Error('Original evidence operation is not owned')
    const guarded = await guardEpisodeChild(fresh, data, 'new_care', false, Boolean(prior))
    await recheckEpisodeRelated(guarded.context, 'ClinicalDocument', data, Boolean(prior))
    const prisma = guarded.context.prisma
    await lockOperation(prisma, 'clinical-document-create', evidence.operationKeyHash)
    const existing = await prisma.clinicalDocument.findUnique({ where: { operationKeyHash: evidence.operationKeyHash } })
    if (existing) {
      if (existing.requestHash !== evidence.requestHash) throw new Error('Operation key was reused with a different payload')
      return result(existing, true)
    }
    const now = new Date()
    const document = await prisma.clinicalDocument.create({
      data: {
        documentNumber: `DOC-${randomUUID()}`, version: 1, status: 'draft', transitionVersion: 1,
        ...evidence, facilityId: data.facilityId, patientId: data.patientId, encounterId: data.encounterId,
        authorId: data.providerId, documentType, title, content,
        contentHash: createHash('sha256').update(content).digest('hex'), actorReference: context.session!.itemId,
      },
    })
    await appendAuditAndOutbox(prisma, {
      eventKey: `clinical_document:${document.id}:v1:created`, eventType: 'clinical_document.created',
      aggregateType: 'clinical_document', aggregateId: document.id, facilityId: document.facilityId,
      patientId: document.patientId, actorReference: context.session!.itemId,
      metadata: { source: 'clinical_document_workflow', aggregateId: document.id, status: document.status, documentVersion: 1, transitionVersion: 1 },
      occurredAt: now,
    })
    return result(document)
  }, { timeout: 30_000 })
}

export async function transitionClinicalDocument(_root: unknown, args: any, context: Context) {
  requireClinical(context)
  if (args.toStatus === 'signed') {
    throw new Error('Clinical document signing is not available in this bounded patient-operations release')
  }
  const scoped = await context.query.ClinicalDocument.findOne({ where: { id: args.documentId }, query: 'id' })
  if (!scoped) throw new Error('Clinical document not found or not accessible')
  if (!Number.isInteger(args.expectedVersion) || args.expectedVersion < 1) throw new Error('Expected document version is invalid')
  const reason = bounded(args.reason, 'Document transition reason', 1000, args.toStatus === 'entered_in_error')
  const evidence = transitionEvidence(args.operationKey, { documentId: args.documentId, toStatus: args.toStatus, expectedVersion: args.expectedVersion, reason })
  const allowed: Record<string, string[]> = { draft: ['signed', 'entered_in_error'], signed: ['entered_in_error'], amended: [], entered_in_error: [] }
  return context.transaction(async (transactionContext: any) => {
    const fresh = await currentEpisodeActor(transactionContext)
    const child = await currentEpisodeChild(fresh, 'ClinicalDocument', args.documentId)
    const prior = await fresh.prisma.workflowTransition.findUnique({ where: { operationKeyHash: evidence.operationKeyHash }, select: { actorReference: true } })
    if (prior && prior.actorReference !== fresh.session.itemId) throw new Error('Original evidence operation is not owned')
    const guarded = await guardEpisodeChild(fresh, child.input, args.toStatus === 'entered_in_error' ? 'cancel_evidence' : 'new_care', false, Boolean(prior))
    const prisma = guarded.context.prisma
    await lockTransitionOperation(prisma, evidence.operationKeyHash)
    await prisma.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`clinical-document:${args.documentId}`}, 0))::text AS "lock"`)
    const replay = await replayTransition(prisma, evidence, 'clinical_document', args.documentId)
    if (replay) return replay
    const current = await prisma.clinicalDocument.findUnique({ where: { id: args.documentId } })
    if (!current || current.transitionVersion !== args.expectedVersion) throw new Error('Clinical document changed; refresh before retrying')
    if (!allowed[current.status]?.includes(args.toStatus)) throw new Error(`Invalid clinical document transition from ${current.status} to ${args.toStatus}`)
    const now = new Date()
    const updated = await prisma.clinicalDocument.update({ where: { id: current.id }, data: {
      status: args.toStatus, transitionVersion: { increment: 1 }, actorReference: context.session!.itemId,
      ...(args.toStatus === 'signed' ? { signedAt: now, signedById: context.session!.itemId } : {}),
    } })
    const events = await appendAuditAndOutbox(prisma, {
      eventKey: `clinical_document:${updated.id}:v${updated.transitionVersion}:${updated.status}`,
      eventType: `clinical_document.${updated.status}`, aggregateType: 'clinical_document', aggregateId: updated.id,
      facilityId: updated.facilityId, patientId: updated.patientId, actorReference: context.session!.itemId,
      metadata: { source: 'clinical_document_workflow', aggregateId: updated.id, fromStatus: current.status, status: updated.status, documentVersion: updated.version, transitionVersion: updated.transitionVersion, reasonProvided: Boolean(reason) },
      occurredAt: now,
    })
    const projected = result(updated)
    await recordTransition(prisma, { evidence, aggregateType: 'clinical_document', aggregateId: updated.id,
      fromStatus: current.status, toStatus: updated.status, fromVersion: current.transitionVersion, toVersion: updated.transitionVersion,
      actorReference: context.session!.itemId, facilityId: updated.facilityId, patientId: updated.patientId,
      auditLogId: events.audit.id, outboxEventId: events.outbox.id, result: projected, occurredAt: now })
    return projected
  }, { timeout: 30_000 })
}

export async function amendClinicalDocument(_root: unknown, _args: unknown, context: Context) {
  requireClinical(context)
  throw new Error('Clinical document amendment is unavailable until qualified signing authority is configured')
}

export async function collectSpecimen(_root: unknown, { data }: any, context: Context) {
  requireClinical(context)
  await validateEncounterProvider(context, { ...data, providerId: undefined })
  const order = await context.query.MedicalOrder.findOne({ where: { id: data.medicalOrderId }, query: 'id orderType status facility { id } patient { id } encounter { id }' }) as any
  if (!order || order.orderType !== 'lab' || !['ordered', 'in_progress'].includes(order.status) || order.facility?.id !== data.facilityId || order.patient?.id !== data.patientId || order.encounter?.id !== data.encounterId) {
    throw new Error('Active laboratory order does not match the specimen scope')
  }
  const specimenType = bounded(data.specimenType, 'Specimen type', 120, true)
  const evidence = operationEvidence({ ...data, specimenType })
  return context.transaction(async (transactionContext: any) => {
    const fresh = await currentEpisodeActor(transactionContext)
    const prior = await fresh.prisma.specimen.findUnique({ where: { operationKeyHash: evidence.operationKeyHash }, select: { actorReference: true } })
    if (prior && prior.actorReference !== fresh.session.itemId) throw new Error('Original evidence operation is not owned')
    const guarded = await guardEpisodeChild(fresh, data, 'new_care', false, Boolean(prior))
    await recheckEpisodeRelated(guarded.context, 'Specimen', data, Boolean(prior))
    const prisma = guarded.context.prisma
    await lockOperation(prisma, 'specimen-collect', evidence.operationKeyHash)
    const existing = await prisma.specimen.findUnique({ where: { operationKeyHash: evidence.operationKeyHash } })
    if (existing) { if (existing.requestHash !== evidence.requestHash) throw new Error('Operation key was reused with a different payload'); return result(existing, true) }
    const now = new Date()
    const specimen = await prisma.specimen.create({ data: {
      specimenNumber: `SPC-${randomUUID()}`, status: 'collected', transitionVersion: 1, ...evidence,
      facilityId: data.facilityId, patientId: data.patientId, encounterId: data.encounterId, medicalOrderId: data.medicalOrderId,
      specimenType, actorReference: context.session!.itemId, collectedAt: now,
    } })
    await appendAuditAndOutbox(prisma, { eventKey: `specimen:${specimen.id}:v1:collected`, eventType: 'specimen.collected',
      aggregateType: 'specimen', aggregateId: specimen.id, facilityId: specimen.facilityId, patientId: specimen.patientId,
      actorReference: context.session!.itemId, metadata: { source: 'specimen_workflow', aggregateId: specimen.id, status: specimen.status, transitionVersion: 1 }, occurredAt: now })
    return result(specimen)
  }, { timeout: 30_000 })
}

export async function recordVitalSign(_root: unknown, { data }: any, context: Context) {
  requireClinical(context)
  await validateEncounterProvider(context, { ...data, providerId: undefined })
  const clinician = await context.query.Clinician.findOne({
    where: { id: data.clinicianId },
    query: 'id active department { facilities { id } } provider { facilities { id } }',
  }) as any
  if (
    !clinician?.active ||
    ![
      ...(clinician.department?.facilities || []),
      ...(clinician.provider?.facilities || []),
    ].some((facility: { id: string }) => facility.id === data.facilityId)
  ) {
    throw new Error('Clinician does not match the active facility')
  }
  const integerFields = ['systolicBp', 'diastolicBp', 'heartRate', 'respiratoryRate', 'oxygenSaturation'] as const
  const values: Record<string, number | null> = {}
  for (const field of integerFields) {
    const raw = data[field]
    if (raw === undefined || raw === null || raw === '') values[field] = null
    else if (!Number.isSafeInteger(raw)) throw new Error('Blood pressure, pulse, respiration, and oxygen values must be whole numbers')
    else values[field] = Number(raw)
  }
  let temperatureTenthsC: number | null = null
  if (data.temperatureC !== undefined && data.temperatureC !== null && data.temperatureC !== '') {
    const temperature = Number(data.temperatureC)
    const tenths = Math.round(temperature * 10)
    if (!Number.isFinite(temperature) || Math.abs(temperature * 10 - tenths) > 1e-8) {
      throw new Error('Temperature must use at most one decimal place')
    }
    temperatureTenthsC = tenths
  }
  if (temperatureTenthsC === null && !integerFields.some(field => values[field] !== null)) {
    throw new Error('At least one vital sign value is required')
  }
  if (temperatureTenthsC !== null && (temperatureTenthsC < 250 || temperatureTenthsC > 450)) {
    throw new Error('Temperature is outside the supported recording range')
  }
  for (const field of ['systolicBp', 'diastolicBp', 'heartRate', 'respiratoryRate'] as const) {
    if (values[field] !== null && (values[field]! < 1 || values[field]! > 300)) throw new Error('Vital sign value is outside the supported recording range')
  }
  if (values.oxygenSaturation !== null && (values.oxygenSaturation < 1 || values.oxygenSaturation > 100)) throw new Error('Oxygen saturation is outside the supported recording range')
  const notes = narrativeText(data.notes, 'Vital sign notes', 2000)
  const evidence = operationEvidence({ ...data, temperatureC: temperatureTenthsC === null ? null : temperatureTenthsC / 10, ...values, notes })
  return context.transaction(async (transactionContext: any) => {
    const fresh = await currentEpisodeActor(transactionContext)
    const prior = await fresh.prisma.vitalSign.findUnique({ where: { operationKeyHash: evidence.operationKeyHash }, select: { actorReference: true } })
    if (prior && prior.actorReference !== fresh.session.itemId) throw new Error('Original evidence operation is not owned')
    const guarded = await guardEpisodeChild(fresh, data, 'new_care', false, Boolean(prior))
    await recheckEpisodeRelated(guarded.context, 'VitalSign', data, Boolean(prior))
    await guarded.context.prisma.$queryRaw(Prisma.sql`SELECT "id" FROM "Clinician" WHERE "id" = ${data.clinicianId} FOR SHARE`)
    const liveClinician = await guarded.context.query.Clinician.findOne({ where: { id: data.clinicianId }, query: 'id active department { id } provider { id }' })
    if (!liveClinician?.active) throw new Error('Current clinician authority could not be verified')
    if (liveClinician.department?.id) {
      await guarded.context.prisma.$queryRaw(Prisma.sql`SELECT "id" FROM "Department" WHERE "id" = ${liveClinician.department.id} FOR SHARE`)
      await guarded.context.prisma.$queryRaw(Prisma.sql`SELECT "A" FROM "_Department_facilities" WHERE "A" = ${liveClinician.department.id} AND "B" = ${data.facilityId} FOR SHARE`)
    }
    if (liveClinician.provider?.id) {
      await guarded.context.prisma.$queryRaw(Prisma.sql`SELECT "id" FROM "Provider" WHERE "id" = ${liveClinician.provider.id} FOR SHARE`)
      await guarded.context.prisma.$queryRaw(Prisma.sql`SELECT "A" FROM "_Facility_providers" WHERE "A" = ${data.facilityId} AND "B" = ${liveClinician.provider.id} FOR SHARE`)
    }
    const currentClinician = await guarded.context.query.Clinician.findOne({ where: { id: data.clinicianId }, query: 'id active department { facilities { id } } provider { status facilities { id } }' })
    if (!currentClinician?.active || ![...(currentClinician.department?.facilities || []), ...(currentClinician.provider?.status === 'active' ? currentClinician.provider.facilities || [] : [])].some((facility: any) => facility.id === data.facilityId)) throw new Error('Current clinician scope could not be verified')
    const prisma = guarded.context.prisma
    await lockOperation(prisma, 'vital-sign-record', evidence.operationKeyHash)
    const existing = await prisma.vitalSign.findUnique({ where: { operationKeyHash: evidence.operationKeyHash } })
    if (existing) {
      if (existing.requestHash !== evidence.requestHash) throw new Error('Operation key was reused with a different payload')
      return { id: existing.id, recordedAt: existing.recordedAt, replayed: true }
    }
    const now = new Date()
    const vital = await prisma.vitalSign.create({ data: {
      ...evidence,
      facilityId: data.facilityId,
      patientId: data.patientId,
      encounterId: data.encounterId,
      recordedById: data.clinicianId,
      actorReference: context.session!.itemId,
      recordedAt: now,
      temperatureC: null,
      temperatureTenthsC,
      ...values,
      notes,
    } })
    await appendAuditAndOutbox(prisma, {
      eventKey: `vital_sign:${vital.id}:recorded`, eventType: 'vital_sign.recorded',
      aggregateType: 'vital_sign', aggregateId: vital.id, facilityId: vital.facilityId,
      patientId: vital.patientId, actorReference: context.session!.itemId,
      metadata: { source: 'vital_sign_workflow', aggregateId: vital.id, recordedAt: now.toISOString() },
      occurredAt: now,
    })
    return { id: vital.id, recordedAt: vital.recordedAt, replayed: false }
  }, { timeout: 30_000 })
}

export async function transitionSpecimen(_root: unknown, args: any, context: Context) {
  requireClinical(context)
  const scoped = await context.query.Specimen.findOne({ where: { id: args.specimenId }, query: 'id' })
  if (!scoped) throw new Error('Specimen not found or not accessible')
  if (!Number.isInteger(args.expectedVersion) || args.expectedVersion < 1) throw new Error('Expected specimen version is invalid')
  const reason = bounded(args.reason, 'Specimen transition reason', 1000, args.toStatus === 'rejected')
  const evidence = transitionEvidence(args.operationKey, { specimenId: args.specimenId, toStatus: args.toStatus, expectedVersion: args.expectedVersion, reason })
  const allowed: Record<string, string[]> = { collected: ['received', 'rejected'], received: ['processing', 'rejected'], processing: ['disposed'], disposed: [], rejected: [] }
  return context.transaction(async (transactionContext: any) => {
    const fresh = await currentEpisodeActor(transactionContext)
    const child = await currentEpisodeChild(fresh, 'Specimen', args.specimenId)
    const prior = await fresh.prisma.workflowTransition.findUnique({ where: { operationKeyHash: evidence.operationKeyHash }, select: { actorReference: true } })
    if (prior && prior.actorReference !== fresh.session.itemId) throw new Error('Original evidence operation is not owned')
    const guarded = await guardEpisodeChild(fresh, child.input, args.toStatus === 'rejected' ? 'cancel_evidence' : args.toStatus === 'disposed' ? 'retention_evidence' : 'late_result', false, Boolean(prior))
    await recheckEpisodeRelated(guarded.context, 'Specimen', child.input, true)
    const prisma = guarded.context.prisma
    await lockTransitionOperation(prisma, evidence.operationKeyHash)
    await prisma.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`specimen:${args.specimenId}`}, 0))::text AS "lock"`)
    const replay = await replayTransition(prisma, evidence, 'specimen', args.specimenId)
    if (replay) return replay
    const current = await prisma.specimen.findUnique({ where: { id: args.specimenId } })
    if (!current || current.transitionVersion !== args.expectedVersion) throw new Error('Specimen changed; refresh before retrying')
    if (!allowed[current.status]?.includes(args.toStatus)) throw new Error(`Invalid specimen transition from ${current.status} to ${args.toStatus}`)
    const now = new Date()
    const updated = await prisma.specimen.update({ where: { id: current.id }, data: {
      status: args.toStatus, transitionVersion: { increment: 1 }, actorReference: context.session!.itemId,
      ...(args.toStatus === 'received' ? { receivedAt: now } : {}), ...(args.toStatus === 'disposed' ? { disposedAt: now } : {}),
      ...(args.toStatus === 'rejected' ? { rejectionReason: reason } : {}),
    } })
    const events = await appendAuditAndOutbox(prisma, { eventKey: `specimen:${updated.id}:v${updated.transitionVersion}:${updated.status}`,
      eventType: `specimen.${updated.status}`, aggregateType: 'specimen', aggregateId: updated.id,
      facilityId: updated.facilityId, patientId: updated.patientId, actorReference: context.session!.itemId,
      metadata: { source: 'specimen_workflow', aggregateId: updated.id, fromStatus: current.status, status: updated.status, transitionVersion: updated.transitionVersion, reasonProvided: Boolean(reason) }, occurredAt: now })
    const projected = result(updated)
    await recordTransition(prisma, { evidence, aggregateType: 'specimen', aggregateId: updated.id, fromStatus: current.status,
      toStatus: updated.status, fromVersion: current.transitionVersion, toVersion: updated.transitionVersion,
      actorReference: context.session!.itemId, facilityId: updated.facilityId, patientId: updated.patientId,
      auditLogId: events.audit.id, outboxEventId: events.outbox.id, result: projected, occurredAt: now })
    return projected
  }, { timeout: 30_000 })
}
