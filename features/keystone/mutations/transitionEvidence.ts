import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'

const OPERATION_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,199}$/

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonical(nested)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function digest(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

export function transitionEvidence(operationKey: unknown, payload: unknown) {
  const key = String(operationKey ?? '').trim()
  if (!OPERATION_KEY_PATTERN.test(key)) throw new Error('Transition operation key is invalid')
  return {
    operationKeyHash: digest(key),
    requestHash: digest(canonical(payload)),
  }
}

export async function lockTransitionOperation(tx: any, operationKeyHash: string) {
  await tx.$queryRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`workflow-transition:${operationKeyHash}`}, 0))::text AS "lock"`,
  )
}

export async function replayTransition(
  tx: any,
  evidence: { operationKeyHash: string; requestHash: string },
  aggregateType: string,
  aggregateId: string,
): Promise<(Record<string, any> & { replayed: boolean }) | null> {
  const existing = await tx.workflowTransition.findUnique({
    where: { operationKeyHash: evidence.operationKeyHash },
  })
  if (!existing) return null
  if (
    existing.requestHash !== evidence.requestHash ||
    existing.aggregateType !== aggregateType ||
    existing.aggregateId !== aggregateId
  ) {
    throw new Error('Transition operation key was reused with a different request')
  }
  const result = existing.result as Record<string, unknown> | null
  if (!result || typeof result !== 'object') throw new Error('Transition replay evidence is incomplete')
  return { ...result, replayed: true }
}

type RecordTransitionInput = {
  evidence: { operationKeyHash: string; requestHash: string }
  aggregateType: string
  aggregateId: string
  fromStatus: string
  toStatus: string
  fromVersion: number
  toVersion: number
  actorReference: string
  facilityId: string
  patientId?: string | null
  auditLogId?: string | null
  outboxEventId?: string | null
  result: Record<string, unknown>
  occurredAt: Date
}

export async function recordTransition(tx: any, input: RecordTransitionInput) {
  const serialized = JSON.stringify(input.result)
  // Creation retains the exact bounded clinical command (including JSON escape
  // expansion), not just a digest. Other transition projections retain 8k limit.
  const limit = input.aggregateType === 'lab_result_creation' ? 32_000 : 8_000
  if (serialized.length > limit) throw new Error('Transition result projection is too large')
  await tx.workflowTransition.create({
    data: {
      operationKeyHash: input.evidence.operationKeyHash,
      requestHash: input.evidence.requestHash,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      fromVersion: input.fromVersion,
      toVersion: input.toVersion,
      actorReference: input.actorReference,
      facilityId: input.facilityId,
      patientId: input.patientId || null,
      auditLogId: input.auditLogId || null,
      outboxEventId: input.outboxEventId || null,
      result: input.result,
      occurredAt: input.occurredAt,
    },
  })
}
