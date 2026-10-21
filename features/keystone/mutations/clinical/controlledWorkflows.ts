import { createHash, randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import type { Context } from '.keystone/types'
import {
  lockTransitionOperation,
  recordTransition,
  replayTransition,
  transitionEvidence,
} from '../transitionEvidence'
import { appendAuditAndOutbox } from '../operational/evidence'
import { currentEpisodeActor, currentEpisodeChild, guardEpisodeChild } from './episodeFence'
import { recheckEpisodeRelated } from './episodeRelatedScope'
import { requireHumanEpisodeReview } from './episodePolicy'
import { replayAcceptedLabResult, replayAcceptedLabTransition, replayAcceptedLabCorrection, persistOriginalLabReceipt, type LabCommand, type LabCorrectionCommand } from './labResultRecovery'

const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,199}$/
const ORDER_TYPES = new Set(['lab', 'medication', 'imaging', 'procedure', 'consult'])
const RESULT_FLAGS = new Set(['normal', 'low', 'high', 'critical'])

function requireOperator(context: Context) {
  const role = context.session?.data.role
  if (!role?.canManagePatients && !role?.canAccessAllClinicalData) {
    throw new Error('Not authorized to manage clinical operations')
  }
}

function bounded(value: unknown, label: string, max = 2000, required = false) {
  const text = String(value ?? '').trim()
  if ((required && !text) || text.length > max || /[\u0000-\u001f\u007f]/.test(text)) {
    throw new Error(`${label} is invalid`)
  }
  return text
}

