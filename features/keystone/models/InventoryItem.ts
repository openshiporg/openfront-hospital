import { list } from '@keystone-6/core'
import { integer, relationship, select, text } from '@keystone-6/core/fields'
import { denyAccess, isSignedIn, permissions, rules } from '../access'
import { trackingFields } from './trackingFields'

export const InventoryItem = list({
  db: { extendPrismaSchema(schema) { return schema
    .replace(/facility\s+Facility\?/, 'facility Facility').replace(/facilityId\s+String\?/, 'facilityId String')
    .replace(/\n}\s*$/, '\n\n  @@unique([facilityId, sku], map: "InventoryItem_facility_sku_key")\n}') } },
  access: { operation: { query: isSignedIn, create: denyAccess, update: denyAccess, delete: denyAccess }, filter: { query: rules.canReadInventory } },
  graphql: { omit: { create: true, update: true, delete: true } },
  ui: { hideCreate: true, hideDelete: true, listView: { initialColumns: ['sku', 'name', 'status', 'quantityOnHand', 'quantityReserved', 'facility'] } },
  fields: {
    sku: text({ validation: { isRequired: true } }), name: text({ validation: { isRequired: true } }), unit: text({ validation: { isRequired: true } }),
    status: select({ type: 'string', options: [{ label: 'Active', value: 'active' }, { label: 'Inactive', value: 'inactive' }], defaultValue: 'active', validation: { isRequired: true } }),
    transitionVersion: integer({ defaultValue: 1, validation: { isRequired: true, min: 1 } }),
    quantityOnHand: integer({ defaultValue: 0, validation: { isRequired: true, min: 0 } }),
    quantityReserved: integer({ defaultValue: 0, validation: { isRequired: true, min: 0 } }),
    reorderPoint: integer({ defaultValue: 0, validation: { isRequired: true, min: 0 } }),
    operationKeyHash: text({ isIndexed: 'unique', access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
    requestHash: text({ access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
    actorReference: text({ access: { read: permissions.canReadAuditMetadata }, validation: { isRequired: true } }),
    facility: relationship({ ref: 'Facility' }), ...trackingFields,
  },
})
