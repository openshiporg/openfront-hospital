import { createHmac, randomUUID } from 'node:crypto'
import type { Context } from '.keystone/types'
import { createDeliverableIntakeAccessToken } from '../../security/intakeAccess'
import { patientDisplayName, providerDisplayName } from '../intake/getIntakeFormByAccessCode'
import { BOOKING_CONSENT, requireConsent } from '../workflowEvidence'
import {
  inspectBookableSlot,
  isScheduleRaceError,
  lockProviderSchedule,
  parsePublicDateWindow,
} from '../scheduling/schedulePolicy'
import getAvailableAppointmentSlots from './getAvailableAppointmentSlots'
import { hash } from '../operational/evidence'
import { consumeSharedRateLimit, requestIdentity } from '../../security/graphqlSecurity'
import { calendarDateInTimeZone } from '../scheduling/facilityTime'

type Args = {
  appointmentTypeId: string
  providerId: string
  facilityId: string
  startsAt: string
  patient: {
    firstName: string
    lastName: string
    email?: string | null
    phone?: string | null
    dateOfBirth?: string | null
  }
  reasonForVisit?: string | null
  preferredContactMethod?: string | null
  consent: {
    accepted: boolean
    policyVersion: string
    statementKey: string
  }
}

function makeAppointmentNumber() {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const randomPart = randomUUID().replaceAll('-', '').slice(0, 7).toUpperCase()
  return `APT-${datePart}-${randomPart}`
}

function dateOnlyFromIso(value?: string | null) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) throw new Error('dateOfBirth must be a valid date')
  if (parsed.getTime() > Date.now()) throw new Error('dateOfBirth cannot be in the future')
  return parsed.toISOString()
}

function cleanOptional(value?: string | null, maxLength = 500) {
  const cleaned = value?.trim()
  if (!cleaned) return null
  if (cleaned.length > maxLength) throw new Error(`Input exceeds the ${maxLength} character limit`)
  return cleaned
}

function validatePatientInput(patient: Args['patient']) {
  const firstName = cleanOptional(patient.firstName, 100)
  const lastName = cleanOptional(patient.lastName, 100)
  if (!firstName || !lastName) throw new Error('Patient first and last name are required')

  const email = cleanOptional(patient.email, 254)?.toLowerCase() || null
  const phone = cleanOptional(patient.phone, 40)
  if (!email && !phone) throw new Error('Email or phone is required for appointment follow-up')
  if (email && !/^\S+@\S+\.\S+$/.test(email)) throw new Error('Email must be valid')
  if (phone) {
    const digits = phone.replace(/\D/g, '')
    if (digits.length < 7 || digits.length > 15) throw new Error('Phone must contain 7 to 15 digits')
  }

  return { firstName, lastName, email, phone }
}

export function bookingContactIdentities(patient: ReturnType<typeof validatePatientInput>) {
  const secret = String(process.env.AUTH_RATE_LIMIT_PEPPER || (process.env.NODE_ENV !== 'production' ? process.env.SESSION_SECRET : '') || '')
  if (secret.length < 48) throw new Error('Public booking rate-limit pepper is not configured')
  const identities: string[] = []
  if (patient.email) {
    identities.push(createHmac('sha256', secret).update(`public-booking-email:${patient.email}`).digest('hex'))
  }
  if (patient.phone) {
    identities.push(createHmac('sha256', secret).update(`public-booking-phone:${patient.phone.replace(/\D/g, '')}`).digest('hex'))
  }
  return identities
}

