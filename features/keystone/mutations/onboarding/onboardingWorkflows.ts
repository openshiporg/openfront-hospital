import { randomUUID } from 'node:crypto'
import type { Context } from '.keystone/types'
import { createDeliverableIntakeAccessToken, deliverableIntakeAccessToken, verifyIntakeAccessToken } from '../../security/intakeAccess'
import { inspectProviderWindow, lockProviderSchedule, normalizeAppointmentTypePolicy } from '../scheduling/schedulePolicy'
import { appendAuditAndOutbox, bounded, lockOperation, operationEvidence, scopedFacilityPatient } from '../operational/evidence'

function requireOnboarding(context: Context) {
  const role = context.session?.data.role
  if ((!role?.canManageOnboarding || !role?.canManagePatients || !role?.canManageAppointments) && !role?.canAccessAllClinicalData) {
    throw new Error('Not authorized to apply hospital onboarding records')
  }
}

export async function createOnboardingAppointment(_root: unknown, { data }: any, context: Context) {
  requireOnboarding(context)
  await scopedFacilityPatient(context, data.facilityId, data.patientId)
  const [provider, appointmentType] = await Promise.all([
    context.query.Provider.findOne({ where: { id: data.providerId }, query: 'id status facilities { id }' }),
    context.query.AppointmentType.findOne({ where: { id: data.appointmentTypeId }, query: 'id name status durationMinutes bufferBeforeMinutes bufferAfterMinutes providers { id }' }),
  ]) as any[]
  if (provider?.status !== 'active' || !provider.facilities?.some((item: any) => item.id === data.facilityId)) throw new Error('Provider is not active in the onboarding facility')
  if (appointmentType?.status !== 'bookable' || !appointmentType.providers?.some((item: any) => item.id === data.providerId)) throw new Error('Appointment type is not bookable for the provider')
  const appointmentTypePolicy = normalizeAppointmentTypePolicy(appointmentType)
  const appointmentNumber = bounded(data.appointmentNumber, 'Appointment number', 100, true)
  const startsAt = new Date(data.startsAt)
  const endsAt = new Date(data.endsAt)
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) throw new Error('Appointment window is invalid')
  if (endsAt.getTime() !== startsAt.getTime() + appointmentTypePolicy.durationMinutes * 60_000) {
    throw new Error('Appointment window must match the appointment type duration')
  }
  if (!['requested', 'confirmed'].includes(data.status)) throw new Error('Onboarding appointments must start requested or confirmed')
  const input = { ...data, appointmentNumber, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() }
  const evidence = operationEvidence(input)

  return context.transaction(async (transactionContext: any) => {
    const prisma = transactionContext.sudo().prisma
    await lockOperation(prisma, 'onboarding-appointment', evidence.operationKeyHash)
    const existing = await prisma.appointment.findUnique({ where: { appointmentNumber } })
    if (existing) {
      const sameScope = existing.facilityId === data.facilityId && existing.patientId === data.patientId &&
        existing.providerId === data.providerId && existing.appointmentTypeId === data.appointmentTypeId
      if (!sameScope) throw new Error('Onboarding appointment number already exists with different scope')
      const sameWindow = existing.startsAt.getTime() === startsAt.getTime() && existing.endsAt.getTime() === endsAt.getTime()
      if (!sameWindow && data.reconcileSchedule === true && ['requested', 'confirmed'].includes(existing.status)) {
        await lockProviderSchedule(prisma, data.providerId)
        const schedule = await inspectProviderWindow(prisma, {
          providerId: data.providerId,
          facilityId: data.facilityId,
          startsAt,
          endsAt,
          bufferBeforeMinutes: appointmentTypePolicy.bufferBeforeMinutes,
          bufferAfterMinutes: appointmentTypePolicy.bufferAfterMinutes,
          excludeAppointmentId: existing.id,
        })
        if (!schedule.withinAvailability || schedule.hasConflict) throw new Error('Onboarding appointment cannot be reconciled to the refreshed schedule')
        const updated = await prisma.appointment.update({
          where: { id: existing.id },
          data: {
            startsAt,
            endsAt,
            locationName: bounded(data.locationName, 'Location name', 300),
            reasonForVisit: bounded(data.reasonForVisit, 'Reason for visit', 2000),
            bookingLockKey: `onboarding:${appointmentNumber}:${startsAt.toISOString()}`,
            transitionVersion: { increment: 1 },
          },
        })
        await appendAuditAndOutbox(prisma, {
          eventKey: `appointment:${updated.id}:v${updated.transitionVersion}:schedule_reconciled`,
          eventType: 'appointment.schedule_reconciled',
          aggregateType: 'appointment',
          aggregateId: updated.id,
          facilityId: updated.facilityId,
          patientId: updated.patientId,
          actorReference: context.session!.itemId,
          metadata: { source: 'onboarding_reconciliation', aggregateId: updated.id, status: updated.status, transitionVersion: updated.transitionVersion },
          occurredAt: new Date(),
        })
        return { id: updated.id, appointmentNumber: updated.appointmentNumber, status: updated.status, transitionVersion: updated.transitionVersion, replayed: false }
      }
      return { id: existing.id, appointmentNumber: existing.appointmentNumber, status: existing.status, transitionVersion: existing.transitionVersion, replayed: true }
    }
    await lockProviderSchedule(prisma, data.providerId)
    const schedule = await inspectProviderWindow(prisma, {
      providerId: data.providerId, facilityId: data.facilityId, startsAt, endsAt,
      bufferBeforeMinutes: appointmentTypePolicy.bufferBeforeMinutes,
      bufferAfterMinutes: appointmentTypePolicy.bufferAfterMinutes,
    })
    if (!schedule.withinAvailability || schedule.hasConflict) throw new Error('Onboarding appointment is outside availability or conflicts')
    const now = new Date()
    const appointment = await prisma.appointment.create({ data: {
      appointmentNumber, transitionVersion: 1, status: data.status, source: 'front_desk',
      bookingLockKey: `${data.providerId}:${startsAt.toISOString()}`, startsAt, endsAt,
      locationName: bounded(data.locationName, 'Location name', 300), reasonForVisit: bounded(data.reasonForVisit, 'Reason for visit', 2000),
      facilityId: data.facilityId, patientId: data.patientId, providerId: data.providerId, appointmentTypeId: data.appointmentTypeId,
    } })
    await appendAuditAndOutbox(prisma, { eventKey: `appointment:${appointment.id}:v1:onboarded`, eventType: 'appointment.onboarded',
      aggregateType: 'appointment', aggregateId: appointment.id, facilityId: appointment.facilityId, patientId: appointment.patientId,
      actorReference: context.session!.itemId, metadata: { source: 'onboarding_workflow', aggregateId: appointment.id, status: appointment.status, transitionVersion: 1 }, occurredAt: now })
    return { id: appointment.id, appointmentNumber: appointment.appointmentNumber, status: appointment.status, transitionVersion: 1, replayed: false }
  }, { timeout: 30_000 })
}

