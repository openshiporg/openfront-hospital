import { Prisma } from '@prisma/client'
import type { Context } from '.keystone/types'
import { transitionEvidence, recordTransition } from '../transitionEvidence'
import { currentEpisodeActor, lockEpisodeFacility, lockEpisodePatientProvider, EPISODE_DENIED } from './episodeFence'

// Domain DTOs, not replacements for generated Keystone/Prisma declarations.
export type LabTuple = { facilityId: string; patientId: string; encounterId: string; medicalOrderId: string; labTestId: string }
export type LabCommand = LabTuple & { operationKey: string; resultValue: string; referenceRange?: string | null; abnormalFlag?: string | null }
export type LabCorrectionCommand = { operationKey: string; resultId: string; resultValue: string; referenceRange?: string | null; abnormalFlag?: string | null; humanReviewed: boolean; humanReviewReference: string }
export type LabTransitionCommand = { operationKey: string; resultId: string; toStatus: string; expectedVersion: number }
type OriginalLabCommand = LabCommand | LabCorrectionCommand
export type LabHeader = LabTuple & {
  id: string; status: string; transitionVersion: number; version: number;
  operationKeyHash: string; requestHash: string; actorReference: string; supersedesResultId: string | null
}
type Evidence = { operationKeyHash: string; requestHash: string }
const tupleKeys = ['facilityId', 'patientId', 'encounterId', 'medicalOrderId', 'labTestId'] as const
const headerSelect = { id: true, status: true, transitionVersion: true, version: true, operationKeyHash: true, requestHash: true,
  actorReference: true, facilityId: true, patientId: true, encounterId: true, medicalOrderId: true, labTestId: true, supersedesResultId: true } as const
const scopeSelection = 'id facility { id } patient { id } encounter { id } medicalOrder { id } labTest { id }'
const denied = () => new Error(EPISODE_DENIED)

export function assertLabTuple(actual: LabTuple, expected: LabTuple) {
  if (tupleKeys.some(key => !actual[key] || actual[key] !== expected[key])) throw denied()
}
export function originalLabReceiptKey(operationKeyHash: string) {
  return transitionEvidence(`lab-result-original:${operationKeyHash}`, {}).operationKeyHash
}
export function normalizedLabEvidence(command: OriginalLabCommand) {
  const { operationKey, ...body } = command
  return transitionEvidence(operationKey, { ...body, resultValue: command.resultValue.trim(), referenceRange: String(command.referenceRange ?? '').trim() })
}
export function rawLabRequestHash(command: OriginalLabCommand) {
  return transitionEvidence(command.operationKey, command).requestHash
}
function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

/** All calls use the transaction's refreshed normal Context, including catalog
 * membership. Retirement is NOT read revocation and this function grants NO write. */
export async function authorizeLabTuple(context: Context, tuple: LabTuple) {
  const parent = await context.query.Encounter.findOne({ where: { id: tuple.encounterId }, query: 'id facility { id } patient { id } provider { id }' })
  if (!parent?.provider?.id || parent.facility?.id !== tuple.facilityId || parent.patient?.id !== tuple.patientId) throw denied()
  await lockEpisodeFacility(context, tuple.facilityId, parent.provider.id)
  await context.prisma.$queryRaw(Prisma.sql`SELECT "id" FROM "Encounter" WHERE "id" = ${tuple.encounterId} FOR SHARE`)
  const current = await context.query.Encounter.findOne({ where: { id: tuple.encounterId }, query: 'id facility { id } patient { id } provider { id }' })
  if (!current || current.facility?.id !== tuple.facilityId || current.patient?.id !== tuple.patientId || current.provider?.id !== parent.provider.id) throw denied()
  await lockEpisodePatientProvider(context, tuple.facilityId, tuple.patientId, parent.provider.id)
  await context.prisma.$queryRaw(Prisma.sql`SELECT "id" FROM "MedicalOrder" WHERE "id" = ${tuple.medicalOrderId} FOR SHARE`)
  const order = await context.query.MedicalOrder.findOne({ where: { id: tuple.medicalOrderId }, query: 'id orderType facility { id } patient { id } encounter { id } orderingProvider { id }' })
  if (!order || order.orderType !== 'lab' || order.facility?.id !== tuple.facilityId || order.patient?.id !== tuple.patientId || order.encounter?.id !== tuple.encounterId || !order.orderingProvider?.id) throw denied()
  await lockEpisodePatientProvider(context, tuple.facilityId, tuple.patientId, order.orderingProvider.id)
  await context.prisma.$queryRaw(Prisma.sql`SELECT "id" FROM "LabTest" WHERE "id" = ${tuple.labTestId} FOR SHARE`)
  if (!await context.query.LabTest.findOne({ where: { id: tuple.labTestId }, query: 'id' })) throw denied()
}

