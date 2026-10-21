import { createHash } from 'node:crypto'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { isIP } from 'node:net'
import { Prisma } from '@prisma/client'

import { getBaseUrlForEmails } from '../lib/mail'
import { deliverableIntakeAccessToken, verifyIntakeAccessToken } from '../security/intakeAccess'
import { decryptSecret, hmacSignature, integrationEncryptionKey } from './crypto'
import { resolveIntegrationEndpoint } from './endpointPolicy'

const MAX_ATTEMPTS = 10
const LEASE_MS = 5 * 60_000
const MAX_RESPONSE_BYTES = 64_000
const CONTRACT_VERSION = 'hospital.webhook.v1'

function retryAt(attempt: number, eventId: string) {
  const base = Math.min(6 * 60 * 60_000, 60_000 * (2 ** Math.max(0, attempt - 1)))
  const jitter = Number.parseInt(createHash('sha256').update(eventId).digest('hex').slice(0, 4), 16) % 30_000
  return new Date(Date.now() + base + jitter)
}

async function postPinnedIntegration(
  target: { url: string; address: string },
  body: string,
  headers: Record<string, string>,
) {
  const endpoint = new URL(target.url)
  const transport = endpoint.protocol === 'https:' ? httpsRequest : httpRequest
  return new Promise<{ status: number; responseDigest: string }>((resolve, reject) => {
    const request = transport({
      protocol: endpoint.protocol,
      hostname: endpoint.hostname,
      port: endpoint.port || undefined,
      path: `${endpoint.pathname}${endpoint.search}`,
      method: 'POST',
      headers: { ...headers, 'content-length': String(Buffer.byteLength(body)) },
      lookup: ((_hostname: string, _options: unknown, callback: (...args: any[]) => void) => {
        callback(null, target.address, isIP(target.address))
      }) as any,
      ...(endpoint.protocol === 'https:' ? { servername: endpoint.hostname } : {}),
    }, response => {
      const hash = createHash('sha256')
      let bytes = 0
      response.on('data', chunk => {
        bytes += chunk.length
        if (bytes > MAX_RESPONSE_BYTES) response.destroy(new Error('integration_response_too_large'))
        else hash.update(chunk)
      })
      response.on('end', () => resolve({
        status: response.statusCode || 0,
        responseDigest: hash.digest('hex'),
      }))
      response.on('error', reject)
    })
    request.setTimeout(10_000, () => request.destroy(new Error('integration_request_timeout')))
    request.on('error', reject)
    request.end(body)
  })
}

async function claimExternal(prisma: any, requestedLimit: number) {
  const limit = Math.max(1, Math.min(50, Math.floor(requestedLimit || 10)))
  const now = new Date()
  const leaseUntil = new Date(now.getTime() + LEASE_MS)
  return prisma.$transaction(async (tx: any) => {
    await tx.$executeRaw(Prisma.sql`
      UPDATE "ClinicalOutboxEvent"
      SET "status" = CASE WHEN "attempts" >= ${MAX_ATTEMPTS} THEN 'dead_letter' ELSE 'retry' END,
          "lastError" = CASE WHEN "attempts" >= ${MAX_ATTEMPTS} THEN 'maximum_attempts_exceeded' ELSE 'worker_lease_expired' END
      WHERE "status" = 'processing' AND "deliveryMode" = 'external'
        AND "nextAttemptAt" IS NOT NULL AND "nextAttemptAt" <= ${now}
    `)
    await tx.$executeRaw(Prisma.sql`
      UPDATE "ClinicalOutboxEvent" event
      SET "status" = 'dead_letter', "nextAttemptAt" = NULL,
          "lastError" = 'integration_generation_revoked'
      FROM "IntegrationInstallation" installation
      WHERE event."installation" = installation."id"
        AND event."deliveryMode" = 'external'
        AND event."status" IN ('pending','retry')
        AND (installation."status" <> 'active' OR event."installationVersion" IS DISTINCT FROM installation."transitionVersion")
    `)
    const rows: Array<{ id: string }> = await tx.$queryRaw(Prisma.sql`
      SELECT event."id"
      FROM "ClinicalOutboxEvent" event
      JOIN "IntegrationInstallation" installation ON installation."id" = event."installation"
      WHERE event."status" IN ('pending','retry') AND event."deliveryMode" = 'external'
        AND event."attempts" < ${MAX_ATTEMPTS}
        AND (event."nextAttemptAt" IS NULL OR event."nextAttemptAt" <= ${now})
        AND installation."status" = 'active'
        AND event."installationVersion" = installation."transitionVersion"
      ORDER BY event."createdAt" ASC
      LIMIT ${limit}
      FOR UPDATE OF event SKIP LOCKED
    `)
    if (rows.length) {
      await tx.clinicalOutboxEvent.updateMany({
        where: { id: { in: rows.map(row => row.id) }, status: { in: ['pending', 'retry'] }, deliveryMode: 'external' },
        data: { status: 'processing', attempts: { increment: 1 }, nextAttemptAt: leaseUntil },
      })
    }
    return rows.map(row => row.id)
  }, { timeout: 30_000 })
}

