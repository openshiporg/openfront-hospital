import { randomBytes, randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import type { Context } from '.keystone/types'

import { encryptSecret, integrationEncryptionKey, sha256 } from '../../integrations/crypto'
import { dispatchExternalOutbox } from '../../integrations/outboxWorker'
import { validateIntegrationEndpoint } from '../../integrations/endpointPolicy'
import { lockTransitionOperation, recordTransition, replayTransition, transitionEvidence } from '../transitionEvidence'
import { appendAuditAndOutbox, bounded, lockOperation, operationEvidence } from './evidence'

const EVENT_TYPES = new Set([
  'message.queued',
  'payment.pending',
  'refund.pending',
  'medical_order.ordered',
  'specimen.collected',
  'prescription.issued',
  'integration.test',
])
const KINDS = new Set(['communications', 'payment', 'laboratory', 'pharmacy', 'webhook'])

function requireIntegrations(context: Context) {
  const role = context.session?.data.role
  if (!role?.canManageIntegrations) throw new Error('Not authorized to manage integrations')
}

async function scopedFacility(context: Context, facilityId: string) {
  requireIntegrations(context)
  const facility = await context.query.Facility.findOne({ where: { id: facilityId }, query: 'id status' }) as any
  if (!facility || facility.status !== 'active') throw new Error('Facility not found or not accessible')
  return facility
}

function result(row: any, replayed = false) {
  return { id: row.id, status: row.status, transitionVersion: row.transitionVersion, replayed }
}

export async function createIntegrationInstallation(_root: unknown, { data }: any, context: Context) {
  await scopedFacility(context, data.facilityId)
  const name = bounded(data.name, 'Integration name', 200, true)
  const kind = bounded(data.kind, 'Integration kind', 40, true)
  if (!KINDS.has(kind)) throw new Error('Integration kind is invalid')
  const endpointUrl = await validateIntegrationEndpoint(data.endpointUrl)
  const allowedEventTypes: string[] = Array.from(new Set<string>((Array.isArray(data.allowedEventTypes) ? data.allowedEventTypes : [])
    .map((value: unknown) => bounded(value, 'Allowed event type', 100, true))))
  if (!allowedEventTypes.length || allowedEventTypes.length > 25 || allowedEventTypes.some(value => !EVENT_TYPES.has(value))) {
    throw new Error('Integration event allowlist is invalid')
  }
  const input = { ...data, name, kind, endpointUrl, allowedEventTypes }
  const evidence = operationEvidence(input)
  return context.transaction(async (transactionContext: any) => {
    const prisma = transactionContext.sudo().prisma
    await lockOperation(prisma, 'integration-installation-create', evidence.operationKeyHash)
    const existing = await prisma.integrationInstallation.findUnique({ where: { operationKeyHash: evidence.operationKeyHash } })
    if (existing) {
      if (existing.requestHash !== evidence.requestHash) throw new Error('Operation key was reused with a different payload')
      return { ...result(existing, true), installationKey: existing.installationKey, signingSecret: null }
    }
    const signingSecret = randomBytes(32).toString('base64url')
    const encrypted = encryptSecret(signingSecret, integrationEncryptionKey())
    const now = new Date()
    const installation = await prisma.integrationInstallation.create({ data: {
      installationKey: `INT-${randomUUID()}`,
      name,
      kind,
      status: 'active',
      transitionVersion: 1,
      ...evidence,
      facilityId: data.facilityId,
      endpointUrl,
      allowedEventTypes,
      signingSecretCiphertext: encrypted.ciphertext,
      signingSecretIv: encrypted.iv,
      signingSecretTag: encrypted.tag,
      keyVersion: 1,
      actorReference: context.session!.itemId,
    } })
    await appendAuditAndOutbox(prisma, {
      eventKey: `integration:${installation.id}:v1:active`, eventType: 'integration.created',
      aggregateType: 'integration', aggregateId: installation.id, facilityId: installation.facilityId,
      actorReference: context.session!.itemId,
      metadata: { source: 'integration_workflow', aggregateId: installation.id, kind, status: 'active', transitionVersion: 1 },
      occurredAt: now,
    })
    return { ...result(installation), installationKey: installation.installationKey, signingSecret }
  }, { timeout: 30_000 })
}

export async function transitionIntegrationInstallation(_root: unknown, args: any, context: Context) {
  requireIntegrations(context)
  const scoped = await context.query.IntegrationInstallation.findOne({ where: { id: args.installationId }, query: 'id' })
  if (!scoped) throw new Error('Integration installation not found or not accessible')
  if (!Number.isInteger(args.expectedVersion) || args.expectedVersion < 1) throw new Error('Expected integration version is invalid')
  if (!['active', 'paused', 'revoked'].includes(args.toStatus)) throw new Error('Integration status is invalid')
  const evidence = transitionEvidence(args.operationKey, { installationId: args.installationId, expectedVersion: args.expectedVersion, toStatus: args.toStatus })
  const allowed: Record<string, string[]> = { active: ['paused', 'revoked'], paused: ['active', 'revoked'], revoked: [] }
  return context.transaction(async (transactionContext: any) => {
    const prisma = transactionContext.sudo().prisma
    await lockTransitionOperation(prisma, evidence.operationKeyHash)
    await prisma.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`integration:${args.installationId}`}, 0))::text AS "lock"`)
    const replay = await replayTransition(prisma, evidence, 'integration', args.installationId)
    if (replay) return replay
    const current = await prisma.integrationInstallation.findUnique({ where: { id: args.installationId } })
    if (!current || current.transitionVersion !== args.expectedVersion) throw new Error('Integration changed; refresh before retrying')
    if (!allowed[current.status]?.includes(args.toStatus)) throw new Error(`Invalid integration transition from ${current.status} to ${args.toStatus}`)
    const now = new Date()
    const updated = await prisma.integrationInstallation.update({ where: { id: current.id }, data: {
      status: args.toStatus, transitionVersion: { increment: 1 }, actorReference: context.session!.itemId,
    } })
    if (args.toStatus !== 'active') {
      await prisma.clinicalOutboxEvent.updateMany({
        where: { installationId: updated.id, deliveryMode: 'external', status: { in: ['pending', 'retry'] } },
        data: { status: 'dead_letter', nextAttemptAt: null, lastError: 'integration_generation_revoked' },
      })
    }
    if (args.toStatus === 'revoked') {
      await prisma.machineCredential.updateMany({ where: { installationId: updated.id, status: 'active' }, data: { status: 'revoked', revokedAt: now, transitionVersion: { increment: 1 } } })
    }
    const events = await appendAuditAndOutbox(prisma, {
      eventKey: `integration:${updated.id}:v${updated.transitionVersion}:${updated.status}`,
      eventType: `integration.${updated.status}`, aggregateType: 'integration', aggregateId: updated.id,
      facilityId: updated.facilityId, actorReference: context.session!.itemId,
      metadata: { source: 'integration_workflow', aggregateId: updated.id, fromStatus: current.status, status: updated.status, transitionVersion: updated.transitionVersion },
      occurredAt: now,
    })
    const projected = result(updated)
    await recordTransition(prisma, {
      evidence, aggregateType: 'integration', aggregateId: updated.id, fromStatus: current.status, toStatus: updated.status,
      fromVersion: current.transitionVersion, toVersion: updated.transitionVersion, actorReference: context.session!.itemId,
      facilityId: updated.facilityId, auditLogId: events.audit.id, outboxEventId: events.outbox.id, result: projected, occurredAt: now,
    })
    return projected
  }, { timeout: 30_000 })
}

export async function issueMachineCredential(_root: unknown, { data }: any, context: Context) {
  requireIntegrations(context)
  const installation = await context.query.IntegrationInstallation.findOne({
    where: { id: data.installationId }, query: 'id status transitionVersion facility { id }',
  }) as any
  if (!installation || installation.status !== 'active') throw new Error('Active integration installation not found or not accessible')
  const name = bounded(data.name, 'Credential name', 200, true)
  const expiresAt = new Date(data.expiresAt)
  const now = new Date()
  if (Number.isNaN(expiresAt.getTime()) || expiresAt <= now || expiresAt.getTime() > now.getTime() + 366 * 24 * 60 * 60_000) {
    throw new Error('Credential expiry must be within the next year')
  }
  const scopes = Array.from(new Set((Array.isArray(data.scopes) ? data.scopes : []).map((scope: unknown) => bounded(scope, 'Credential scope', 80, true))))
  if (!scopes.length || scopes.length > 10 || scopes.some(scope => scope !== 'webhook:write')) throw new Error('Machine credential scopes are invalid')
  const evidence = operationEvidence({ ...data, name, expiresAt: expiresAt.toISOString(), scopes })
  return context.transaction(async (transactionContext: any) => {
    const prisma = transactionContext.sudo().prisma
    await lockOperation(prisma, 'machine-credential-create', evidence.operationKeyHash)
    const existing = await prisma.machineCredential.findUnique({ where: { operationKeyHash: evidence.operationKeyHash } })
    if (existing) {
      if (existing.requestHash !== evidence.requestHash) throw new Error('Operation key was reused with a different payload')
      return { ...result(existing, true), credential: null, keyPrefix: existing.keyPrefix }
    }
    await prisma.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`integration:${installation.id}`}, 0))::text AS "lock"`)
    const currentInstallation = await prisma.integrationInstallation.findUnique({ where: { id: installation.id } })
    if (!currentInstallation || currentInstallation.status !== 'active' || currentInstallation.transitionVersion !== installation.transitionVersion) {
      throw new Error('Integration changed or is no longer active')
    }
    const prefix = randomBytes(6).toString('hex')
    const credential = `ofh_${prefix}_${randomBytes(32).toString('base64url')}`
    const row = await prisma.machineCredential.create({ data: {
      name, keyPrefix: prefix, transitionVersion: 1, ...evidence,
      actorReference: context.session!.itemId, secretDigest: sha256(credential), scopes,
      status: 'active', facilityId: currentInstallation.facilityId, installationId: currentInstallation.id,
      createdById: context.session!.itemId, createdAt: now, expiresAt,
    } })
    await appendAuditAndOutbox(prisma, {
      eventKey: `machine_credential:${row.id}:v1:active`, eventType: 'machine_credential.issued',
      aggregateType: 'machine_credential', aggregateId: row.id, facilityId: row.facilityId,
      actorReference: context.session!.itemId,
      metadata: { source: 'integration_workflow', aggregateId: row.id, installationId: row.installationId, status: 'active', transitionVersion: 1, expiresAt: expiresAt.toISOString() },
      occurredAt: now,
    })
    return { ...result(row), credential, keyPrefix: prefix }
  }, { timeout: 30_000 })
}

