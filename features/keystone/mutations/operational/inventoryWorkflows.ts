import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import type { Context } from '.keystone/types'
import { lockTransitionOperation, recordTransition, replayTransition, transitionEvidence } from '../transitionEvidence'
import { appendAudit, bounded, hash, lockOperation, operationEvidence } from './evidence'
import { HospitalRefusal } from '../../lib/constraint-errors'

function requireInventory(context: Context) {
  const role = context.session?.data.role
  if (!role?.canManageInventory) {
    throw new HospitalRefusal('Not authorized to manage inventory')
  }
}

function itemResult(row: any, replayed = false) {
  return {
    id: row.id,
    status: row.status,
    transitionVersion: row.transitionVersion,
    quantityOnHand: row.quantityOnHand,
    quantityReserved: row.quantityReserved,
    replayed,
  }
}

export async function createInventoryItem(_root: unknown, { data }: any, context: Context) {
  requireInventory(context)
  const facility = await context.query.Facility.findOne({ where: { id: data.facilityId }, query: 'id status' }) as any
  if (!facility || facility.status !== 'active') throw new HospitalRefusal('Facility not found or not accessible')
  const input = {
    ...data,
    sku: bounded(data.sku, 'SKU', 100, true).toUpperCase(),
    name: bounded(data.name, 'Inventory item name', 300, true),
    unit: bounded(data.unit, 'Inventory unit', 80, true),
  }
  const initialQuantity = Number(data.initialQuantity || 0)
  const reorderPoint = Number(data.reorderPoint || 0)
  if (!Number.isSafeInteger(initialQuantity) || initialQuantity < 0 || !Number.isSafeInteger(reorderPoint) || reorderPoint < 0) {
    throw new HospitalRefusal('Inventory quantities must be non-negative integers')
  }
  const evidence = operationEvidence(input)
  return context.transaction(async (transactionContext: any) => {
    const prisma = transactionContext.sudo().prisma
    await lockOperation(prisma, 'inventory-item-create', evidence.operationKeyHash)
    const existing = await prisma.inventoryItem.findUnique({ where: { operationKeyHash: evidence.operationKeyHash } })
    if (existing) {
      if (existing.requestHash !== evidence.requestHash) throw new HospitalRefusal('Operation key was reused with a different payload')
      return itemResult(existing, true)
    }
    const duplicateSku = await prisma.inventoryItem.findFirst({ where: { facilityId: data.facilityId, sku: input.sku } })
    if (duplicateSku) throw new HospitalRefusal('Inventory SKU already exists in the facility')
    const now = new Date()
    const item = await prisma.inventoryItem.create({
      data: {
        sku: input.sku, name: input.name, unit: input.unit, status: 'active', transitionVersion: 1,
        quantityOnHand: initialQuantity, quantityReserved: 0, reorderPoint,
        ...evidence, actorReference: context.session!.itemId, facilityId: data.facilityId,
      },
    })
    if (initialQuantity > 0) {
      await prisma.inventoryMovement.create({
        data: {
          movementNumber: `MOV-${randomUUID()}`,
          operationKeyHash: hash(`initial:${evidence.operationKeyHash}`),
          requestHash: evidence.requestHash,
          movementType: 'receive', quantityDelta: initialQuantity, resultingOnHand: initialQuantity,
          reservedDelta: 0, resultingReserved: 0, reasonCode: 'initial_balance',
          facilityId: data.facilityId, itemId: item.id, actorReference: context.session!.itemId, occurredAt: now,
        },
      })
    }
    await appendAudit(prisma, {
      eventType: 'inventory_item.created',
      aggregateType: 'inventory_item', aggregateId: item.id, facilityId: item.facilityId,
      actorReference: context.session!.itemId,
      metadata: { source: 'inventory_workflow', aggregateId: item.id, status: item.status, transitionVersion: 1 },
      occurredAt: now,
    })
    return itemResult(item)
  }, { timeout: 30_000 })
}

