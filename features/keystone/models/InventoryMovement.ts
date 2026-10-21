import { list } from '@keystone-6/core'
import { integer, relationship, select, text, timestamp } from '@keystone-6/core/fields'
import { denyAccess, isSignedIn, permissions, rules } from '../access'

export const InventoryMovement = list({
  db: { extendPrismaSchema(schema) { return schema
    .replace(/facility\s+Facility\?/, 'facility Facility').replace(/facilityId\s+String\?/, 'facilityId String')
    .replace(/item\s+InventoryItem\?/, 'item InventoryItem').replace(/itemId\s+String\?/, 'itemId String') } },
  access: { operation: { query: isSignedIn, create: denyAccess, update: denyAccess, delete: denyAccess }, filter: { query: rules.canReadInventory } },
  graphql: { omit: { create: true, update: true, delete: true } },
  ui: { hideCreate: true, hideDelete: true, listView: { initialColumns: ['item', 'movementType', 'quantityDelta', 'resultingOnHand', 'occurredAt'] } },
  fields: {
    movementNumber: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    operationKeyHash: text({ isIndexed: 'unique', access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
    requestHash: text({ access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
    movementType: select({ type: 'string', options: [
      { label: 'Receive', value: 'receive' }, { label: 'Consume', value: 'consume' },
      { label: 'Adjust', value: 'adjust' }, { label: 'Reserve', value: 'reserve' }, { label: 'Release', value: 'release' },
    ], validation: { isRequired: true } }),
    quantityDelta: integer({ validation: { isRequired: true } }), resultingOnHand: integer({ validation: { isRequired: true, min: 0 } }),
    reservedDelta: integer({ defaultValue: 0, validation: { isRequired: true } }), resultingReserved: integer({ validation: { isRequired: true, min: 0 } }),
    reasonCode: text({ validation: { isRequired: true } }), facility: relationship({ ref: 'Facility' }), item: relationship({ ref: 'InventoryItem' }),
    prescription: relationship({ ref: 'Prescription' }), procedure: relationship({ ref: 'Procedure' }),
    actorReference: text({ access: { read: permissions.canReadAuditMetadata }, validation: { isRequired: true } }),
    occurredAt: timestamp({ defaultValue: { kind: 'now' }, validation: { isRequired: true } }),
  },
})