function serializeAppointmentRequestResult(appointment: any) {
  if (!appointment) return null

  return {
    id: appointment.id,
    appointmentNumber: appointment.appointmentNumber,
    status: appointment.status,
    startsAt: appointment.startsAt,
    endsAt: appointment.endsAt,
    patient: appointment.patient
      ? {
          id: appointment.patient.id,
          displayName: patientDisplayName(appointment.patient),
        }
      : null,
    provider: appointment.provider
      ? {
          id: appointment.provider.id,
          displayName: providerDisplayName(appointment.provider),
          specialty: appointment.provider.specialty,
        }
      : null,
    appointmentType: appointment.appointmentType
      ? {
          id: appointment.appointmentType.id,
          name: appointment.appointmentType.name,
          durationMinutes: appointment.appointmentType.durationMinutes,
        }
      : null,
    intakeForms: appointment.intakeForms || [],
  }
}

export default async function requestAppointment(_root: unknown, args: Args, context: Context) {
  const request = (context as any).req
  const identity = requestIdentity(request?.headers || {}, request?.socket?.remoteAddress)
  requireConsent(args.consent, BOOKING_CONSENT)
  const patientInput = validatePatientInput(args.patient)
  const reasonForVisit = cleanOptional(args.reasonForVisit, 2000)
  const preferredContactMethod = args.preferredContactMethod === 'email' ? 'email' : args.preferredContactMethod === 'phone' ? 'phone' : 'sms'
  if (preferredContactMethod === 'email' && !patientInput.email) throw new Error('Email is required for email follow-up')
  if (preferredContactMethod !== 'email' && !patientInput.phone) throw new Error('Phone is required for phone or SMS follow-up')
  const slotDate = new Date(args.startsAt)
  if (Number.isNaN(slotDate.getTime())) throw new Error('startsAt must be a valid ISO date')
  if (slotDate.getTime() <= Date.now()) throw new Error('Appointment requests must use a future slot')

  const prisma = context.sudo().prisma as any
  const facilityConfiguration = await prisma.facility.findFirst({
    where: { id: args.facilityId, status: 'active' },
    select: { id: true, timeZone: true },
  })
  if (!facilityConfiguration) throw new Error('The selected facility is not available')
  const facilityDate = calendarDateInTimeZone(slotDate, facilityConfiguration.timeZone)
  parsePublicDateWindow(facilityDate, facilityConfiguration.timeZone)
  if (slotDate.getUTCMinutes() % 15 !== 0 || slotDate.getUTCSeconds() !== 0 || slotDate.getUTCMilliseconds() !== 0) {
    throw new Error('That appointment slot is no longer available')
  }

  const production = process.env.NODE_ENV === 'production'
  const now = new Date()
  const contactIdentities = bookingContactIdentities(patientInput)
  const slotIdentity = `${args.facilityId}:${args.providerId}:${args.appointmentTypeId}:${slotDate.toISOString()}`
  const rejectRate = () => { throw new Error('Too many appointment requests; please try again later') }
  if (!await consumeSharedRateLimit(prisma, 'public-booking-global', 'all-requests', production ? 100 : 2_000, now, 60)) rejectRate()
  if (!await consumeSharedRateLimit(prisma, 'public-booking-network', identity, production ? 5 : 100, now, 60)) rejectRate()
  if (!await consumeSharedRateLimit(prisma, 'public-booking-facility', args.facilityId, production ? 30 : 500, now, 60)) rejectRate()
  if (!await consumeSharedRateLimit(prisma, 'public-booking-slot', slotIdentity, production ? 10 : 200, now, 15 * 60)) rejectRate()
  for (const contactIdentity of contactIdentities) {
    if (!await consumeSharedRateLimit(prisma, 'public-booking-contact', contactIdentity, production ? 2 : 100, now, 60 * 60)) rejectRate()
  }

  const listedSlots = await getAvailableAppointmentSlots(
    _root,
    {
      appointmentTypeId: args.appointmentTypeId,
      providerId: args.providerId,
      facilityId: args.facilityId,
      date: facilityDate,
    },
    context,
  )
  if (!listedSlots.some((slot) =>
    slot.providerId === args.providerId && slot.facilityId === args.facilityId && slot.startsAt === slotDate.toISOString(),
  )) {
    throw new Error('That appointment slot is no longer available')
  }

  const sudo = context.sudo()
  // A public request is not a reservation. Use a request-specific uniqueness key;
  // provider overlap is enforced only when staff confirms the appointment.
  const bookingLockKey = `request:${randomUUID()}`
  const intakeFormId = randomUUID()
  const intakeAccess = createDeliverableIntakeAccessToken(intakeFormId)

  try {
    const appointmentId = await sudo.prisma.$transaction(async (tx) => {
      await lockProviderSchedule(tx, args.providerId)
      const requestedSlot = await inspectBookableSlot(tx, {
        appointmentTypeId: args.appointmentTypeId,
        providerId: args.providerId,
        facilityId: args.facilityId,
        startsAt: slotDate,
      })
      if (requestedSlot.availability.hasConflict) {
        throw new Error('That appointment slot was just taken. Please choose another time.')
      }
      const facility = requestedSlot.facility
      const communicationInstallations = await tx.integrationInstallation.findMany({
        where: { facilityId: facility.id, kind: 'communications', status: 'active' },
        orderBy: { createdAt: 'asc' },
        take: 101,
        select: { id: true, transitionVersion: true, allowedEventTypes: true },
      })
      const eligibleCommunicationInstallations = communicationInstallations.filter(item =>
        Array.isArray(item.allowedEventTypes) && item.allowedEventTypes.includes('message.queued'),
      )
      if (communicationInstallations.length > 100 || eligibleCommunicationInstallations.length > 1) {
        throw new Error('Online appointment follow-up configuration is ambiguous')
      }
      // A missing external communications adapter does not make scheduling
      // disappear. It creates an explicit staff follow-up task instead of a
      // fictional queued/sent state.
      const communicationInstallation = eligibleCommunicationInstallations[0] || null
      const followUpMode = communicationInstallation ? 'integration' : 'manual'
      const outstandingRequests = await tx.appointment.count({
        where: { facilityId: facility.id, source: 'patient_portal', status: 'requested' },
      })
      if (outstandingRequests >= 500) throw new Error('Online appointment requests are temporarily unavailable')

      // Public contact details are not identity proof. Always create a new front-door
      // patient record rather than attaching this request to an existing patient.
      const patient = await tx.patient.create({
        data: {
          firstName: patientInput.firstName,
          lastName: patientInput.lastName,
          email: patientInput.email || '',
          phone: patientInput.phone || '',
          dateOfBirth: dateOnlyFromIso(args.patient.dateOfBirth),
          preferredContactMethod,
          status: 'active',
          facilities: { connect: { id: facility.id } },
        },
      })

      const appointment = await tx.appointment.create({
        data: {
          appointmentNumber: makeAppointmentNumber(),
          status: 'requested',
          source: 'patient_portal',
          bookingLockKey,
          startsAt: requestedSlot.startsAt,
          endsAt: requestedSlot.endsAt,
          locationName: facility.name,
          reasonForVisit: reasonForVisit || '',
          patientId: patient.id,
          providerId: args.providerId,
          facilityId: facility.id,
          appointmentTypeId: args.appointmentTypeId,
        },
      })

      const intakeForm = await tx.intakeForm.create({
        data: {
          id: intakeFormId,
          operationKeyHash: hash(`booking-intake:${appointment.id}`),
          requestHash: hash(`booking-intake-payload:${appointment.id}:pre_visit`),
          title: 'Pre-visit intake',
          status: 'not_sent',
          templateKey: 'pre_visit',
          accessCodeHash: intakeAccess.tokenHash,
          accessExpiresAt: intakeAccess.expiresAt,
          facilityId: facility.id,
          patientId: patient.id,
          appointmentId: appointment.id,
          formSchema: {
            sections: [
              { key: 'contact', label: 'Contact and demographics' },
              { key: 'visit_reason', label: 'Reason for visit' },
              { key: 'insurance', label: 'Insurance and payment' },
            ],
          },
        },
      })

      const message = await tx.patientMessage.create({
        data: {
          operationKeyHash: hash(`booking-message:${appointment.id}`),
          requestHash: hash(`booking-message-payload:${appointment.id}:${preferredContactMethod}`),
          transitionVersion: 1,
          purpose: 'care_operations',
          facilityId: facility.id,
          patientId: patient.id,
          appointmentId: appointment.id,
          installationId: communicationInstallation?.id || null,
          direction: 'outbound',
          channel: preferredContactMethod === 'email' ? 'email' : preferredContactMethod === 'phone' ? 'phone' : 'sms',
          status: communicationInstallation ? 'queued' : 'manual_required',
          subject: 'Appointment request follow-up',
          body: `Appointment request ${appointment.appointmentNumber} needs confirmation and intake follow-up for ${new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: facilityConfiguration.timeZone }).format(appointment.startsAt)}. ${communicationInstallation ? 'Complete intake: {{intake_link}}' : 'Contact the patient through the selected channel; no external message was sent.'}`,
          metadata: { source: 'public_booking', intakeFormId: intakeForm.id, followUpMode },
        },
      })

      const consent = await tx.patientConsent.create({
        data: {
          ...BOOKING_CONSENT,
          decision: 'granted',
          effectiveAt: new Date(),
          grantedAt: new Date(),
          captureMethod: 'public_web',
          facilityId: facility.id,
          patientId: patient.id,
          appointmentId: appointment.id,
          intakeFormId: intakeForm.id,
          evidence: { accepted: true, source: 'appointment_request_form' },
        } as any,
      })

      await tx.clinicalAuditLog.create({
        data: {
          eventType: 'appointment.requested',
          occurredAt: new Date(),
          actorType: 'patient_self_service',
          facilityId: facility.id,
          patientId: patient.id,
          appointmentId: appointment.id,
          intakeFormId: intakeForm.id,
          consentId: consent.id,
          metadata: {
            source: 'public_booking',
            appointmentStatus: 'requested',
            intakeStatus: 'not_sent',
            contactChannel: preferredContactMethod,
            followUpMode,
          },
        },
      })

      await tx.clinicalOutboxEvent.create({
        data: {
          eventKey: `patient_message:${message.id}:v1:${message.status}`,
          eventType: communicationInstallation ? 'message.queued' : 'message.manual_required',
          aggregateType: 'patient_message',
          aggregateId: message.id,
          contractVersion: communicationInstallation ? 'hospital.webhook.v1' : 'hospital.event.v1',
          deliveryMode: communicationInstallation ? 'external' : 'internal',
          installationId: communicationInstallation?.id || null,
          installationVersion: communicationInstallation?.transitionVersion || null,
          status: communicationInstallation ? 'pending' : 'recorded',
          attempts: 0,
          nextAttemptAt: communicationInstallation ? new Date() : null,
          facilityId: facility.id,
          patientId: patient.id,
          appointmentId: appointment.id,
          payload: {
            source: 'public_booking',
            aggregateId: message.id,
            channel: message.channel,
            purpose: message.purpose,
            status: message.status,
            followUpMode,
            transitionVersion: 1,
            intakeFormId: intakeForm.id,
          },
          createdAt: new Date(),
        },
      })

      return appointment.id
    }, { isolationLevel: 'ReadCommitted' })

    const appointment = await sudo.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        patient: true,
        provider: true,
        appointmentType: true,
        intakeForms: { select: { id: true, status: true } },
      },
    })
    const appointmentWithAccess = appointment
      ? {
          ...appointment,
          intakeForms: appointment.intakeForms.map((form, index) => ({
            ...form,
            accessCode: index === 0 ? intakeAccess.token : null,
          })),
        }
      : null
    return serializeAppointmentRequestResult(appointmentWithAccess)
  } catch (error: any) {
    if (isScheduleRaceError(error)) throw new Error('That appointment slot was just taken. Please choose another time.')
    throw error
  }
}
