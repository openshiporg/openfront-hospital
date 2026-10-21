import { list, graphql } from '@keystone-6/core'
import { text, relationship, select, timestamp, json, virtual } from '@keystone-6/core/fields'

import { denyAccess, isSignedIn, permissions, rules } from '../access'
import { trackingFields } from './trackingFields'

export const Patient = list({
  access: {
    operation: {
      query: isSignedIn,
      create: permissions.canAccessAllClinicalData,
      update: permissions.canManagePatients,
      delete: denyAccess,
    },
    filter: {
      query: rules.canReadPatients,
      update: rules.canReadPatients,
      delete: rules.canReadPatients,
    },
  },
  graphql: { omit: { create: true, update: true, delete: true } },
  ui: {
    listView: {
      initialColumns: ['displayName', 'status', 'dateOfBirth', 'phone', 'email'],
    },
  },
  fields: {
    firstName: text({ access: { read: permissions.canReadPatientPhi, update: denyAccess }, validation: { isRequired: true } }),
    lastName: text({ access: { read: permissions.canReadPatientPhi, update: denyAccess }, validation: { isRequired: true } }),
    displayName: virtual({
      access: { read: permissions.canReadPatientPhi },
      field: graphql.field({
        type: graphql.String,
        resolve(item) {
          return `${(item.firstName as string) || ''} ${(item.lastName as string) || ''}`.trim()
        },
      }),
    }),
    status: select({
      type: 'string',
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Inactive', value: 'inactive' },
        { label: 'Archived', value: 'archived' },
      ],
      defaultValue: 'active',
      validation: { isRequired: true },
    }),
    dateOfBirth: timestamp({ label: 'Date of birth', access: { read: permissions.canReadPatientPhi, update: denyAccess } }),
    phone: text({ access: { read: permissions.canReadPatientPhi, update: denyAccess } }),
    email: text({ access: { read: permissions.canReadPatientPhi, update: denyAccess } }),
    preferredContactMethod: select({
      access: { read: permissions.canReadPatientPhi },
      type: 'string',
      options: [
        { label: 'Phone', value: 'phone' },
        { label: 'SMS', value: 'sms' },
        { label: 'Email', value: 'email' },
        { label: 'Legacy portal (read only)', value: 'portal' },
      ],
      defaultValue: 'phone',
    }),
    emergencyContactName: text({ access: { read: permissions.canReadPatientPhi } }),
    emergencyContactPhone: text({ access: { read: permissions.canReadPatientPhi } }),
    insuranceSummary: json({
      access: { read: permissions.canReadPatientPhi },
      ui: { description: 'Lightweight payer, member ID, and coverage notes. Avoid storing full clinical records here.' },
    }),
    notes: text({ access: { read: permissions.canReadPatientPhi }, ui: { displayMode: 'textarea' } }),
    facilities: relationship({
      ref: 'Facility.patients',
      many: true,
      access: { create: permissions.canAccessAllClinicalData, update: permissions.canAccessAllClinicalData },
    }),
    appointments: relationship({
      ref: 'Appointment.patient',
      many: true,
      access: { create: () => false, update: () => false },
    }),
    intakeForms: relationship({
      ref: 'IntakeForm.patient',
      many: true,
      access: { create: () => false, update: () => false },
    }),
    messages: relationship({
      ref: 'PatientMessage.patient',
      many: true,
      access: { create: () => false, update: () => false },
    }),
    identifiers: relationship({ ref: 'PatientIdentifier.patient', many: true, access: { create: () => false, update: () => false } }),
    registrations: relationship({ ref: 'PatientRegistration.patient', many: true, access: { create: () => false, update: () => false } }),
    consents: relationship({ ref: 'PatientConsent.patient', many: true, access: { create: () => false, update: () => false } }),
    clinicalAuditLogs: relationship({ ref: 'ClinicalAuditLog.patient', many: true, access: { create: () => false, update: () => false } }),
    portalAccess: relationship({
      ref: 'PatientPortalAccess.patient',
      many: true,
      access: { read: permissions.canAccessAllClinicalData, create: denyAccess, update: denyAccess },
    }),
    user: relationship({
      ref: 'User.patientProfile',
      access: { create: permissions.canAccessAllClinicalData, update: permissions.canAccessAllClinicalData },
    }),
    ...trackingFields,
  },
})
