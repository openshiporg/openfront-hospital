import { list } from '@keystone-6/core'
import { integer, json, relationship, text, timestamp } from '@keystone-6/core/fields'
import { denyAccess, isSignedIn, permissions, rules } from '../access'

export const ClaimVersion = list({
  db: { extendPrismaSchema(schema) { return schema
    .replace(/facility\s+Facility\?/, 'facility Facility').replace(/facilityId\s+String\?/, 'facilityId String')
    .replace(/patient\s+Patient\?/, 'patient Patient').replace(/patientId\s+String\?/, 'patientId String')
    .replace(/claim\s+InsuranceClaim\?/, 'claim InsuranceClaim').replace(/claimId\s+String\?/, 'claimId String')
    .replace(/\n}\s*$/, '\n\n  @@unique([claimId, version], map: "ClaimVersion_claim_version_key")\n}') } },
  access: { operation: { query: isSignedIn, create: denyAccess, update: denyAccess, delete: denyAccess }, filter: { query: rules.canReadBillingRecords } },
  graphql: { omit: { create: true, update: true, delete: true } },
  ui: { hideCreate: true, hideDelete: true, listView: { initialColumns: ['claim', 'version', 'status', 'reasonCode', 'createdAt'] } },
  fields: {
    versionKey: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    version: integer({ validation: { isRequired: true, min: 1 } }), status: text({ validation: { isRequired: true } }),
    operationKeyHash: text({ isIndexed: 'unique', access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
    requestHash: text({ access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
    facility: relationship({ ref: 'Facility' }), patient: relationship({ ref: 'Patient' }), claim: relationship({ ref: 'InsuranceClaim.versions' }),
    coverage: relationship({ ref: 'PatientCoverage' }), reasonCode: text(), snapshot: json({ access: { read: permissions.canManageBilling } }),
    actorReference: text({ access: { read: permissions.canReadAuditMetadata }, validation: { isRequired: true } }),
    createdAt: timestamp({ defaultValue: { kind: 'now' }, validation: { isRequired: true } }),
  },
})