async function authorizedHeader(context: Context, header: LabHeader) {
  await authorizeLabTuple(context, header)
  await context.prisma.$queryRaw(Prisma.sql`SELECT "id" FROM "LabResult" WHERE "id" = ${header.id} FOR SHARE`)
  const visible = await context.query.LabResult.findOne({ where: { id: header.id }, query: scopeSelection })
  if (!visible || visible.facility?.id !== header.facilityId || visible.patient?.id !== header.patientId || visible.encounter?.id !== header.encounterId || visible.medicalOrder?.id !== header.medicalOrderId || visible.labTest?.id !== header.labTestId) throw denied()
  const current = await context.prisma.labResult.findUnique({ where: { id: header.id }, select: headerSelect })
  if (!current) throw denied()
  assertLabTuple(current, header)
  if (current.operationKeyHash !== header.operationKeyHash || current.requestHash !== header.requestHash || current.supersedesResultId !== header.supersedesResultId) throw denied()
  if (current.supersedesResultId) {
    await context.prisma.$queryRaw(Prisma.sql`SELECT "id" FROM "LabResult" WHERE "id" = ${current.supersedesResultId} FOR SHARE`)
    const source = await context.query.LabResult.findOne({ where: { id: current.supersedesResultId }, query: `${scopeSelection} version` })
    if (!source || source.version + 1 !== current.version || source.facility?.id !== current.facilityId || source.patient?.id !== current.patientId || source.encounter?.id !== current.encounterId || source.medicalOrder?.id !== current.medicalOrderId || source.labTest?.id !== current.labTestId) throw denied()
  }
  return current
}

async function receiptHeader(context: Context, header: LabHeader) {
  // Never select private result JSON to discover ownership/correlation.
  const receipt = await context.prisma.workflowTransition.findUnique({ where: { operationKeyHash: originalLabReceiptKey(header.operationKeyHash) },
    select: { id: true, aggregateType: true, aggregateId: true, actorReference: true, facilityId: true, patientId: true, requestHash: true, toStatus: true, toVersion: true, auditLogId: true, outboxEventId: true } })
  if (receipt && (receipt.aggregateType !== 'lab_result_creation' || receipt.aggregateId !== header.id || receipt.facilityId !== header.facilityId || receipt.patientId !== header.patientId || receipt.requestHash !== header.requestHash)) throw denied()
  const origin = receipt ? null : await context.prisma.clinicalAuditLog.findFirst({ where: {
    eventType: 'lab_result.created', facilityId: header.facilityId, patientId: header.patientId, encounterId: header.encounterId,
    metadata: { path: ['aggregateId'], equals: header.id },
  }, select: { actorReference: true } })
  // actorReference on the result changes on transitions. It is NOT creator proof
  // after v1; missing origin then stays unknown, never becomes today's actor.
  const owner = receipt?.actorReference || origin?.actorReference || (header.transitionVersion === 1 ? header.actorReference : null)
  return { receipt, owner }
}

