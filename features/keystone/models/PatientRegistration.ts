import { list } from '@keystone-6/core'
import { json, relationship, select, text, timestamp } from '@keystone-6/core/fields'

import { denyAccess, isSignedIn, permissions, rules } from '../access'

export const PatientRegistration = list({
  db: {
    extendPrismaSchema(schema) {
      return schema
        .replace(/facility\s+Facility\?/, 'facility Facility')
        .replace(/facilityId\s+String\?/, 'facilityId String')
        .replace(/patient\s+Patient\?/, 'patient Patient')
        .replace(/patientId\s+String\?/, 'patientId String')
        .replace(/identifier\s+PatientIdentifier\?/, 'identifier PatientIdentifier')
        .replace(/identifierId\s+String\?/, 'identifierId String')
        .replace(/consent\s+PatientConsent\?/, 'consent PatientConsent')
        .replace(/consentId\s+String\?/, 'consentId String')
        .replace(/auditLog\s+ClinicalAuditLog\?/, 'auditLog ClinicalAuditLog')
        .replace(/auditLogId\s+String\?/, 'auditLogId String')
        .replace(/createdBy\s+User\?/, 'createdBy User')
        .replace(/createdById\s+String\?/, 'createdById String')
        .replace(/identifierId\s+String(\s+@map)/, 'identifierId String @unique$1')
        .replace(/consentId\s+String(\s+@map)/, 'consentId String @unique$1')
        .replace(/auditLogId\s+String(\s+@map)/, 'auditLogId String @unique$1')
        .replace(
          /\n}\s*$/,
          '\n\n  @@unique([facilityId, idempotencyKeyHash], map: "PatientRegistration_facility_idempotency_key")\n}',
        )
    },
  },
  access: {
    operation: { query: isSignedIn, create: denyAccess, update: denyAccess, delete: denyAccess },
    filter: { query: rules.canReadPatientRegistrations },
  },
  graphql: { omit: { create: true, update: true, delete: true } },
  ui: {
    hideCreate: true,
    hideDelete: true,
    isHidden: ({ session }) => !session?.data.role?.canManagePatients,
    listView: { initialColumns: ['status', 'facility', 'patient', 'identifier', 'duplicateResolution', 'createdAt'] },
  },
  fields: {
    status: select({
      type: 'string',
      options: [{ label: 'Completed', value: 'completed' }],
      defaultValue: 'completed',
      validation: { isRequired: true },
    }),
    facility: relationship({ ref: 'Facility.patientRegistrations' }),
    patient: relationship({ ref: 'Patient.registrations' }),
    identifier: relationship({ ref: 'PatientIdentifier' }),
    consent: relationship({ ref: 'PatientConsent' }),
    auditLog: relationship({ ref: 'ClinicalAuditLog' }),
    createdBy: relationship({ ref: 'User' }),
    idempotencyKeyHash: text({
      access: { read: permissions.canAccessAllClinicalData },
      validation: { isRequired: true },
      ui: { description: 'SHA-256 digest only. The submitted idempotency key is never stored.' },
    }),
    requestHash: text({
      access: { read: permissions.canAccessAllClinicalData },
      validation: { isRequired: true },
    }),
    duplicateResolution: select({
      type: 'string',
      options: [
        { label: 'No candidate', value: 'no_candidate' },
        { label: 'Create distinct patient', value: 'create_new' },
        { label: 'Link existing patient', value: 'link_existing' },
      ],
      validation: { isRequired: true },
    }),
    provenance: json({
      access: { read: permissions.canReadAuditMetadata },
      ui: { description: 'Bounded workflow provenance only; never store MRNs, contact values, or free-text PHI.' },
    }),
    createdAt: timestamp({ validation: { isRequired: true }, defaultValue: { kind: 'now' } }),
  },
})
