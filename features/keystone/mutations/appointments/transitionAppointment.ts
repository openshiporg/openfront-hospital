import { Prisma } from '@prisma/client'
import { currentEpisodeActor, lockEpisodeFacility, lockEpisodePatientProvider } from '../clinical/episodeFence'
import type { Context } from '.keystone/types'
import { inspectProviderWindow, lockProviderSchedule } from '../scheduling/schedulePolicy'
import {
  lockTransitionOperation,
  recordTransition,
  replayTransition,
  transitionEvidence,
} from '../transitionEvidence'

const TRANSITIONS: Record<string, string[]> = {
  requested: ['confirmed', 'cancelled'],
  confirmed: ['checked_in', 'cancelled', 'no_show'],
  checked_in: ['in_visit', 'cancelled'],
  in_visit: ['completed'],
  completed: [],
  cancelled: [],
  no_show: [],
}

const TERMINAL_STATUSES = new Set(['completed', 'cancelled', 'no_show'])

type Args = {
  operationKey: string
  appointmentId: string
  toStatus: string
  expectedVersion: number
  reason?: string | null
  operationalNotes?: string | null
}

function cleanOptional(value?: string | null, maxLength = 2000) {
  const cleaned = value?.trim()
  if (!cleaned) return null
  if (cleaned.length > maxLength) throw new Error(`Input exceeds the ${maxLength} character limit`)
  return cleaned
}

function requirePermission(context: Context) {
  if (!context.session?.data.role?.canManageAppointments && !context.session?.data.role?.canAccessAllClinicalData) {
    throw new Error('Not authorized to transition appointments')
  }
}

