import { randomBytes, randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import type { Context } from '.keystone/types'

import { encryptSecret, exportEncryptionKey, sha256 } from '../../integrations/crypto'
import { inventoryRowsToCsv, previewInventoryCsv, type InventoryImportRow } from '../../portability/inventoryCsv'
import { lockTransitionOperation, recordTransition, replayTransition, transitionEvidence } from '../transitionEvidence'
import { appendAuditAndOutbox, bounded, hash, lockOperation, operationEvidence } from './evidence'

function requirePortability(context: Context) {
  const role = context.session?.data.role
  if (!role?.canManageDataPortability) throw new Error('Not authorized to manage imports and exports')
}

function requireAuditReportAccess(context: Context) {
  if (!context.session?.data.role?.canViewReports) {
    throw new Error('Report permission is required to export audit records')
  }
}

async function scopedFacility(context: Context, facilityId: string) {
  requirePortability(context)
  const facility = await context.query.Facility.findOne({ where: { id: facilityId }, query: 'id status staff { id }' }) as any
  const isGlobal = context.session?.data.role?.canAccessAllClinicalData === true
  const isFacilityStaff = facility?.staff?.some((member: { id: string }) => member.id === context.session?.itemId)
  if (!facility || facility.status !== 'active' || (!isGlobal && !isFacilityStaff)) {
    throw new Error('Facility not found, inactive, or not accessible')
  }
}

function result(row: any, replayed = false) {
  return { id: row.id, status: row.status, transitionVersion: row.transitionVersion, replayed }
}

export async function previewInventoryImport(_root: unknown, { data }: any, context: Context) {
  await scopedFacility(context, data.facilityId)
  const preview = previewInventoryCsv(data.csv)
  const sourceHash = sha256(String(data.csv))
  const evidence = operationEvidence({ operationKey: data.operationKey, facilityId: data.facilityId, importType: 'inventory', sourceHash })
  return context.transaction(async (transactionContext: any) => {
    const prisma = transactionContext.sudo().prisma
    await lockOperation(prisma, 'import-preview', evidence.operationKeyHash)
    const existing = await prisma.importBatch.findUnique({ where: { operationKeyHash: evidence.operationKeyHash } })
    if (existing) {
      if (existing.requestHash !== evidence.requestHash) throw new Error('Operation key was reused with a different payload')
      return { ...result(existing, true), rowCount: existing.rowCount, errorCount: existing.errorCount }
    }
    const now = new Date()
    const batch = await prisma.importBatch.create({ data: {
      batchNumber: `IMPORT-${randomUUID()}`, importType: 'inventory', status: 'previewed', transitionVersion: 1,
      ...evidence, sourceHash, facilityId: data.facilityId, rowCount: preview.rowCount, errorCount: preview.errors.length,
      preview, actorReference: context.session!.itemId,
    } })
    await appendAuditAndOutbox(prisma, {
      eventKey: `import_batch:${batch.id}:v1:previewed`, eventType: 'import.previewed',
      aggregateType: 'import_batch', aggregateId: batch.id, facilityId: batch.facilityId,
      actorReference: context.session!.itemId,
      metadata: { source: 'portability_workflow', aggregateId: batch.id, importType: 'inventory', rowCount: batch.rowCount, errorCount: batch.errorCount, status: 'previewed', transitionVersion: 1 },
      occurredAt: now,
    })
    return { ...result(batch), rowCount: batch.rowCount, errorCount: batch.errorCount }
  }, { timeout: 30_000 })
}

function batchRows(batch: any): InventoryImportRow[] {
  const rows = batch.preview && typeof batch.preview === 'object' && Array.isArray(batch.preview.rows) ? batch.preview.rows : null
  if (!rows || rows.length !== batch.rowCount || rows.some((row: any) => !Number.isInteger(row.rowNumber) || typeof row.sku !== 'string')) {
    throw new Error('Import preview evidence is invalid')
  }
  return rows
}

export async function applyInventoryImport(_root: unknown, args: any, context: Context) {
  requirePortability(context)
  const scoped = await context.query.ImportBatch.findOne({ where: { id: args.batchId }, query: 'id' })
  if (!scoped) throw new Error('Import batch not found or not accessible')
  if (!Number.isInteger(args.expectedVersion) || args.expectedVersion < 1) throw new Error('Expected import version is invalid')
  const evidence = transitionEvidence(args.operationKey, { batchId: args.batchId, expectedVersion: args.expectedVersion, toStatus: 'applied' })
  return context.transaction(async (transactionContext: any) => {
    const prisma = transactionContext.sudo().prisma
    await lockTransitionOperation(prisma, evidence.operationKeyHash)
    await prisma.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`import-batch:${args.batchId}`}, 0))::text AS "lock"`)
    const replay = await replayTransition(prisma, evidence, 'import_batch', args.batchId)
    if (replay) return replay
    const batch = await prisma.importBatch.findUnique({ where: { id: args.batchId } })
    if (!batch || batch.status !== 'previewed' || batch.transitionVersion !== args.expectedVersion) throw new Error('Import batch changed or is not ready to apply')
    if (batch.errorCount > 0) throw new Error('Import preview errors must be resolved before apply')
    const rows = batchRows(batch)
    const existing = await prisma.inventoryItem.findMany({ where: { facilityId: batch.facilityId, sku: { in: rows.map(row => row.sku) } }, select: { sku: true } })
    if (existing.length) throw new Error('One or more import SKUs already exist in the facility')
    const now = new Date()
    const appliedIds: string[] = []
    for (const row of rows) {
      const item = await prisma.inventoryItem.create({ data: {
        sku: row.sku, name: row.name, unit: row.unit, status: 'active', transitionVersion: 1,
        quantityOnHand: row.quantity, quantityReserved: 0, reorderPoint: row.reorderPoint,
        operationKeyHash: hash(`import-item:${batch.id}:${row.rowNumber}`),
        requestHash: hash(`${batch.sourceHash}:${row.rowNumber}`),
        actorReference: context.session!.itemId, facilityId: batch.facilityId,
      } })
      appliedIds.push(item.id)
      if (row.quantity > 0) {
        await prisma.inventoryMovement.create({ data: {
          movementNumber: `MOV-${randomUUID()}`, operationKeyHash: hash(`import-movement:${batch.id}:${row.rowNumber}`),
          requestHash: hash(`${batch.sourceHash}:movement:${row.rowNumber}`), movementType: 'receive',
          quantityDelta: row.quantity, resultingOnHand: row.quantity, reservedDelta: 0, resultingReserved: 0,
          reasonCode: 'authorized_import', facilityId: batch.facilityId, itemId: item.id,
          actorReference: context.session!.itemId, occurredAt: now,
        } })
      }
    }
    const updated = await prisma.importBatch.update({ where: { id: batch.id }, data: {
      status: 'applied', transitionVersion: { increment: 1 }, appliedIds, appliedAt: now, actorReference: context.session!.itemId,
    } })
    const events = await appendAuditAndOutbox(prisma, {
      eventKey: `import_batch:${updated.id}:v${updated.transitionVersion}:applied`, eventType: 'import.applied',
      aggregateType: 'import_batch', aggregateId: updated.id, facilityId: updated.facilityId,
      actorReference: context.session!.itemId,
      metadata: { source: 'portability_workflow', aggregateId: updated.id, importType: 'inventory', rowCount: updated.rowCount, status: 'applied', transitionVersion: updated.transitionVersion },
      occurredAt: now,
    })
    const projected = result(updated)
    await recordTransition(prisma, {
      evidence, aggregateType: 'import_batch', aggregateId: updated.id, fromStatus: batch.status, toStatus: updated.status,
      fromVersion: batch.transitionVersion, toVersion: updated.transitionVersion, actorReference: context.session!.itemId,
      facilityId: updated.facilityId, auditLogId: events.audit.id, outboxEventId: events.outbox.id, result: projected, occurredAt: now,
    })
    return projected
  }, { timeout: 30_000 })
}

export async function rollbackInventoryImport(_root: unknown, args: any, context: Context) {
  requirePortability(context)
  const scoped = await context.query.ImportBatch.findOne({ where: { id: args.batchId }, query: 'id' })
  if (!scoped) throw new Error('Import batch not found or not accessible')
  if (!Number.isInteger(args.expectedVersion) || args.expectedVersion < 1) throw new Error('Expected import version is invalid')
  const reasonCode = bounded(args.reasonCode, 'Import rollback reason', 80, true)
  const evidence = transitionEvidence(args.operationKey, { batchId: args.batchId, expectedVersion: args.expectedVersion, toStatus: 'rolled_back', reasonCode })
  return context.transaction(async (transactionContext: any) => {
    const prisma = transactionContext.sudo().prisma
    await lockTransitionOperation(prisma, evidence.operationKeyHash)
    await prisma.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`import-batch:${args.batchId}`}, 0))::text AS "lock"`)
    const replay = await replayTransition(prisma, evidence, 'import_batch', args.batchId)
    if (replay) return replay
    const batch = await prisma.importBatch.findUnique({ where: { id: args.batchId } })
    if (!batch || batch.status !== 'applied' || batch.transitionVersion !== args.expectedVersion || !Array.isArray(batch.appliedIds)) throw new Error('Import batch changed or cannot be rolled back')
    const rows = batchRows(batch)
    for (const itemId of [...batch.appliedIds].sort()) {
      await prisma.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`inventory-item:${itemId}`}, 0))::text AS "lock"`)
      await prisma.$queryRaw(Prisma.sql`SELECT "id" FROM "InventoryItem" WHERE "id" = ${itemId} FOR UPDATE`)
    }
    const items = await prisma.inventoryItem.findMany({ where: { id: { in: batch.appliedIds as string[] }, facilityId: batch.facilityId } })
    if (items.length !== rows.length || items.some((item: any) => {
      const row = rows.find(value => value.sku === item.sku)
      return !row || item.status !== 'active' || item.transitionVersion !== 1 || item.quantityOnHand !== row.quantity || item.quantityReserved !== 0
    })) throw new Error('Imported inventory changed; rollback is no longer safe')
    const now = new Date()
    for (const item of items) {
      const changed = await prisma.inventoryItem.updateMany({ where: { id: item.id, transitionVersion: 1, status: 'active', quantityOnHand: item.quantityOnHand, quantityReserved: 0 }, data: { status: 'inactive', quantityOnHand: 0, transitionVersion: { increment: 1 }, actorReference: context.session!.itemId } })
      if (changed.count !== 1) throw new Error('Imported inventory changed; rollback is no longer safe')
      if (item.quantityOnHand > 0) {
        await prisma.inventoryMovement.create({ data: {
          movementNumber: `MOV-${randomUUID()}`, operationKeyHash: hash(`import-rollback:${batch.id}:${item.id}`),
          requestHash: evidence.requestHash, movementType: 'adjust', quantityDelta: -item.quantityOnHand,
          resultingOnHand: 0, reservedDelta: 0, resultingReserved: 0, reasonCode,
          facilityId: batch.facilityId, itemId: item.id, actorReference: context.session!.itemId, occurredAt: now,
        } })
      }
    }
    const updated = await prisma.importBatch.update({ where: { id: batch.id }, data: {
      status: 'rolled_back', transitionVersion: { increment: 1 }, rolledBackAt: now, actorReference: context.session!.itemId,
    } })
    const events = await appendAuditAndOutbox(prisma, {
      eventKey: `import_batch:${updated.id}:v${updated.transitionVersion}:rolled_back`, eventType: 'import.rolled_back',
      aggregateType: 'import_batch', aggregateId: updated.id, facilityId: updated.facilityId,
      actorReference: context.session!.itemId,
      metadata: { source: 'portability_workflow', aggregateId: updated.id, importType: 'inventory', rowCount: updated.rowCount, status: 'rolled_back', transitionVersion: updated.transitionVersion, reasonCode }, occurredAt: now,
    })
    const projected = result(updated)
    await recordTransition(prisma, {
      evidence, aggregateType: 'import_batch', aggregateId: updated.id, fromStatus: batch.status, toStatus: updated.status,
      fromVersion: batch.transitionVersion, toVersion: updated.transitionVersion, actorReference: context.session!.itemId,
      facilityId: updated.facilityId, auditLogId: events.audit.id, outboxEventId: events.outbox.id, result: projected, occurredAt: now,
    })
    return projected
  }, { timeout: 30_000 })
}

function exportFilters(value: unknown) {
  if (value == null) return {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Export filters are invalid')
  const input = value as Record<string, unknown>
  if (Object.keys(input).some(key => !['from', 'to', 'status'].includes(key))) throw new Error('Export filter is not supported')
  const output: Record<string, string> = {}
  if (input.from) output.from = new Date(String(input.from)).toISOString()
  if (input.to) output.to = new Date(String(input.to)).toISOString()
  if (input.status) output.status = bounded(input.status, 'Export status filter', 40, true)
  if (output.from && output.to && new Date(output.from) > new Date(output.to)) throw new Error('Export date range is invalid')
  return output
}

export async function requestExportJob(_root: unknown, { data }: any, context: Context) {
  await scopedFacility(context, data.facilityId)
  const exportType = bounded(data.exportType, 'Export type', 40, true)
  const format = bounded(data.format, 'Export format', 10, true)
  if (!['patients', 'appointments', 'audit', 'inventory'].includes(exportType) || !['csv', 'json'].includes(format)) throw new Error('Export type or format is invalid')
  if (exportType === 'audit') requireAuditReportAccess(context)
  const filters = exportFilters(data.filters)
  const evidence = operationEvidence({ ...data, exportType, format, filters })
  return context.transaction(async (transactionContext: any) => {
    const prisma = transactionContext.sudo().prisma
    await lockOperation(prisma, 'export-job-create', evidence.operationKeyHash)
    const existing = await prisma.exportJob.findUnique({ where: { operationKeyHash: evidence.operationKeyHash } })
    if (existing) {
      if (existing.requestHash !== evidence.requestHash) throw new Error('Operation key was reused with a different payload')
      return { ...result(existing, true), accessToken: null, expiresAt: existing.expiresAt }
    }
    const accessToken = randomBytes(32).toString('base64url')
    const now = new Date()
    const expiresAt = new Date(now.getTime() + 60 * 60_000)
    const job = await prisma.exportJob.create({ data: {
      jobNumber: `EXPORT-${randomUUID()}`, exportType, status: 'queued', transitionVersion: 1,
      ...evidence, facilityId: data.facilityId, requestedById: context.session!.itemId,
      format, filters, accessTokenDigest: sha256(accessToken), actorReference: context.session!.itemId, expiresAt,
    } })
    await appendAuditAndOutbox(prisma, {
      eventKey: `export_job:${job.id}:v1:queued`, eventType: 'export.queued',
      aggregateType: 'export_job', aggregateId: job.id, facilityId: job.facilityId,
      actorReference: context.session!.itemId,
      metadata: { source: 'portability_workflow', aggregateId: job.id, exportType, format, status: 'queued', transitionVersion: 1, expiresAt: expiresAt.toISOString() }, occurredAt: now,
    })
    return { ...result(job), accessToken, expiresAt }
  }, { timeout: 30_000 })
}

export const MAX_EXPORT_ROWS = 500

export function requireCompleteExportRows<T>(rows: T[]) {
  if (rows.length > MAX_EXPORT_ROWS) {
    throw new Error(`Export contains more than ${MAX_EXPORT_ROWS} rows; narrow the filters and retry`)
  }
  return rows
}

function dateWhere(filters: any) {
  return filters?.from || filters?.to ? { gte: filters.from ? new Date(filters.from) : undefined, lte: filters.to ? new Date(filters.to) : undefined } : undefined
}

function genericCsv(rows: Array<Record<string, unknown>>) {
  if (!rows.length) return ''
  const keys = Object.keys(rows[0])
  const escape = (value: unknown) => {
    let text = value instanceof Date ? value.toISOString() : typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '')
    if (/^[=+\-@]/.test(text)) text = `'${text}`
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
  }
  return [keys.join(','), ...rows.map(row => keys.map(key => escape(row[key])).join(','))].join('\r\n')
}

