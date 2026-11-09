import { Prisma } from '@prisma/client'
import type { Context } from '.keystone/types'

import { enforcePublicIntakeRateLimit } from '../../security/publicIntakeRateLimit'
import { createVisitAccessToken, verifyVisitAccessToken } from '../../security/visitAccess'
import { lockProviderSchedule } from '../scheduling/schedulePolicy'
import { providerDisplayName } from '../intake/getIntakeFormByAccessCode'
import { HospitalRefusal } from '../../lib/constraint-errors'

// Patient self-service for one visit, as patient portals do (MyChart "Appointments", Zocdoc "Manage appointment"):
// look the visit up from the receipt link, or with the request number and date of birth, see its status, and cancel
// it before it starts. A cancel releases the slot immediately and lands in the clinic's audit trail and inbox.

const ACTIVE = new Set(['requested', 'confirmed'])
const NUMBER_PATTERN = /^APT-[A-Z0-9-]{6,60}$/i

type LookupArgs = { accessToken?: string | null; appointmentNumber?: string | null; dateOfBirth?: string | null }

async function findVisit(context: Context, args: LookupArgs) {
  const prisma = context.sudo().prisma as any
  const capability = args.accessToken || `${args.appointmentNumber ?? ''}:${args.dateOfBirth ?? ''}`
  await enforcePublicIntakeRateLimit(context, `visit:${capability}`, 'lookup')
  let appointment: any = null
  const include = { provider: true, appointmentType: true, facility: { select: { name: true, timeZone: true, phone: true, addressLine1: true, city: true } }, patient: { select: { dateOfBirth: true } } }
  if (args.accessToken) {
    const id = verifyVisitAccessToken(args.accessToken)
    if (id) appointment = await prisma.appointment.findUnique({ where: { id }, include })
  } else {
    const number = String(args.appointmentNumber ?? '').trim().toUpperCase()
    const dob = String(args.dateOfBirth ?? '').trim()
    if (NUMBER_PATTERN.test(number) && /^\d{4}-\d{2}-\d{2}$/.test(dob)) {
      const match = await prisma.appointment.findUnique({ where: { appointmentNumber: number }, include })
      if (match?.patient?.dateOfBirth && new Date(match.patient.dateOfBirth).toISOString().slice(0, 10) === dob) appointment = match
    }
  }
  return appointment
}

function serialize(appointment: any, accessToken: string) {
  const startsAt = new Date(appointment.startsAt)
  return {
    appointmentNumber: appointment.appointmentNumber,
    status: appointment.status,
    startsAt: appointment.startsAt,
    endsAt: appointment.endsAt,
    facilityName: appointment.facility?.name || appointment.locationName || '',
    facilityTimeZone: appointment.facility?.timeZone || 'UTC',
    facilityPhone: appointment.facility?.phone || '',
    facilityAddress: [appointment.facility?.addressLine1, appointment.facility?.city].filter(Boolean).join(', '),
    providerName: providerDisplayName(appointment.provider) || '',
    visitTypeName: appointment.appointmentType?.name || '',
    canCancel: ACTIVE.has(appointment.status) && startsAt.getTime() > Date.now(),
    accessToken,
  }
}

export async function patientVisit(_root: unknown, args: LookupArgs, context: Context) {
  const appointment = await findVisit(context, args)
  if (!appointment) return null
  return serialize(appointment, args.accessToken && verifyVisitAccessToken(args.accessToken) === appointment.id ? args.accessToken : createVisitAccessToken(appointment.id))
}

export async function cancelPatientVisit(_root: unknown, args: { accessToken: string; reason?: string | null }, context: Context) {
  const id = verifyVisitAccessToken(args.accessToken)
  if (!id) throw new HospitalRefusal('This visit link is not valid. Look the visit up again.')
  await enforcePublicIntakeRateLimit(context, `visit:${args.accessToken}`, 'submit')
  const reason = String(args.reason ?? '').trim().slice(0, 300) || 'Cancelled by the patient online.'
  const prisma = context.sudo().prisma as any
  const outcome = await prisma.$transaction(async (tx: any) => {
    await tx.$executeRaw(Prisma.sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`)
    const current = await tx.appointment.findUnique({ where: { id }, select: { id: true, status: true, providerId: true, startsAt: true, transitionVersion: true, facilityId: true, patientId: true } })
    if (!current) throw new HospitalRefusal('This visit link is not valid. Look the visit up again.')
    if (current.status === 'cancelled') return { changed: false }
    if (!ACTIVE.has(current.status) || current.startsAt.getTime() <= Date.now()) throw new HospitalRefusal('This visit can no longer be cancelled online. Call the clinic.')
    await lockProviderSchedule(tx, current.providerId)
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Appointment" WHERE "id" = ${id} FOR UPDATE`)
    const now = new Date()
    const nextVersion = current.transitionVersion + 1
    // Same release as a staff cancellation: terminal state frees the booking lock so the slot is bookable again.
    const updated = await tx.appointment.updateMany({
      where: { id, transitionVersion: current.transitionVersion, status: current.status },
      data: { status: 'cancelled', transitionVersion: nextVersion, cancellationReason: reason, bookingLockKey: `released:${id}:${now.getTime()}` },
    })
    if (updated.count !== 1) throw new HospitalRefusal('This visit just changed. Look it up again.')
    const metadata = { source: 'patient_self_service', aggregateType: 'appointment', aggregateId: id, fromStatus: current.status, status: 'cancelled', transitionVersion: nextVersion, reasonProvided: true }
    await tx.clinicalAuditLog.create({ data: { eventType: 'appointment.cancelled', occurredAt: now, actorType: 'patient_self_service', actorReference: '', facilityId: current.facilityId, patientId: current.patientId, appointmentId: id, metadata } })
    return { changed: true }
  }, { timeout: 30_000 })
  const appointment = await findVisit(context, { accessToken: args.accessToken })
  return appointment ? serialize(appointment, args.accessToken) : null
}