function canonical(value: any): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonical(nested)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function digest(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function creationEvidence(input: any) {
  const key = bounded(input.operationKey, 'Operation key', 200, true)
  if (!KEY_PATTERN.test(key)) throw new Error('Operation key is invalid')
  const { operationKey: _operationKey, ...payload } = input
  return {
    operationKeyHash: digest(key),
    requestHash: digest(canonical(payload)),
  }
}

function projection(row: any, replayed = false) {
  return {
    id: row.id,
    status: row.status,
    transitionVersion: row.transitionVersion,
    replayed,
  }
}

async function scope(
  context: Context,
  input: { facilityId: string; patientId: string; encounterId?: string; providerId?: string },
) {
  requireOperator(context)
  const [facility, patient, encounter, provider] = await Promise.all([
    context.query.Facility.findOne({ where: { id: input.facilityId }, query: 'id status' }),
    context.query.Patient.findOne({ where: { id: input.patientId }, query: 'id status facilities { id }' }),
    input.encounterId
      ? context.query.Encounter.findOne({
          where: { id: input.encounterId },
          query: 'id status patient { id } facility { id }',
        })
      : null,
    input.providerId
      ? context.query.Provider.findOne({
          where: { id: input.providerId },
          query: 'id status facilities { id }',
        })
      : null,
  ]) as any[]

  if (
    !facility ||
    facility.status !== 'active' ||
    patient?.status !== 'active' ||
    !patient?.facilities?.some((item: any) => item.id === input.facilityId)
  ) {
    throw new Error('Facility or patient not found or not accessible')
  }
  if (
    input.encounterId &&
    (!encounter || encounter.patient?.id !== input.patientId || encounter.facility?.id !== input.facilityId)
  ) {
    throw new Error('Encounter does not match the accessible patient and facility')
  }
  if (
    input.providerId &&
    (provider?.status !== 'active' || !provider?.facilities?.some((item: any) => item.id === input.facilityId))
  ) {
    throw new Error('Provider does not match the accessible facility')
  }
  return { facility, patient, encounter, provider }
}

async function scopedRecord(context: Context, model: string, id: string, authorize: (context: Context) => void = requireOperator) {
  authorize(context)
  const record = await (context.query as any)[model].findOne({
    where: { id },
    query: 'id status transitionVersion facility { id } patient { id } encounter { id }',
  })
  if (!record) throw new Error(`${model} not found or not accessible`)
  return record
}

async function createControlled(
  context: Context,
  options: {
    model: string
    delegate: string
    prefix: string
    input: any
    data: any
    originalLabCommand?: LabCommand
    afterCreate?: (prisma: any, row: any, evidence: { operationKeyHash: string; requestHash: string }) => Promise<void>
  },
) {
  const ev = creationEvidence(options.input)
  return context.transaction(async (transactionContext: any) => {
    if (options.model === 'LabResult') await transactionContext.prisma.$executeRaw(Prisma.sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`)
    const fresh = await currentEpisodeActor(transactionContext, options.model === 'InsuranceClaim' ? 'billing' : 'clinical')
    if (options.model === 'LabResult' && options.originalLabCommand) {
      const replay = await replayAcceptedLabResult(fresh, options.originalLabCommand, ev, options.originalLabCommand)
      if (replay) {
        if (replay.originalAcknowledgement.state.startsWith('legacy_')) throw new Error('Legacy result identity verified, but original body/status/version acknowledgement is unknown. Use read-only result readback and retain the original command.')
        return replay
      }
    }
    const existingReceipt = await fresh.prisma[options.delegate].findUnique({ where: { operationKeyHash: ev.operationKeyHash }, select: { actorReference: true } })
    const guarded = await guardEpisodeChild(fresh, options.input, options.model === 'InsuranceClaim' ? 'claim' : options.model === 'LabResult' ? 'late_result' : 'new_care', false, Boolean(existingReceipt))
    await recheckEpisodeRelated(guarded.context, options.model, options.input, Boolean(existingReceipt))
    const sudo = guarded.context.sudo()
    await sudo.prisma.$queryRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${options.prefix}:create:${ev.operationKeyHash}`}, 0))::text AS "lock"`,
    )
    const existing = await sudo.prisma[options.delegate].findUnique({
      where: { operationKeyHash: ev.operationKeyHash },
      select: { id: true, status: true, transitionVersion: true, requestHash: true, actorReference: true, facilityId: true, patientId: true, encounterId: true },
    })
    if (existing) {
      if (existing.requestHash !== ev.requestHash || existing.actorReference !== fresh.session.itemId || existing.facilityId !== options.input.facilityId || existing.patientId !== options.input.patientId || (existing.encounterId || null) !== (options.input.encounterId || null)) {
        throw new Error('Operation key was reused with a different payload or authority')
      }
      if (options.model === 'LabResult') throw new Error('Existing result requires original receipt recovery; retain and retry the exact command')
      return projection(existing, true)
    }
    const row = await sudo.query[options.model].createOne({
      data: { ...options.data, ...ev },
      query: 'id status transitionVersion',
    })
    if (options.afterCreate) await options.afterCreate(sudo.prisma, row, ev)
    if (options.originalLabCommand) await persistOriginalLabReceipt(sudo.prisma, row, ev, options.originalLabCommand, fresh.session.itemId, options.originalLabCommand)
    return projection(row, false)
  }, { timeout: 30_000 })
}

async function transitionControlled(
  context: Context,
  options: {
    model: string
    delegate: string
    prefix: string
    id: string
    toStatus: string
    expectedVersion: number
    operationKey: string
    data?: any
    authorize?: (context: Context) => void
    afterTransition?: (prisma: any, current: any, row: any, evidence: { operationKeyHash: string; requestHash: string }) => Promise<void>
  },
) {
  await scopedRecord(context, options.model, options.id, options.authorize || requireOperator)
  if (!Number.isInteger(options.expectedVersion) || options.expectedVersion < 1) {
    throw new Error('Expected clinical record version is invalid')
  }
  const data = options.data || {}
  const ev = transitionEvidence(options.operationKey, {
    aggregateType: options.prefix,
    aggregateId: options.id,
    toStatus: options.toStatus,
    expectedVersion: options.expectedVersion,
    data,
  })

  return context.transaction(async (transactionContext: any) => {
    if (options.model === 'LabResult') await transactionContext.prisma.$executeRaw(Prisma.sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`)
    const fresh = await currentEpisodeActor(transactionContext, options.model === 'InsuranceClaim' ? 'billing' : 'clinical')
    if (options.model === 'LabResult') {
      const original = await replayAcceptedLabTransition(fresh, options.id, ev, {
        operationKey: options.operationKey, resultId: options.id, toStatus: options.toStatus, expectedVersion: options.expectedVersion,
      })
      if (original) {
        if (original.originalAcknowledgement.state.startsWith('legacy_')) throw new Error('Original lab transition status/version are known, but its full command is unknown. Retain the identity and use owned readback; no replacement key is authorized.')
        return original
      }
    }
    const child = await currentEpisodeChild(fresh, options.model, options.id)
    const prior = await fresh.prisma.workflowTransition.findUnique({ where: { operationKeyHash: ev.operationKeyHash }, select: { actorReference: true } })
    if (prior && prior.actorReference !== fresh.session.itemId) throw new Error('Original child operation is not owned')
    const guarded = await guardEpisodeChild(fresh, child.input,
      options.model === 'InsuranceClaim' ? 'claim' : options.toStatus === 'cancelled' ? 'cancel_evidence' : options.model === 'LabResult' ? 'late_result' : 'new_care', false, Boolean(prior))
    await recheckEpisodeRelated(guarded.context, options.model, child.input, true)
    const sudo = guarded.context.sudo()
    await lockTransitionOperation(sudo.prisma, ev.operationKeyHash)
    await sudo.prisma.$queryRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${options.prefix}:${options.id}`}, 0))::text AS "lock"`,
    )
    const replay = options.model === 'LabResult'
      ? await replayAcceptedLabTransition(fresh, options.id, ev, {
        operationKey: options.operationKey, resultId: options.id, toStatus: options.toStatus, expectedVersion: options.expectedVersion,
      })
      : await replayTransition(sudo.prisma, ev, options.prefix, options.id)
    if (replay) {
      if (options.model === 'LabResult' && replay.originalAcknowledgement.state.startsWith('legacy_')) throw new Error('Original lab transition command is unknown; retain the original identity and use owned readback')
      return replay
    }
    const current = await sudo.prisma[options.delegate].findUnique({ where: { id: options.id },
      ...(options.model === 'LabResult' ? { select: { id: true, status: true, transitionVersion: true, facilityId: true, patientId: true, encounterId: true } } : {}),
    })
    if (!current || current.transitionVersion !== options.expectedVersion) {
      throw new Error('Clinical record changed; refresh before retrying')
    }
    const row = await sudo.query[options.model].updateOne({
      where: { id: options.id },
      data: { status: options.toStatus, ...data },
      query: 'id status transitionVersion',
    })
    if (options.afterTransition) await options.afterTransition(sudo.prisma, current, row, ev)
    const result = { ...projection(row, false), ...(options.model === 'LabResult' ? { originalCommand: {
      operationKey: options.operationKey, resultId: options.id, toStatus: options.toStatus, expectedVersion: options.expectedVersion,
      actorReference: fresh.session.itemId,
    } } : {}) }
    const outbox = await sudo.prisma.clinicalOutboxEvent.findUnique({
      where: { eventKey: `${options.prefix}:${options.id}:v${row.transitionVersion}:${row.status}` },
      select: { id: true },
    })
    await recordTransition(sudo.prisma, {
      evidence: ev,
      aggregateType: options.prefix,
      aggregateId: options.id,
      fromStatus: current.status,
      toStatus: row.status,
      fromVersion: current.transitionVersion,
      toVersion: row.transitionVersion,
      actorReference: context.session?.itemId ?? '',
      facilityId: current.facilityId,
      patientId: current.patientId,
      outboxEventId: outbox?.id,
      result,
      occurredAt: new Date(),
    })
    return result
  }, { timeout: 30_000 })
}

async function scopedBed(context: Context, bedId: string, facilityId?: string) {
  const bed = await context.query.Bed.findOne({
    where: { id: bedId },
    query: 'id status transitionVersion facility { id } currentPatient { id } room { id }',
  }) as any
  if (!bed || (facilityId && bed.facility?.id !== facilityId)) {
    throw new Error('Bed not found or not accessible in the facility')
  }
  return bed
}

async function validateRelatedOrder(
  context: Context,
  input: { medicalOrderId?: string; orderType: string; facilityId: string; patientId: string; encounterId: string },
) {
  if (!input.medicalOrderId) return
  const order = await context.query.MedicalOrder.findOne({
    where: { id: input.medicalOrderId },
    query: 'id orderType status facility { id } patient { id } encounter { id }',
  }) as any
  if (
    !order ||
    order.orderType !== input.orderType ||
    order.facility?.id !== input.facilityId ||
    order.patient?.id !== input.patientId ||
    order.encounter?.id !== input.encounterId
  ) {
    throw new Error(`Related ${input.orderType} order does not match the active patient encounter`)
  }
}

