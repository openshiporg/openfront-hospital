import type { JSONValue } from '@keystone-6/core/types'
import type { Context } from '.keystone/types'
import { hashIntakeAccessToken, isActiveIntakeAccess } from '../../security/intakeAccess'
import { enforcePublicIntakeRateLimit } from '../../security/publicIntakeRateLimit'
import { INTAKE_CONSENT, requireConsent } from '../workflowEvidence'
import { serializePatientIntakeForm } from './getIntakeFormByAccessCode'

type Args = {
  accessCode: string
  responses: JSONValue
  patientUpdates?: {
    email?: string | null
    phone?: string | null
    preferredContactMethod?: string | null
    insuranceSummary?: JSONValue | null
  } | null
  consent: {
    accepted: boolean
    policyVersion: string
    statementKey: string
  }
}

function validateResponses(responses: JSONValue) {
  if (!responses || typeof responses !== 'object' || Array.isArray(responses)) {
    throw new Error('Intake responses must be an object')
  }
  if (JSON.stringify(responses).length > 50_000) throw new Error('Intake responses exceed the size limit')
}

function cleanOptional(value?: string | null, maxLength = 500) {
  const cleaned = value?.trim()
  if (!cleaned) return null
  if (cleaned.length > maxLength) throw new Error(`Input exceeds the ${maxLength} character limit`)
  return cleaned
}

export default async function submitIntakeForm(
  root: unknown,
  { accessCode, responses, patientUpdates, consent: consentInput }: Args,
  context: Context
) {
  if (!accessCode || accessCode.length < 16 || accessCode.length > 128) throw new Error('Invalid intake access code')
  await enforcePublicIntakeRateLimit(context, accessCode, 'submit')
  requireConsent(consentInput, INTAKE_CONSENT)
  validateResponses(responses)

  const email = cleanOptional(patientUpdates?.email, 254)?.toLowerCase() || null
  if (email && !/^\S+@\S+\.\S+$/.test(email)) throw new Error('Email must be valid')
  const phone = cleanOptional(patientUpdates?.phone, 40)
  const preferredContactMethod = patientUpdates?.preferredContactMethod
  if (preferredContactMethod && !['sms', 'email', 'phone'].includes(preferredContactMethod)) {
    throw new Error('Preferred contact method is invalid')
  }
  const insuranceSummary = patientUpdates?.insuranceSummary
  if (
    insuranceSummary != null &&
    (typeof insuranceSummary !== 'object' || Array.isArray(insuranceSummary) || JSON.stringify(insuranceSummary).length > 20_000)
  ) {
    throw new Error('Insurance summary must be a bounded object')
  }

  const sudo = context.sudo()
  const accessCodeHash = hashIntakeAccessToken(accessCode)
  const existing = await sudo.prisma.intakeForm.findUnique({
    where: { accessCodeHash },
    include: { patient: true, appointment: true },
  })
  const accessIsActive = isActiveIntakeAccess(accessCode, existing)
  if (!existing || !accessIsActive) throw new Error('Intake access is invalid or no longer active')
  if (existing.status === 'reviewed' || existing.status === 'submitted') {
    throw new Error('Intake access is invalid or no longer active')
  }
  if (!existing.patient?.id || !existing.appointment?.id) throw new Error('Intake form is missing its patient or appointment')

  const patientId = existing.patient.id
  const appointmentId = existing.appointment.id
  const intakeFormId = existing.id
  const facilityId = existing.appointment.facilityId
  if (!facilityId || existing.facilityId !== facilityId) throw new Error('Intake form facility scope is invalid')
  const submittedAt = new Date()
  await sudo.prisma.$transaction(async (tx) => {
    const claimedAccess = await tx.intakeForm.updateMany({
      where: {
        id: intakeFormId,
        accessCodeHash,
        accessExpiresAt: { gt: submittedAt },
        accessUsedAt: null,
        accessRevokedAt: null,
        status: { notIn: ['submitted', 'reviewed'] },
      },
      data: {
        status: 'submitted',
        responses: responses as any,
        submittedAt,
        accessUsedAt: submittedAt,
      },
    })
    if (claimedAccess.count !== 1) throw new Error('Intake access is invalid or no longer active')

    const patientData: Record<string, unknown> = {}
    if (email) patientData.email = email
    if (phone) patientData.phone = phone
    if (preferredContactMethod) patientData.preferredContactMethod = preferredContactMethod
    if (insuranceSummary != null) patientData.insuranceSummary = insuranceSummary
    if (Object.keys(patientData).length) {
      await tx.patient.update({ where: { id: patientId }, data: patientData })
    }

    const consent = await tx.patientConsent.create({
      data: {
        ...INTAKE_CONSENT,
        decision: 'granted',
        effectiveAt: new Date(),
        grantedAt: new Date(),
        captureMethod: 'access_code_web',
        facilityId,
        patientId,
        appointmentId,
        intakeFormId,
        evidence: { accepted: true, source: 'intake_submission_form' },
      } as any,
    })

    await tx.clinicalAuditLog.create({
      data: {
        eventType: 'intake.submitted',
        occurredAt: new Date(),
        actorType: 'patient_access_code',
        facilityId,
        patientId,
        appointmentId,
        intakeFormId,
        consentId: consent.id,
        metadata: {
          source: 'public_intake',
          intakeStatus: 'submitted',
          contactUpdated: Boolean(Object.keys(patientData).length),
        },
      },
    })
  }, { isolationLevel: 'Serializable' })

  const submitted = await sudo.prisma.intakeForm.findUnique({
    where: { id: intakeFormId },
    include: {
      patient: true,
      appointment: { include: { provider: true, appointmentType: true } },
    },
  })
  return serializePatientIntakeForm(submitted)
}
