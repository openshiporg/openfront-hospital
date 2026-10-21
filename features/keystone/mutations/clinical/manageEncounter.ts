import { createHash, randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import type { Context } from '.keystone/types'
import { currentEpisodeActor, effectiveEpisodePolicy, lockCurrentEncounter, lockEpisodeFacility, lockEpisodePatientProvider } from './episodeFence'
import { assertEpisodeTuple } from './episodePolicy'
import { policyProjection, rejectEpisodeCommand, reviewFingerprint } from './episodeWorkflows'
import { isEncounterTransitionAllowed, linkedAppointmentTransition, validateBoundedEncounterTransitionEvidence } from './encounterPolicy'
import {
  lockTransitionOperation,
  recordTransition,
  replayTransition,
  transitionEvidence,
} from '../transitionEvidence'

const OPERATION_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,199}$/

type OpenEncounterInput = {
  operationKey: string
  facilityId: string
  patientId: string
  providerId: string
  appointmentId?: string | null
  departmentId?: string | null
  chiefComplaint?: string | null
}

type OpenArgs = { data: OpenEncounterInput }
type TransitionArgs = {
  operationKey: string
  encounterId: string
  toStatus: string
  expectedVersion: number
  diagnosisSummary?: string | null
  reason?: string | null
  expectedReviewFingerprint?: string | null
  reviewedTuple?: Record<string, unknown> | null
}

function requirePermission(context: Context) {
  const role = context.session?.data.role
  if (!role?.canManagePatients && !role?.canAccessAllClinicalData) {
    throw new Error('Not authorized to manage encounters')
  }
}

function bounded(value: unknown, label: string, maxLength: number, required = false) {
  const normalized = String(value ?? '').trim()
  if ((required && !normalized) || normalized.length > maxLength || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new Error(`${label} is invalid`)
  }
  return normalized
}

