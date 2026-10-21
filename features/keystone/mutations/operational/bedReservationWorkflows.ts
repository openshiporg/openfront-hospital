import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import type { Context } from '.keystone/types'
import { lockTransitionOperation, recordTransition, replayTransition, transitionEvidence } from '../transitionEvidence'
import { appendAuditAndOutbox, bounded, lockOperation, operationEvidence, scopedFacilityPatient } from './evidence'

function requireBeds(context: Context) {
  const role = context.session?.data.role
  if (!role?.canManagePatients && !role?.canAccessAllClinicalData) throw new Error('Not authorized to reserve beds')
}

function result(row: any, replayed = false) {
  return { id: row.id, status: row.status, transitionVersion: row.transitionVersion, replayed }
}

export async function reserveBed(_root: unknown, { data }: any, context: Context) {
  requireBeds(context)
  await scopedFacilityPatient(context, data.facilityId, data.patientId)
  if (!Number.isInteger(data.expectedBedVersion) || data.expectedBedVersion < 1) throw new Error('Expected bed version is invalid')
  const bed = await context.query.Bed.findOne({ where: { id: data.bedId }, query: 'id facility { id }' }) as any
  if (!bed || bed.facility?.id !== data.facilityId) throw new Error('Bed not found in the accessible facility')
  const expiresAt = new Date(data.expiresAt)
  const now = new Date()
  if (Number.isNaN(expiresAt.getTime()) || expiresAt <= now || expiresAt.getTime() > now.getTime() + 24 * 60 * 60_000) {
    throw new Error('Bed reservation expiry must be within the next 24 hours')
  }
  const reasonCode = bounded(data.reasonCode, 'Reservation reason', 80, true)
  const evidence = operationEvidence({ ...data, expiresAt: expiresAt.toISOString(), reasonCode })
  return context.transaction(async (transactionContext: any) => {
    const prisma = transactionContext.sudo().prisma
    await lockOperation(prisma, 'bed-reservation-create', evidence.operationKeyHash)
    const replay = await prisma.bedReservation.findUnique({ where: { operationKeyHash: evidence.operationKeyHash } })
    if (replay) { if (replay.requestHash !== evidence.requestHash) throw new Error('Operation key was reused with a different payload'); return result(replay, true) }
    await prisma.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`bed:${data.bedId}`}, 0))::text AS "lock"`)
    const currentBed = await prisma.bed.findUnique({ where: { id: data.bedId } })
    if (!currentBed || currentBed.facilityId !== data.facilityId || currentBed.transitionVersion !== data.expectedBedVersion) {
      throw new Error('Bed changed; refresh before retrying')
    }
    const prior = await prisma.bedReservation.findFirst({ where: { bedId: data.bedId, status: 'active' } })
    if (prior && prior.expiresAt <= now) {
      const expired = await prisma.bedReservation.update({ where: { id: prior.id }, data: { status: 'expired', transitionVersion: { increment: 1 }, releasedAt: now, actorReference: context.session!.itemId } })
      await appendAuditAndOutbox(prisma, {
        eventKey: `bed_reservation:${expired.id}:v${expired.transitionVersion}:expired`, eventType: 'bed_reservation.expired',
        aggregateType: 'bed_reservation', aggregateId: expired.id, facilityId: expired.facilityId, patientId: expired.patientId,
        actorReference: context.session!.itemId,
        metadata: { source: 'bed_reservation_workflow', aggregateId: expired.id, bedId: expired.bedId, fromStatus: prior.status, status: expired.status, transitionVersion: expired.transitionVersion },
        occurredAt: now,
      })
    } else if (prior) {
      throw new Error('Bed already has an active reservation')
    }
    if (!['available', ...(prior && prior.expiresAt <= now ? ['reserved'] : [])].includes(currentBed.status) || currentBed.currentPatientId) {
      throw new Error('Bed is not available for reservation')
    }
    const reservation = await prisma.bedReservation.create({ data: {
      reservationNumber: `BEDHOLD-${randomUUID()}`, status: 'active', transitionVersion: 1, ...evidence,
      facilityId: data.facilityId, patientId: data.patientId, bedId: data.bedId,
      actorReference: context.session!.itemId, reasonCode, expiresAt,
    } })
    await prisma.bed.update({ where: { id: currentBed.id }, data: { status: 'reserved', transitionVersion: { increment: 1 } } })
    await appendAuditAndOutbox(prisma, { eventKey: `bed_reservation:${reservation.id}:v1:active`, eventType: 'bed_reservation.active',
      aggregateType: 'bed_reservation', aggregateId: reservation.id, facilityId: reservation.facilityId, patientId: reservation.patientId,
      actorReference: context.session!.itemId, metadata: { source: 'bed_reservation_workflow', aggregateId: reservation.id, bedId: reservation.bedId, status: reservation.status, transitionVersion: 1 }, occurredAt: now })
    return result(reservation)
  }, { timeout: 30_000 })
}

export async function releaseBedReservation(_root: unknown, args: any, context: Context) {
  requireBeds(context)
  const scoped = await context.query.BedReservation.findOne({ where: { id: args.reservationId }, query: 'id' })
  if (!scoped) throw new Error('Bed reservation not found or not accessible')
  if (!Number.isInteger(args.expectedVersion) || args.expectedVersion < 1) throw new Error('Expected reservation version is invalid')
  const reasonCode = bounded(args.reasonCode, 'Release reason', 80, true)
  const evidence = transitionEvidence(args.operationKey, { reservationId: args.reservationId, expectedVersion: args.expectedVersion, reasonCode })
  return context.transaction(async (transactionContext: any) => {
    const prisma = transactionContext.sudo().prisma
    await lockTransitionOperation(prisma, evidence.operationKeyHash)
    await prisma.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`bed-reservation:${args.reservationId}`}, 0))::text AS "lock"`)
    const replay = await replayTransition(prisma, evidence, 'bed_reservation', args.reservationId)
    if (replay) return replay
    const current = await prisma.bedReservation.findUnique({ where: { id: args.reservationId } })
    if (!current || current.status !== 'active' || current.transitionVersion !== args.expectedVersion) throw new Error('Bed reservation changed or is no longer active')
    await prisma.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`bed:${current.bedId}`}, 0))::text AS "lock"`)
    const bed = await prisma.bed.findUnique({ where: { id: current.bedId } })
    if (!bed || bed.status !== 'reserved' || bed.currentPatientId) throw new Error('Reserved bed changed; refresh before releasing')
    const now = new Date()
    const updated = await prisma.bedReservation.update({ where: { id: current.id }, data: { status: 'released', transitionVersion: { increment: 1 }, releasedAt: now, reasonCode } })
    await prisma.bed.update({ where: { id: bed.id }, data: { status: 'available', transitionVersion: { increment: 1 } } })
    const events = await appendAuditAndOutbox(prisma, { eventKey: `bed_reservation:${updated.id}:v${updated.transitionVersion}:released`, eventType: 'bed_reservation.released',
      aggregateType: 'bed_reservation', aggregateId: updated.id, facilityId: updated.facilityId, patientId: updated.patientId,
      actorReference: context.session!.itemId, metadata: { source: 'bed_reservation_workflow', aggregateId: updated.id, bedId: updated.bedId, fromStatus: current.status, status: updated.status, transitionVersion: updated.transitionVersion }, occurredAt: now })
    const projected = result(updated)
    await recordTransition(prisma, { evidence, aggregateType: 'bed_reservation', aggregateId: updated.id, fromStatus: current.status, toStatus: updated.status,
      fromVersion: current.transitionVersion, toVersion: updated.transitionVersion, actorReference: context.session!.itemId,
      facilityId: updated.facilityId, patientId: updated.patientId, auditLogId: events.audit.id, outboxEventId: events.outbox.id,
      result: projected, occurredAt: now })
    return projected
  }, { timeout: 30_000 })
}
