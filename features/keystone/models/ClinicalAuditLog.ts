import { list } from '@keystone-6/core'
import { json, relationship, text, timestamp } from '@keystone-6/core/fields'

import { permissions, rules } from '../access'
const denyMutation = () => false

export const ClinicalAuditLog = list({
  db: {
    extendPrismaSchema(schema) {
      return schema
        .replace(/facility\s+Facility\?/, 'facility Facility')
        .replace(/facilityId\s+String\?/, 'facilityId String')
    },
  },
  access: {
    operation: {
      query: permissions.canViewReports,
      create: denyMutation,
      update: denyMutation,
      delete: denyMutation,
    },
    filter: {
      query: rules.canReadClinicalAuditLogs,
    },
  },
  graphql: {
    omit: { create: true, update: true, delete: true },
  },
  ui: {
    hideCreate: true,
    hideDelete: true,
    isHidden: ({ session }) => !session?.data.role?.canViewReports,
    listView: { initialColumns: ['eventType', 'occurredAt', 'patient', 'appointment', 'encounter', 'intakeForm'] },
  },
  fields: {
    eventType: text({ validation: { isRequired: true } }),
    occurredAt: timestamp({ validation: { isRequired: true }, defaultValue: { kind: 'now' } }),
    actorType: text({ validation: { isRequired: true }, defaultValue: 'patient' }),
    actorReference: text({
      access: { read: permissions.canReadAuditMetadata },
      ui: { description: 'Authenticated staff user ID or empty for patient self-service; never store contact details, access codes, or response bodies.' },
    }),
    facility: relationship({ ref: 'Facility' }),
    patient: relationship({ ref: 'Patient.clinicalAuditLogs' }),
    appointment: relationship({ ref: 'Appointment.clinicalAuditLogs' }),
    encounter: relationship({ ref: 'Encounter.clinicalAuditLogs' }),
    intakeForm: relationship({ ref: 'IntakeForm.clinicalAuditLogs' }),
    consent: relationship({ ref: 'PatientConsent.auditLogs' }),
    metadata: json({
      access: { read: permissions.canReadAuditMetadata },
      ui: { description: 'Bounded non-PHI event metadata such as source, channel, and status.' },
    }),
    createdAt: timestamp({ validation: { isRequired: true }, defaultValue: { kind: 'now' }, access: { create: denyMutation, update: denyMutation } }),
  },
})