async function recordAdmissionTransition(
  prisma: any,
  input: {
    ev: { operationKeyHash: string; requestHash: string }
    current: any
    row: any
    actorReference: string
    occurredAt: Date
  },
) {
  const result = projection(input.row, false)
  const outbox = await prisma.clinicalOutboxEvent.findUnique({
    where: {
      eventKey: `admission:${input.current.id}:v${input.row.transitionVersion}:${input.row.status}`,
    },
    select: { id: true },
  })
  await recordTransition(prisma, {
    evidence: input.ev,
    aggregateType: 'admission',
    aggregateId: input.current.id,
    fromStatus: input.current.status,
    toStatus: input.row.status,
    fromVersion: input.current.transitionVersion,
    toVersion: input.row.transitionVersion,
    actorReference: input.actorReference,
    facilityId: input.current.facilityId,
    patientId: input.current.patientId,
    outboxEventId: outbox?.id,
    result,
    occurredAt: input.occurredAt,
  })
  return result
}

export async function admitPatient(_root: unknown, { data }: any, context: Context) {
  const input = { ...data, notes: bounded(data.notes, 'Admission notes', 4000) }
  const scoped = await scope(context, {
    facilityId: data.facilityId,
    patientId: data.patientId,
    providerId: data.attendingProviderId,
    encounterId: data.encounterId,
  })
  if (scoped.encounter && !['open', 'in_progress'].includes(scoped.encounter.status)) {
    throw new Error('Admission encounter must be open or in progress')
  }
  const bed = await scopedBed(context, data.bedId, data.facilityId)
  const ev = creationEvidence(input)

  return context.transaction(async (transactionContext: any) => {
    const fresh = await currentEpisodeActor(transactionContext)
    const prior = await fresh.prisma.admission.findUnique({ where: { operationKeyHash: ev.operationKeyHash }, select: { actorReference: true } })
    if (prior && prior.actorReference !== fresh.session.itemId) throw new Error('Original admission operation is not owned')
    const guarded = await guardEpisodeChild(fresh, input, 'new_care', false, Boolean(prior))
    if (input.encounterId && !prior) {
      const currentEncounter = await guarded.context.query.Encounter.findOne({ where: { id: input.encounterId }, query: 'id status' })
      if (!['open', 'in_progress'].includes(currentEncounter?.status)) throw new Error('Current admission encounter must be open or in progress')
    }
    await scopedBed(guarded.context, data.bedId, data.facilityId)
    const sudo = guarded.context.sudo()
    await sudo.prisma.$queryRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`admission:create:${ev.operationKeyHash}`}, 0))::text AS "lock"`,
    )
    const existing = await sudo.prisma.admission.findUnique({
      where: { operationKeyHash: ev.operationKeyHash },
    })
    if (existing) {
      if (existing.requestHash !== ev.requestHash) {
        throw new Error('Operation key was reused with a different payload')
      }
      return projection(existing, true)
    }

    await sudo.prisma.$queryRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`bed:${data.bedId}`}, 0))::text AS "lock"`,
    )
    const currentBed = await sudo.prisma.bed.findUnique({ where: { id: data.bedId } })
    const activeReservation = await sudo.prisma.bedReservation.findFirst({
      where: { bedId: data.bedId, status: 'active' },
    })
    const reservationMatches = Boolean(
      activeReservation &&
      activeReservation.patientId === data.patientId &&
      activeReservation.facilityId === data.facilityId &&
      activeReservation.expiresAt > new Date(),
    )
    if (
      !currentBed ||
      currentBed.facilityId !== data.facilityId ||
      currentBed.currentPatientId ||
      !(
        (currentBed.status === 'available' && !activeReservation) ||
        (currentBed.status === 'reserved' && reservationMatches)
      )
    ) {
      throw new Error('Bed is no longer available for this patient')
    }

    const now = new Date()
    const admission = await sudo.query.Admission.createOne({
      data: {
        admissionNumber: `ADM-${randomUUID()}`,
        facility: { connect: { id: data.facilityId } },
        patient: { connect: { id: data.patientId } },
        encounter: data.encounterId ? { connect: { id: data.encounterId } } : undefined,
        attendingProvider: { connect: { id: data.attendingProviderId } },
        room: { connect: { id: bed.room.id } },
        bed: { connect: { id: data.bedId } },
        admittedAt: now,
        notes: input.notes,
        ...ev,
      },
      query: 'id status transitionVersion',
    })
    if (activeReservation) {
      const consumed = await sudo.prisma.bedReservation.update({
        where: { id: activeReservation.id },
        data: { status: 'consumed', transitionVersion: { increment: 1 }, consumedAt: now, admissionId: admission.id, actorReference: context.session!.itemId },
      })
      await appendAuditAndOutbox(sudo.prisma, {
        eventKey: `bed_reservation:${consumed.id}:v${consumed.transitionVersion}:consumed`, eventType: 'bed_reservation.consumed',
        aggregateType: 'bed_reservation', aggregateId: consumed.id, facilityId: consumed.facilityId, patientId: consumed.patientId,
        actorReference: context.session!.itemId,
        metadata: { source: 'admission_workflow', aggregateId: consumed.id, admissionId: admission.id, bedId: consumed.bedId, fromStatus: activeReservation.status, status: consumed.status, transitionVersion: consumed.transitionVersion },
        occurredAt: now,
      })
    }
    await sudo.prisma.bed.update({
      where: { id: data.bedId },
      data: {
        status: 'occupied',
        currentPatientId: data.patientId,
        transitionVersion: { increment: 1 },
      },
    })
    await sudo.prisma.bedOccupancyEvent.create({
      data: {
        eventKey: `admission:${admission.id}:assigned:v1`,
        eventType: 'assigned',
        facilityId: data.facilityId,
        patientId: data.patientId,
        admissionId: admission.id,
        bedId: data.bedId,
        actorReference: context.session!.itemId,
        reasonCode: 'admission',
        occurredAt: now,
      },
    })
    return projection(admission, false)
  }, { timeout: 30_000 })
}