export async function transitionInventoryItem(_root: unknown, args: any, context: Context) {
  requireInventory(context)
  const scoped = await context.query.InventoryItem.findOne({ where: { id: args.itemId }, query: 'id' })
  if (!scoped) throw new HospitalRefusal('Inventory item not found or not accessible')
  if (!Number.isInteger(args.expectedVersion) || args.expectedVersion < 1) throw new HospitalRefusal('Expected inventory version is invalid')
  if (!['active', 'inactive'].includes(args.toStatus)) throw new HospitalRefusal('Inventory status is invalid')
  const reasonCode = bounded(args.reasonCode, 'Inventory status reason', 80, true)
  const evidence = transitionEvidence(args.operationKey, { itemId: args.itemId, expectedVersion: args.expectedVersion, toStatus: args.toStatus, reasonCode })
  return context.transaction(async (transactionContext: any) => {
    const prisma = transactionContext.sudo().prisma
    await lockTransitionOperation(prisma, evidence.operationKeyHash)
    await prisma.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`inventory-item:${args.itemId}`}, 0))::text AS "lock"`)
    const replay = await replayTransition(prisma, evidence, 'inventory_item', args.itemId)
    if (replay) return replay
    const current = await prisma.inventoryItem.findUnique({ where: { id: args.itemId } })
    if (!current || current.transitionVersion !== args.expectedVersion || current.status === args.toStatus) throw new HospitalRefusal('Inventory item changed; refresh before retrying')
    if (args.toStatus === 'inactive' && current.quantityReserved > 0) throw new HospitalRefusal('Reserved inventory must be released before deactivation')
    const now = new Date()
    const updated = await prisma.inventoryItem.update({ where: { id: current.id }, data: { status: args.toStatus, transitionVersion: { increment: 1 }, actorReference: context.session!.itemId } })
    const events = await appendAudit(prisma, {
      eventType: `inventory_item.${updated.status}`, aggregateType: 'inventory_item', aggregateId: updated.id,
      facilityId: updated.facilityId, actorReference: context.session!.itemId,
      metadata: { source: 'inventory_workflow', aggregateId: updated.id, fromStatus: current.status, status: updated.status, transitionVersion: updated.transitionVersion, reasonCode }, occurredAt: now,
    })
    const projected = itemResult(updated)
    await recordTransition(prisma, {
      evidence, aggregateType: 'inventory_item', aggregateId: updated.id, fromStatus: current.status, toStatus: updated.status,
      fromVersion: current.transitionVersion, toVersion: updated.transitionVersion, actorReference: context.session!.itemId,
      facilityId: updated.facilityId, auditLogId: events.audit.id, result: projected, occurredAt: now,
    })
    return projected
  }, { timeout: 30_000 })
}

export async function moveInventory(_root: unknown, { data }: any, context: Context) {
  requireInventory(context)
  if (!Number.isInteger(data.expectedVersion) || data.expectedVersion < 1) throw new HospitalRefusal('Expected inventory version is invalid')
  const movementType = bounded(data.movementType, 'Movement type', 40, true)
  if (!['receive', 'consume', 'adjust', 'reserve', 'release'].includes(movementType)) throw new HospitalRefusal('Inventory movement type is invalid')
  const quantityDelta = Number(data.quantityDelta || 0)
  const reservedDelta = Number(data.reservedDelta || 0)
  if (!Number.isSafeInteger(quantityDelta) || !Number.isSafeInteger(reservedDelta)) throw new HospitalRefusal('Inventory movement quantities must be integers')
  if (movementType === 'receive' && (quantityDelta <= 0 || reservedDelta !== 0)) throw new HospitalRefusal('Receive movement must add on-hand quantity')
  if (movementType === 'consume' && (quantityDelta >= 0 || reservedDelta !== 0)) throw new HospitalRefusal('Consume movement must subtract on-hand quantity')
  if (movementType === 'reserve' && (quantityDelta !== 0 || reservedDelta <= 0)) throw new HospitalRefusal('Reserve movement must add reserved quantity')
  if (movementType === 'release' && (quantityDelta !== 0 || reservedDelta >= 0)) throw new HospitalRefusal('Release movement must subtract reserved quantity')
  if (movementType === 'adjust' && (quantityDelta === 0 || reservedDelta !== 0)) throw new HospitalRefusal('Adjustment must change on-hand quantity')
  const reasonCode = bounded(data.reasonCode, 'Inventory reason', 80, true)
  const scoped = await context.query.InventoryItem.findOne({ where: { id: data.itemId }, query: 'id' })
  if (!scoped) throw new HospitalRefusal('Inventory item not found or not accessible')
  const evidence = operationEvidence({ ...data, movementType, quantityDelta, reservedDelta, reasonCode })

  return context.transaction(async (transactionContext: any) => {
    const prisma = transactionContext.sudo().prisma
    await lockOperation(prisma, 'inventory-movement', evidence.operationKeyHash)
    const existing = await prisma.inventoryMovement.findUnique({ where: { operationKeyHash: evidence.operationKeyHash } })
    if (existing) {
      if (existing.requestHash !== evidence.requestHash) throw new HospitalRefusal('Operation key was reused with a different payload')
      const item = await prisma.inventoryItem.findUnique({ where: { id: existing.itemId } })
      if (!item) throw new HospitalRefusal('Inventory replay item is missing')
      return itemResult(item, true)
    }
    await prisma.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`inventory-item:${data.itemId}`}, 0))::text AS "lock"`)
    const item = await prisma.inventoryItem.findUnique({ where: { id: data.itemId } })
    if (!item || item.status !== 'active' || item.transitionVersion !== data.expectedVersion) {
      throw new HospitalRefusal('Inventory item changed or is inactive; refresh before retrying')
    }
    const nextOnHand = item.quantityOnHand + quantityDelta
    const nextReserved = item.quantityReserved + reservedDelta
    if (nextOnHand < 0 || nextReserved < 0 || nextReserved > nextOnHand) {
      throw new HospitalRefusal('Inventory movement would create an invalid or negative balance')
    }
    const now = new Date()
    const updated = await prisma.inventoryItem.update({
      where: { id: item.id },
      data: {
        quantityOnHand: nextOnHand,
        quantityReserved: nextReserved,
        transitionVersion: { increment: 1 },
        actorReference: context.session!.itemId,
      },
    })
    const movement = await prisma.inventoryMovement.create({
      data: {
        movementNumber: `MOV-${randomUUID()}`,
        ...evidence,
        movementType,
        quantityDelta,
        resultingOnHand: nextOnHand,
        reservedDelta,
        resultingReserved: nextReserved,
        reasonCode,
        facilityId: item.facilityId,
        itemId: item.id,
        actorReference: context.session!.itemId,
        occurredAt: now,
      },
    })
    await appendAudit(prisma, {
      eventType: `inventory.${movementType}`, aggregateType: 'inventory_item', aggregateId: item.id,
      facilityId: item.facilityId, actorReference: context.session!.itemId,
      metadata: { source: 'inventory_workflow', aggregateId: item.id, movementId: movement.id, movementType, transitionVersion: updated.transitionVersion, quantityDelta, reservedDelta },
      occurredAt: now,
    })
    return itemResult(updated)
  }, { timeout: 30_000 })
}