async function authorizeClaimedDelivery(tx: any, eventId: string) {
  const claimed = await tx.clinicalOutboxEvent.findUnique({ where: { id: eventId } })
  if (!claimed || claimed.status !== 'processing' || claimed.deliveryMode !== 'external' || !claimed.installationId) return null
  await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`integration:${claimed.installationId}`}, 0))::text AS "lock"`)
  const [event, installation] = await Promise.all([
    tx.clinicalOutboxEvent.findUnique({ where: { id: eventId } }),
    tx.integrationInstallation.findUnique({ where: { id: claimed.installationId } }),
  ])
  if (
    !event || event.status !== 'processing' || !installation || installation.status !== 'active' ||
    event.installationVersion !== installation.transitionVersion
  ) {
    if (event?.status === 'processing') {
      await tx.clinicalOutboxEvent.update({ where: { id: event.id }, data: {
        status: 'dead_letter', nextAttemptAt: null, lastError: 'integration_generation_revoked',
      } })
    }
    return null
  }
  return { ...event, installation }
}

async function deliveryPayload(prisma: any, event: any) {
  const data: Record<string, unknown> = { ...(event.payload && typeof event.payload === 'object' ? event.payload : {}) }
  if (event.eventType === 'message.queued' && event.aggregateType === 'patient_message') {
    const message = await prisma.patientMessage.findUnique({
      where: { id: event.aggregateId },
      select: { id: true, facilityId: true, patientId: true, appointmentId: true, channel: true, purpose: true, subject: true, body: true, metadata: true },
    })
    if (!message || message.facilityId !== event.facilityId) throw new Error('integration_aggregate_scope_mismatch')
    let body = message.body
    if (body.includes('{{intake_link}}')) {
      const intakeFormId = message.metadata && typeof message.metadata === 'object'
        ? String((message.metadata as Record<string, unknown>).intakeFormId || '')
        : ''
      const intake = intakeFormId ? await prisma.intakeForm.findUnique({
        where: { id: intakeFormId },
        select: {
          id: true, facilityId: true, patientId: true, appointmentId: true,
          accessCodeHash: true, accessExpiresAt: true, accessUsedAt: true, accessRevokedAt: true,
        },
      }) : null
      if (
        !intake || intake.facilityId !== message.facilityId || intake.patientId !== message.patientId ||
        intake.appointmentId !== message.appointmentId || !intake.accessExpiresAt || intake.accessUsedAt ||
        intake.accessRevokedAt || intake.accessExpiresAt <= new Date()
      ) throw new Error('intake_access_unavailable')
      const access = deliverableIntakeAccessToken(intake.id, intake.accessExpiresAt)
      if (!verifyIntakeAccessToken(access.token, intake.accessCodeHash)) throw new Error('intake_access_digest_mismatch')
      const intakeUrl = `${getBaseUrlForEmails()}/intake#accessCode=${encodeURIComponent(access.token)}`
      body = body.replaceAll('{{intake_link}}', intakeUrl)
    }
    data.message = {
      id: message.id,
      patientReference: message.patientId,
      channel: message.channel,
      purpose: message.purpose,
      subject: message.subject,
      body,
    }
  }
  return {
    contractVersion: CONTRACT_VERSION,
    eventId: event.id,
    eventKey: event.eventKey,
    eventType: event.eventType,
    occurredAt: event.createdAt.toISOString(),
    facilityReference: event.facilityId,
    aggregate: { type: event.aggregateType, id: event.aggregateId },
    data,
  }
}

