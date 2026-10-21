import { list } from '@keystone-6/core'
import { integer, json, relationship, select, text, timestamp } from '@keystone-6/core/fields'
import { denyAccess, isSignedIn, permissions, rules } from '../access'
import { trackingFields } from './trackingFields'

export const ImportBatch = list({
  db: { extendPrismaSchema(schema) { return schema.replace(/facility\s+Facility\?/, 'facility Facility').replace(/facilityId\s+String\?/, 'facilityId String') } },
  access: { operation: { query: isSignedIn, create: denyAccess, update: denyAccess, delete: denyAccess }, filter: { query: rules.canReadPortabilityRecords } },
  graphql: { omit: { create: true, update: true, delete: true } },
  ui: { hideCreate: true, hideDelete: true, listView: { initialColumns: ['batchNumber', 'importType', 'status', 'rowCount', 'errorCount', 'facility'] } },
  fields: {
    batchNumber: text({ isIndexed: 'unique', validation: { isRequired: true } }), importType: select({ type: 'string', options: [{ label: 'Patients', value: 'patients' }, { label: 'Inventory', value: 'inventory' }], validation: { isRequired: true } }),
    status: select({ type: 'string', options: [{ label: 'Previewed', value: 'previewed' }, { label: 'Applied', value: 'applied' }, { label: 'Rolled back', value: 'rolled_back' }, { label: 'Failed', value: 'failed' }], defaultValue: 'previewed', validation: { isRequired: true } }),
    transitionVersion: integer({ defaultValue: 1, validation: { isRequired: true, min: 1 } }), operationKeyHash: text({ isIndexed: 'unique', access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }), requestHash: text({ access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }), sourceHash: text({ validation: { isRequired: true } }),
    facility: relationship({ ref: 'Facility' }), rowCount: integer({ defaultValue: 0, validation: { isRequired: true, min: 0 } }), errorCount: integer({ defaultValue: 0, validation: { isRequired: true, min: 0 } }),
    preview: json({ access: { read: permissions.canManageDataPortability } }), appliedIds: json({ access: { read: permissions.canManageDataPortability } }),
    actorReference: text({ access: { read: permissions.canReadAuditMetadata }, validation: { isRequired: true } }), appliedAt: timestamp(), rolledBackAt: timestamp(), ...trackingFields,
  },
})