export function projectOriginalLabReceipt(value: unknown, header: LabHeader, rawHash?: string) {
  const result = object(value)
  const receipt = object(result?.labAcknowledgement)
  const command = object(receipt?.originalCommand)
  if (!result || !receipt || !command || result.id !== header.id || typeof result.status !== 'string' || !Number.isInteger(result.transitionVersion) || receipt.schemaVersion !== 1 || receipt.recordVersion !== header.version || receipt.requestHash !== header.requestHash || receipt.operationKeyHash !== header.operationKeyHash) throw denied()
  if (result.status !== (header.supersedesResultId ? 'corrected' : 'preliminary') || result.transitionVersion !== (header.supersedesResultId ? 2 : 1)) throw denied()
  if (header.supersedesResultId && (!Number.isInteger(receipt.sourceRecordVersion) || Number(receipt.sourceRecordVersion) < 1 || Number(receipt.sourceRecordVersion) + 1 !== header.version)) throw denied()
  const tuple = object(receipt.tuple) || command
  for (const key of tupleKeys) if (tuple[key] !== header[key]) throw denied()
  if (header.supersedesResultId ? command.resultId !== header.supersedesResultId : Object.hasOwn(command, 'resultId')) throw denied()
  if (typeof command.operationKey !== 'string' || transitionEvidence(command.operationKey, {}).operationKeyHash !== header.operationKeyHash || typeof receipt.rawRequestHash !== 'string') throw denied()
  const { operationKey, ...body } = command
  if (typeof command.resultValue !== 'string' || (command.referenceRange != null && typeof command.referenceRange !== 'string') || transitionEvidence(operationKey, command).requestHash !== receipt.rawRequestHash || (rawHash && rawHash !== receipt.rawRequestHash)) throw new Error('Original lab command body does not match')
  const normalized = { ...body, resultValue: command.resultValue.trim(), referenceRange: String(command.referenceRange ?? '').trim() }
  if (transitionEvidence(operationKey, normalized).requestHash !== header.requestHash) throw denied()
  return result
}

// Isolated domain ports for cheap tests. They do not implement or simulate
// Keystone ACL, Prisma, transactions, hooks, PostgreSQL or commit-time authority.
export type OriginalLabReceiptHeader = { id: string; toStatus: string; toVersion: number }
export type LabAcknowledgementPort = {
  lookup: () => Promise<LabHeader | null>
  authorize: (header: LabHeader) => Promise<LabHeader>
  origin: (header: LabHeader) => Promise<{ owner: string | null; receipt: OriginalLabReceiptHeader | null }>
  readBody: (header: LabHeader, receipt: OriginalLabReceiptHeader) => Promise<unknown>
}
export async function recoverLabAcknowledgement(port: LabAcknowledgementPort, input: {
  actorId: string; evidence: Evidence; rawHash: string; tuple?: LabTuple; supersedesResultId: string | null
}) {
  const header = await port.lookup()
  if (!header) return null
  if (input.tuple) assertLabTuple(header, input.tuple)
  if (header.requestHash !== input.evidence.requestHash || header.operationKeyHash !== input.evidence.operationKeyHash || header.supersedesResultId !== input.supersedesResultId) throw denied()
  const current = await port.authorize(header)
  assertLabTuple(current, header)
  if (current.id !== header.id || current.operationKeyHash !== header.operationKeyHash || current.requestHash !== header.requestHash || current.supersedesResultId !== header.supersedesResultId) throw denied()
  const { receipt, owner } = await port.origin(current)
  if (owner !== input.actorId) throw denied()
  if (!receipt) return { id: current.id, status: current.status, transitionVersion: current.transitionVersion, replayed: true,
    originalAcknowledgement: { state: 'legacy_identity_only_original_body_status_version_unknown', original: null,
      current: { status: current.status, transitionVersion: current.transitionVersion } } }
  const original = projectOriginalLabReceipt(await port.readBody(current, receipt), current, input.rawHash)
  if (original.status !== receipt.toStatus || original.transitionVersion !== receipt.toVersion) throw denied()
  return { id: current.id, status: String(original.status), transitionVersion: Number(original.transitionVersion), replayed: true,
    originalAcknowledgement: { state: 'accepted_original', original: { id: original.id, status: original.status, transitionVersion: original.transitionVersion } } }
}
function nativeAcknowledgementPort(context: Context, evidence: Evidence): LabAcknowledgementPort {
  return {
    lookup: () => context.prisma.labResult.findUnique({ where: { operationKeyHash: evidence.operationKeyHash }, select: headerSelect }),
    authorize: header => authorizedHeader(context, header),
    origin: header => receiptHeader(context, header),
    readBody: async (header, receipt) => (await context.prisma.workflowTransition.findFirst({ where: {
      id: receipt.id, aggregateType: 'lab_result_creation', aggregateId: header.id, actorReference: context.session!.itemId,
      facilityId: header.facilityId, patientId: header.patientId, requestHash: evidence.requestHash,
    }, select: { result: true } }))?.result,
  }
}

