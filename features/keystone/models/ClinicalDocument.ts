import { list } from '@keystone-6/core'
import { integer, relationship, select, text, timestamp } from '@keystone-6/core/fields'
import { denyAccess, isSignedIn, permissions, rules } from '../access'
import { trackingFields } from './trackingFields'

export const ClinicalDocument = list({
  db: { extendPrismaSchema(schema) { return schema
    .replace(/facility\s+Facility\?/, 'facility Facility').replace(/facilityId\s+String\?/, 'facilityId String')
    .replace(/patient\s+Patient\?/, 'patient Patient').replace(/patientId\s+String\?/, 'patientId String')
    .replace(/encounter\s+Encounter\?/, 'encounter Encounter').replace(/encounterId\s+String\?/, 'encounterId String')
    .replace(/author\s+Provider\?/, 'author Provider').replace(/authorId\s+String\?/, 'authorId String') } },
  access: { operation: { query: isSignedIn, create: denyAccess, update: denyAccess, delete: denyAccess }, filter: { query: rules.canReadClinicalDocuments } },
  graphql: { omit: { create: true, update: true, delete: true } },
  ui: { hideCreate: true, hideDelete: true, listView: { initialColumns: ['documentNumber', 'version', 'status', 'documentType', 'patient', 'encounter'] } },
  fields: {
    documentNumber: text({ isIndexed: 'unique', validation: { isRequired: true } }), version: integer({ defaultValue: 1, validation: { isRequired: true, min: 1 } }),
    status: select({ type: 'string', options: [{ label: 'Draft', value: 'draft' }, { label: 'Signed', value: 'signed' }, { label: 'Amended', value: 'amended' }, { label: 'Entered in error', value: 'entered_in_error' }], defaultValue: 'draft', validation: { isRequired: true } }),
    transitionVersion: integer({ defaultValue: 1, validation: { isRequired: true, min: 1 } }),
    operationKeyHash: text({ isIndexed: 'unique', access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }), requestHash: text({ access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
    facility: relationship({ ref: 'Facility' }), patient: relationship({ ref: 'Patient' }), encounter: relationship({ ref: 'Encounter' }), author: relationship({ ref: 'Provider' }),
    supersedes: relationship({ ref: 'ClinicalDocument.supersedingDocument' }), supersedingDocument: relationship({ ref: 'ClinicalDocument.supersedes' }),
    documentType: text({ validation: { isRequired: true } }), title: text({ validation: { isRequired: true } }), content: text({ access: { read: permissions.canReadClinicalPhi }, ui: { displayMode: 'textarea' } }), contentHash: text({ access: { read: permissions.canReadClinicalPhi }, validation: { isRequired: true } }),
    actorReference: text({ access: { read: permissions.canReadAuditMetadata }, validation: { isRequired: true } }), signedAt: timestamp(), signedBy: relationship({ ref: 'User' }), ...trackingFields,
  },
})
