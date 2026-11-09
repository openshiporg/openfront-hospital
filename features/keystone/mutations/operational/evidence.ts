import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import type { Context } from '.keystone/types'
import { HospitalRefusal } from '../../lib/constraint-errors'

const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,199}$/

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

export function hash(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

export function operationEvidence(input: Record<string, unknown>) {
  const operationKey = String(input.operationKey ?? '').trim()
  if (!KEY_PATTERN.test(operationKey)) throw new HospitalRefusal('Operation key is invalid')
  const { operationKey: _operationKey, ...payload } = input
  return { operationKeyHash: hash(operationKey), requestHash: hash(canonical(payload)) }
}

export function bounded(value: unknown, label: string, max: number, required = false) {
  const text = String(value ?? '').trim()
  if ((required && !text) || text.length > max || /[\u0000-\u001f\u007f]/.test(text)) {
    throw new HospitalRefusal(`${label} is invalid`)
  }
  return text
}

export function requireSafeCents(value: unknown, label: string, allowZero = false) {
  if (!Number.isSafeInteger(value) || Number(value) < (allowZero ? 0 : 1)) {
    throw new HospitalRefusal(`${label} must be ${allowZero ? 'non-negative' : 'positive'} integer cents`)
  }
  return Number(value)
}

export async function lockOperation(tx: any, namespace: string, operationKeyHash: string) {
  await tx.$queryRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${namespace}:${operationKeyHash}`}, 0))::text AS "lock"`,
  )
}

export async function scopedFacilityPatient(context: Context, facilityId: string, patientId: string) {
  const [facility, patient] = await Promise.all([
    context.query.Facility.findOne({ where: { id: facilityId }, query: 'id status' }),
    context.query.Patient.findOne({ where: { id: patientId }, query: 'id status facilities { id }' }),
  ]) as any[]
  if (
    !facility || facility.status !== 'active' || patient?.status !== 'active' ||
    !patient?.facilities?.some((item: { id: string }) => item.id === facilityId)
  ) {
    throw new HospitalRefusal('Facility or patient not found or not accessible')
  }
  return { facility, patient }
}

export async function appendAudit(tx: any, input: {
  eventType: string
  aggregateType: string
  aggregateId: string
  facilityId: string
  patientId?: string | null
  actorReference: string
  metadata: Record<string, unknown>
  occurredAt?: Date
}) {
  const occurredAt = input.occurredAt || new Date()
  if (JSON.stringify(input.metadata).length > 8_000) throw new HospitalRefusal('Event metadata is too large')
  const audit = await tx.clinicalAuditLog.create({
    data: {
      eventType: input.eventType,
      occurredAt,
      actorType: 'staff_user',
      actorReference: input.actorReference,
      facilityId: input.facilityId,
      patientId: input.patientId || null,
      metadata: input.metadata,
      createdAt: occurredAt,
    },
  })
  return { audit }
}
