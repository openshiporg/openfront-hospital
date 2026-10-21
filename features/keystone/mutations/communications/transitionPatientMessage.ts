import { Prisma } from '@prisma/client'
import type { Context } from '.keystone/types'

import { appendAuditAndOutbox } from '../operational/evidence'
import { lockTransitionOperation, recordTransition, replayTransition, transitionEvidence } from '../transitionEvidence'

export default async function transitionPatientMessage(
  _root: unknown,
  args: { operationKey: string; messageId: string; toStatus: string; expectedVersion: number; reasonCode?: string | null },
  context: Context,
) {
  const role = context.session?.data.role
  if (!role?.canManageCommunications && !role?.canManageAppointments) {
    throw new Error('Not authorized to complete patient follow-up')
  }
  if (args.toStatus !== 'completed') throw new Error('Only manual follow-up completion is supported here')
  if (!Number.isInteger(args.expectedVersion) || args.expectedVersion < 1) throw new Error('Expected message version is invalid')
  const reasonCode = String(args.reasonCode || 'manual_follow_up_completed').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_')
  if (!reasonCode || reasonCode.length > 80) throw new Error('Follow-up reason code is invalid')

  const visible = await context.query.PatientMessage.findOne({
    where: { id: args.messageId },
    query: 'id status transitionVersion',
  }) as any
  if (!visible) throw new Error('Patient follow-up not found or not accessible')
  const evidence = transitionEvidence(args.operationKey, {
    messageId: args.messageId,
    toStatus: args.toStatus,
    expectedVersion: args.expectedVersion,
    reasonCode,
  })

  return context.transaction(async (transactionContext: any) => {
    const prisma = transactionContext.sudo().prisma
    await lockTransitionOperation(prisma, evidence.operationKeyHash)
    await prisma.$queryRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`patient-message:${args.messageId}`}, 0))::text AS "lock"`,
    )
    const replay = await replayTransition(prisma, evidence, 'patient_message', args.messageId)
    if (replay) return replay
    const current = await prisma.patientMessage.findUnique({ where: { id: args.messageId } })
    if (!current || current.transitionVersion !== args.expectedVersion) {
      throw new Error('Patient follow-up changed; refresh before retrying')
    }
    if (current.status !== 'manual_required') {
      throw new Error('Only a manual follow-up task can be completed by an operator')
    }
    const now = new Date()
    const updated = await prisma.patientMessage.update({
      where: { id: current.id },
      data: {
        status: 'completed',
        transitionVersion: { increment: 1 },
        metadata: {
          ...(current.metadata && typeof current.metadata === 'object' ? current.metadata : {}),
          completionReasonCode: reasonCode,
          completedBy: context.session!.itemId,
          completedAt: now.toISOString(),
        },
      },
    })
    const events = await appendAuditAndOutbox(prisma, {
      eventKey: `patient_message:${updated.id}:v${updated.transitionVersion}:completed`,
      eventType: 'message.manual_completed',
      aggregateType: 'patient_message',
      aggregateId: updated.id,
      facilityId: updated.facilityId,
      patientId: updated.patientId,
      actorReference: context.session!.itemId,
      metadata: {
        source: 'manual_follow_up_workflow',
        aggregateId: updated.id,
        fromStatus: current.status,
        status: updated.status,
        transitionVersion: updated.transitionVersion,
        reasonCode,
      },
      occurredAt: now,
    })
    const result = {
      id: updated.id,
      status: updated.status,
      transitionVersion: updated.transitionVersion,
      replayed: false,
    }
    await recordTransition(prisma, {
      evidence,
      aggregateType: 'patient_message',
      aggregateId: updated.id,
      fromStatus: current.status,
      toStatus: updated.status,
      fromVersion: current.transitionVersion,
      toVersion: updated.transitionVersion,
      actorReference: context.session!.itemId,
      facilityId: updated.facilityId,
      patientId: updated.patientId,
      auditLogId: events.audit.id,
      outboxEventId: events.outbox.id,
      result,
      occurredAt: now,
    })
    return result
  }, { timeout: 30_000 })
}
