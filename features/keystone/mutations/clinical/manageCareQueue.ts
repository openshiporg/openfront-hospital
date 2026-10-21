import { createHash, randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import type { Context } from '.keystone/types'
import {
  lockTransitionOperation,
  recordTransition,
  replayTransition,
  transitionEvidence,
} from '../transitionEvidence'
import { calendarDateInTimeZone } from '../scheduling/facilityTime'
import { lockProviderSchedule } from '../scheduling/schedulePolicy'
import { currentEpisodeActor, guardEpisodeChild, lockEpisodeFacility, lockEpisodePatientProvider } from './episodeFence'

function requireOperator(context: Context) {
  const role = context.session?.data.role
  if (!role?.canManageAppointments && !role?.canManagePatients && !role?.canAccessAllClinicalData) {
    throw new Error('Not authorized to manage the care queue')
  }
}

function cleanKey(value: string) {
  const key = String(value ?? '').trim()
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{15,199}$/.test(key)) throw new Error('Queue idempotency key is invalid')
  return key
}

function digest(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function queueResult(row: any, replayed: boolean) {
  return {
    id: row.id,
    ticketNumber: row.ticketNumber,
    status: row.status,
    priority: row.priority,
    reasonCode: row.reasonCode,
    queueDate: row.queueDate,
    queuePosition: row.queuePosition,
    transitionVersion: row.transitionVersion,
    arrivedAt: row.arrivedAt instanceof Date ? row.arrivedAt : new Date(row.arrivedAt),
    calledAt: row.calledAt ? (row.calledAt instanceof Date ? row.calledAt : new Date(row.calledAt)) : null,
    completedAt: row.completedAt ? (row.completedAt instanceof Date ? row.completedAt : new Date(row.completedAt)) : null,
    replayed,
  }
}

export async function arriveAppointment(
  _root: unknown,
  args: { appointmentId: string; idempotencyKey: string; reasonCode?: string },
  context: Context,
) {
  requireOperator(context)
  const operationKey = cleanKey(args.idempotencyKey)
  const evidence = transitionEvidence(operationKey, {
    appointmentId: args.appointmentId,
    toStatus: 'checked_in',
    reasonCode: args.reasonCode ?? 'scheduled_visit',
  })
  const keyHash = evidence.operationKeyHash
  const requestHash = digest(JSON.stringify({
    appointmentId: args.appointmentId,
    reasonCode: args.reasonCode ?? 'scheduled_visit',
  }))
  const scoped = await context.query.Appointment.findOne({
    where: { id: args.appointmentId },
    query: 'id status patient { id } facility { id timeZone } provider { id }',
  }) as any
  if (!scoped?.patient?.id || !scoped?.facility?.id || !scoped.facility.timeZone) {
    throw new Error('Appointment not found, unscoped, or facility time zone is unavailable')
  }

  return context.transaction(async (transactionContext: any) => {
    // Keystone 6.5 declares `isolationLevel` as the enum object while Prisma expects the
    // string, so set it as the transaction's first statement (as in labResultRecovery.ts).
    await transactionContext.prisma.$executeRaw(Prisma.sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`)
    const currentContext = await currentEpisodeActor(transactionContext, 'queue')
    await lockEpisodeFacility(currentContext, scoped.facility.id, scoped.provider?.id)
    await lockEpisodePatientProvider(currentContext, scoped.facility.id, scoped.patient.id, scoped.provider?.id)
    await currentContext.prisma.$queryRaw(Prisma.sql`SELECT "id" FROM "Appointment" WHERE "id" = ${args.appointmentId} FOR UPDATE`)
    const currentAppointment = await currentContext.query.Appointment.findOne({ where: { id: args.appointmentId }, query: 'id patient { id } provider { id } facility { id timeZone }' })
    if (currentAppointment?.patient?.id !== scoped.patient.id || currentAppointment?.provider?.id !== scoped.provider?.id || currentAppointment?.facility?.id !== scoped.facility.id || currentAppointment.facility.timeZone !== scoped.facility.timeZone) throw new Error('Arrival scope changed; refresh before retrying')
    const sudo = currentContext.sudo()
    await lockTransitionOperation(sudo.prisma, keyHash)
    await lockProviderSchedule(sudo.prisma, scoped.provider?.id || `appointment:${args.appointmentId}`)
    await sudo.prisma.$queryRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`care-queue:${args.appointmentId}`}, 0))::text AS "lock"`,
    )

    const existing = await sudo.prisma.careQueueTicket.findFirst({ where: { appointmentId: args.appointmentId } })
    if (existing) {
      if (existing.idempotencyKeyHash !== keyHash || existing.requestHash !== requestHash || existing.actorReference !== currentContext.session.itemId) {
        throw new Error('Appointment already has a queue ticket from a different arrival operation')
      }
      return queueResult(existing, true)
    }

    const priorTransition = await replayTransition(sudo.prisma, evidence, 'appointment', args.appointmentId)
    const appointment = await sudo.prisma.appointment.findUnique({ where: { id: args.appointmentId } })
    if (!appointment || !['confirmed', 'checked_in'].includes(appointment.status)) {
      throw new Error('Only confirmed or already checked-in appointments can enter the care queue')
    }
    const now = new Date()
    const facilityTimeZone = scoped.facility.timeZone
    const queueDate = calendarDateInTimeZone(now, facilityTimeZone)
    await sudo.prisma.$queryRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`care-queue-position:${scoped.facility.id}:${queueDate}`}, 0))::text AS "lock"`,
    )
    const lastTicket = await sudo.prisma.careQueueTicket.findFirst({
      where: { facilityId: scoped.facility.id, queueDate },
      orderBy: { queuePosition: 'desc' },
      select: { queuePosition: true },
    })
    const queuePosition = Number(lastTicket?.queuePosition || 0) + 1

    let checkedIn = appointment
    let appointmentAudit: any = null
    let appointmentOutbox: any = null
    if (!priorTransition) {
      checkedIn = await sudo.prisma.appointment.update({
        where: { id: appointment.id },
        data: {
          status: 'checked_in',
          ...(appointment.status === 'confirmed' ? { checkInAt: now } : {}),
          transitionVersion: { increment: 1 },
        },
      })
      const eventType = appointment.status === 'confirmed' ? 'appointment.checked_in' : 'appointment.arrival_reconciled'
      const metadata = {
        source: 'care_queue_arrival', aggregateType: 'appointment', aggregateId: appointment.id,
        fromStatus: appointment.status, status: 'checked_in', transitionVersion: checkedIn.transitionVersion,
        queueDate, arrivalReconciled: appointment.status === 'checked_in',
      }
      appointmentAudit = await sudo.prisma.clinicalAuditLog.create({ data: {
        eventType, occurredAt: now, actorType: 'staff_user', actorReference: context.session?.itemId || '',
        facilityId: appointment.facilityId, patientId: appointment.patientId, appointmentId: appointment.id,
        metadata, createdAt: now,
      } })
      appointmentOutbox = await sudo.prisma.clinicalOutboxEvent.create({ data: {
        eventKey: `appointment:${appointment.id}:v${checkedIn.transitionVersion}:${eventType}`,
        eventType, aggregateType: 'appointment', aggregateId: appointment.id, status: 'recorded', attempts: 0,
        nextAttemptAt: null, facilityId: appointment.facilityId, patientId: appointment.patientId,
        appointmentId: appointment.id, payload: metadata, createdAt: now,
      } })
    }

    const ticket = await sudo.query.CareQueueTicket.createOne({
      data: {
        ticketNumber: `QUEUE-${randomUUID()}`,
        priority: 'routine',
        reasonCode: args.reasonCode ?? 'scheduled_visit',
        queueDate,
        queuePosition,
        idempotencyKeyHash: keyHash,
        requestHash,
        arrivedAt: appointment.checkInAt || now,
        facility: { connect: { id: scoped.facility.id } },
        patient: { connect: { id: scoped.patient.id } },
        appointment: { connect: { id: appointment.id } },
      },
      query: 'id ticketNumber status priority reasonCode queueDate queuePosition transitionVersion arrivedAt calledAt completedAt',
    })

    if (!priorTransition) {
      await recordTransition(sudo.prisma, {
        evidence,
        aggregateType: 'appointment',
        aggregateId: appointment.id,
        fromStatus: appointment.status,
        toStatus: 'checked_in',
        fromVersion: appointment.transitionVersion,
        toVersion: checkedIn.transitionVersion,
        actorReference: context.session?.itemId || '',
        facilityId: appointment.facilityId,
        patientId: appointment.patientId,
        auditLogId: appointmentAudit.id,
        outboxEventId: appointmentOutbox.id,
        result: {
          id: checkedIn.id, appointmentNumber: checkedIn.appointmentNumber,
          fromStatus: appointment.status, status: 'checked_in', transitionVersion: checkedIn.transitionVersion,
          startsAt: checkedIn.startsAt, endsAt: checkedIn.endsAt, checkInAt: checkedIn.checkInAt || now,
          completedAt: checkedIn.completedAt || null, cancellationReason: checkedIn.cancellationReason || null,
          replayed: false,
        },
        occurredAt: now,
      })
    } else if (appointment.status === 'checked_in') {
      const metadata = { source: 'care_queue_arrival_reconciliation', aggregateId: appointment.id, ticketId: ticket.id, status: 'checked_in' }
      await sudo.prisma.clinicalAuditLog.create({ data: {
        eventType: 'appointment.arrival_reconciled', occurredAt: now, actorType: 'staff_user',
        actorReference: context.session?.itemId || '', facilityId: appointment.facilityId,
        patientId: appointment.patientId, appointmentId: appointment.id, metadata, createdAt: now,
      } })
    }
    return queueResult(ticket, false)
  }, { timeout: 30_000 })
}

export async function transitionCareQueue(
  _root: unknown,
  args: { operationKey: string; ticketId: string; toStatus: string; expectedVersion: number; encounterId?: string },
  context: Context,
) {
  requireOperator(context)
  if (!Number.isInteger(args.expectedVersion) || args.expectedVersion < 1) {
    throw new Error('Expected queue version is invalid')
  }
  const evidence = transitionEvidence(args.operationKey, {
    ticketId: args.ticketId,
    toStatus: args.toStatus,
    expectedVersion: args.expectedVersion,
    encounterId: args.encounterId || null,
  })
  const scoped = await context.query.CareQueueTicket.findOne({
    where: { id: args.ticketId },
    query: 'id status transitionVersion patient { id } facility { id } encounter { id }',
  }) as any
  if (!scoped?.patient?.id || !scoped?.facility?.id) throw new Error('Queue ticket not found or not accessible')

  const encounterId = args.encounterId
  if (encounterId) {
    const encounter = await context.query.Encounter.findOne({
      where: { id: encounterId },
      query: 'id status patient { id } facility { id }',
    }) as any
    if (
      !encounter ||
      encounter.status !== 'in_progress' ||
      encounter.patient?.id !== scoped.patient.id ||
      encounter.facility?.id !== scoped.facility.id
    ) {
      throw new Error('Encounter must be in progress for the queue patient and facility')
    }
  }

  return context.transaction(async (transactionContext: any) => {
    // Keystone 6.5 declares `isolationLevel` as the enum object while Prisma expects the
    // string, so set it as the transaction's first statement (as in labResultRecovery.ts).
    await transactionContext.prisma.$executeRaw(Prisma.sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`)
    const currentContext = await currentEpisodeActor(transactionContext, 'queue')
    const visible = await currentContext.query.CareQueueTicket.findOne({ where: { id: args.ticketId }, query: 'id patient { id } facility { id } encounter { id } appointment { id provider { id } }' })
    if (visible?.patient?.id !== scoped.patient.id || visible?.facility?.id !== scoped.facility.id) throw new Error('Current queue scope is unavailable')
    await lockEpisodeFacility(currentContext, visible.facility.id, visible.appointment?.provider?.id)
    await lockEpisodePatientProvider(currentContext, visible.facility.id, visible.patient.id, visible.appointment?.provider?.id)
    const sudo = currentContext.sudo()
    await sudo.prisma.$queryRaw(Prisma.sql`SELECT "id" FROM "CareQueueTicket" WHERE "id" = ${args.ticketId} FOR UPDATE`)
    const prior = await sudo.prisma.workflowTransition.findUnique({ where: { operationKeyHash: evidence.operationKeyHash }, select: { actorReference: true } })
    if (prior && prior.actorReference !== currentContext.session.itemId) throw new Error('Original queue operation is not owned')
    const linkedEncounterId = encounterId || visible.encounter?.id
    if (args.toStatus === 'in_care' && linkedEncounterId) {
      await guardEpisodeChild(currentContext, { facilityId: visible.facility.id, patientId: visible.patient.id, encounterId: linkedEncounterId }, 'new_care', false, Boolean(prior), 'queue')
      if (!prior) {
        const parent = await currentContext.query.Encounter.findOne({ where: { id: linkedEncounterId }, query: 'id status' })
        if (parent?.status !== 'in_progress') throw new Error('Current encounter must be in progress for handoff')
      }
    }
    await lockTransitionOperation(sudo.prisma, evidence.operationKeyHash)
    await sudo.prisma.$queryRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`care-queue-ticket:${args.ticketId}`}, 0))::text AS "lock"`,
    )
    const replay = await replayTransition(sudo.prisma, evidence, 'care_queue', args.ticketId)
    if (replay) return replay
    const current = await sudo.prisma.careQueueTicket.findUnique({ where: { id: args.ticketId } })
    if (!current || current.transitionVersion !== args.expectedVersion) {
      throw new Error('Queue ticket changed; refresh before retrying')
    }
    if (args.toStatus === 'in_care' && !encounterId && !current.encounterId) {
      throw new Error('Encounter is required before handing off into care')
    }

    const updated = await sudo.query.CareQueueTicket.updateOne({
      where: { id: current.id },
      data: {
        status: args.toStatus,
        ...(encounterId ? { encounter: { connect: { id: encounterId } } } : {}),
      },
      query: 'id ticketNumber status priority reasonCode queueDate queuePosition transitionVersion arrivedAt calledAt completedAt',
    })
    const result = queueResult(updated, false)
    const eventType = `queue.${updated.status}`
    const outbox = await sudo.prisma.clinicalOutboxEvent.findUnique({
      where: { eventKey: `queue:${current.id}:v${updated.transitionVersion}:${eventType}` },
      select: { id: true },
    })
    await recordTransition(sudo.prisma, {
      evidence,
      aggregateType: 'care_queue',
      aggregateId: current.id,
      fromStatus: current.status,
      toStatus: updated.status,
      fromVersion: current.transitionVersion,
      toVersion: updated.transitionVersion,
      actorReference: context.session?.itemId || '',
      facilityId: current.facilityId,
      patientId: current.patientId,
      outboxEventId: outbox?.id,
      result,
      occurredAt: new Date(),
    })
    return result
  }, { timeout: 30_000 })
}