export async function revokeMachineCredential(_root: unknown, args: any, context: Context) {
  requireIntegrations(context)
  const scoped = await context.query.MachineCredential.findOne({ where: { id: args.credentialId }, query: 'id' })
  if (!scoped) throw new Error('Machine credential not found or not accessible')
  if (!Number.isInteger(args.expectedVersion) || args.expectedVersion < 1) throw new Error('Expected credential version is invalid')
  const evidence = transitionEvidence(args.operationKey, { credentialId: args.credentialId, expectedVersion: args.expectedVersion, toStatus: 'revoked' })
  return context.transaction(async (transactionContext: any) => {
    const prisma = transactionContext.sudo().prisma
    await lockTransitionOperation(prisma, evidence.operationKeyHash)
    const preliminary = await prisma.machineCredential.findUnique({ where: { id: args.credentialId } })
    if (!preliminary) throw new Error('Machine credential changed or is not active')
    await prisma.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`integration:${preliminary.installationId}`}, 0))::text AS "lock"`)
    await prisma.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`machine-credential:${args.credentialId}`}, 0))::text AS "lock"`)
    const replay = await replayTransition(prisma, evidence, 'machine_credential', args.credentialId)
    if (replay) return replay
    const current = await prisma.machineCredential.findUnique({ where: { id: args.credentialId } })
    if (!current || current.status !== 'active' || current.transitionVersion !== args.expectedVersion) throw new Error('Machine credential changed or is not active')
    const now = new Date()
    const updated = await prisma.machineCredential.update({ where: { id: current.id }, data: { status: 'revoked', transitionVersion: { increment: 1 }, revokedAt: now } })
    const events = await appendAuditAndOutbox(prisma, {
      eventKey: `machine_credential:${updated.id}:v${updated.transitionVersion}:revoked`, eventType: 'machine_credential.revoked',
      aggregateType: 'machine_credential', aggregateId: updated.id, facilityId: updated.facilityId,
      actorReference: context.session!.itemId,
      metadata: { source: 'integration_workflow', aggregateId: updated.id, installationId: updated.installationId, status: 'revoked', transitionVersion: updated.transitionVersion },
      occurredAt: now,
    })
    const projected = result(updated)
    await recordTransition(prisma, {
      evidence, aggregateType: 'machine_credential', aggregateId: updated.id, fromStatus: current.status, toStatus: updated.status,
      fromVersion: current.transitionVersion, toVersion: updated.transitionVersion, actorReference: context.session!.itemId,
      facilityId: updated.facilityId, auditLogId: events.audit.id, outboxEventId: events.outbox.id, result: projected, occurredAt: now,
    })
    return projected
  }, { timeout: 30_000 })
}