async function exportRows(prisma: any, job: any) {
  const filters = job.filters && typeof job.filters === 'object' ? job.filters : {}
  const createdAt = dateWhere(filters)
  const status = filters.status ? { equals: filters.status } : undefined
  const take = MAX_EXPORT_ROWS + 1
  if (job.exportType === 'inventory') {
    return prisma.inventoryItem.findMany({ where: { facilityId: job.facilityId, ...(status ? { status: filters.status } : {}) }, orderBy: [{ sku: 'asc' }], take,
      select: { sku: true, name: true, unit: true, status: true, quantityOnHand: true, quantityReserved: true, reorderPoint: true } })
  }
  if (job.exportType === 'appointments') {
    return prisma.appointment.findMany({ where: { facilityId: job.facilityId, ...(createdAt ? { createdAt } : {}), ...(status ? { status: filters.status } : {}) }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take,
      select: { id: true, appointmentNumber: true, status: true, patientId: true, providerId: true, appointmentTypeId: true, startsAt: true, endsAt: true, createdAt: true } })
  }
  if (job.exportType === 'audit') {
    return prisma.clinicalAuditLog.findMany({ where: { facilityId: job.facilityId, ...(createdAt ? { createdAt } : {}) }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take,
      select: { id: true, eventType: true, occurredAt: true, actorType: true, actorReference: true, patientId: true, appointmentId: true, intakeFormId: true, encounterId: true, metadata: true, createdAt: true } })
  }
  return prisma.patient.findMany({ where: { facilities: { some: { id: job.facilityId } }, ...(createdAt ? { createdAt } : {}), ...(status ? { status: filters.status } : {}) }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take,
    select: { id: true, firstName: true, lastName: true, dateOfBirth: true, email: true, phone: true, preferredContactMethod: true, status: true, createdAt: true } })
}