export async function transitionAdmission(_root: unknown, args: any, context: Context) {
  const scoped = await scopedRecord(context, 'Admission', args.admissionId) as any
  if (!Number.isInteger(args.expectedVersion) || args.expectedVersion < 1) {
    throw new Error('Expected admission version is invalid')
  }
  const reasonCode = bounded(args.reasonCode, 'Transfer reason', 80, args.toStatus === 'transferred')
  const dischargeDisposition = bounded(
    args.dischargeDisposition,
    'Discharge disposition',
    500,
    args.toStatus === 'discharged',
  )
  const ev = transitionEvidence(args.operationKey, {
    admissionId: args.admissionId,
    toStatus: args.toStatus,
    expectedVersion: args.expectedVersion,
    bedId: args.bedId || null,
    reasonCode,
    dischargeDisposition,
  })
  const target = args.toStatus === 'transferred'
    ? await scopedBed(context, args.bedId, scoped.facility.id)
    : null

  return context.transaction(async (transactionContext: any) => {
    const fresh = await currentEpisodeActor(transactionContext)
    const child = await currentEpisodeChild(fresh, 'Admission', args.admissionId)
    const guarded = await guardEpisodeChild(fresh, child.input, 'cancel_evidence', false, true)
    const sudo = guarded.context.sudo()
    const prior = await sudo.prisma.workflowTransition.findUnique({ where: { operationKeyHash: ev.operationKeyHash }, select: { actorReference: true } })
    if (prior && prior.actorReference !== fresh.session.itemId) throw new Error('Original admission operation is not owned')
    if (args.toStatus === 'transferred') await scopedBed(guarded.context, args.bedId, child.input.facilityId)
    await lockTransitionOperation(sudo.prisma, ev.operationKeyHash)
    await sudo.prisma.$queryRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`admission:${args.admissionId}`}, 0))::text AS "lock"`,
    )
    const replay = await replayTransition(sudo.prisma, ev, 'admission', args.admissionId)
    if (replay) return replay

    let current = await sudo.prisma.admission.findUnique({ where: { id: args.admissionId } })
    if (!current || current.transitionVersion !== args.expectedVersion) {
      throw new Error('Admission changed; refresh before retrying')
    }
    if (!['admitted', 'transferred'].includes(current.status)) {
      throw new Error(`Invalid admission transition from ${current.status} to ${args.toStatus}`)
    }

    const now = new Date()
    if (args.toStatus === 'transferred') {
      if (!args.bedId || args.bedId === current.bedId || !target?.room?.id) {
        throw new Error('A different destination bed is required')
      }
      const bedIds = [...new Set([current.bedId, args.bedId].filter(Boolean))].sort()
      for (const bedId of bedIds) {
        await sudo.prisma.$queryRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`bed:${bedId}`}, 0))::text AS "lock"`,
        )
      }
      current = await sudo.prisma.admission.findUnique({ where: { id: args.admissionId } })
      const [newBed, currentBed] = await Promise.all([
        sudo.prisma.bed.findUnique({ where: { id: args.bedId } }),
        current?.bedId ? sudo.prisma.bed.findUnique({ where: { id: current.bedId } }) : null,
      ])
      if (
        !current ||
        current.transitionVersion !== args.expectedVersion ||
        !newBed ||
        newBed.facilityId !== current.facilityId ||
        newBed.status !== 'available' ||
        newBed.currentPatientId ||
        (current.bedId && currentBed?.currentPatientId !== current.patientId)
      ) {
        throw new Error('Admission or destination bed changed; refresh before retrying')
      }
      if (current.bedId) {
        await sudo.prisma.bed.update({
          where: { id: current.bedId },
          data: { status: 'cleaning', currentPatientId: null, transitionVersion: { increment: 1 } },
        })
      }
      await sudo.prisma.bed.update({
        where: { id: args.bedId },
        data: { status: 'occupied', currentPatientId: current.patientId, transitionVersion: { increment: 1 } },
      })
      await sudo.prisma.bedOccupancyEvent.create({
        data: {
          eventKey: `admission:${current.id}:transfer:v${current.transitionVersion + 1}`,
          eventType: 'transferred',
          facilityId: current.facilityId,
          patientId: current.patientId,
          admissionId: current.id,
          bedId: args.bedId,
          previousBedId: current.bedId,
          actorReference: context.session!.itemId,
          reasonCode,
          occurredAt: now,
        },
      })
      const row = await sudo.query.Admission.updateOne({
        where: { id: current.id },
        data: {
          status: 'transferred',
          room: { connect: { id: target.room.id } },
          bed: { connect: { id: args.bedId } },
        },
        query: 'id status transitionVersion',
      })
      return recordAdmissionTransition(sudo.prisma, {
        ev,
        current,
        row,
        actorReference: context.session!.itemId,
        occurredAt: now,
      })
    }

    if (args.toStatus === 'discharged') {
      if (current.bedId) {
        await sudo.prisma.$queryRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`bed:${current.bedId}`}, 0))::text AS "lock"`,
        )
        current = await sudo.prisma.admission.findUnique({ where: { id: args.admissionId } })
        const occupiedBed = current?.bedId
          ? await sudo.prisma.bed.findUnique({ where: { id: current.bedId } })
          : null
        if (
          !current ||
          current.transitionVersion !== args.expectedVersion ||
          !occupiedBed ||
          occupiedBed.currentPatientId !== current.patientId
        ) {
          throw new Error('Admission bed changed; refresh before retrying')
        }
        await sudo.prisma.bed.update({
          where: { id: current.bedId },
          data: { status: 'cleaning', currentPatientId: null, transitionVersion: { increment: 1 } },
        })
      }
      await sudo.prisma.bedOccupancyEvent.create({
        data: {
          eventKey: `admission:${current.id}:released:v${current.transitionVersion + 1}`,
          eventType: 'released',
          facilityId: current.facilityId,
          patientId: current.patientId,
          admissionId: current.id,
          bedId: current.bedId,
          actorReference: context.session!.itemId,
          reasonCode: 'discharge',
          occurredAt: now,
        },
      })
      const row = await sudo.query.Admission.updateOne({
        where: { id: current.id },
        data: { status: 'discharged', dischargeDisposition },
        query: 'id status transitionVersion',
      })
      return recordAdmissionTransition(sudo.prisma, {
        ev,
        current,
        row,
        actorReference: context.session!.itemId,
        occurredAt: now,
      })
    }

    throw new Error('Unsupported admission transition')
  }, { timeout: 30_000 })
}

export async function transitionBedReadiness(_root: unknown, args: any, context: Context) {
  requireOperator(context)
  if (!Number.isInteger(args.expectedVersion) || args.expectedVersion < 1) {
    throw new Error('Expected bed version is invalid')
  }
  const bed = await scopedBed(context, args.bedId)
  const facilityId = bed.facility?.id
  if (!facilityId) throw new Error('Bed is missing direct facility scope')
  const ev = transitionEvidence(args.operationKey, {
    bedId: args.bedId,
    toStatus: args.toStatus,
    expectedVersion: args.expectedVersion,
  })
  const allowed: Record<string, string[]> = {
    cleaning: ['available', 'out_of_service'],
    available: ['out_of_service'],
    out_of_service: ['available'],
  }

  return context.transaction(async (transactionContext: any) => {
    const sudo = transactionContext.sudo()
    await lockTransitionOperation(sudo.prisma, ev.operationKeyHash)
    await sudo.prisma.$queryRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`bed:${args.bedId}`}, 0))::text AS "lock"`,
    )
    const replay = await replayTransition(sudo.prisma, ev, 'bed', args.bedId)
    if (replay) return replay
    const current = await sudo.prisma.bed.findUnique({ where: { id: args.bedId } })
    if (
      !current ||
      current.facilityId !== facilityId ||
      current.transitionVersion !== args.expectedVersion ||
      current.currentPatientId
    ) {
      throw new Error('Bed changed or remains occupied')
    }
    if (!allowed[current.status]?.includes(args.toStatus)) {
      throw new Error('Invalid bed readiness transition')
    }

    const now = new Date()
    const updated = await sudo.prisma.bed.update({
      where: { id: current.id },
      data: { status: args.toStatus, transitionVersion: { increment: 1 } },
    })
    const metadata = {
      source: 'bed_readiness_transition',
      aggregateType: 'bed',
      aggregateId: current.id,
      fromStatus: current.status,
      status: updated.status,
      transitionVersion: updated.transitionVersion,
    }
    const eventType = `bed.${updated.status}`
    const audit = await sudo.prisma.clinicalAuditLog.create({
      data: {
        eventType,
        occurredAt: now,
        actorType: 'staff_user',
        actorReference: context.session!.itemId,
        facilityId,
        metadata,
        createdAt: now,
      },
    })
    const outbox = await sudo.prisma.clinicalOutboxEvent.create({
      data: {
        eventKey: `bed:${current.id}:v${updated.transitionVersion}:${updated.status}`,
        eventType,
        aggregateType: 'bed',
        aggregateId: current.id,
        status: 'recorded',
        attempts: 0,
        nextAttemptAt: null,
        facilityId,
        payload: metadata,
        createdAt: now,
      },
    })
    if (updated.status === 'available') {
      await sudo.prisma.bedOccupancyEvent.create({
        data: {
          eventKey: `bed:${current.id}:available:v${updated.transitionVersion}`,
          eventType: 'available',
          facilityId,
          bedId: current.id,
          actorReference: context.session!.itemId,
          reasonCode: 'readiness_complete',
          occurredAt: now,
        },
      })
    }
    const result = {
      id: updated.id,
      status: updated.status,
      transitionVersion: updated.transitionVersion,
      replayed: false,
    }
    await recordTransition(sudo.prisma, {
      evidence: ev,
      aggregateType: 'bed',
      aggregateId: current.id,
      fromStatus: current.status,
      toStatus: updated.status,
      fromVersion: current.transitionVersion,
      toVersion: updated.transitionVersion,
      actorReference: context.session!.itemId,
      facilityId,
      auditLogId: audit.id,
      outboxEventId: outbox.id,
      result,
      occurredAt: now,
    })
    return result
  }, { timeout: 30_000 })
}

