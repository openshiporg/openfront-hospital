import { randomUUID } from 'node:crypto'
import { appendAuditAndOutbox } from '../operational/evidence'
import { lockTransitionOperation, recordTransition, transitionEvidence } from '../transitionEvidence'
import { assertEpisodeTuple, episodeDigest, episodeEligibility, requireHumanEpisodeReview, validateEpisodePolicy } from './episodePolicy'
import { currentEpisodeActor, effectiveEpisodePolicy, lockCurrentEncounter, lockEpisodeFacility } from './episodeFence'

export function policyProjection(row: any) {
  return row ? { id: row.id, revision: row.revision, effectiveAt: row.effectiveAt, definition: row.definition,
    reviewReference: row.reviewReference, reviewedByReference: row.reviewedByReference, reviewedRoleReference: row.reviewedRoleReference } : null
}
export async function rejectEpisodeCommand(context: any, scope: any, policy: any, originalCommand: any, evidence: any, reasonCode: string) {
  const now = new Date()
  const row = await context.prisma.encounter.findUnique({ where: { id: scope.tuple.encounterId } })
  const result = { id: row.id, encounterNumber: row.encounterNumber, fromStatus: row.status, status: row.status,
    transitionVersion: row.transitionVersion, startedAt: row.startedAt || null, endedAt: row.endedAt || null, replayed: false,
    outcome: 'rejected', reasonCode, episodeReceipt: { tuple: scope.tuple, originalCommand, policy: policyProjection(policy),
      actorId: context.session.itemId, roleId: context.session.data.role.id, accepted: false, reasonCode,
      clinicalAuthority: 'not_asserted', descendantsClosed: false, admissionDischarged: false } }
  const events = await appendAuditAndOutbox(context.prisma, { eventKey: `encounter_command:${evidence.operationKeyHash}:rejected`, eventType: 'encounter_command.rejected',
    aggregateType: 'encounter_command', aggregateId: row.id, facilityId: scope.tuple.facilityId, patientId: scope.tuple.patientId,
    actorReference: context.session.itemId, metadata: { source: 'episode_policy_workflow', reasonCode, policyId: policy?.id || null, transitionPerformed: false }, occurredAt: now })
  await recordTransition(context.prisma, { evidence, aggregateType: 'encounter_command', aggregateId: row.id,
    fromStatus: row.status, toStatus: 'rejected', fromVersion: row.transitionVersion, toVersion: row.transitionVersion,
    actorReference: context.session.itemId, facilityId: scope.tuple.facilityId, patientId: scope.tuple.patientId,
    auditLogId: events.audit.id, outboxEventId: events.outbox.id, result, occurredAt: now })
  return result
}

export function reviewFingerprint(context: any, scope: any, policy: any) {
  return episodeDigest({ tuple: scope.tuple, actorId: context.session.itemId, roleId: context.session.data.role.id,
    securityVersion: context.session.data.securityVersion,
    capabilities: { canManagePatients: context.session.data.role.canManagePatients, canAccessAllClinicalData: context.session.data.role.canAccessAllClinicalData,
      canManageBilling: context.session.data.role.canManageBilling, canManageRoles: context.session.data.role.canManageRoles }, encounterVersion: scope.encounter.transitionVersion,
    encounterStatus: scope.encounter.status, appointmentVersion: scope.appointment?.transitionVersion || null,
    appointmentStatus: scope.appointment?.status || null, policyId: policy?.id || null, policyRevision: policy?.revision || null,
    policyEffectiveAt: policy?.effectiveAt ? new Date(policy.effectiveAt).toISOString() : null, policyDefinition: policy?.definition || null })
}

