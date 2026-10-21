import type { Context } from '.keystone/types'
import { hashIntakeAccessToken, isActiveIntakeAccess } from '../../security/intakeAccess'
import { enforcePublicIntakeRateLimit } from '../../security/publicIntakeRateLimit'

export function patientDisplayName(patient?: { firstName?: string | null; lastName?: string | null } | null) {
  if (!patient) return null
  return `${patient.firstName || ''} ${patient.lastName || ''}`.trim()
}

export function providerDisplayName(provider?: { firstName?: string | null; lastName?: string | null; credentials?: string | null } | null) {
  if (!provider) return null
  const credentials = provider.credentials ? `, ${provider.credentials}` : ''
  return `${provider.firstName || ''} ${provider.lastName || ''}${credentials}`.trim()
}

export function serializePatientIntakeForm(form: any, accessCode: string | null = null) {
  if (!form) return null

  return {
    id: form.id,
    title: form.title,
    status: form.status,
    templateKey: form.templateKey,
    formSchema: form.formSchema,
    submittedAt: form.submittedAt,
    accessCode,
    patient: form.patient
      ? {
          id: form.patient.id,
          displayName: patientDisplayName(form.patient),
          email: form.patient.email,
          phone: form.patient.phone,
          dateOfBirth: form.patient.dateOfBirth,
          preferredContactMethod: form.patient.preferredContactMethod,
          insuranceSummary: form.patient.insuranceSummary,
        }
      : null,
    appointment: form.appointment
      ? {
          id: form.appointment.id,
          appointmentNumber: form.appointment.appointmentNumber,
          status: form.appointment.status,
          startsAt: form.appointment.startsAt,
          endsAt: form.appointment.endsAt,
          reasonForVisit: form.appointment.reasonForVisit,
          facilityName: form.appointment.facility?.name || null,
          facilityTimeZone: form.appointment.facility?.timeZone || 'UTC',
          provider: form.appointment.provider
            ? {
                id: form.appointment.provider.id,
                displayName: providerDisplayName(form.appointment.provider),
                specialty: form.appointment.provider.specialty,
              }
            : null,
          appointmentType: form.appointment.appointmentType
            ? {
                id: form.appointment.appointmentType.id,
                name: form.appointment.appointmentType.name,
                durationMinutes: form.appointment.appointmentType.durationMinutes,
              }
            : null,
        }
      : null,
  }
}

export default async function getIntakeFormByAccessCode(
  root: unknown,
  { accessCode }: { accessCode: string },
  context: Context
) {
  if (!accessCode || accessCode.length < 16 || accessCode.length > 128) return null
  await enforcePublicIntakeRateLimit(context, accessCode, 'lookup')

  const prisma = context.sudo().prisma as any
  const form = await prisma.intakeForm.findUnique({
    where: { accessCodeHash: hashIntakeAccessToken(accessCode) },
    include: {
      patient: true,
      appointment: {
        include: {
          provider: true,
          appointmentType: true,
          facility: { select: { name: true, timeZone: true } },
        },
      },
    },
  })

  if (!isActiveIntakeAccess(accessCode, form)) return null
  await prisma.clinicalAuditLog.create({
    data: {
      eventType: 'intake.viewed',
      occurredAt: new Date(),
      actorType: 'patient_self_service',
      actorReference: '',
      facilityId: form.facilityId,
      patientId: form.patientId,
      appointmentId: form.appointmentId,
      intakeFormId: form.id,
      metadata: { source: 'one_time_intake_access', accessState: 'active' },
      createdAt: new Date(),
    },
  })
  return serializePatientIntakeForm(form, accessCode)
}
