import { Prisma } from '@prisma/client'
import type { Context } from '.keystone/types'
import {
  lockTransitionOperation,
  recordTransition,
  replayTransition,
  transitionEvidence,
} from '../transitionEvidence'

const TRANSITIONS: Record<string, string[]> = {
  submitted: ['needs_review', 'reviewed'],
  needs_review: ['reviewed'],
  reviewed: ['needs_review'],
  // Delivery and patient completion are not staff-review transitions. Public
  // submission claims the one-time bearer and moves any active form directly
  // to submitted; retained legacy delivery states remain read-only here.
  not_sent: [],
  sent: [],
  in_progress: [],
}

type Args = {
  operationKey: string
  intakeFormId: string
  toStatus: string
  expectedVersion: number
  reviewNotes?: string | null
}

function cleanOptional(value?: string | null, maxLength = 4000) {
  const cleaned = value?.trim()
  if (!cleaned) return null
  if (cleaned.length > maxLength) throw new Error(`Input exceeds the ${maxLength} character limit`)
  return cleaned
}

export default async function transitionIntakeReview(_root: unknown, args: Args, context: Context) {
  const role = context.session?.data.role
  if (!role?.canManageIntake && !role?.canAccessAllClinicalData) {
    throw new Error('Not authorized to transition intake review')
  }
  if (!Number.isInteger(args.expectedVersion) || args.expectedVersion < 1) {
    throw new Error('Expected intake version is invalid')
  }
  const reviewNotes = cleanOptional(args.reviewNotes)
  const evidence = transitionEvidence(args.operationKey, {
    intakeFormId: args.intakeFormId,
    toStatus: args.toStatus,
    expectedVersion: args.expectedVersion,
    reviewNotes,
  })
  const scopedForm = await context.query.IntakeForm.findOne({
    where: { id: args.intakeFormId },
    query: 'id',
  })
  if (!scopedForm) throw new Error('Intake form not found or not accessible')

  const sudo = context.sudo()
  return sudo.prisma.$transaction(async tx => {
    await lockTransitionOperation(tx, evidence.operationKeyHash)
    await tx.$queryRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`intake:${args.intakeFormId}`}, 0))::text AS "lock"`,
    )
    const replay = await replayTransition(tx, evidence, 'intake_form', args.intakeFormId)
    if (replay) return {
      ...replay,
      reviewedAt: replay.reviewedAt ? new Date(replay.reviewedAt) : null,
    }

    const form = await tx.intakeForm.findUnique({ where: { id: args.intakeFormId } })
    if (!form || form.transitionVersion !== args.expectedVersion) {
      throw new Error('Intake form changed; refresh before retrying')
    }
    if (!TRANSITIONS[form.status]?.includes(args.toStatus)) {
      throw new Error(`Invalid intake transition from ${form.status} to ${args.toStatus}`)
    }
    if (args.toStatus === 'reviewed' && !reviewNotes && !form.reviewNotes) {
      throw new Error('Review notes are required to mark intake reviewed')
    }

    const now = new Date()
    const nextVersion = form.transitionVersion + 1
    const updated = await tx.intakeForm.update({
      where: { id: form.id },
      data: {
        status: args.toStatus,
        transitionVersion: nextVersion,
        ...(args.toStatus === 'reviewed' ? { reviewedAt: now, reviewedById: context.session?.itemId } : {}),
        ...(reviewNotes ? { reviewNotes } : {}),
      },
    })
    const metadata = {
      source: 'intake_transition',
      aggregateType: 'intake_form',
      aggregateId: form.id,
      fromStatus: form.status,
      status: updated.status,
      transitionVersion: nextVersion,
      reviewNotesProvided: Boolean(reviewNotes),
    }
    const eventType = `intake.${args.toStatus}`
    const audit = await tx.clinicalAuditLog.create({
      data: {
        eventType,
        occurredAt: now,
        actorType: 'staff_user',
        actorReference: context.session?.itemId || '',
        facilityId: form.facilityId,
        patientId: form.patientId,
        appointmentId: form.appointmentId,
        intakeFormId: form.id,
        metadata,
      },
    })
    const outbox = await tx.clinicalOutboxEvent.create({
      data: {
        eventKey: `intake:${form.id}:v${nextVersion}:${updated.status}`,
        eventType,
        aggregateType: 'intake_form',
        aggregateId: form.id,
        status: 'recorded',
        attempts: 0,
        nextAttemptAt: null,
        facilityId: form.facilityId,
        patientId: form.patientId,
        appointmentId: form.appointmentId,
        payload: metadata,
        createdAt: now,
      },
    })
    const result = {
      id: updated.id,
      fromStatus: form.status,
      status: updated.status,
      transitionVersion: updated.transitionVersion,
      reviewedAt: updated.reviewedAt || null,
      reviewedById: updated.reviewedById || null,
      replayed: false,
    }
    await recordTransition(tx, {
      evidence,
      aggregateType: 'intake_form',
      aggregateId: form.id,
      fromStatus: form.status,
      toStatus: updated.status,
      fromVersion: form.transitionVersion,
      toVersion: updated.transitionVersion,
      actorReference: context.session?.itemId || '',
      facilityId: form.facilityId,
      patientId: form.patientId,
      auditLogId: audit.id,
      outboxEventId: outbox.id,
      result,
      occurredAt: now,
    })
    return result
  }, { isolationLevel: 'Serializable', timeout: 30_000 })
}