export async function reviewEpisodePolicy(_root: unknown, { data }: any, context: any) {
  const definition = validateEpisodePolicy(data.definition)
  const reviewReference = requireHumanEpisodeReview(data.attested, data.reviewReference)
  if (!Number.isInteger(data.expectedRevision) || data.expectedRevision < 0) throw new Error('Expected policy revision is invalid')
  const originalCommand = { facilityId: data.facilityId, expectedRevision: data.expectedRevision, definition, reviewReference, attested: true }
  return context.transaction(async (transactionContext: any) => {
    const current = await currentEpisodeActor(transactionContext, 'configure')
    await lockEpisodeFacility(current, data.facilityId)
    const policy = await effectiveEpisodePolicy(current.prisma, data.facilityId)
    const evidence = transitionEvidence(data.operationKey, { ...originalCommand, actorId: current.session.itemId })
    await lockTransitionOperation(current.prisma, evidence.operationKeyHash)
    const existing = await current.prisma.episodeClosurePolicy.findUnique({ where: { operationKeyHash: evidence.operationKeyHash } })
    if (existing) {
      if (existing.requestHash !== evidence.requestHash || existing.reviewedByReference !== current.session.itemId) throw new Error('Policy operation identity does not match the original command')
      return { original: policyProjection(existing), current: policyProjection(policy), replayed: true }
    }
    if ((policy?.revision || 0) !== data.expectedRevision) throw new Error('Policy changed; review the current revision before submitting')
    const now = new Date()
    const row = await current.prisma.episodeClosurePolicy.create({ data: {
      id: randomUUID(), facilityId: data.facilityId, revision: data.expectedRevision + 1,
      revisionKey: `${data.facilityId}:${data.expectedRevision + 1}`, definition, reviewReference,
      reviewedByReference: current.session.itemId, reviewedRoleReference: current.session.data.role.id,
      ...evidence, originalCommand, effectiveAt: now, createdAt: now, updatedAt: now,
    } })
    await appendAuditAndOutbox(current.prisma, { eventKey: `episode_policy:${row.id}:reviewed`, eventType: 'episode_policy.reviewed',
      aggregateType: 'episode_policy', aggregateId: row.id, facilityId: data.facilityId, actorReference: current.session.itemId,
      metadata: { source: 'episode_policy_workflow', policyId: row.id, revision: row.revision, humanReviewRecorded: true, clinicalAuthority: 'not_asserted', retentionDispositionChanged: false }, occurredAt: now })
    return { original: policyProjection(row), current: policyProjection(row), replayed: false }
  }, { isolationLevel: 'Serializable', timeout: 30_000 })
}

export async function episodePolicyWorkspace(_root: unknown, args: any, context: any) {
  const take = args.take ?? 25
  if (!Number.isInteger(take) || take < 1 || take > 25 || (args.beforeRevision != null && (!Number.isInteger(args.beforeRevision) || args.beforeRevision < 1))) throw new Error('Policy history page is invalid')
  return context.transaction(async (tx: any) => {
    const current = await currentEpisodeActor(tx)
    await lockEpisodeFacility(current, args.facilityId)
    const effective = await effectiveEpisodePolicy(current.prisma, args.facilityId)
    const rows = await current.prisma.episodeClosurePolicy.findMany({ where: { facilityId: args.facilityId,
      ...(args.beforeRevision ? { revision: { lt: args.beforeRevision } } : {}) }, orderBy: { revision: 'desc' }, take: take + 1 })
    return { actorId: current.session.itemId, effective: policyProjection(effective), history: rows.slice(0, take).map(policyProjection),
      nextRevision: rows.length > take ? rows[take - 1].revision : null,
      canConfigure: current.session.data.role.canManageRoles === true && current.session.data.role.canManagePatients === true,
      legacyState: effective ? 'explicit_reviewed_policy' : 'no_reviewed_policy_no_operational_closure' }
  }, { isolationLevel: 'Serializable', timeout: 30_000 })
}

