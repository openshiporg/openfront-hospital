import { readBoundedBody } from './boundedBody'
import { randomUUID } from 'node:crypto'
import { webhookErrorResponse } from './webhookErrors'
import { Prisma } from '@prisma/client'
import { effectiveEpisodePolicy } from '../mutations/clinical/episodeFence'
import { episodeEligibility } from '../mutations/clinical/episodePolicy'

import { keystoneContext } from '../context'
import { decryptSecret, hmacSignature, integrationEncryptionKey, safeEqualHex, sha256 } from './crypto'

const MAX_BODY_BYTES = 64_000
const REPLAY_WINDOW_SECONDS = 5 * 60
const EVENT_TYPES = new Set([
  'payment.succeeded', 'payment.failed',
  'refund.succeeded', 'refund.failed',
  'message.sent', 'message.delivered', 'message.failed',
  'claim.acknowledged', 'claim.rejected',
])
const INBOUND_EVENT_TYPES_BY_KIND: Record<string, ReadonlySet<string>> = {
  communications: new Set(['message.sent', 'message.delivered', 'message.failed']),
  payment: new Set(['payment.succeeded', 'payment.failed', 'refund.succeeded', 'refund.failed']),
  webhook: new Set(['claim.acknowledged', 'claim.rejected']),
}

function acceptsInboundEvent(kind: string, eventType: string) {
  return INBOUND_EVENT_TYPES_BY_KIND[kind]?.has(eventType) === true
}

function json(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } })
}

function boundedText(value: unknown, max: number) {
  const text = String(value || '').trim()
  if (!text || text.length > max || /[\u0000-\u001f\u007f]/.test(text)) throw new Error('invalid_webhook_field')
  return text
}

