import { Prisma } from '@prisma/client'
import type { Context } from '.keystone/types'

import {
  buildRegistrationRequestHash,
  findDeterministicDuplicateReasons,
  hashRegistrationIdempotencyKey,
  maskRegistrationContact,
  normalizeRegistrationInput,
  REGISTRATION_CONSENT,
  type RegistrationInput,
} from './registrationPolicy'

type Args = { data: RegistrationInput }

type CandidateRecord = {
  id: string
  firstName: string
  lastName: string
  dateOfBirth: Date | null
  email: string
  phone: string
}

function requirePermission(context: Context) {
  const role = context.session?.data.role
  if (!role?.canManagePatients && !role?.canAccessAllClinicalData) {
    throw new Error('Not authorized to register patients')
  }
}

function candidateDto(candidate: CandidateRecord, reasons: string[]) {
  return {
    patientId: candidate.id,
    displayName: `${candidate.firstName} ${candidate.lastName}`.trim(),
    dateOfBirth: candidate.dateOfBirth?.toISOString().slice(0, 10) ?? null,
    maskedEmail: maskRegistrationContact(candidate.email, 'email'),
    maskedPhone: maskRegistrationContact(candidate.phone, 'phone'),
    reasons,
  }
}

function completedDto(result: any, replayed: boolean) {
  return {
    status: 'completed',
    replayed,
    registrationId: result.id,
    patientId: result.patientId,
    identifierId: result.identifierId,
    medicalRecordNumber: result.identifier.maskedValue,
    duplicateResolution: result.duplicateResolution,
    candidates: [],
    candidateCount: 0,
    candidateLimit: 25,
    candidateCountIsLowerBound: false,
  }
}

export default async function registerPatient(root: unknown, args: Args, context: Context) {
  requirePermission(context)
  const input = normalizeRegistrationInput(args.data)

  const scopedFacility = await context.query.Facility.findOne({
    where: { id: input.facilityId },
    query: 'id status',
  }) as { id: string; status: string } | null
  if (!scopedFacility || scopedFacility.status !== 'active') {
    throw new Error('Facility not found, inactive, or not accessible')
  }

  const idempotencyKeyHash = hashRegistrationIdempotencyKey(input.idempotencyKey)
  const requestHash = buildRegistrationRequestHash(input)
  const actorId = context.session!.itemId
  const sudo = context.sudo()

  try {
    return await sudo.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`hospital-registration:${input.facilityId}`}, 0))::text AS "lock"`,
      )

      const replay = await tx.patientRegistration.findFirst({
        where: { facilityId: input.facilityId, idempotencyKeyHash },
        include: { identifier: true },
      })
      if (replay) {
        if (replay.requestHash !== requestHash) {
          throw new Error('Registration idempotency key was already used with a different payload')
        }
        return completedDto(replay, true)
      }

      const existingIdentifier = await tx.patientIdentifier.findFirst({
        where: { facilityId: input.facilityId, normalizedValue: input.medicalRecordNumber, status: 'active' },
      })
      if (existingIdentifier) {
        throw new Error('Medical record number is already assigned at this facility')
      }

      const birthDate = new Date(input.dateOfBirth)
      const possibleCandidates = await tx.patient.findMany({
        where: {
          dateOfBirth: birthDate,
          facilities: { some: { id: input.facilityId } },
        },
        orderBy: { id: 'asc' },
        select: { id: true, firstName: true, lastName: true, dateOfBirth: true, email: true, phone: true },
        take: 26,
      })
      if (possibleCandidates.length > 25) {
        return {
          status: 'candidate_overflow',
          replayed: false,
          registrationId: null,
          patientId: null,
          identifierId: null,
          medicalRecordNumber: null,
          duplicateResolution: null,
          candidates: [],
          candidateCount: possibleCandidates.length,
          candidateLimit: 25,
          candidateCountIsLowerBound: true,
        }
      }
      const candidates = possibleCandidates
        .map((candidate) => ({ candidate, reasons: findDeterministicDuplicateReasons(input, candidate) }))
        .filter(({ reasons }) => reasons.length > 0)

      if (candidates.length > 0 && !input.duplicateResolution) {
        return {
          status: 'duplicate_review',
          replayed: false,
          registrationId: null,
          patientId: null,
          identifierId: null,
          medicalRecordNumber: null,
          duplicateResolution: null,
          candidates: candidates.map(({ candidate, reasons }) => candidateDto(candidate, reasons)),
          candidateCount: candidates.length,
          candidateLimit: 25,
          candidateCountIsLowerBound: false,
        }
      }
      if (input.duplicateResolution && candidates.length === 0) {
        throw new Error('Duplicate resolution was supplied but no deterministic candidate exists')
      }

      let patientId: string
      let duplicateResolution: 'no_candidate' | 'create_new' | 'link_existing'
      if (input.duplicateResolution === 'link_existing') {
        const selected = candidates.find(({ candidate }) => candidate.id === input.duplicatePatientId)
        if (!selected) throw new Error('Selected duplicate patient is not an accessible deterministic candidate')
        patientId = selected.candidate.id
        duplicateResolution = 'link_existing'
      } else {
        const patient = await tx.patient.create({
          data: {
            firstName: input.firstName,
            lastName: input.lastName,
            dateOfBirth: birthDate,
            email: input.email ?? '',
            phone: input.phone ?? '',
            preferredContactMethod: input.preferredContactMethod,
            status: 'active',
            facilities: { connect: [{ id: input.facilityId }] },
          },
        })
        patientId = patient.id
        duplicateResolution = input.duplicateResolution === 'create_new' ? 'create_new' : 'no_candidate'
      }

      const now = new Date()
      const identifier = await tx.patientIdentifier.create({
        data: {
          identifierType: 'mrn',
          normalizedValue: input.medicalRecordNumber,
          maskedValue: `••••${input.medicalRecordNumber.slice(-4)}`,
          status: 'active',
          facilityId: input.facilityId,
          patientId,
          createdById: actorId,
          createdAt: now,
        },
      })
      const consent = await tx.patientConsent.create({
        data: {
          consentType: REGISTRATION_CONSENT.consentType,
          policyVersion: input.consent.policyVersion,
          statementKey: input.consent.statementKey,
          decision: 'granted',
          effectiveAt: now,
          grantedAt: now,
          captureMethod: 'staff_registration',
          facilityId: input.facilityId,
          patientId,
          evidence: { source: 'platform_registration', accepted: true },
          createdAt: now,
        } as any,
      })
      const auditLog = await tx.clinicalAuditLog.create({
        data: {
          eventType: 'patient.registered',
          occurredAt: now,
          actorType: 'staff_user',
          actorReference: actorId,
          facilityId: input.facilityId,
          patientId,
          metadata: {
            source: 'platform_registration',
            status: 'completed',
            duplicateResolution,
          },
          createdAt: now,
        },
      })
      const registration = await tx.patientRegistration.create({
        data: {
          status: 'completed',
          facilityId: input.facilityId,
          patientId,
          identifierId: identifier.id,
          consentId: consent.id,
          auditLogId: auditLog.id,
          createdById: actorId,
          idempotencyKeyHash,
          requestHash,
          duplicateResolution,
          provenance: { source: 'platform_registration', policyVersion: REGISTRATION_CONSENT.policyVersion },
          createdAt: now,
        },
        include: { identifier: true },
      })
      return completedDto(registration, false)
    }, { isolationLevel: 'Serializable' })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) {
      throw new Error('Registration conflicted with another request; retry with the same idempotency key')
    }
    throw error
  }
}