/** Read-only original creation replay. Called INSIDE the actual creator's native
 * transaction, BEFORE fresh-effect policy/catalog admission. No key/body backfill. */
export async function replayAcceptedLabResult(context: Context, tuple: LabTuple, evidence: Evidence, rawCommand: LabCommand) {
  await authorizeLabTuple(context, tuple)
  return recoverLabAcknowledgement(nativeAcknowledgementPort(context, evidence), {
    actorId: context.session!.itemId, evidence, rawHash: rawLabRequestHash(rawCommand), tuple, supersedesResultId: null,
  })
}

/** Previously accepted status commands are read-only too. This deliberately does
 * not admit a NEW finalization/acknowledgement with a retired catalog test. */
export async function replayAcceptedLabTransition(context: Context, resultId: string, evidence: Evidence, command: LabTransitionCommand) {
  const header = await context.prisma.labResult.findUnique({ where: { id: resultId }, select: headerSelect })
  if (!header) throw denied()
  const authorized = await authorizedHeader(context, header)
  const receipt = await context.prisma.workflowTransition.findUnique({ where: { operationKeyHash: evidence.operationKeyHash },
    select: { id: true, aggregateType: true, aggregateId: true, actorReference: true, facilityId: true, patientId: true, requestHash: true, toStatus: true, toVersion: true } })
  if (!receipt) return null
  if (receipt.aggregateType !== 'lab_result' || receipt.aggregateId !== authorized.id || receipt.actorReference !== context.session?.itemId || receipt.facilityId !== authorized.facilityId || receipt.patientId !== authorized.patientId || receipt.requestHash !== evidence.requestHash) throw denied()
  const stored = await context.prisma.workflowTransition.findFirst({ where: { id: receipt.id, aggregateType: 'lab_result', aggregateId: authorized.id,
    actorReference: context.session.itemId, facilityId: authorized.facilityId, patientId: authorized.patientId, requestHash: evidence.requestHash }, select: { result: true } })
  const result = object(stored?.result)
  if (!result || result.id !== authorized.id || result.status !== receipt.toStatus || result.transitionVersion !== receipt.toVersion) throw denied()
  const originalCommand = object(result.originalCommand)
  if (originalCommand && (originalCommand.operationKey !== command.operationKey || originalCommand.resultId !== command.resultId || originalCommand.toStatus !== command.toStatus || originalCommand.expectedVersion !== command.expectedVersion || originalCommand.actorReference !== context.session.itemId)) throw denied()
  return { id: authorized.id, status: receipt.toStatus, transitionVersion: receipt.toVersion, replayed: true,
    originalAcknowledgement: { state: originalCommand ? 'accepted_original' : 'legacy_transition_command_unknown',
      originalStatus: receipt.toStatus, originalTransitionVersion: receipt.toVersion } }
}

