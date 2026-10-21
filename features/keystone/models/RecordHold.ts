import { list } from '@keystone-6/core'
import { integer, relationship, select, text, timestamp } from '@keystone-6/core/fields'
import { denyAccess, isSignedIn, permissions, rules } from '../access'
import { trackingFields } from './trackingFields'

export const RecordHold = list({
  db: { extendPrismaSchema(schema) { return schema.replace(/facility\s+Facility\?/, 'facility Facility').replace(/facilityId\s+String\?/, 'facilityId String') } },
  access: { operation: { query: isSignedIn, create: denyAccess, update: denyAccess, delete: denyAccess }, filter: { query: rules.canReadRetentionRecords } },
  graphql: { omit: { create: true, update: true, delete: true } },
  ui: { hideCreate: true, hideDelete: true, listView: { initialColumns: ['aggregateType', 'aggregateId', 'status', 'reasonCode', 'facility'] } },
  fields: {
    holdNumber: text({ isIndexed: 'unique', validation: { isRequired: true } }), aggregateType: text({ validation: { isRequired: true } }), aggregateId: text({ validation: { isRequired: true }, isIndexed: true }),
    status: select({ type: 'string', options: [{ label: 'Active', value: 'active' }, { label: 'Released', value: 'released' }], defaultValue: 'active', validation: { isRequired: true } }), transitionVersion: integer({ defaultValue: 1, validation: { isRequired: true, min: 1 } }),
    operationKeyHash: text({ isIndexed: 'unique', access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }), requestHash: text({ access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
    facility: relationship({ ref: 'Facility' }), patient: relationship({ ref: 'Patient' }), reasonCode: text({ validation: { isRequired: true } }), notes: text({ access: { read: permissions.canManageRetention } }),
    actorReference: text({ access: { read: permissions.canReadAuditMetadata }, validation: { isRequired: true } }), placedAt: timestamp({ defaultValue: { kind: 'now' }, validation: { isRequired: true } }), releasedAt: timestamp(), ...trackingFields,
  },
})
