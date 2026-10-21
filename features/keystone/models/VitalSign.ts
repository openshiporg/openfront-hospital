import { list } from '@keystone-6/core'
import { integer, relationship, text, timestamp } from '@keystone-6/core/fields'

import { denyAccess, isSignedIn, permissions, rules } from '../access'
import { trackingFields } from './trackingFields'

export const VitalSign = list({
  db: {
    extendPrismaSchema(schema) {
      return schema
        .replace(/facility\s+Facility\?/, 'facility Facility')
        .replace(/facilityId\s+String\?/, 'facilityId String')
        .replace(/patient\s+Patient\?/, 'patient Patient')
        .replace(/patientId\s+String\?/, 'patientId String')
        .replace(/encounter\s+Encounter\?/, 'encounter Encounter')
        .replace(/encounterId\s+String\?/, 'encounterId String')
        .replace(/recordedBy\s+Clinician\?/, 'recordedBy Clinician')
        .replace(/recordedById\s+String\?/, 'recordedById String')
    },
  },
  access: {
    operation: { query: isSignedIn, create: denyAccess, update: denyAccess, delete: denyAccess },
    filter: { query: rules.canReadVitalSigns },
  },
  graphql: { omit: { create: true, update: true, delete: true } },
  ui: { hideCreate: true, hideDelete: true, listView: { initialColumns: ['patient', 'encounter', 'recordedAt', 'recordedBy'] } },
  fields: {
    operationKeyHash: text({ isIndexed: 'unique', access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
    requestHash: text({ access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
    facility: relationship({ ref: 'Facility' }),
    patient: relationship({ ref: 'Patient' }),
    encounter: relationship({ ref: 'Encounter' }),
    recordedBy: relationship({ ref: 'Clinician' }),
    actorReference: text({ access: { read: permissions.canReadAuditMetadata }, validation: { isRequired: true } }),
    recordedAt: timestamp({ defaultValue: { kind: 'now' }, validation: { isRequired: true } }),
    // New writes use integer tenths so ordinary decimal temperatures are not
    // rounded. temperatureC is retained read-only for migrated legacy rows.
    temperatureC: integer({ access: { read: permissions.canReadClinicalPhi } }),
    temperatureTenthsC: integer({ access: { read: permissions.canReadClinicalPhi } }),
    systolicBp: integer({ access: { read: permissions.canReadClinicalPhi } }),
    diastolicBp: integer({ access: { read: permissions.canReadClinicalPhi } }),
    heartRate: integer({ access: { read: permissions.canReadClinicalPhi } }),
    respiratoryRate: integer({ access: { read: permissions.canReadClinicalPhi } }),
    oxygenSaturation: integer({ access: { read: permissions.canReadClinicalPhi } }),
    notes: text({ access: { read: permissions.canReadClinicalPhi }, ui: { displayMode: 'textarea' } }),
    ...trackingFields,
  },
})
