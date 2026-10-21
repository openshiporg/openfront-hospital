import { list } from '@keystone-6/core'
import { integer, relationship, select, text, timestamp } from '@keystone-6/core/fields'
import { denyAccess, isSignedIn, permissions, rules } from '../access'
import { trackingFields } from './trackingFields'

export const Specimen = list({
  db: { extendPrismaSchema(schema) { return schema
    .replace(/facility\s+Facility\?/, 'facility Facility').replace(/facilityId\s+String\?/, 'facilityId String')
    .replace(/patient\s+Patient\?/, 'patient Patient').replace(/patientId\s+String\?/, 'patientId String')
    .replace(/encounter\s+Encounter\?/, 'encounter Encounter').replace(/encounterId\s+String\?/, 'encounterId String')
    .replace(/medicalOrder\s+MedicalOrder\?/, 'medicalOrder MedicalOrder').replace(/medicalOrderId\s+String\?/, 'medicalOrderId String') } },
  access: { operation: { query: isSignedIn, create: denyAccess, update: denyAccess, delete: denyAccess }, filter: { query: rules.canReadSpecimens } },
  graphql: { plural: 'Specimens', omit: { create: true, update: true, delete: true } },
  ui: { hideCreate: true, hideDelete: true, listView: { initialColumns: ['specimenNumber', 'status', 'specimenType', 'patient', 'medicalOrder'] } },
  fields: {
    specimenNumber: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    status: select({ type: 'string', options: [
      { label: 'Collected', value: 'collected' }, { label: 'Received', value: 'received' }, { label: 'Processing', value: 'processing' },
      { label: 'Disposed', value: 'disposed' }, { label: 'Rejected', value: 'rejected' },
    ], defaultValue: 'collected', validation: { isRequired: true } }),
    transitionVersion: integer({ defaultValue: 1, validation: { isRequired: true, min: 1 } }),
    operationKeyHash: text({ isIndexed: 'unique', access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }), requestHash: text({ access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
    facility: relationship({ ref: 'Facility' }), patient: relationship({ ref: 'Patient' }), encounter: relationship({ ref: 'Encounter' }), medicalOrder: relationship({ ref: 'MedicalOrder' }),
    specimenType: text({ validation: { isRequired: true } }), actorReference: text({ access: { read: permissions.canReadAuditMetadata }, validation: { isRequired: true } }),
    collectedAt: timestamp({ validation: { isRequired: true } }), receivedAt: timestamp(), disposedAt: timestamp(), rejectionReason: text({ access: { read: permissions.canReadClinicalPhi } }), ...trackingFields,
  },
})