async function markMessageSent(tx: any, event: any, now: Date) {
  if (event.eventType !== 'message.queued' || event.aggregateType !== 'patient_message') return
  const message = await tx.patientMessage.findUnique({ where: { id: event.aggregateId } })
  if (!message || message.facilityId !== event.facilityId || message.status !== 'queued') return
  const updated = await tx.patientMessage.update({
    where: { id: message.id },
    data: { status: 'sent', transitionVersion: { increment: 1 }, sentAt: now },
  })
  const metadata = {
    source: 'integration_outbox_worker', aggregateId: updated.id,
    fromStatus: message.status, status: updated.status, transitionVersion: updated.transitionVersion,
  }
  await tx.clinicalAuditLog.create({ data: {
    eventType: 'message.sent', occurredAt: now, actorType: 'integration_worker', actorReference: event.installationId,
    facilityId: updated.facilityId, patientId: updated.patientId, metadata, createdAt: now,
  } })
  await tx.clinicalOutboxEvent.create({ data: {
    eventKey: `patient_message:${updated.id}:v${updated.transitionVersion}:sent`, eventType: 'message.sent',
    aggregateType: 'patient_message', aggregateId: updated.id, contractVersion: 'hospital.event.v1',
    deliveryMode: 'internal', status: 'recorded', attempts: 0, nextAttemptAt: null,
    facilityId: updated.facilityId, patientId: updated.patientId, appointmentId: updated.appointmentId,
    payload: metadata, createdAt: now,
  } })
}

async function finalize(tx: any, event: any, outcome: {
  status: 'succeeded' | 'retry' | 'failed'
  responseStatus?: number
  responseDigest?: string
  errorCode?: string
}) {
  const now = new Date()
  const current = await tx.clinicalOutboxEvent.findUnique({ where: { id: event.id } })
    if (!current || current.status !== 'processing' || current.attempts !== event.attempts) return false
    await tx.integrationDeliveryAttempt.create({ data: {
      attemptKey: `${event.id}:${event.installationId}:${event.attempts}`,
      facilityId: event.facilityId,
      installationId: event.installationId,
      outboxEventId: event.id,
      attemptNumber: event.attempts,
      status: outcome.status,
      responseStatus: outcome.responseStatus,
      errorCode: outcome.errorCode || '',
      responseDigest: outcome.responseDigest || '',
      startedAt: event.claimedAt,
      completedAt: now,
    } })
    if (outcome.status === 'succeeded') {
      await tx.clinicalOutboxEvent.update({ where: { id: event.id }, data: {
        status: 'delivered', deliveredAt: now, nextAttemptAt: null, lastError: '',
      } })
      await tx.integrationInstallation.update({ where: { id: event.installationId }, data: {
        lastSuccessAt: now, lastErrorAt: null, lastErrorCode: '',
      } })
      await markMessageSent(tx, event, now)
    } else {
      const exhausted = event.attempts >= MAX_ATTEMPTS || outcome.status === 'failed'
      await tx.clinicalOutboxEvent.update({ where: { id: event.id }, data: {
        status: exhausted ? 'dead_letter' : 'retry',
        nextAttemptAt: exhausted ? null : retryAt(event.attempts, event.id),
        lastError: outcome.errorCode || 'integration_delivery_failed',
      } })
      await tx.integrationInstallation.update({ where: { id: event.installationId }, data: {
        lastErrorAt: now, lastErrorCode: outcome.errorCode || 'integration_delivery_failed',
      } })
    }
  return true
}

