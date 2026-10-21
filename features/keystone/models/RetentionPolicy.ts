import { list } from '@keystone-6/core'
import { integer, relationship, select, text } from '@keystone-6/core/fields'
import { denyAccess, isSignedIn, permissions, rules } from '../access'
import { trackingFields } from './trackingFields'

export const RetentionPolicy = list({
  db: { extendPrismaSchema(schema) { return schema
    .replace(/facility\s+Facility\?/, 'facility Facility').replace(/facilityId\s+String\?/, 'facilityId String')
    .replace(/\n}\s*$/, '\n\n  @@unique([facilityId, recordType], map: "RetentionPolicy_facility_record_key")\n}') } },
  access: { operation: { query: isSignedIn, create: denyAccess, update: denyAccess, delete: denyAccess }, filter: { query: rules.canReadRetentionRecords } },
  graphql: { omit: { create: true, update: true, delete: true } },
  ui: { hideCreate: true, hideDelete: true, listView: { initialColumns: ['recordType', 'retentionDays', 'status', 'facility'] } },
  fields: {
    recordType: text({ validation: { isRequired: true } }), retentionDays: integer({ validation: { isRequired: true, min: 1 } }),
    status: select({ type: 'string', options: [{ label: 'Active', value: 'active' }, { label: 'Inactive', value: 'inactive' }], defaultValue: 'active', validation: { isRequired: true } }),
    transitionVersion: integer({ defaultValue: 1, validation: { isRequired: true, min: 1 } }),
    operationKeyHash: text({ isIndexed: 'unique', access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
    requestHash: text({ access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
    actorReference: text({ access: { read: permissions.canReadAuditMetadata }, validation: { isRequired: true } }),
    facility: relationship({ ref: 'Facility' }), ...trackingFields,
  },
})