export async function persistOriginalLabReceipt(prisma: Context['prisma'], row: { id: string; status: string; transitionVersion: number }, evidence: Evidence, command: OriginalLabCommand, actorReference: string, tuple: LabTuple, recordVersion = 1, sourceRecordVersion?: number) {
  const result = { ...row, replayed: false, labAcknowledgement: { schemaVersion: 1, originalCommand: command, tuple: {
    facilityId: tuple.facilityId, patientId: tuple.patientId, encounterId: tuple.encounterId, medicalOrderId: tuple.medicalOrderId, labTestId: tuple.labTestId,
  }, recordVersion,
    ...(sourceRecordVersion != null ? { sourceRecordVersion } : {}),
    operationKeyHash: evidence.operationKeyHash, requestHash: evidence.requestHash, rawRequestHash: rawLabRequestHash(command) } }
  const eventKey = row.transitionVersion === 1 ? `lab_result:${tuple.facilityId}:create:${evidence.operationKeyHash}` : `lab_result:${row.id}:v${row.transitionVersion}:${row.status}`
  const outbox = await prisma.clinicalOutboxEvent.findUnique({ where: { eventKey }, select: { id: true, aggregateType: true, aggregateId: true, facilityId: true, patientId: true, encounterId: true } })
  const audit = await prisma.clinicalAuditLog.findFirst({ where: { eventType: row.transitionVersion === 1 ? 'lab_result.created' : `lab_result.${row.status}`,
    actorReference, facilityId: tuple.facilityId, patientId: tuple.patientId, encounterId: tuple.encounterId,
    AND: [{ metadata: { path: ['aggregateId'], equals: row.id } }, { metadata: { path: ['transitionVersion'], equals: row.transitionVersion } }],
  }, select: { id: true } })
  if (!audit || !outbox || outbox.aggregateType !== 'lab_result' || outbox.aggregateId !== row.id || outbox.facilityId !== tuple.facilityId || outbox.patientId !== tuple.patientId || outbox.encounterId !== tuple.encounterId) throw new Error('Original lab acknowledgement lacks correlated native audit/outbox evidence')
  await recordTransition(prisma, { evidence: { operationKeyHash: originalLabReceiptKey(evidence.operationKeyHash), requestHash: evidence.requestHash },
    aggregateType: 'lab_result_creation', aggregateId: row.id, fromStatus: 'not_recorded', toStatus: row.status,
    fromVersion: 0, toVersion: row.transitionVersion, actorReference, facilityId: tuple.facilityId, patientId: tuple.patientId,
    auditLogId: audit.id, outboxEventId: outbox.id, occurredAt: new Date(), result })
}

export async function replayAcceptedLabCorrection(context: Context, evidence: Evidence, command: LabCorrectionCommand) {
  return recoverLabAcknowledgement(nativeAcknowledgementPort(context, evidence), {
    actorId: context.session!.itemId, evidence, rawHash: rawLabRequestHash(command), supersedesResultId: command.resultId,
  })
}

/** Scoped operator detail and creation-recovery share ONE serializable snapshot.
 * Values are selected only through normal List field access after header scope. */
