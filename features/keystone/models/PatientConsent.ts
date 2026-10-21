import { list } from '@keystone-6/core'
import { json, relationship, select, text, timestamp } from '@keystone-6/core/fields'

import { permissions, rules } from '../access'
const denyMutation = () => false

export const PatientConsent = list({
  db: {
    extendPrismaSchema(schema) {
      return schema
        .replace(/facility\s+Facility\?/, 'facility Facility')
        .replace(/facilityId\s+String\?/, 'facilityId String')
    },
  },
  access: {
    operation: {
      query: (args) => permissions.canManageIntake(args) || permissions.canManagePatients(args) || permissions.canAccessAllClinicalData(args),
      create: denyMutation,
      update: denyMutation,
      delete: denyMutation,
    },
    filter: {
      query: rules.canReadPatientConsents,
    },
  },
  graphql: {
    omit: { create: true, update: true, delete: true },
  },
  ui: {
    hideCreate: true,
    hideDelete: true,
    isHidden: ({ session }) => !session?.data.role?.canManageIntake && !session?.data.role?.canManagePatients && !session?.data.role?.canAccessAllClinicalData,
    listView: { initialColumns: ['consentType', 'decision', 'effectiveAt', 'patient', 'appointment', 'intakeForm'] },
  },
  fields: {
    operationKeyHash: text({ db: { isNullable: true }, isIndexed: 'unique', access: { read: permissions.canAccessAllClinicalData } }),
    requestHash: text({ db: { isNullable: true }, access: { read: permissions.canAccessAllClinicalData } }),
    consentType: text({ validation: { isRequired: true } }),
    decision: select({
      type: 'string',
      options: [
        { label: 'Granted', value: 'granted' },
        { label: 'Declined', value: 'declined' },
        { label: 'Withdrawn', value: 'withdrawn' },
      ],
      defaultValue: 'granted',
      validation: { isRequired: true },
    }),
    effectiveAt: timestamp({ validation: { isRequired: true }, defaultValue: { kind: 'now' } }),
    reasonCode: text(),
    supersedes: relationship({ ref: 'PatientConsent.supersedingDecision' }),
    supersedingDecision: relationship({ ref: 'PatientConsent.supersedes' }),
    policyVersion: text({ validation: { isRequired: true } }),
    statementKey: text({ validation: { isRequired: true } }),
    grantedAt: timestamp({ ui: { description: 'Set only when the decision is granted; declined and withdrawn decisions remain empty.' } }),
    captureMethod: text({ validation: { isRequired: true }, defaultValue: 'public_web' }),
    facility: relationship({ ref: 'Facility' }),
    patient: relationship({ ref: 'Patient.consents' }),
    appointment: relationship({ ref: 'Appointment.consents' }),
    intakeForm: relationship({ ref: 'IntakeForm.consents' }),
    auditLogs: relationship({ ref: 'ClinicalAuditLog.consent', many: true }),
    evidence: json({
      access: { read: permissions.canReadIntakePhi },
      ui: { description: 'Bounded consent evidence only; never store form responses, access codes, or contact details.' },
    }),
    createdAt: timestamp({ validation: { isRequired: true }, defaultValue: { kind: 'now' }, access: { create: denyMutation, update: denyMutation } }),
  },
})