export async function createMedicalOrder(_root: unknown, { data }: any, context: Context) {
  if (!ORDER_TYPES.has(data.orderType)) throw new Error('Order type is invalid')
  await scope(context, {
    facilityId: data.facilityId,
    patientId: data.patientId,
    encounterId: data.encounterId,
    providerId: data.orderingProviderId,
  })
  const input = { ...data, summary: bounded(data.summary, 'Order summary', 4000, true) }
  return createControlled(context, {
    model: 'MedicalOrder',
    delegate: 'medicalOrder',
    prefix: 'medical_order',
    input,
    data: {
      orderNumber: `ORD-${randomUUID()}`,
      orderType: data.orderType,
      facility: { connect: { id: data.facilityId } },
      patient: { connect: { id: data.patientId } },
      encounter: { connect: { id: data.encounterId } },
      orderingProvider: { connect: { id: data.orderingProviderId } },
      summary: input.summary,
    },
  })
}

export const transitionMedicalOrder = (_root: unknown, args: any, context: Context) => transitionControlled(context, {
  model: 'MedicalOrder',
  delegate: 'medicalOrder',
  prefix: 'medical_order',
  id: args.orderId,
  toStatus: args.toStatus,
  expectedVersion: args.expectedVersion,
  operationKey: args.operationKey,
})

export async function recordLabResult(_root: unknown, { data }: { data: LabCommand }, context: Context) {
  // Current authority and original receipt are checked in the native transaction
  // BEFORE fresh catalog admission. New effects still use unchanged active-test,
  // order and episode-policy checks below in createControlled.
  if (JSON.stringify(data).length > 16_000) throw new Error('Original lab command is too large')
  if (!RESULT_FLAGS.has(data.abnormalFlag ?? 'normal')) throw new Error('Result flag is invalid')
  const input = {
    ...data,
    resultValue: bounded(data.resultValue, 'Result value', 4000, true),
    referenceRange: bounded(data.referenceRange, 'Reference range', 1000),
  }
  return createControlled(context, {
    model: 'LabResult',
    delegate: 'labResult',
    prefix: 'lab_result',
    input,
    originalLabCommand: data,
    data: {
      resultNumber: `RESULT-${randomUUID()}`,
      facility: { connect: { id: data.facilityId } },
      patient: { connect: { id: data.patientId } },
      encounter: { connect: { id: data.encounterId } },
      medicalOrder: { connect: { id: data.medicalOrderId } },
      labTest: { connect: { id: data.labTestId } },
      resultValue: input.resultValue,
      referenceRange: input.referenceRange,
      abnormalFlag: data.abnormalFlag ?? 'normal',
    },
  })
}

