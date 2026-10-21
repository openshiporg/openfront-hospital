import { narrativeText } from '../../../lib/narrativeText'
import type { Context } from '.keystone/types'
import { appendAuditAndOutbox, bounded, lockOperation, operationEvidence, scopedFacilityPatient } from '../operational/evidence'

type Args = {
  operationKey: string
  facilityId: string
  patientId: string
  appointmentId?: string | null
  installationId?: string | null
  templateId?: string | null
  channel: string
  purpose: string
  subject?: string | null
  body: string
}

function requirePermission(context: Context) {
  const role = context.session?.data.role
  if (!role?.canManageCommunications) {
    throw new Error('Not authorized to send patient messages')
  }
}

export default async function sendSecurePatientMessage(_root: unknown, args: Args, context: Context) {
  requirePermission(context)
  if (!['sms', 'email', 'phone'].includes(args.channel)) {
    throw new Error('Patient follow-up channel must be sms, email, or phone')
  }
  if (!['care_operations', 'billing', 'general'].includes(args.purpose)) {
    throw new Error('Secure message purpose is invalid')
  }
  const subject = bounded(args.subject, 'Message subject', 200)
  const body = narrativeText(args.body, 'Message body', 4000, true)
  await scopedFacilityPatient(context, args.facilityId, args.patientId)

  const [scopedAppointment, preference, installation, template] = await Promise.all([
    args.appointmentId
      ? context.query.Appointment.findOne({
          where: { id: args.appointmentId },
          query: 'id patient { id } facility { id }',
        })
      : null,
    context.query.CommunicationPreference.findMany({
      where: {
        facility: { id: { equals: args.facilityId } },
        patient: { id: { equals: args.patientId } },
        channel: { equals: args.channel },
        purpose: { equals: args.purpose },
      },
      take: 1,
      query: 'id status',
    }),
    args.installationId
      ? context.query.IntegrationInstallation.findOne({
          where: { id: args.installationId },
          query: 'id status kind transitionVersion facility { id }',
        })
      : null,
    args.templateId
      ? context.query.CommunicationTemplate.findOne({
          where: { id: args.templateId },
          query: 'id status channel facility { id }',
        })
      : null,
  ]) as any[]

  if (
    args.appointmentId &&
    (!scopedAppointment || scopedAppointment.patient?.id !== args.patientId || scopedAppointment.facility?.id !== args.facilityId)
  ) {
    throw new Error('Appointment does not belong to the selected patient and facility')
  }
  if (preference?.[0]?.status === 'opted_out') throw new Error('Patient has opted out of this message channel and purpose')
  if (args.purpose === 'general' && preference?.[0]?.status !== 'allowed') {
    throw new Error('General messages require an explicit allowed communication preference')
  }
  const manualFollowUp = args.channel === 'phone'
  if (manualFollowUp && installation) {
    throw new Error('Manual phone follow-up cannot use an external communications integration')
  }
  if (!manualFollowUp && (
    !installation || installation.status !== 'active' || installation.kind !== 'communications' ||
    installation.facility?.id !== args.facilityId
  )) {
    throw new Error('SMS and email messages require an active facility communications integration')
  }
  if (
    template &&
    (template.status !== 'active' || template.channel !== args.channel || template.facility?.id !== args.facilityId)
  ) {
    throw new Error('Communication template does not match the active facility channel')
  }

  const input = {
    operationKey: args.operationKey,
    facilityId: args.facilityId,
    patientId: args.patientId,
    appointmentId: args.appointmentId || null,
    installationId: args.installationId || null,
    templateId: args.templateId || null,
    channel: args.channel,
    purpose: args.purpose,
    subject,
    body,
  }
  const evidence = operationEvidence(input)

  return context.transaction(async (transactionContext: any) => {
    const prisma = transactionContext.sudo().prisma
    await lockOperation(prisma, 'patient-message-create', evidence.operationKeyHash)
    const existing = await prisma.patientMessage.findUnique({ where: { operationKeyHash: evidence.operationKeyHash } })
    if (existing) {
      if (existing.requestHash !== evidence.requestHash) {
        throw new Error('Operation key was reused with a different payload')
      }
      return {
        id: existing.id,
        status: existing.status,
        channel: existing.channel,
        direction: existing.direction,
        recordedAt: existing.createdAt,
        patientId: existing.patientId,
        appointmentId: existing.appointmentId,
        replayed: true,
      }
    }

    const patient = await prisma.patient.findUnique({
      where: { id: args.patientId },
      select: { id: true, status: true },
    })
    if (!patient || patient.status !== 'active') throw new Error('Active patient not found')
    const now = new Date()
    const message = await prisma.patientMessage.create({
      data: {
        ...evidence,
        transitionVersion: 1,
        facilityId: args.facilityId,
        patientId: patient.id,
        appointmentId: args.appointmentId || null,
        installationId: installation?.id || null,
        templateId: template?.id || null,
        direction: 'outbound',
        channel: args.channel,
        purpose: args.purpose,
        subject,
        body,
        status: manualFollowUp ? 'manual_required' : 'queued',
        metadata: { source: 'platform_secure_message', followUpMode: manualFollowUp ? 'manual' : 'integration' },
      },
    })
    await appendAuditAndOutbox(prisma, {
      eventKey: `patient_message:${message.id}:v1:${message.status}`,
      eventType: manualFollowUp ? 'message.manual_required' : 'message.queued',
      aggregateType: 'patient_message',
      aggregateId: message.id,
      facilityId: args.facilityId,
      patientId: patient.id,
      actorReference: context.session?.itemId || '',
      deliveryMode: manualFollowUp ? 'internal' : 'external',
      installationId: installation?.id,
      installationVersion: installation?.transitionVersion,
      metadata: {
        source: 'patient_message_workflow',
        aggregateId: message.id,
        channel: args.channel,
        purpose: args.purpose,
        status: message.status,
        followUpMode: manualFollowUp ? 'manual' : 'integration',
        transitionVersion: 1,
      },
      occurredAt: now,
    })
    return {
      id: message.id,
      status: message.status,
      channel: message.channel,
      direction: message.direction,
      recordedAt: message.createdAt,
      patientId: patient.id,
      appointmentId: message.appointmentId,
      replayed: false,
    }
  }, { timeout: 30_000 })
}