async function applyDomainEvent(tx: any, input: {
  installation: any
  credential: any
  eventId: string
  eventType: string
  payload: any
  requestDigest: string
  now: Date
}) {
  const actorReference = `machine:${input.credential.id}`
  const aggregateId = boundedText(input.payload.aggregateId, 200)
  const targetStatus = input.eventType.split('.')[1]
  let current: any
  let updated: any
  let patientId: string | null = null
  let aggregateType = ''

  if (input.eventType.startsWith('payment.')) {
    if (input.installation.kind !== 'payment') throw new Error('integration_kind_mismatch')
    await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`webhook-aggregate:payment:${aggregateId}`}, 0))::text AS "lock"`)
    current = await tx.patientPayment.findUnique({ where: { id: aggregateId } })
    if (!current || current.facilityId !== input.installation.facilityId || current.installationId !== input.installation.id) throw new Error('aggregate_scope_mismatch')
    if (current.status === targetStatus) return { aggregateType: 'payment', aggregateId, replayedState: true }
    if (current.status !== 'pending' || !['succeeded', 'failed'].includes(targetStatus)) throw new Error('invalid_domain_transition')
    updated = await tx.patientPayment.update({ where: { id: current.id }, data: {
      status: targetStatus, transitionVersion: { increment: 1 }, actorReference,
      externalReference: boundedText(input.payload.externalReference || input.eventId, 300),
      receivedAt: targetStatus === 'succeeded' ? input.now : null,
    } })
    patientId = updated.patientId
    aggregateType = 'payment'
  } else if (input.eventType.startsWith('refund.')) {
    if (input.installation.kind !== 'payment') throw new Error('integration_kind_mismatch')
    // Event IDs are attacker/integration supplied and therefore cannot be the
    // only lock identity. Serialize the aggregate before reading its state, then
    // serialize the parent payment before changing monetary totals.
    await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`webhook-aggregate:refund:${aggregateId}`}, 0))::text AS "lock"`)
    current = await tx.patientRefund.findUnique({ where: { id: aggregateId } })
    if (!current || current.facilityId !== input.installation.facilityId || current.installationId !== input.installation.id) throw new Error('aggregate_scope_mismatch')
    if (current.status === targetStatus) return { aggregateType: 'refund', aggregateId, replayedState: true }
    if (current.status !== 'pending' || !['succeeded', 'failed'].includes(targetStatus)) throw new Error('invalid_domain_transition')
    await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`payment-refund:${current.paymentId}`}, 0))::text AS "lock"`)
    updated = await tx.patientRefund.update({ where: { id: current.id }, data: {
      status: targetStatus, transitionVersion: { increment: 1 }, actorReference,
      externalReference: boundedText(input.payload.externalReference || input.eventId, 300),
      completedAt: targetStatus === 'succeeded' ? input.now : null,
    } })
    if (targetStatus === 'succeeded') {
      await tx.patientPayment.update({ where: { id: current.paymentId }, data: { refundedAmountCents: { increment: current.amountCents } } })
    }
    patientId = updated.patientId
    aggregateType = 'refund'
  } else if (input.eventType.startsWith('claim.')) {
    if (input.installation.kind !== 'webhook') throw new Error('integration_kind_mismatch')
    await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`webhook-aggregate:claim:${aggregateId}`}, 0))::text AS "lock"`)
    current = await tx.insuranceClaim.findUnique({ where: { id: aggregateId } })
    if (!current || current.facilityId !== input.installation.facilityId) throw new Error('aggregate_scope_mismatch')
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Encounter" WHERE "id" = ${current.encounterId} FOR UPDATE`)
    const parent = await tx.encounter.findUnique({ where: { id: current.encounterId }, select: { id: true, facilityId: true, patientId: true, status: true } })
    if (!parent || parent.facilityId !== current.facilityId || parent.patientId !== current.patientId) throw new Error('aggregate_scope_mismatch')
    const policy = await effectiveEpisodePolicy(tx, current.facilityId)
    const closure = await tx.workflowTransition.findFirst({ where: { aggregateType: 'encounter', aggregateId: current.encounterId,
      facilityId: current.facilityId, patientId: current.patientId, toStatus: { in: ['closed', 'cancelled'] } }, orderBy: { toVersion: 'desc' }, select: { result: true } })
    const discharged = Boolean(await tx.admission.findFirst({ where: { facilityId: current.facilityId, patientId: current.patientId, encounterId: current.encounterId, status: 'discharged' }, select: { id: true } }))
    const policyInput = { status: parent.status, discharged, receiptPresent: Boolean(closure?.result?.episodeReceipt), action: 'claim' as const }
    const eligible = episodeEligibility({ ...policyInput, policy: policy?.definition || null })
    const applied = closure?.result?.episodeReceipt?.policy?.definition
    const originalEligible = applied ? episodeEligibility({ ...policyInput, policy: applied }) : eligible
    if (!eligible.allowed || !originalEligible.allowed) throw new Error('episode_claim_policy_denied')
    const claimStatus = targetStatus === 'acknowledged' ? 'external_acknowledged' : 'external_rejected'
    if (current.status === claimStatus) return { aggregateType: 'insurance_claim', aggregateId, replayedState: true }
    if (current.status !== 'submitted') throw new Error('invalid_domain_transition')
    const reasonCode = targetStatus === 'rejected'
      ? boundedText(input.payload.reasonCode || 'external_rejection', 80)
      : 'external_acknowledgement'
    updated = await tx.insuranceClaim.update({ where: { id: current.id }, data: {
      status: claimStatus,
      transitionVersion: { increment: 1 },
      actorReference,
      reasonCode,
      denialReason: targetStatus === 'rejected' ? boundedText(input.payload.reason || reasonCode, 2_000) : '',
    } })
    patientId = updated.patientId
    aggregateType = 'insurance_claim'
  } else {
    if (input.installation.kind !== 'communications') throw new Error('integration_kind_mismatch')
    await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`webhook-aggregate:message:${aggregateId}`}, 0))::text AS "lock"`)
    current = await tx.patientMessage.findUnique({ where: { id: aggregateId } })
    if (!current || current.facilityId !== input.installation.facilityId || current.installationId !== input.installation.id) throw new Error('aggregate_scope_mismatch')
    if (current.status === targetStatus) return { aggregateType: 'patient_message', aggregateId, replayedState: true }
    const allowed: Record<string, string[]> = { queued: ['sent', 'failed'], sent: ['delivered', 'failed'] }
    if (!allowed[current.status]?.includes(targetStatus)) throw new Error('invalid_domain_transition')
    updated = await tx.patientMessage.update({ where: { id: current.id }, data: {
      status: targetStatus, transitionVersion: { increment: 1 },
      externalId: boundedText(input.payload.externalReference || input.eventId, 300),
      ...(targetStatus === 'sent' ? { sentAt: input.now } : {}),
      ...(targetStatus === 'delivered' ? { deliveredAt: input.now } : {}),
    } })
    patientId = updated.patientId
    aggregateType = 'patient_message'
  }

  const metadata = {
    source: 'integration_webhook', aggregateId, installationId: input.installation.id,
    fromStatus: current.status, status: updated.status, transitionVersion: updated.transitionVersion,
    externalEventId: input.eventId,
  }
  const audit = await tx.clinicalAuditLog.create({ data: {
    eventType: input.eventType, occurredAt: input.now, actorType: 'machine_credential', actorReference,
    facilityId: input.installation.facilityId, patientId, metadata, createdAt: input.now,
  } })
  const outbox = await tx.clinicalOutboxEvent.create({ data: {
    eventKey: `${aggregateType}:${aggregateId}:v${updated.transitionVersion}:${updated.status}`,
    eventType: input.eventType, aggregateType, aggregateId, contractVersion: 'hospital.event.v1',
    deliveryMode: 'internal', status: 'recorded', attempts: 0, nextAttemptAt: null,
    facilityId: input.installation.facilityId, patientId, payload: metadata, createdAt: input.now,
  } })
  if (aggregateType === 'insurance_claim') {
    await tx.claimVersion.create({ data: {
      versionKey: `${updated.id}:${updated.transitionVersion}`,
      version: updated.transitionVersion,
      status: updated.status,
      operationKeyHash: sha256(`claim-webhook:${input.installation.id}:${input.eventId}`),
      requestHash: input.requestDigest,
      facilityId: updated.facilityId,
      patientId: updated.patientId,
      claimId: updated.id,
      coverageId: updated.coverageId,
      reasonCode: updated.reasonCode || '',
      snapshot: {
        claimNumber: updated.claimNumber,
        status: updated.status,
        billedAmountCents: updated.billedAmountCents,
        paidAmountCents: updated.paidAmountCents,
        payerName: updated.payerName,
        source: 'signed_integration_webhook',
      },
      actorReference,
      createdAt: input.now,
    } })
  }
  await tx.workflowTransition.create({ data: {
    operationKeyHash: sha256(`webhook:${input.installation.id}:${input.eventId}`),
    requestHash: input.requestDigest,
    aggregateType,
    aggregateId,
    fromStatus: current.status,
    toStatus: updated.status,
    fromVersion: current.transitionVersion,
    toVersion: updated.transitionVersion,
    actorReference,
    facilityId: input.installation.facilityId,
    patientId,
    auditLogId: audit.id,
    outboxEventId: outbox.id,
    result: { id: updated.id, status: updated.status, transitionVersion: updated.transitionVersion },
    occurredAt: input.now,
  } })
  return { aggregateType, aggregateId, replayedState: false }
}

export async function handleIntegrationWebhook(request: Request, installationKey: string) {
  try { return await processIntegrationWebhook(request, installationKey) }
  catch (error) { const failure = webhookErrorResponse(error); return json(failure.status, { error: failure.code, correlationId: randomUUID() }) }
}

async function processIntegrationWebhook(request: Request, installationKey: string) {
  const contentType = request.headers.get('content-type') || ''
  const length = Number(request.headers.get('content-length') || 0)
  if (!contentType.toLowerCase().startsWith('application/json')) return json(415, { error: 'unsupported_media_type' })
  if (!Number.isFinite(length) || length < 1 || length > MAX_BODY_BYTES) return json(413, { error: 'request_too_large' })
  let rawBody: string
  try { rawBody = await readBoundedBody(request, MAX_BODY_BYTES) }
  catch { return json(413, { error: 'invalid_or_oversized_body' }) }
  if (!rawBody || Buffer.byteLength(rawBody) > MAX_BODY_BYTES) return json(413, { error: 'request_too_large' })
  const authorization = request.headers.get('authorization') || ''
  const candidate = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  const match = /^ofh_([a-f0-9]{12})_([A-Za-z0-9_-]{40,})$/.exec(candidate)
  if (!match) return json(401, { error: 'invalid_machine_credential' })

  const prisma = keystoneContext.prisma
  const installation = await prisma.integrationInstallation.findUnique({ where: { installationKey } })
  const credential = await prisma.machineCredential.findUnique({ where: { keyPrefix: match[1] } })
  const now = new Date()
  if (
    !installation || installation.status !== 'active' || !credential || credential.status !== 'active' ||
    credential.installationId !== installation.id || credential.facilityId !== installation.facilityId ||
    credential.expiresAt <= now || !safeEqualHex(credential.secretDigest, sha256(candidate)) ||
    !Array.isArray(credential.scopes) || !credential.scopes.includes('webhook:write')
  ) return json(401, { error: 'invalid_machine_credential' })

  const timestamp = request.headers.get('x-openfront-timestamp') || ''
  const signature = (request.headers.get('x-openfront-signature') || '').replace(/^sha256=/, '')
  const timestampSeconds = Number(timestamp)
  if (!Number.isInteger(timestampSeconds) || Math.abs(Math.floor(now.getTime() / 1000) - timestampSeconds) > REPLAY_WINDOW_SECONDS) {
    return json(401, { error: 'invalid_webhook_signature' })
  }
  let signingSecret: string
  try {
    signingSecret = decryptSecret({
      ciphertext: installation.signingSecretCiphertext,
      iv: installation.signingSecretIv,
      tag: installation.signingSecretTag,
    }, integrationEncryptionKey())
  } catch {
    return json(503, { error: 'integration_key_unavailable' })
  }
  if (!safeEqualHex(signature, hmacSignature(signingSecret, timestamp, rawBody))) return json(401, { error: 'invalid_webhook_signature' })

  let payload: any
  try { payload = JSON.parse(rawBody) } catch { return json(400, { error: 'invalid_json' }) }
  let eventId: string
  let eventType: string
  try {
    eventId = boundedText(payload.eventId, 200)
    eventType = boundedText(payload.eventType, 100)
  } catch {
    return json(400, { error: 'invalid_webhook_event' })
  }
  if (!EVENT_TYPES.has(eventType)) return json(400, { error: 'unsupported_webhook_event' })
  if (!acceptsInboundEvent(installation.kind, eventType)) return json(400, { error: 'unsupported_webhook_event_for_integration' })
  const requestDigest = sha256(rawBody)
  const receiptKey = sha256(`${installation.id}:${eventId}`)

  try {
    const outcome = await prisma.$transaction(async (tx: any) => {
      // Existing integration writers take this advisory generation lock before
      // updating Installation/Credential. Preserve that order before row locks.
      await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`integration:${installation.id}`}, 0))::text AS "lock"`)
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Facility" WHERE "id" = ${installation.facilityId} FOR UPDATE`)
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "IntegrationInstallation" WHERE "id" = ${installation.id} FOR SHARE`)
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "MachineCredential" WHERE "id" = ${credential.id} FOR SHARE`)
      const currentFacility = await tx.facility.findUnique({ where: { id: installation.facilityId }, select: { status: true } })
      if (currentFacility?.status !== 'active') throw new Error('integration_generation_revoked')
      await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`webhook:${receiptKey}`}, 0))::text AS "lock"`)
      const [currentInstallation, currentCredential] = await Promise.all([
        tx.integrationInstallation.findUnique({ where: { id: installation.id } }),
        tx.machineCredential.findUnique({ where: { id: credential.id } }),
      ])
      if (
        !currentInstallation || currentInstallation.status !== 'active' || currentInstallation.facilityId !== installation.facilityId || currentInstallation.transitionVersion !== installation.transitionVersion ||
        currentInstallation.signingSecretCiphertext !== installation.signingSecretCiphertext || currentInstallation.signingSecretIv !== installation.signingSecretIv || currentInstallation.signingSecretTag !== installation.signingSecretTag ||
        Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds) > REPLAY_WINDOW_SECONDS ||
        !currentCredential || currentCredential.status !== 'active' || currentCredential.transitionVersion !== credential.transitionVersion ||
        currentCredential.installationId !== currentInstallation.id || currentCredential.facilityId !== currentInstallation.facilityId ||
        currentCredential.expiresAt <= new Date() || !safeEqualHex(currentCredential.secretDigest, sha256(candidate)) ||
        !Array.isArray(currentCredential.scopes) || !currentCredential.scopes.includes('webhook:write') ||
        !acceptsInboundEvent(currentInstallation.kind, eventType)
      ) throw new Error('integration_generation_revoked')
      const existing = await tx.integrationWebhookReceipt.findUnique({ where: { receiptKey } })
      if (existing) {
        if (existing.requestDigest !== requestDigest) throw new Error('webhook_event_id_reused')
        return { replayed: true, status: existing.status }
      }
      const applied = await applyDomainEvent(tx, {
        installation: currentInstallation, credential: currentCredential, eventId, eventType, payload, requestDigest, now,
      })
      await tx.integrationWebhookReceipt.create({ data: {
        receiptKey, eventId, eventType, requestDigest, status: 'processed',
        facilityId: currentInstallation.facilityId, installationId: currentInstallation.id,
        receivedAt: now, processedAt: now,
      } })
      await tx.machineCredential.update({ where: { id: currentCredential.id }, data: {
        lastUsedAt: now, lastUsedFingerprint: sha256(request.headers.get('user-agent') || 'unknown').slice(0, 16),
      } })
      return { replayed: false, status: 'processed', ...applied }
    }, { isolationLevel: 'Serializable', timeout: 30_000 })
    return json(200, { accepted: true, ...outcome })
  } catch (error) {
    const failure = webhookErrorResponse(error)
    return json(failure.status, { error: failure.code, correlationId: randomUUID() })
  }
}