export default async function transitionAppointment(_root: unknown, args: Args, context: Context) {
  requirePermission(context)
  if (args.toStatus === 'checked_in') {
    throw new Error('Appointment check-in must use the atomic care-queue arrival workflow')
  }
  if (!Number.isInteger(args.expectedVersion) || args.expectedVersion < 1) {
    throw new Error('Expected appointment version is invalid')
  }
  const reason = cleanOptional(args.reason, 1000)
  const operationalNotes = cleanOptional(args.operationalNotes, 2000)
  const evidence = transitionEvidence(args.operationKey, {
    appointmentId: args.appointmentId,
    toStatus: args.toStatus,
    expectedVersion: args.expectedVersion,
    reason,
    operationalNotes,
  })
  const scopedAppointment = await context.query.Appointment.findOne({
    where: { id: args.appointmentId },
    query: 'id provider { id }',
  }) as { id: string; provider?: { id: string } | null } | null
  if (!scopedAppointment) throw new Error('Appointment not found or not accessible')

  return context.transaction(async (transactionContext: any) => {
    // Keystone 6.5 declares `isolationLevel` as the enum object while Prisma expects the
    // string, so set it as the transaction's first statement (as in labResultRecovery.ts).
    await transactionContext.prisma.$executeRaw(Prisma.sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`)
    const current = await currentEpisodeActor(transactionContext, 'appointments')
    const scoped = await current.query.Appointment.findOne({ where: { id: args.appointmentId }, query: 'id patient { id } provider { id } facility { id }' })
    if (!scoped?.facility?.id || !scoped.patient?.id || !scoped.provider?.id) throw new Error('Current appointment scope is unavailable')
    await lockEpisodeFacility(current, scoped.facility.id, scoped.provider.id)
    await lockEpisodePatientProvider(current, scoped.facility.id, scoped.patient.id, scoped.provider.id)
    const tx = current.prisma
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Appointment" WHERE "id" = ${args.appointmentId} FOR UPDATE`)
    const visible = await current.query.Appointment.findOne({ where: { id: args.appointmentId }, query: 'id patient { id } provider { id } facility { id }' })
    if (visible?.facility?.id !== scoped.facility.id || visible?.patient?.id !== scoped.patient.id || visible?.provider?.id !== scoped.provider.id) throw new Error('Appointment scope changed')
    const prior = await tx.workflowTransition.findUnique({ where: { operationKeyHash: evidence.operationKeyHash }, select: { actorReference: true } })
    if (prior && prior.actorReference !== current.session.itemId) throw new Error('Original appointment operation is not owned')
    await lockTransitionOperation(tx, evidence.operationKeyHash)
    await lockProviderSchedule(tx, scoped.provider.id)
    const replay = await replayTransition(tx, evidence, 'appointment', args.appointmentId)
    if (replay) return {
      ...replay,
      startsAt: new Date(replay.startsAt),
      endsAt: new Date(replay.endsAt),
      checkInAt: replay.checkInAt ? new Date(replay.checkInAt) : null,
      completedAt: replay.completedAt ? new Date(replay.completedAt) : null,
    }

    const appointment = await tx.appointment.findUnique({
      where: { id: args.appointmentId },
      include: { appointmentType: true },
    })
    if (!appointment || appointment.transitionVersion !== args.expectedVersion) {
      throw new Error('Appointment changed; refresh before retrying')
    }
    if (!TRANSITIONS[appointment.status]?.includes(args.toStatus)) {
      throw new Error(`Invalid appointment transition from ${appointment.status} to ${args.toStatus}`)
    }
    if (args.toStatus === 'cancelled' && !reason) throw new Error('Cancellation reason is required')

    if (args.toStatus === 'confirmed') {
      if (!appointment.providerId) throw new Error('Appointment is missing a provider')
      if (!appointment.facilityId) throw new Error('Appointment is missing a facility')
      const durationMinutes = Number(appointment.appointmentType?.durationMinutes)
      if (!Number.isInteger(durationMinutes) || appointment.endsAt.getTime() !== appointment.startsAt.getTime() + durationMinutes * 60_000) {
        throw new Error('Appointment window must match the appointment type duration')
      }
      const schedule = await inspectProviderWindow(tx, {
        providerId: appointment.providerId,
        facilityId: appointment.facilityId,
        startsAt: appointment.startsAt,
        endsAt: appointment.endsAt,
        bufferBeforeMinutes: Number(appointment.appointmentType?.bufferBeforeMinutes || 0),
        bufferAfterMinutes: Number(appointment.appointmentType?.bufferAfterMinutes || 0),
        excludeAppointmentId: appointment.id,
      })
      if (schedule.hasConflict) {
        throw new Error('Appointment cannot be confirmed because the provider schedule conflicts')
      }
    }

    const now = new Date()
    const nextVersion = appointment.transitionVersion + 1
    const updateData: Record<string, unknown> = {
      status: args.toStatus,
      transitionVersion: nextVersion,
    }
    if (args.toStatus === 'checked_in') updateData.checkInAt = now
    if (args.toStatus === 'completed') updateData.completedAt = now
    if (args.toStatus === 'cancelled') updateData.cancellationReason = reason
    if (operationalNotes) updateData.operationalNotes = operationalNotes
    if (TERMINAL_STATUSES.has(args.toStatus)) {
      updateData.bookingLockKey = `released:${appointment.id}:${now.getTime()}`
    }

    const updated = await tx.appointment.update({ where: { id: appointment.id }, data: updateData })
    const metadata = {
      source: 'appointment_transition',
      aggregateType: 'appointment',
      aggregateId: appointment.id,
      fromStatus: appointment.status,
      status: updated.status,
      transitionVersion: nextVersion,
      reasonProvided: Boolean(reason),
      operationalNotesProvided: Boolean(operationalNotes),
    }
    const eventType = `appointment.${args.toStatus}`
    const audit = await tx.clinicalAuditLog.create({
      data: {
        eventType,
        occurredAt: now,
        actorType: 'staff_user',
        actorReference: context.session?.itemId || '',
        facilityId: appointment.facilityId,
        patientId: appointment.patientId,
        appointmentId: appointment.id,
        metadata,
      },
    })
    const outbox = await tx.clinicalOutboxEvent.create({
      data: {
        eventKey: `appointment:${appointment.id}:v${nextVersion}:${updated.status}`,
        eventType,
        aggregateType: 'appointment',
        aggregateId: appointment.id,
        status: 'recorded',
        attempts: 0,
        nextAttemptAt: null,
        facilityId: appointment.facilityId,
        patientId: appointment.patientId,
        appointmentId: appointment.id,
        payload: metadata,
        createdAt: now,
      },
    })
    const result = {
      id: updated.id,
      appointmentNumber: updated.appointmentNumber,
      fromStatus: appointment.status,
      status: updated.status,
      transitionVersion: updated.transitionVersion,
      startsAt: updated.startsAt,
      endsAt: updated.endsAt,
      checkInAt: updated.checkInAt || null,
      completedAt: updated.completedAt || null,
      cancellationReason: updated.cancellationReason || null,
      replayed: false,
    }
    await recordTransition(tx, {
      evidence,
      aggregateType: 'appointment',
      aggregateId: appointment.id,
      fromStatus: appointment.status,
      toStatus: updated.status,
      fromVersion: appointment.transitionVersion,
      toVersion: updated.transitionVersion,
      actorReference: context.session?.itemId || '',
      facilityId: appointment.facilityId,
      patientId: appointment.patientId,
      auditLogId: audit.id,
      outboxEventId: outbox.id,
      result,
      occurredAt: now,
    })
    return result
  }, { timeout: 30_000 })
}