export async function labResultReadback(_root: unknown, args: { resultId?: string; command?: LabCommand; correctionCommand?: LabCorrectionCommand; beforeVersion?: number }, context: Context) {
  const command = args.command || args.correctionCommand
  if ([args.resultId, args.command, args.correctionCommand].filter(Boolean).length !== 1 || (args.beforeVersion != null && (!Number.isInteger(args.beforeVersion) || args.beforeVersion < 1))) throw new Error('Lab readback request is invalid')
  return context.transaction(async tx => {
    // Installed Keystone declares isolationLevel as the enum OBJECT although
    // Prisma runtime expects a string. Do not shim/cast that SDK declaration:
    // set native transaction isolation BEFORE its first read instead. PG execution
    // and current-at-COMMIT behavior remain separately ungranted validation.
    await tx.prisma.$executeRaw(Prisma.sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`)
    const current: Context = await currentEpisodeActor(tx)
    if (args.command) await authorizeLabTuple(current, args.command)
    if (args.correctionCommand) {
      const source = await current.query.LabResult.findOne({ where: { id: args.correctionCommand.resultId }, query: 'id' })
      if (!source) throw denied()
      const sourceHeader = await current.prisma.labResult.findUnique({ where: { id: source.id }, select: headerSelect })
      if (!sourceHeader) throw denied()
      await authorizedHeader(current, sourceHeader)
    }
    const header = await current.prisma.labResult.findUnique({ where: args.resultId ? { id: args.resultId } : { operationKeyHash: transitionEvidence(command!.operationKey, {}).operationKeyHash }, select: headerSelect })
    if (!header) {
      if (args.resultId) throw denied() // Do not distinguish missing from foreign IDs.
      return { outcome: 'unknown', original: null, current: null, interpretation: 'not_rejection_or_rollback_keep_original_intent' }
    }
    if (args.command) {
      assertLabTuple(header, args.command)
      if (header.supersedesResultId) throw denied()
    }
    if (command && normalizedLabEvidence(command).requestHash !== header.requestHash) throw denied()
    if (args.correctionCommand && header.supersedesResultId !== args.correctionCommand.resultId) throw denied()
    const authorized = await authorizedHeader(current, header)
    const { receipt, owner } = await receiptHeader(current, authorized)
    if (command && owner !== current.session?.itemId) throw denied()
    let original: Record<string, unknown> | null = null
    if (receipt && owner === current.session?.itemId) {
      const stored = await current.prisma.workflowTransition.findFirst({ where: { id: receipt.id, aggregateType: 'lab_result_creation', aggregateId: authorized.id,
        facilityId: authorized.facilityId, patientId: authorized.patientId, actorReference: current.session.itemId, requestHash: authorized.requestHash }, select: { result: true } })
      original = projectOriginalLabReceipt(stored?.result, authorized, command ? rawLabRequestHash(command) : undefined)
      if (original.status !== receipt.toStatus || original.transitionVersion !== receipt.toVersion) throw denied()
    }
    let knownLegacyOriginalHeader: Record<string, unknown> | null = null
    if (!receipt && owner && owner === current.session?.itemId) {
      const origin = await current.prisma.clinicalAuditLog.findFirst({ where: { eventType: 'lab_result.created', actorReference: owner,
        facilityId: authorized.facilityId, patientId: authorized.patientId, encounterId: authorized.encounterId,
        metadata: { path: ['aggregateId'], equals: authorized.id },
      }, select: { id: true, metadata: true } })
      const metadata = object(origin?.metadata)
      if (origin && metadata?.source === 'controlled_clinical_hook' && metadata.aggregateId === authorized.id && typeof metadata.status === 'string' && Number.isInteger(metadata.transitionVersion)) {
        knownLegacyOriginalHeader = { auditId: origin.id, id: authorized.id, status: metadata.status, transitionVersion: metadata.transitionVersion,
          originalRawBody: 'unknown_not_backfilled', interpretation: 'immutable_creation_audit_header_only_not_full_command_acknowledgement' }
      }
    }
    const value = await current.query.LabResult.findOne({ where: { id: authorized.id }, query: `${scopeSelection} resultNumber status version transitionVersion resultValue referenceRange abnormalFlag resultedAt acknowledgedAt metadata supersedesResult { id } supersedingResult { id }` })
    if (!value || value.resultValue == null) throw denied()
    const history = await current.prisma.workflowTransition.findMany({ where: { aggregateType: 'lab_result', aggregateId: authorized.id,
      facilityId: authorized.facilityId, patientId: authorized.patientId, actorReference: current.session.itemId,
      ...(args.beforeVersion ? { toVersion: { lt: args.beforeVersion } } : {}) }, orderBy: { toVersion: 'desc' }, take: 26,
      select: { id: true, fromStatus: true, toStatus: true, fromVersion: true, toVersion: true, occurredAt: true, result: true } })
    // Inverse IDs from normal List access are not permission to load their values.
    return { outcome: original ? 'accepted' : owner === current.session?.itemId ? 'legacy_original_body_unknown' : 'current_only_original_not_owned', original,
      current: value, knownLegacyOriginalHeader, creationReceipt: receipt && owner === current.session?.itemId ? {
        id: receipt.id, auditLogId: receipt.auditLogId, outboxEventId: receipt.outboxEventId, originalStatus: receipt.toStatus, originalTransitionVersion: receipt.toVersion,
      } : null, ownedHistory: history.slice(0, 25), nextVersion: history.length > 25 ? history[24].toVersion : null,
      interpretation: 'operational_transcription_not_laboratory_truth_or_complete_clinical_history' }
  }, { timeout: 30_000 })
}