const LOCAL_TYPES: Record<string, { list: string; query: string }> = {
  patient: { list: 'Patient', query: 'id facilities { id }' },
  appointment: { list: 'Appointment', query: 'id facility { id }' },
  encounter: { list: 'Encounter', query: 'id facility { id }' },
  claim: { list: 'InsuranceClaim', query: 'id facility { id }' },
  inventory_item: { list: 'InventoryItem', query: 'id facility { id }' },
}

export async function dispatchIntegrationOutbox(_root: unknown, args: { limit?: number }, context: Context) {
  if (!context.session?.data.role?.canAccessAllClinicalData || !context.session?.data.role?.canManageIntegrations) {
    throw new Error('Only the global maintenance administrator can dispatch integration events')
  }
  return dispatchExternalOutbox(context.sudo().prisma, args.limit)
}

export async function linkExternalIdentity(_root: unknown, { data }: any, context: Context) {
  await scopedFacility(context, data.facilityId)
  const system = bounded(data.system, 'External system', 120, true)
  const resourceType = bounded(data.resourceType, 'External resource type', 120, true)
  const externalId = bounded(data.externalId, 'External identifier', 300, true)
  const localType = bounded(data.localType, 'Local resource type', 80, true)
  const local = LOCAL_TYPES[localType]
  if (!local) throw new Error('Local resource type is not supported')
  const row = await (context.query as any)[local.list].findOne({ where: { id: data.localId }, query: local.query })
  const inFacility = localType === 'patient'
    ? row?.facilities?.some((facility: { id: string }) => facility.id === data.facilityId)
    : row?.facility?.id === data.facilityId
  if (!row || !inFacility) throw new Error('Local resource not found in the accessible facility')
  const input = { ...data, system, resourceType, externalId, localType }
  const evidence = operationEvidence(input)
  return context.transaction(async (transactionContext: any) => {
    const prisma = transactionContext.sudo().prisma
    await lockOperation(prisma, 'external-identity-link', evidence.operationKeyHash)
    const existing = await prisma.externalIdentityLink.findUnique({ where: { operationKeyHash: evidence.operationKeyHash } })
    if (existing) {
      if (existing.requestHash !== evidence.requestHash) throw new Error('Operation key was reused with a different payload')
      return { id: existing.id, status: existing.status, replayed: true }
    }
    const duplicate = await prisma.externalIdentityLink.findFirst({ where: { facilityId: data.facilityId, system, resourceType, externalId } })
    if (duplicate) throw new Error('External identity is already linked in the facility')
    const now = new Date()
    const link = await prisma.externalIdentityLink.create({ data: {
      linkNumber: `XLINK-${randomUUID()}`, facilityId: data.facilityId, system, resourceType,
      externalId, localType, localId: data.localId, status: 'active', ...evidence,
      actorReference: context.session!.itemId, createdAt: now,
    } })
    await appendAuditAndOutbox(prisma, {
      eventKey: `external_identity:${link.id}:linked`, eventType: 'external_identity.linked',
      aggregateType: 'external_identity', aggregateId: link.id, facilityId: link.facilityId,
      actorReference: context.session!.itemId,
      metadata: { source: 'integration_workflow', aggregateId: link.id, system, resourceType, localType, localId: link.localId },
      occurredAt: now,
    })
    return { id: link.id, status: link.status, replayed: false }
  }, { timeout: 30_000 })
}