export const transitionLabResult = (_root: unknown, args: any, context: Context) => transitionControlled(context, {
  model: 'LabResult',
  delegate: 'labResult',
  prefix: 'lab_result',
  id: args.resultId,
  toStatus: args.toStatus,
  expectedVersion: args.expectedVersion,
  operationKey: args.operationKey,
  data: args.toStatus === 'acknowledged'
    ? { acknowledgedBy: { connect: { id: context.session!.itemId } } }
    : {},
})

export async function correctLabResult(_root: unknown, { data }: { data: LabCorrectionCommand }, context: Context) {
  if (JSON.stringify(data).length > 16_000) throw new Error('Original correction command is too large')
  const original = await context.query.LabResult.findOne({
    where: { id: data.resultId },
    query: 'id status version facility { id } patient { id } encounter { id } medicalOrder { id } labTest { id }',
  }) as any
  if (
    !original ||
    !['final', 'acknowledged', 'corrected'].includes(original.status) ||
    !original.facility?.id ||
    !original.patient?.id ||
    !original.encounter?.id ||
    !original.medicalOrder?.id ||
    !original.labTest?.id
  ) {
    throw new Error('Final result not found or not accessible for correction')
  }
  await scope(context, {
    facilityId: original.facility.id,
    patientId: original.patient.id,
    encounterId: original.encounter.id,
  })
  if (!RESULT_FLAGS.has(data.abnormalFlag ?? 'normal')) throw new Error('Result flag is invalid')
  const input = {
    ...data,
    resultValue: bounded(data.resultValue, 'Corrected result value', 4000, true),
    referenceRange: bounded(data.referenceRange, 'Reference range', 1000),
  }
  const humanReviewReference = requireHumanEpisodeReview(data.humanReviewed, data.humanReviewReference)
  const ev = creationEvidence(input)

  return context.transaction(async (transactionContext: any) => {
    await transactionContext.prisma.$executeRaw(Prisma.sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`)
    const fresh = await currentEpisodeActor(transactionContext)
    const accepted = await replayAcceptedLabCorrection(fresh, ev, data)
    if (accepted) {
      if (accepted.originalAcknowledgement.state.startsWith('legacy_')) throw new Error('Legacy correction identity verified, but original body/status/version acknowledgement is unknown. Use read-only result readback and retain the original command.')
      return accepted
    }
    const child = await currentEpisodeChild(fresh, 'LabResult', original.id)
    if (child.input.facilityId !== original.facility.id || child.input.patientId !== original.patient.id || child.input.encounterId !== original.encounter.id) throw new Error('Correction scope changed; review before retrying')
    const prior = await fresh.prisma.labResult.findUnique({ where: { operationKeyHash: ev.operationKeyHash }, select: { actorReference: true } })
    if (prior && prior.actorReference !== fresh.session.itemId) throw new Error('Original correction operation is not owned')
    const guarded = await guardEpisodeChild(fresh, child.input, 'correction', true, Boolean(prior))
    await recheckEpisodeRelated(guarded.context, 'LabResultCorrection', { ...child.input, medicalOrderId: original.medicalOrder.id, labTestId: original.labTest.id }, Boolean(prior))
    const sudo = guarded.context.sudo()
    await sudo.prisma.$queryRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`lab-result-correction:${original.id}`}, 0))::text AS "lock"`,
    )
    const existing = await sudo.prisma.labResult.findUnique({ where: { operationKeyHash: ev.operationKeyHash }, select: { id: true } })
    if (existing) throw new Error('Existing correction requires original receipt recovery; retain and retry the exact command')
    const priorCorrection = await sudo.prisma.labResult.findFirst({ where: { supersedesResultId: original.id }, select: { id: true } })
    if (priorCorrection) throw new Error('Result was already superseded; correct the latest version instead')
    const current = await sudo.prisma.labResult.findUnique({ where: { id: original.id }, select: {
      id: true, version: true, facilityId: true, patientId: true, encounterId: true, medicalOrderId: true, labTestId: true,
    } })
    if (!current || current.version !== original.version || current.facilityId !== original.facility.id || current.patientId !== original.patient.id || current.encounterId !== original.encounter.id || current.medicalOrderId !== original.medicalOrder.id || current.labTestId !== original.labTest.id) throw new Error('Result changed; refresh before correcting')
    const created = await sudo.query.LabResult.createOne({
      data: {
        resultNumber: `RESULT-${randomUUID()}`,
        facility: { connect: { id: original.facility.id } },
        patient: { connect: { id: original.patient.id } },
        encounter: { connect: { id: original.encounter.id } },
        medicalOrder: { connect: { id: original.medicalOrder.id } },
        labTest: { connect: { id: original.labTest.id } },
        supersedesResult: { connect: { id: original.id } },
        metadata: { humanReviewed: true, humanReviewReference, reviewedByReference: fresh.session.itemId, softwareClinicalDecisionPerformed: false },
        version: current.version + 1,
        resultValue: input.resultValue,
        referenceRange: input.referenceRange,
        abnormalFlag: data.abnormalFlag ?? 'normal',
        ...ev,
      },
      query: 'id status transitionVersion',
    })
    const corrected = await sudo.query.LabResult.updateOne({
      where: { id: created.id },
      data: { status: 'corrected' },
      query: 'id status transitionVersion',
    })
    await persistOriginalLabReceipt(sudo.prisma, corrected, ev, data, fresh.session.itemId, {
      facilityId: original.facility.id, patientId: original.patient.id, encounterId: original.encounter.id,
      medicalOrderId: original.medicalOrder.id, labTestId: original.labTest.id,
    }, current.version + 1, current.version)
    return projection(corrected, false)
  }, { timeout: 30_000 })
}

