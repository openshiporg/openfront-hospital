import { list } from '@keystone-6/core'
import { integer, relationship, select, text, timestamp } from '@keystone-6/core/fields'
import { denyAccess, isSignedIn, permissions, rules } from '../access'
import { trackingFields } from './trackingFields'

export const PatientCoverage = list({
  db: { extendPrismaSchema(schema) { return schema
    .replace(/facility\s+Facility\?/, 'facility Facility').replace(/facilityId\s+String\?/, 'facilityId String')
    .replace(/patient\s+Patient\?/, 'patient Patient').replace(/patientId\s+String\?/, 'patientId String') } },
  access: { operation: { query: isSignedIn, create: denyAccess, update: denyAccess, delete: denyAccess }, filter: { query: rules.canReadCoverages } },
  graphql: { omit: { create: true, update: true, delete: true } },
  ui: { hideCreate: true, hideDelete: true, listView: { initialColumns: ['coverageNumber', 'status', 'payerName', 'patient', 'facility'] } },
  fields: {
    coverageNumber: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    status: select({ type: 'string', options: [
      { label: 'Unverified', value: 'unverified' }, { label: 'Staff-verified record (not payer eligibility)', value: 'active' },
      { label: 'Inactive record', value: 'inactive' }, { label: 'Staff-rejected record', value: 'rejected' },
    ], defaultValue: 'unverified', validation: { isRequired: true } }),
    transitionVersion: integer({ defaultValue: 1, validation: { isRequired: true, min: 1 } }),
    operationKeyHash: text({ isIndexed: 'unique', access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
    requestHash: text({ access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
    actorReference: text({ access: { read: permissions.canReadAuditMetadata }, validation: { isRequired: true } }),
    facility: relationship({ ref: 'Facility' }), patient: relationship({ ref: 'Patient' }),
    payerName: text({ access: { read: permissions.canManageBilling }, validation: { isRequired: true } }),
    memberId: text({ access: { read: permissions.canManageBilling }, validation: { isRequired: true } }),
    groupNumber: text({ access: { read: permissions.canManageBilling } }),
    effectiveAt: timestamp(), terminatesAt: timestamp(), verifiedAt: timestamp(), verifiedBy: relationship({ ref: 'User' }),
    ...trackingFields,
  },
})