function digest(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function projection(row: any, replayed = false) {
  return {
    id: row.id,
    encounterNumber: row.encounterNumber,
    status: row.status,
    transitionVersion: row.transitionVersion,
    replayed,
  }
}

async function resolveOpenScope(context: Context, input: OpenEncounterInput) {
  requirePermission(context)
  const [facility, patient, provider, appointment, department] = await Promise.all([
    context.query.Facility.findOne({ where: { id: input.facilityId }, query: 'id status' }),
    context.query.Patient.findOne({ where: { id: input.patientId }, query: 'id facilities { id }' }),
    context.query.Provider.findOne({ where: { id: input.providerId }, query: 'id status facilities { id }' }),
    input.appointmentId
      ? context.query.Appointment.findOne({
          where: { id: input.appointmentId },
          query: 'id status patient { id } provider { id } facility { id }',
        })
      : null,
    input.departmentId
      ? context.query.Department.findOne({ where: { id: input.departmentId }, query: 'id facilities { id }' })
      : null,
  ]) as any[]

  if (
    !facility ||
    facility.status !== 'active' ||
    !patient?.facilities?.some((item: any) => item.id === input.facilityId) ||
    provider?.status !== 'active' ||
    !provider?.facilities?.some((item: any) => item.id === input.facilityId)
  ) {
    throw new Error('Facility, patient, or provider not found or not accessible')
  }
  if (
    input.appointmentId &&
    (
      !appointment ||
      !['checked_in', 'in_visit'].includes(appointment.status) ||
      appointment.patient?.id !== input.patientId ||
      appointment.provider?.id !== input.providerId ||
      appointment.facility?.id !== input.facilityId
    )
  ) {
    throw new Error('Appointment does not match the checked-in patient, provider, and facility')
  }
  if (input.departmentId && (!department || !department.facilities?.some((item: any) => item.id === input.facilityId))) {
    throw new Error('Department does not match the accessible facility')
  }
}

export async function openEncounter(_root: unknown, { data }: OpenArgs, context: Context) {
  const operationKey = bounded(data.operationKey, 'Operation key', 200, true)
  if (!OPERATION_KEY.test(operationKey)) throw new Error('Operation key is invalid')
  const input: OpenEncounterInput = {
    operationKey,
    facilityId: bounded(data.facilityId, 'Facility', 128, true),
    patientId: bounded(data.patientId, 'Patient', 128, true),
    providerId: bounded(data.providerId, 'Provider', 128, true),
    appointmentId: data.appointmentId ? bounded(data.appointmentId, 'Appointment', 128, true) : null,
    departmentId: data.departmentId ? bounded(data.departmentId, 'Department', 128, true) : null,
    chiefComplaint: bounded(data.chiefComplaint, 'Reason for encounter', 4000),
  }
  await resolveOpenScope(context, input)

  const operationKeyHash = digest(operationKey)
  const requestHash = digest(canonical({ ...input, operationKey: undefined }))
  try {
    return await context.transaction(async (transactionContext: any) => {
      // Keystone 6.5 declares `isolationLevel` as the enum object while Prisma expects the
      // string, so set it as the transaction's first statement (as in labResultRecovery.ts).
      await transactionContext.prisma.$executeRaw(Prisma.sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`)
      const current = await currentEpisodeActor(transactionContext)
      await lockEpisodeFacility(current, input.facilityId, input.providerId)
      await lockEpisodePatientProvider(current, input.facilityId, input.patientId, input.providerId)
      if (input.appointmentId) await current.prisma.$queryRaw(Prisma.sql`SELECT "id" FROM "Appointment" WHERE "id" = ${input.appointmentId} FOR UPDATE`)
      await resolveOpenScope(current, input)
      const tx = current.prisma
      await tx.$queryRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`encounter:open:${operationKeyHash}`}, 0))::text AS "lock"`,
      )
      if (input.appointmentId) {
        await tx.$queryRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`encounter:appointment:${input.appointmentId}`}, 0))::text AS "lock"`,
        )
      }
      const replay = await tx.encounter.findUnique({ where: { operationKeyHash } })
      if (replay) {
        if (replay.requestHash !== requestHash || replay.actorReference !== current.session.itemId || replay.facilityId !== input.facilityId || replay.patientId !== input.patientId || replay.providerId !== input.providerId || (replay.appointmentId || null) !== input.appointmentId) throw new Error('Operation key was reused with a different payload or authority')
        return projection(replay, true)
      }
      if (input.appointmentId && await tx.encounter.findFirst({ where: { appointmentId: input.appointmentId } })) {
        throw new Error('Appointment already has an encounter')
      }

      const now = new Date()
      const encounter = await tx.encounter.create({
        data: {
          encounterNumber: `ENC-${randomUUID()}`,
          status: 'open',
          transitionVersion: 1,
          operationKeyHash,
          requestHash,
          actorReference: context.session!.itemId,
          facilityId: input.facilityId,
          patientId: input.patientId,
          providerId: input.providerId,
          appointmentId: input.appointmentId,
          departmentId: input.departmentId,
          chiefComplaint: input.chiefComplaint || '',
        },
      })
      const metadata = {
        source: 'encounter_workflow',
        aggregateType: 'encounter',
        aggregateId: encounter.id,
        status: encounter.status,
        transitionVersion: encounter.transitionVersion,
      }
      await tx.clinicalAuditLog.create({
        data: {
          eventType: 'encounter.opened',
          occurredAt: now,
          actorType: 'staff_user',
          actorReference: context.session!.itemId,
          facilityId: encounter.facilityId,
          patientId: encounter.patientId,
          appointmentId: encounter.appointmentId,
          encounterId: encounter.id,
          metadata,
          createdAt: now,
        },
      })
      await tx.clinicalOutboxEvent.create({
        data: {
          eventKey: `encounter:${encounter.id}:v1:opened`,
          eventType: 'encounter.opened',
          aggregateType: 'encounter',
          aggregateId: encounter.id,
          status: 'recorded',
          attempts: 0,
          nextAttemptAt: null,
          facilityId: encounter.facilityId,
          patientId: encounter.patientId,
          appointmentId: encounter.appointmentId,
          encounterId: encounter.id,
          payload: metadata,
          createdAt: now,
        },
      })
      return projection(encounter)
    }, { timeout: 30_000 })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) {
      throw new Error('Encounter opening conflicted with another request; retry with the same operation key')
    }
    throw error
  }
}

export async function transitionEncounter(_root: unknown, args: TransitionArgs, context: Context) {
  requirePermission(context)
  const diagnosisSummary = bounded(args.diagnosisSummary, 'Diagnosis summary', 4000)
  const reason = bounded(args.reason, 'Transition reason', 1000)
  validateBoundedEncounterTransitionEvidence({ toStatus: args.toStatus, diagnosisSummary, reason })
  if (!Number.isInteger(args.expectedVersion) || args.expectedVersion < 1) throw new Error('Expected encounter version is invalid')
  return context.transaction(async (transactionContext: any) => {
    // Keystone 6.5 declares `isolationLevel` as the enum object while Prisma expects the
    // string, so set it as the transaction's first statement (as in labResultRecovery.ts).
    await transactionContext.prisma.$executeRaw(Prisma.sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`)
    const current = await currentEpisodeActor(transactionContext)
    const scope = await lockCurrentEncounter(current, args.encounterId)
    if (!args.reviewedTuple) throw new Error('Original reviewed episode tuple is required; legacy command remains unverified')
    assertEpisodeTuple(args.reviewedTuple, scope.tuple)
    const policy = await effectiveEpisodePolicy(current.prisma, scope.tuple.facilityId)
    const tx = current.prisma
    const originalCommand = { ...args, actorId: current.session.itemId, tuple: scope.tuple }
    const evidence = transitionEvidence(args.operationKey, originalCommand)
    await lockTransitionOperation(tx, evidence.operationKeyHash)
    const existing = await tx.workflowTransition.findUnique({ where: { operationKeyHash: evidence.operationKeyHash } })
    if (existing) {
      if (existing.actorReference !== current.session.itemId || !existing.result?.episodeReceipt) {
        throw new Error('Original operation is not owned or is legacy-unverified; use read-only recovery')
      }
      assertEpisodeTuple(existing.result.episodeReceipt.tuple, scope.tuple)
      const replay = await replayTransition(tx, evidence, existing.aggregateType === 'encounter_command' ? 'encounter_command' : 'encounter', args.encounterId)
      if (replay) {
        // Annotated so the stored receipt fields (outcome, status, episodeReceipt) stay in the type.
        const replayed: typeof replay = {
          ...replay,
          startedAt: replay.startedAt ? new Date(replay.startedAt) : null,
          endedAt: replay.endedAt ? new Date(replay.endedAt) : null,
        }
        return replayed
      }
    }
    if (['closed', 'cancelled'].includes(args.toStatus)) {
      if (!policy || policy.definition.operationalClosure !== 'enabled') return rejectEpisodeCommand(current, scope, policy, originalCommand, evidence, 'reviewed_operational_policy_required')
      if (!args.expectedReviewFingerprint || args.expectedReviewFingerprint !== reviewFingerprint(current, scope, policy)) {
        return rejectEpisodeCommand(current, scope, policy, originalCommand, evidence, 'stale_episode_appointment_authority_or_policy_review')
      }
    }
    const encounter = await tx.encounter.findUnique({ where: { id: args.encounterId } })
    if (!encounter || encounter.transitionVersion !== args.expectedVersion) {
      return rejectEpisodeCommand(current, scope, policy, originalCommand, evidence, 'stale_encounter_version')
    }
    if (!isEncounterTransitionAllowed(encounter.status, args.toStatus)) {
      return rejectEpisodeCommand(current, scope, policy, originalCommand, evidence, 'invalid_encounter_transition')
    }
    const now = new Date()
    let appointmentTransition: { id: string; fromStatus: string; toStatus: string } | null = null
    if (encounter.appointmentId) {
      const appointment = scope.appointment
      if (args.toStatus === 'in_progress' && (!appointment || !['checked_in', 'in_visit'].includes(appointment.status))) {
        throw new Error('Linked appointment must be checked in before the encounter starts')
      }
      if (appointment) {
        const linkedTransition = linkedAppointmentTransition(args.toStatus, appointment.status)
        if (linkedTransition?.toStatus === 'in_visit') {
          const changed = await tx.appointment.updateMany({ where: { id: appointment.id, transitionVersion: appointment.transitionVersion, status: appointment.status }, data: { status: 'in_visit', transitionVersion: { increment: 1 } } })
          if (changed.count !== 1) throw new Error('Linked appointment changed; review before retrying')
          appointmentTransition = { id: appointment.id, ...linkedTransition }
        }
        if (linkedTransition?.toStatus === 'completed') {
          const changed = await tx.appointment.updateMany({
            where: { id: appointment.id, transitionVersion: appointment.transitionVersion, status: appointment.status },
            data: {
              status: 'completed',
              transitionVersion: { increment: 1 },
              completedAt: now,
              bookingLockKey: `released:${appointment.id}:${now.getTime()}`,
            },
          })
          if (changed.count !== 1) throw new Error('Linked appointment changed; review before retrying')
          appointmentTransition = { id: appointment.id, ...linkedTransition }
        }
      }
    }

    const transitionVersion = encounter.transitionVersion + 1
    const changed = await tx.encounter.updateMany({
      where: { id: encounter.id, transitionVersion: args.expectedVersion, status: encounter.status },
      data: {
        status: args.toStatus,
        transitionVersion,
        actorReference: context.session!.itemId,
        ...(args.toStatus === 'in_progress' && !encounter.startedAt ? { startedAt: now } : {}),
        ...(['closed', 'cancelled'].includes(args.toStatus) ? { endedAt: now } : {}),
      },
    })
    if (changed.count !== 1) throw new Error('Encounter changed; review before retrying')
    const updated = await tx.encounter.findUnique({ where: { id: encounter.id } })
    const metadata = {
      source: 'encounter_workflow',
      aggregateType: 'encounter',
      aggregateId: encounter.id,
      fromStatus: encounter.status,
      status: updated.status,
      transitionVersion,
      reasonProvided: Boolean(reason),
      diagnosisSummaryUpdated: false,
      clinicalAuthority: 'not_asserted',
      policyId: policy?.id || null,
      policyRevision: policy?.revision || null,
      descendantsClosed: false,
      admissionDischarged: false,
    }
    const eventType = `encounter.${updated.status}`
    const audit = await tx.clinicalAuditLog.create({
      data: {
        eventType,
        occurredAt: now,
        actorType: 'staff_user',
        actorReference: context.session!.itemId,
        facilityId: encounter.facilityId,
        patientId: encounter.patientId,
        appointmentId: encounter.appointmentId,
        encounterId: encounter.id,
        metadata,
        createdAt: now,
      },
    })
    if (appointmentTransition) {
      await tx.clinicalAuditLog.create({
        data: {
          eventType: `appointment.${appointmentTransition.toStatus}`,
          occurredAt: now,
          actorType: 'staff_user',
          actorReference: context.session!.itemId,
          facilityId: encounter.facilityId,
          patientId: encounter.patientId,
          appointmentId: appointmentTransition.id,
          encounterId: encounter.id,
          metadata: {
            source: 'encounter_workflow',
            fromStatus: appointmentTransition.fromStatus,
            toStatus: appointmentTransition.toStatus,
          },
          createdAt: now,
        },
      })
    }
    const outbox = await tx.clinicalOutboxEvent.create({
      data: {
        eventKey: `encounter:${encounter.id}:v${transitionVersion}:${updated.status}`,
        eventType,
        aggregateType: 'encounter',
        aggregateId: encounter.id,
        status: 'recorded',
        attempts: 0,
        nextAttemptAt: null,
        facilityId: encounter.facilityId,
        patientId: encounter.patientId,
        appointmentId: encounter.appointmentId,
        encounterId: encounter.id,
        payload: metadata,
        createdAt: now,
      },
    })
    const result = {
      id: updated.id,
      encounterNumber: updated.encounterNumber,
      fromStatus: encounter.status,
      status: updated.status,
      transitionVersion: updated.transitionVersion,
      startedAt: updated.startedAt || null,
      endedAt: updated.endedAt || null,
      outcome: 'accepted',
      episodeReceipt: { tuple: scope.tuple, originalCommand, policy: policyProjection(policy), actorId: current.session.itemId,
        accepted: true, roleId: current.session.data.role.id, securityVersion: current.session.data.securityVersion,
        appointmentAcknowledgement: appointmentTransition ? { ...appointmentTransition, version: scope.appointment.transitionVersion + 1 } : null,
        clinicalAuthority: 'not_asserted', descendantsClosed: false, admissionDischarged: false },
      replayed: false,
    }
    await recordTransition(tx, {
      evidence,
      aggregateType: 'encounter',
      aggregateId: encounter.id,
      fromStatus: encounter.status,
      toStatus: updated.status,
      fromVersion: encounter.transitionVersion,
      toVersion: updated.transitionVersion,
      actorReference: context.session!.itemId,
      facilityId: encounter.facilityId,
      patientId: encounter.patientId,
      auditLogId: audit.id,
      outboxEventId: outbox.id,
      result,
      occurredAt: now,
    })
    return result
  }, { timeout: 30_000 })
}