export async function issueIntakeForm(_root: unknown, { data }: any, context: Context) {
  requireOnboarding(context)
  await scopedFacilityPatient(context, data.facilityId, data.patientId)
  const appointment = await context.query.Appointment.findOne({ where: { id: data.appointmentId }, query: 'id facility { id } patient { id }' }) as any
  if (!appointment || appointment.facility?.id !== data.facilityId || appointment.patient?.id !== data.patientId) throw new Error('Appointment does not match the intake scope')
  const title = bounded(data.title || 'Pre-visit intake', 'Intake title', 300, true)
  const templateKey = bounded(data.templateKey || 'pre_visit', 'Template key', 100, true)
  const input = { ...data, title, templateKey }
  const evidence = operationEvidence(input)
  return context.transaction(async (transactionContext: any) => {
    const prisma = transactionContext.sudo().prisma
    await lockOperation(prisma, 'intake-issue', evidence.operationKeyHash)
    const byOperation = await prisma.intakeForm.findUnique({ where: { operationKeyHash: evidence.operationKeyHash } })
    const replayProjection = async (row: any) => {
      if (row.accessUsedAt || row.accessRevokedAt || ['submitted', 'reviewed'].includes(row.status)) {
        return { id: row.id, status: row.status, transitionVersion: row.transitionVersion, accessCode: null, accessExpiresAt: row.accessExpiresAt, replayed: true }
      }
      let expiresAt = row.accessExpiresAt ? new Date(row.accessExpiresAt) : new Date(0)
      let access = expiresAt > new Date() ? deliverableIntakeAccessToken(row.id, expiresAt) : null
      if (!access || !verifyIntakeAccessToken(access.token, row.accessCodeHash)) {
        access = createDeliverableIntakeAccessToken(row.id)
        expiresAt = access.expiresAt
        row = await prisma.intakeForm.update({ where: { id: row.id }, data: {
          accessCodeHash: access.tokenHash,
          accessExpiresAt: access.expiresAt,
          accessUsedAt: null,
          accessRevokedAt: null,
        } })
        await appendAuditAndOutbox(prisma, {
          eventKey: `intake:${row.id}:v${row.transitionVersion}:access_rotated:${Math.floor(expiresAt.getTime() / 1_000)}`,
          eventType: 'intake.access_rotated',
          aggregateType: 'intake_form',
          aggregateId: row.id,
          facilityId: row.facilityId,
          patientId: row.patientId,
          actorReference: context.session!.itemId,
          metadata: { source: 'onboarding_reconciliation', aggregateId: row.id, status: row.status, transitionVersion: row.transitionVersion },
          occurredAt: new Date(),
        })
      }
      return { id: row.id, status: row.status, transitionVersion: row.transitionVersion, accessCode: access.token, accessExpiresAt: expiresAt, replayed: true }
    }
    if (byOperation) {
      if (byOperation.requestHash !== evidence.requestHash) throw new Error('Operation key was reused with a different payload')
      return replayProjection(byOperation)
    }
    const existing = await prisma.intakeForm.findFirst({ where: { appointmentId: data.appointmentId, templateKey } })
    if (existing) return replayProjection(existing)
    const intakeId = randomUUID()
    const access = createDeliverableIntakeAccessToken(intakeId)
    const now = new Date()
    const intake = await prisma.intakeForm.create({ data: {
      id: intakeId,
      ...evidence,
      title, templateKey, status: 'not_sent', transitionVersion: 1,
      accessCodeHash: access.tokenHash, accessExpiresAt: access.expiresAt,
      facilityId: data.facilityId, patientId: data.patientId, appointmentId: data.appointmentId,
      formSchema: data.formSchema || { sections: ['contact', 'reason_for_visit', 'insurance'] },
    } })
    await appendAuditAndOutbox(prisma, { eventKey: `intake:${intake.id}:v1:issued`, eventType: 'intake.issued',
      aggregateType: 'intake_form', aggregateId: intake.id, facilityId: intake.facilityId, patientId: intake.patientId,
      actorReference: context.session!.itemId, metadata: { source: 'intake_issue_workflow', aggregateId: intake.id, status: intake.status, transitionVersion: 1 }, occurredAt: now })
    return { id: intake.id, status: intake.status, transitionVersion: 1, accessCode: access.token, accessExpiresAt: access.expiresAt, replayed: false }
  }, { timeout: 30_000 })
}