export async function createPrescription(_root: unknown, { data }: any, context: Context) {
  await scope(context, {
    facilityId: data.facilityId,
    patientId: data.patientId,
    encounterId: data.encounterId,
    providerId: data.providerId,
  })
  await validateRelatedOrder(context, {
    medicalOrderId: data.medicalOrderId,
    orderType: 'medication',
    facilityId: data.facilityId,
    patientId: data.patientId,
    encounterId: data.encounterId,
  })
  const recordingBasis = bounded(data.recordingBasis, 'Prescription recording basis', 80, true)
  if (!['external_record', 'manual_reconciliation'].includes(recordingBasis)) {
    throw new Error('Prescription records must identify an external/manual recording basis')
  }
  const input = {
    ...data,
    recordingBasis,
    medicationName: bounded(data.medicationName, 'Medication name', 300, true),
    dosage: bounded(data.dosage, 'Dosage', 500, true),
    frequency: bounded(data.frequency, 'Frequency', 500, true),
    notes: bounded(data.notes, 'Prescription notes', 3000),
  }
  return createControlled(context, {
    model: 'Prescription',
    delegate: 'prescription',
    prefix: 'prescription',
    input,
    data: {
      prescriptionNumber: `RX-${randomUUID()}`,
      facility: { connect: { id: data.facilityId } },
      patient: { connect: { id: data.patientId } },
      encounter: { connect: { id: data.encounterId } },
      provider: { connect: { id: data.providerId } },
      medicalOrder: data.medicalOrderId ? { connect: { id: data.medicalOrderId } } : undefined,
      recordingBasis,
      medicationName: input.medicationName,
      dosage: input.dosage,
      frequency: input.frequency,
      notes: input.notes,
    },
  })
}

export const transitionPrescription = (_root: unknown, args: any, context: Context) => transitionControlled(context, {
  model: 'Prescription',
  delegate: 'prescription',
  prefix: 'prescription',
  id: args.prescriptionId,
  toStatus: args.toStatus,
  expectedVersion: args.expectedVersion,
  operationKey: args.operationKey,
})

export async function createProcedure(_root: unknown, { data }: any, context: Context) {
  await scope(context, {
    facilityId: data.facilityId,
    patientId: data.patientId,
    encounterId: data.encounterId,
    providerId: data.providerId,
  })
  await validateRelatedOrder(context, {
    medicalOrderId: data.medicalOrderId,
    orderType: 'procedure',
    facilityId: data.facilityId,
    patientId: data.patientId,
    encounterId: data.encounterId,
  })
  const input = {
    ...data,
    procedureName: bounded(data.procedureName, 'Procedure name', 300, true),
    notes: bounded(data.notes, 'Procedure notes', 3000),
  }
  const scheduledAt = data.scheduledAt ? new Date(data.scheduledAt) : null
  if (scheduledAt && Number.isNaN(scheduledAt.getTime())) throw new Error('Procedure schedule is invalid')
  return createControlled(context, {
    model: 'Procedure',
    delegate: 'procedure',
    prefix: 'procedure',
    input,
    data: {
      procedureNumber: `PROC-${randomUUID()}`,
      facility: { connect: { id: data.facilityId } },
      patient: { connect: { id: data.patientId } },
      encounter: { connect: { id: data.encounterId } },
      provider: { connect: { id: data.providerId } },
      medicalOrder: data.medicalOrderId ? { connect: { id: data.medicalOrderId } } : undefined,
      procedureName: input.procedureName,
      scheduledAt,
      notes: input.notes,
    },
  })
}

export const transitionProcedure = (_root: unknown, args: any, context: Context) => transitionControlled(context, {
  model: 'Procedure',
  delegate: 'procedure',
  prefix: 'procedure',
  id: args.procedureId,
  toStatus: args.toStatus,
  expectedVersion: args.expectedVersion,
  operationKey: args.operationKey,
})

export async function createCarePlan(_root: unknown, { data }: any, context: Context) {
  await scope(context, {
    facilityId: data.facilityId,
    patientId: data.patientId,
    encounterId: data.encounterId,
    providerId: data.providerId,
  })
  const input = {
    ...data,
    title: bounded(data.title, 'Care plan title', 200, true),
    goals: bounded(data.goals, 'Care plan goals', 4000, true),
    interventions: bounded(data.interventions, 'Care plan interventions', 4000, true),
  }
  return createControlled(context, {
    model: 'CarePlan',
    delegate: 'carePlan',
    prefix: 'care_plan',
    input,
    data: {
      title: input.title,
      facility: { connect: { id: data.facilityId } },
      patient: { connect: { id: data.patientId } },
      provider: { connect: { id: data.providerId } },
      encounter: data.encounterId ? { connect: { id: data.encounterId } } : undefined,
      goals: input.goals,
      interventions: input.interventions,
    },
  })
}

export const transitionCarePlan = (_root: unknown, args: any, context: Context) => transitionControlled(context, {
  model: 'CarePlan',
  delegate: 'carePlan',
  prefix: 'care_plan',
  id: args.carePlanId,
  toStatus: args.toStatus,
  expectedVersion: args.expectedVersion,
  operationKey: args.operationKey,
})

async function appendClaimVersion(
  prisma: any,
  claimId: string,
  evidence: { operationKeyHash: string; requestHash: string },
  actorReference: string,
) {
  const claim = await prisma.insuranceClaim.findUnique({ where: { id: claimId } })
  if (!claim) throw new Error('Claim version source is missing')
  await prisma.claimVersion.create({ data: {
    versionKey: `${claim.id}:v${claim.transitionVersion}`,
    version: claim.transitionVersion,
    status: claim.status,
    ...evidence,
    facilityId: claim.facilityId,
    patientId: claim.patientId,
    claimId: claim.id,
    coverageId: claim.coverageId,
    reasonCode: claim.reasonCode || '',
    snapshot: {
      claimNumber: claim.claimNumber,
      status: claim.status,
      billedAmountCents: claim.billedAmountCents,
      paidAmountCents: claim.paidAmountCents,
      payerName: claim.payerName,
      reasonCode: claim.reasonCode || '',
    },
    actorReference,
    createdAt: new Date(),
  } })
}

function requireBillingOperator(context: Context) {
  const role = context.session?.data.role
  if (!role?.canAccessAllClinicalData && !role?.canManageBilling) {
    throw new Error('Billing permission is required to manage claims')
  }
}

function requireClinicalOrBillingOperator(context: Context) {
  const role = context.session?.data.role
  if (!role?.canAccessAllClinicalData && !role?.canManagePatients && !role?.canManageBilling) {
    throw new Error('Patient-operation or billing permission is required for this selector')
  }
}

