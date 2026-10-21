import { list, graphql } from '@keystone-6/core'
import { integer, text, relationship, select, timestamp, json, virtual } from '@keystone-6/core/fields'

import { denyAccess, isSignedIn, permissions, rules } from '../access'
import { trackingFields } from './trackingFields'

export const IntakeForm = list({
  db: {
    extendPrismaSchema(schema) {
      return schema
        .replace(/facility\s+Facility\?/, 'facility Facility')
        .replace(/facilityId\s+String\?/, 'facilityId String')
    },
  },
  access: {
    operation: {
      query: isSignedIn,
      create: permissions.canAccessAllClinicalData,
      update: permissions.canManageIntake,
      delete: denyAccess,
    },
    filter: {
      query: rules.canReadIntakeForms,
      update: rules.canReadIntakeForms,
    },
  },
  graphql: {
    omit: { create: true, update: true, delete: true },
  },
  ui: {
    listView: {
      initialColumns: ['intakeLabel', 'status', 'patient', 'appointment', 'submittedAt'],
    },
  },
  fields: {
    operationKeyHash: text({ isIndexed: 'unique', access: { read: denyAccess }, validation: { isRequired: true } }),
    requestHash: text({ access: { read: denyAccess }, validation: { isRequired: true } }),
    title: text({ validation: { isRequired: true }, defaultValue: 'Patient intake' }),
    transitionVersion: integer({
      defaultValue: 1,
      validation: { isRequired: true, min: 1 },
      access: { create: permissions.canAccessAllClinicalData, update: denyAccess },
    }),
    status: select({
      type: 'string',
      access: { create: permissions.canManageOnboarding, update: denyAccess },
      options: [
        { label: 'Access active; delivery not evidenced', value: 'not_sent' },
        { label: 'Legacy sent (read only)', value: 'sent' },
        { label: 'Legacy in progress (read only)', value: 'in_progress' },
        { label: 'Submitted', value: 'submitted' },
        { label: 'Needs review', value: 'needs_review' },
        { label: 'Reviewed', value: 'reviewed' },
      ],
      defaultValue: 'not_sent',
      validation: { isRequired: true },
    }),
    facility: relationship({
      ref: 'Facility',
      access: { create: permissions.canAccessAllClinicalData, update: denyAccess },
    }),
    patient: relationship({
      ref: 'Patient.intakeForms',
      access: { create: permissions.canAccessAllClinicalData, update: denyAccess },
    }),
    appointment: relationship({
      ref: 'Appointment.intakeForms',
      access: { create: permissions.canAccessAllClinicalData, update: denyAccess },
    }),
    templateKey: text({ defaultValue: 'new_patient' }),
    accessCodeHash: text({
      isIndexed: 'unique',
      isFilterable: false,
      isOrderable: false,
      db: { isNullable: true },
      access: { read: denyAccess, create: permissions.canManageOnboarding, update: denyAccess },
      ui: { itemView: { fieldMode: 'hidden' }, listView: { fieldMode: 'hidden' } },
    }),
    accessExpiresAt: timestamp({
      validation: { isRequired: true },
      access: { read: permissions.canReadIntakePhi, create: permissions.canManageOnboarding, update: denyAccess },
    }),
    accessUsedAt: timestamp({
      access: { read: permissions.canReadIntakePhi, create: permissions.canManageOnboarding, update: denyAccess },
    }),
    accessRevokedAt: timestamp({
      access: { read: permissions.canReadIntakePhi, create: permissions.canManageOnboarding, update: denyAccess },
    }),
    formSchema: json({ ui: { description: 'Versioned fields shown to the patient.' } }),
    responses: json({
      access: { read: permissions.canReadIntakePhi, create: permissions.canManageOnboarding, update: denyAccess },
      ui: { description: 'Patient-submitted answers. Keep scope to intake/admin context, not full EMR charting.' },
    }),
    sentAt: timestamp({ access: { create: permissions.canManageOnboarding, update: denyAccess } }),
    submittedAt: timestamp({ access: { create: permissions.canManageOnboarding, update: denyAccess } }),
    reviewedAt: timestamp({ access: { create: permissions.canManageOnboarding, update: denyAccess } }),
    reviewedBy: relationship({ ref: 'User.reviewedIntakeForms', access: { create: permissions.canManageOnboarding, update: denyAccess } }),
    reviewNotes: text({
      access: { read: permissions.canReadIntakePhi, create: permissions.canManageOnboarding, update: denyAccess },
      ui: { displayMode: 'textarea' },
    }),
    consents: relationship({ ref: 'PatientConsent.intakeForm', many: true, access: { create: () => false, update: () => false } }),
    clinicalAuditLogs: relationship({ ref: 'ClinicalAuditLog.intakeForm', many: true, access: { create: () => false, update: () => false } }),
    intakeLabel: virtual({
      field: graphql.field({
        type: graphql.String,
        resolve(item) {
          return `${item.title || 'Intake'} • ${item.status || 'not_sent'}`
        },
      }),
    }),
    ...trackingFields,
  },
})