export async function episodeClosureWorkspace(_root: unknown, args: any, context: any) {
  const take = args.take ?? 25
  if (!Number.isInteger(take) || take < 1 || take > 25 || (args.beforeVersion != null && (!Number.isInteger(args.beforeVersion) || args.beforeVersion < 1))) throw new Error('Episode history page is invalid')
  return context.transaction(async (tx: any) => {
    const current = await currentEpisodeActor(tx)
    const scope = await lockCurrentEncounter(current, args.encounterId)
    const policy = await effectiveEpisodePolicy(current.prisma, scope.tuple.facilityId)
    const entries = await current.prisma.workflowTransition.findMany({ where: {
      aggregateType: 'encounter', aggregateId: args.encounterId, facilityId: scope.tuple.facilityId, patientId: scope.tuple.patientId,
      ...(args.beforeVersion ? { toVersion: { lt: args.beforeVersion } } : {}),
    }, orderBy: { toVersion: 'desc' }, take: take + 1, select: { id: true, actorReference: true, fromStatus: true, toStatus: true, toVersion: true, occurredAt: true, result: true } })
    const rejectedWhere: any = { aggregateType: 'encounter_command', aggregateId: args.encounterId, actorReference: current.session.itemId,
      facilityId: scope.tuple.facilityId, patientId: scope.tuple.patientId }
    let rejectedPageWhere: any = rejectedWhere
    if (args.beforeRejectedId) {
      const cursor = await current.prisma.workflowTransition.findFirst({ where: { ...rejectedWhere, id: args.beforeRejectedId }, select: { id: true, occurredAt: true } })
      if (!cursor) throw new Error('Owned rejected-receipt cursor is stale or unavailable')
      rejectedPageWhere = { ...rejectedWhere, OR: [{ occurredAt: { lt: cursor.occurredAt } }, { occurredAt: cursor.occurredAt, id: { lt: cursor.id } }] }
    }
    const rejectedEntries = await current.prisma.workflowTransition.findMany({ where: rejectedPageWhere, orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], take: take + 1,
      select: { id: true, toVersion: true, occurredAt: true, result: true } })
    const rejectedHistory = rejectedEntries.slice(0, take).map((entry: any) => ({ id: entry.id, observedVersion: entry.toVersion, occurredAt: entry.occurredAt,
      reasonCode: entry.result?.reasonCode || 'legacy_rejection_unknown', policyRevision: entry.result?.episodeReceipt?.policy?.revision || null }))
    const history = entries.slice(0, take).map((entry: any) => ({ id: entry.id, fromStatus: entry.fromStatus, toStatus: entry.toStatus,
      toVersion: entry.toVersion, occurredAt: entry.occurredAt, provenance: entry.result?.episodeReceipt ? 'reviewed_policy_receipt' : 'legacy_policy_unknown',
      policy: entry.result?.episodeReceipt?.policy || null, owned: entry.actorReference === current.session.itemId }))
    const closure = await current.prisma.workflowTransition.findFirst({ where: {
      aggregateType: 'encounter', aggregateId: args.encounterId, facilityId: scope.tuple.facilityId, patientId: scope.tuple.patientId, toStatus: { in: ['closed', 'cancelled'] },
    }, orderBy: { toVersion: 'desc' }, select: { result: true } })
    const discharged = Boolean(await current.prisma.admission.findFirst({ where: { facilityId: scope.tuple.facilityId, patientId: scope.tuple.patientId, encounterId: args.encounterId, status: 'discharged' }, select: { id: true } }))
    const applied = closure?.result?.episodeReceipt?.policy?.definition || null
    // Eligibility is metadata only. Never retrieve children through a sudo parent.
    const eligibility = ['new_care', 'late_result', 'correction', 'claim', 'cancel_evidence', 'retention_evidence'].map((action: any) => {
      const base = { status: scope.encounter.status, discharged, receiptPresent: Boolean(closure?.result?.episodeReceipt), action, humanReviewed: false }
      const effective = episodeEligibility({ ...base, policy: policy?.definition || null })
      const original = applied ? episodeEligibility({ ...base, policy: applied }) : effective
      return { action, allowed: effective.allowed && original.allowed, code: !original.allowed ? original.code : effective.code }
    })
    return { actorId: current.session.itemId, tuple: scope.tuple, status: scope.encounter.status, transitionVersion: scope.encounter.transitionVersion,
      appointment: scope.appointment ? { id: scope.appointment.id, status: scope.appointment.status, transitionVersion: scope.appointment.transitionVersion } : null,
      policy: policyProjection(policy), reviewFingerprint: reviewFingerprint(current, scope, policy), history,
      nextVersion: entries.length > take ? entries[take - 1].toVersion : null, eligibility, rejectedHistory,
      nextRejectedId: rejectedEntries.length > take ? rejectedEntries[take - 1].id : null,
      legacyState: closure && !closure.result?.episodeReceipt ? 'legacy_policy_unknown_no_backfill' : 'current_source_receipt_or_active' }
  }, { isolationLevel: 'Serializable', timeout: 30_000 })
}

/** Read-only recovery: unknown is not rejection, accepted is not current state. */
export async function recoverEpisodeClosure(_root: unknown, args: any, context: any) {
  return context.transaction(async (tx: any) => {
    const current = await currentEpisodeActor(tx)
    const scope = await lockCurrentEncounter(current, args.encounterId)
    const policy = await effectiveEpisodePolicy(current.prisma, scope.tuple.facilityId)
    const evidence = transitionEvidence(args.operationKey, {})
    await lockTransitionOperation(current.prisma, evidence.operationKeyHash)
    const entry = await current.prisma.workflowTransition.findUnique({ where: { operationKeyHash: evidence.operationKeyHash } })
    if (!entry) return { outcome: 'unknown', original: null, current: { status: scope.encounter.status, transitionVersion: scope.encounter.transitionVersion }, policy: policyProjection(policy) }
    if (!['encounter', 'encounter_command'].includes(entry.aggregateType) || entry.aggregateId !== args.encounterId || entry.actorReference !== current.session.itemId || entry.facilityId !== scope.tuple.facilityId || entry.patientId !== scope.tuple.patientId) throw new Error('Original episode operation is not owned or accessible')
    if (!entry.result?.episodeReceipt) return { outcome: 'legacy_unknown', original: null, current: { status: scope.encounter.status, transitionVersion: scope.encounter.transitionVersion }, policy: policyProjection(policy) }
    assertEpisodeTuple(entry.result.episodeReceipt.tuple, scope.tuple)
    return { outcome: entry.result.episodeReceipt.accepted === false ? 'rejected' : 'accepted', original: entry.result, current: { status: scope.encounter.status, transitionVersion: scope.encounter.transitionVersion,
      appointment: scope.appointment ? { id: scope.appointment.id, status: scope.appointment.status, transitionVersion: scope.appointment.transitionVersion } : null }, policy: policyProjection(policy) }
  }, { isolationLevel: 'Serializable', timeout: 30_000 })
}