export async function dispatchExternalOutbox(prisma: any, requestedLimit = 10) {
  const ids = await claimExternal(prisma, requestedLimit)
  let delivered = 0
  let retried = 0
  let deadLettered = 0
  for (const id of ids) {
    const result = await prisma.$transaction(async (tx: any) => {
      const claimedAt = new Date()
      const event = await authorizeClaimedDelivery(tx, id)
      if (!event) return { delivered: 0, retried: 0, deadLettered: 1 }
      // Hold the integration generation lock through the bounded network send
      // and final state write. Pause/revoke therefore either wins before this
      // authorization or waits until this delivery is fully recorded.
      const snapshot = { ...event, installationId: event.installation.id, claimedAt }
      try {
        const allowed = Array.isArray(event.installation.allowedEventTypes) ? event.installation.allowedEventTypes : []
        if (!allowed.includes(event.eventType)) throw new Error('event_type_not_allowlisted')
        const endpoint = await resolveIntegrationEndpoint(event.installation.endpointUrl)
        const secret = decryptSecret({
          ciphertext: event.installation.signingSecretCiphertext,
          iv: event.installation.signingSecretIv,
          tag: event.installation.signingSecretTag,
        }, integrationEncryptionKey())
        const payload = await deliveryPayload(tx, event)
        const body = JSON.stringify(payload)
        if (Buffer.byteLength(body) > 64_000) throw new Error('integration_payload_too_large')
        const timestamp = Math.floor(Date.now() / 1000).toString()
        const response = await postPinnedIntegration(endpoint, body, {
          'content-type': 'application/json',
          'user-agent': 'openfront-hospital-outbox/1',
          'x-openfront-contract': CONTRACT_VERSION,
          'x-openfront-event-id': event.id,
          'x-openfront-timestamp': timestamp,
          'x-openfront-signature': `sha256=${hmacSignature(secret, timestamp, body)}`,
        })
        const { status: responseStatus, responseDigest } = response
        if (responseStatus >= 200 && responseStatus < 300) {
          const changed = await finalize(tx, snapshot, { status: 'succeeded', responseStatus, responseDigest })
          return { delivered: changed ? 1 : 0, retried: 0, deadLettered: 0 }
        }
        if (responseStatus === 408 || responseStatus === 425 || responseStatus === 429 || responseStatus >= 500) {
          const changed = await finalize(tx, snapshot, { status: 'retry', responseStatus, responseDigest, errorCode: `http_${responseStatus}` })
          return {
            delivered: 0,
            retried: changed && event.attempts < MAX_ATTEMPTS ? 1 : 0,
            deadLettered: changed && event.attempts >= MAX_ATTEMPTS ? 1 : 0,
          }
        }
        const changed = await finalize(tx, snapshot, { status: 'failed', responseStatus, responseDigest, errorCode: `http_${responseStatus}` })
        return { delivered: 0, retried: 0, deadLettered: changed ? 1 : 0 }
      } catch (error) {
        const code = error instanceof Error ? error.message.slice(0, 120).replace(/[^A-Za-z0-9_.:-]/g, '_') : 'integration_delivery_error'
        const terminal = [
          'event_type_not_allowlisted',
          'integration_payload_too_large',
          'integration_aggregate_scope_mismatch',
          'intake_access_unavailable',
          'intake_access_digest_mismatch',
        ].includes(code)
        const changed = await finalize(tx, snapshot, { status: terminal ? 'failed' : 'retry', errorCode: code })
        return {
          delivered: 0,
          retried: changed && !terminal && event.attempts < MAX_ATTEMPTS ? 1 : 0,
          deadLettered: changed && (terminal || event.attempts >= MAX_ATTEMPTS) ? 1 : 0,
        }
      }
    }, { timeout: 30_000 })
    delivered += result.delivered
    retried += result.retried
    deadLettered += result.deadLettered
  }
  return { claimed: ids.length, delivered, retried, deadLettered }
}
