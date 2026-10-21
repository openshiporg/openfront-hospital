import { list, graphql } from '@keystone-6/core'
import { text, relationship, select, timestamp, integer, json, virtual } from '@keystone-6/core/fields'

import { denyAccess, isSignedIn, permissions, rules } from '../access'
import { trackingFields } from './trackingFields'

export const Appointment = list({
  db: {
    extendPrismaSchema(schema) {
      return schema
        .replace(/facility\s+Facility\?/, 'facility Facility')
        .replace(/facilityId\s+String\?/, 'facilityId String')
        .replace(/patient\s+Patient\?/, 'patient Patient')
        .replace(/patientId\s+String\?/, 'patientId String')
        .replace(/provider\s+Provider\?/, 'provider Provider')
        .replace(/providerId\s+String\?/, 'providerId String')
        .replace(/appointmentType\s+AppointmentType\?/, 'appointmentType AppointmentType')
        .replace(/appointmentTypeId\s+String\?/, 'appointmentTypeId String')
    },
  },
  access: {
    operation: {
      query: isSignedIn,
      create: permissions.canAccessAllClinicalData,
      update: permissions.canManageAppointments,
      delete: denyAccess,
    },
    filter: {
      query: rules.canReadAppointments,
      update: rules.canReadAppointments,
    },
  },
  graphql: {
    omit: { create: true, update: true, delete: true },
  },
  ui: {
    listView: {
      initialColumns: ['appointmentNumber', 'status', 'patient', 'provider', 'startsAt'],
    },
  },
  fields: {
    appointmentNumber: text({
      isIndexed: 'unique',
      access: { create: permissions.canAccessAllClinicalData, update: denyAccess },
      validation: { isRequired: true },
    }),
    bookingLockKey: text({
      isIndexed: 'unique',
      access: { read: denyAccess, create: permissions.canManageOnboarding, update: denyAccess },
      ui: { description: 'Provider + start-time lock used to prevent duplicate active bookings for the same slot. Cleared when cancelled.' },
    }),
    transitionVersion: integer({
      defaultValue: 1,
      validation: { isRequired: true, min: 1 },
      access: { create: permissions.canAccessAllClinicalData, update: denyAccess },
    }),
    status: select({
      type: 'string',
      access: { create: permissions.canManageOnboarding, update: denyAccess },
      options: [
        { label: 'Requested', value: 'requested' },
        { label: 'Confirmed', value: 'confirmed' },
        { label: 'Checked in', value: 'checked_in' },
        { label: 'In visit', value: 'in_visit' },
        { label: 'Completed', value: 'completed' },
        { label: 'Cancelled', value: 'cancelled' },
        { label: 'No show', value: 'no_show' },
      ],
      defaultValue: 'requested',
      validation: { isRequired: true },
    }),
    patient: relationship({
      ref: 'Patient.appointments',
      access: { create: permissions.canAccessAllClinicalData, update: denyAccess },
    }),
    provider: relationship({
      ref: 'Provider.appointments',
      access: { create: permissions.canAccessAllClinicalData, update: denyAccess },
    }),
    facility: relationship({
      ref: 'Facility.appointments',
      access: { create: permissions.canAccessAllClinicalData, update: denyAccess },
    }),
    appointmentType: relationship({
      ref: 'AppointmentType.appointments',
      access: { create: permissions.canAccessAllClinicalData, update: denyAccess },
    }),
    startsAt: timestamp({
      access: { create: permissions.canAccessAllClinicalData, update: denyAccess },
      validation: { isRequired: true },
    }),
    endsAt: timestamp({
      access: { create: permissions.canAccessAllClinicalData, update: denyAccess },
      validation: { isRequired: true },
    }),
    locationName: text({ access: { create: permissions.canAccessAllClinicalData, update: denyAccess } }),
    reasonForVisit: text({ access: { read: permissions.canReadAppointmentPhi }, ui: { displayMode: 'textarea' } }),
    source: select({
      type: 'string',
      access: { create: permissions.canAccessAllClinicalData, update: denyAccess },
      options: [
        { label: 'Legacy patient portal (read only)', value: 'patient_portal' },
        { label: 'Front desk', value: 'front_desk' },
        { label: 'Phone', value: 'phone' },
        { label: 'Referral', value: 'referral' },
      ],
      defaultValue: 'front_desk',
    }),
    estimatedFeeCents: integer({ access: { read: permissions.canReadAppointmentPhi }, defaultValue: 0, validation: { min: 0 } }),
    checkInAt: timestamp({ access: { create: permissions.canManageOnboarding, update: denyAccess } }),
    completedAt: timestamp({ access: { create: permissions.canManageOnboarding, update: denyAccess } }),
    cancellationReason: text({
      access: { read: permissions.canReadAppointmentPhi, create: permissions.canManageOnboarding, update: denyAccess },
      ui: { displayMode: 'textarea' },
    }),
    intakeForms: relationship({
      ref: 'IntakeForm.appointment',
      many: true,
      access: { create: permissions.canAccessAllClinicalData, update: permissions.canAccessAllClinicalData },
    }),
    messages: relationship({
      ref: 'PatientMessage.appointment',
      many: true,
      access: { create: permissions.canAccessAllClinicalData, update: permissions.canAccessAllClinicalData },
    }),
    careQueueTickets: relationship({
      ref: 'CareQueueTicket.appointment',
      many: true,
      access: { read: ({ session }) => Boolean(session?.data.role?.canManageAppointments || session?.data.role?.canManagePatients || session?.data.role?.canAccessAllClinicalData) },
    }),
    consents: relationship({ ref: 'PatientConsent.appointment', many: true, access: { create: () => false, update: () => false } }),
    clinicalAuditLogs: relationship({ ref: 'ClinicalAuditLog.appointment', many: true, access: { create: () => false, update: () => false } }),
    operationalNotes: text({
      access: { read: permissions.canReadAppointmentPhi, create: permissions.canAccessAllClinicalData, update: denyAccess },
      ui: { displayMode: 'textarea' },
    }),
    metadata: json({ access: { read: permissions.canReadAppointmentPhi } }),
    appointmentSummary: virtual({
      field: graphql.field({
        type: graphql.String,
        resolve(item) {
          return `${item.appointmentNumber || 'Appointment'} • ${item.status || 'requested'}`
        },
      }),
    }),
    ...trackingFields,
  },
})