export async function processExportJob(_root: unknown, args: any, context: Context) {
  requirePortability(context)
  const scoped = await context.query.ExportJob.findOne({ where: { id: args.jobId }, query: 'id exportType' }) as any
  if (!scoped) throw new Error('Export job not found or not accessible')
  if (scoped.exportType === 'audit') requireAuditReportAccess(context)
  if (!Number.isInteger(args.expectedVersion) || args.expectedVersion < 1) throw new Error('Expected export version is invalid')
  const evidence = transitionEvidence(args.operationKey, { jobId: args.jobId, expectedVersion: args.expectedVersion, toStatus: 'ready' })
  return context.transaction(async (transactionContext: any) => {
    const prisma = transactionContext.sudo().prisma
    await lockTransitionOperation(prisma, evidence.operationKeyHash)
    await prisma.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`export-job:${args.jobId}`}, 0))::text AS "lock"`)
    const replay = await replayTransition(prisma, evidence, 'export_job', args.jobId)
    if (replay) return replay
    const job = await prisma.exportJob.findUnique({ where: { id: args.jobId } })
    if (!job || job.status !== 'queued' || job.transitionVersion !== args.expectedVersion || job.expiresAt <= new Date()) throw new Error('Export job changed or expired')
    const rows = requireCompleteExportRows<Record<string, unknown>>(await exportRows(prisma, job))
    const artifact = job.format === 'csv'
      ? (job.exportType === 'inventory' ? inventoryRowsToCsv(rows) : genericCsv(rows))
      : JSON.stringify({ exportType: job.exportType, generatedAt: new Date().toISOString(), rows })
    if (Buffer.byteLength(artifact) > 2_000_000) throw new Error('Export result exceeds the two megabyte bounded artifact limit')
    const encrypted = encryptSecret(artifact, exportEncryptionKey())
    const now = new Date()
    const updated = await prisma.exportJob.update({ where: { id: job.id }, data: {
      status: 'ready', transitionVersion: { increment: 1 }, resultDigest: sha256(artifact),
      resultCiphertext: encrypted.ciphertext, resultIv: encrypted.iv, resultTag: encrypted.tag,
      objectKey: `database-encrypted:${job.id}`, readyAt: now, actorReference: context.session!.itemId,
    } })
    const events = await appendAuditAndOutbox(prisma, {
      eventKey: `export_job:${updated.id}:v${updated.transitionVersion}:ready`, eventType: 'export.ready',
      aggregateType: 'export_job', aggregateId: updated.id, facilityId: updated.facilityId,
      actorReference: context.session!.itemId,
      metadata: { source: 'portability_workflow', aggregateId: updated.id, exportType: updated.exportType, format: updated.format, rowCount: rows.length, status: 'ready', transitionVersion: updated.transitionVersion, expiresAt: updated.expiresAt.toISOString() }, occurredAt: now,
    })
    const projected = result(updated)
    await recordTransition(prisma, {
      evidence, aggregateType: 'export_job', aggregateId: updated.id, fromStatus: job.status, toStatus: updated.status,
      fromVersion: job.transitionVersion, toVersion: updated.transitionVersion, actorReference: context.session!.itemId,
      facilityId: updated.facilityId, auditLogId: events.audit.id, outboxEventId: events.outbox.id, result: projected, occurredAt: now,
    })
    return projected
  }, { timeout: 30_000 })
}