async function facilityPatientScope(context: Context, input: { facilityId: string; patientId: string }) {
  const [facility, patient] = await Promise.all([
    context.query.Facility.findOne({ where: { id: input.facilityId }, query: 'id status' }),
    context.query.Patient.findOne({ where: { id: input.patientId }, query: 'id status facilities { id }' }),
  ]) as any[]
  if (
    !facility || facility.status !== 'active' || patient?.status !== 'active' ||
    !patient.facilities?.some((item: any) => item.id === input.facilityId)
  ) throw new Error('Facility or patient not found or not accessible')
}

async function billingScope(context: Context, input: { facilityId: string; patientId: string; encounterId?: string }) {
  requireBillingOperator(context)
  await facilityPatientScope(context, input)
  if (input.encounterId) {
    // Billing operators receive no general clinical-record access. After the
    // billing role and direct facility/patient relationship are verified, use a
    // minimal internal projection solely to enforce the claim relationship.
    const encounter = await context.sudo().query.Encounter.findOne({
      where: { id: input.encounterId }, query: 'id patient { id } facility { id }',
    }) as any
    if (encounter?.patient?.id !== input.patientId || encounter?.facility?.id !== input.facilityId) {
      throw new Error('Encounter does not match the accessible billing patient and facility')
    }
  }
}

export async function workflowPatientCandidates(_root: unknown, args: any, context: Context) {
  requireClinicalOrBillingOperator(context)
  const facilityId = bounded(args.facilityId, 'Facility reference', 200, true)
  const facility = await context.query.Facility.findOne({ where: { id: facilityId }, query: 'id status' }) as any
  if (!facility || facility.status !== 'active') throw new Error('Facility not found or not accessible')
  const search = bounded(args.search, 'Patient search', 100, true)
  if (search.length < 2) throw new Error('Enter at least two characters to search patients')
  const terms = search.split(/\s+/).filter(Boolean).slice(0, 2)
  const nameFilters: any[] = terms.flatMap((term: string) => [
    { firstName: { contains: term, mode: 'insensitive' } },
    { lastName: { contains: term, mode: 'insensitive' } },
    { id: { contains: term, mode: 'insensitive' } },
  ])
  if (terms.length > 1) nameFilters.push(
    { AND: [{ firstName: { contains: terms[0], mode: 'insensitive' } }, { lastName: { contains: terms[1], mode: 'insensitive' } }] },
    { AND: [{ firstName: { contains: terms[1], mode: 'insensitive' } }, { lastName: { contains: terms[0], mode: 'insensitive' } }] },
  )
  return context.query.Patient.findMany({
    where: {
      status: { equals: 'active' },
      facilities: { some: { id: { equals: facilityId } } },
      OR: nameFilters,
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
    take: Math.min(Math.max(Number.isInteger(args.take) ? args.take : 25, 1), 25),
    query: 'id displayName',
  })
}

export async function workflowEncounterCandidates(_root: unknown, args: any, context: Context) {
  requireClinicalOrBillingOperator(context)
  await facilityPatientScope(context, { facilityId: args.facilityId, patientId: args.patientId })
  const search = bounded(args.search, 'Encounter search', 100, true)
  if (search.length < 2) throw new Error('Enter at least two characters to search encounters')
  const take = Number.isInteger(args.take) ? Math.min(Math.max(args.take, 1), 25) : 25
  const skip = Number.isInteger(args.skip) ? Math.min(Math.max(args.skip, 0), 5_000) : 0
  return context.sudo().prisma.encounter.findMany({
    where: {
      facilityId: args.facilityId,
      patientId: args.patientId,
      status: { in: ['open', 'in_progress', 'closed'] },
      encounterNumber: { contains: search, mode: 'insensitive' },
    },
    select: { id: true, encounterNumber: true, status: true },
    orderBy: [{ encounterNumber: 'asc' }, { id: 'asc' }],
    take,
    skip,
  })
}

export async function prepareInsuranceClaim(_root: unknown, { data }: any, context: Context) {
  requireBillingOperator(context)
  await billingScope(context, {
    facilityId: data.facilityId,
    patientId: data.patientId,
    encounterId: data.encounterId,
  })
  if (data.coverageId) {
    const coverage = await context.query.PatientCoverage.findOne({
      where: { id: data.coverageId }, query: 'id status facility { id } patient { id } payerName',
    }) as any
    if (
      !coverage || coverage.status !== 'active' || coverage.facility?.id !== data.facilityId ||
      coverage.patient?.id !== data.patientId
    ) throw new Error('Active coverage does not match the claim patient and facility')
  }
  const input = { ...data, payerName: bounded(data.payerName, 'Payer name', 300, true) }
  if (!Number.isSafeInteger(data.billedAmountCents) || data.billedAmountCents < 0) {
    throw new Error('Billed amount must be non-negative integer cents')
  }
  return createControlled(context, {
    model: 'InsuranceClaim',
    delegate: 'insuranceClaim',
    prefix: 'insurance_claim',
    input,
    data: {
      claimNumber: `CLAIM-${randomUUID()}`,
      facility: { connect: { id: data.facilityId } },
      patient: { connect: { id: data.patientId } },
      encounter: { connect: { id: data.encounterId } },
      payerName: input.payerName,
      billedAmountCents: data.billedAmountCents,
      coverage: data.coverageId ? { connect: { id: data.coverageId } } : undefined,
    },
    afterCreate: (prisma, row, evidence) => appendClaimVersion(prisma, row.id, evidence, context.session!.itemId),
  })
}

export function transitionInsuranceClaim(_root: unknown, args: any, context: Context) {
  requireBillingOperator(context)
  if (['external_acknowledged', 'external_rejected', 'accepted', 'denied'].includes(args.toStatus)) {
    throw new Error('Payer acknowledgement states require a verified signed integration event')
  }
  const notes = bounded(args.notes, 'Claim transition notes', 2000)
  const reasonCode = bounded(
    args.reasonCode,
    'Claim transition reason',
    80,
    args.toStatus === 'corrected',
  )
  return transitionControlled(context, {
    model: 'InsuranceClaim',
    delegate: 'insuranceClaim',
    prefix: 'insurance_claim',
    id: args.claimId,
    toStatus: args.toStatus,
    expectedVersion: args.expectedVersion,
    operationKey: args.operationKey,
    authorize: requireBillingOperator,
    data: { reasonCode, denialReason: notes },
    afterTransition: (prisma, _current, row, evidence) => appendClaimVersion(prisma, row.id, evidence, context.session!.itemId),
  })
}
