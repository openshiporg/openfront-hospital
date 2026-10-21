import { list } from '@keystone-6/core'
import { integer, json, relationship, select, text, timestamp } from '@keystone-6/core/fields'
import { denyAccess, isSignedIn, permissions, rules } from '../access'
import { trackingFields } from './trackingFields'

export const ExportJob = list({
  db: { extendPrismaSchema(schema) { return schema.replace(/facility\s+Facility\?/, 'facility Facility').replace(/facilityId\s+String\?/, 'facilityId String').replace(/requestedBy\s+User\?/, 'requestedBy User').replace(/requestedById\s+String\?/, 'requestedById String') } },
  access: { operation: { query: isSignedIn, create: denyAccess, update: denyAccess, delete: denyAccess }, filter: { query: rules.canReadPortabilityRecords } },
  graphql: { omit: { create: true, update: true, delete: true } },
  ui: { hideCreate: true, hideDelete: true, listView: { initialColumns: ['jobNumber', 'exportType', 'status', 'format', 'facility', 'expiresAt'] } },
  fields: {
    jobNumber: text({ isIndexed: 'unique', validation: { isRequired: true } }), exportType: select({ type: 'string', options: [{ label: 'Patients', value: 'patients' }, { label: 'Appointments', value: 'appointments' }, { label: 'Audit', value: 'audit' }, { label: 'Inventory', value: 'inventory' }], validation: { isRequired: true } }),
    status: select({ type: 'string', options: [{ label: 'Queued', value: 'queued' }, { label: 'Processing', value: 'processing' }, { label: 'Ready', value: 'ready' }, { label: 'Expired', value: 'expired' }, { label: 'Failed', value: 'failed' }], defaultValue: 'queued', validation: { isRequired: true } }),
    transitionVersion: integer({ defaultValue: 1, validation: { isRequired: true, min: 1 } }), operationKeyHash: text({ isIndexed: 'unique', access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }), requestHash: text({ access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
    facility: relationship({ ref: 'Facility' }), requestedBy: relationship({ ref: 'User' }), format: select({ type: 'string', options: [{ label: 'CSV', value: 'csv' }, { label: 'JSON', value: 'json' }], validation: { isRequired: true } }),
    filters: json({ access: { read: permissions.canManageDataPortability } }), objectKey: text({ access: { read: denyAccess } }), resultDigest: text({ access: { read: permissions.canManageDataPortability } }), accessTokenDigest: text({ access: { read: denyAccess } }),
    resultCiphertext: text({ access: { read: denyAccess } }), resultIv: text({ access: { read: denyAccess } }), resultTag: text({ access: { read: denyAccess } }),
    actorReference: text({ access: { read: permissions.canReadAuditMetadata }, validation: { isRequired: true } }),
    expiresAt: timestamp({ validation: { isRequired: true } }), readyAt: timestamp(), consumedAt: timestamp(), errorCode: text(), ...trackingFields,
  },
})
