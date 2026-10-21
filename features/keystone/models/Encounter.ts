import { list } from '@keystone-6/core'
import { integer, json, relationship, select, text, timestamp } from '@keystone-6/core/fields'

import { denyAccess, isSignedIn, permissions, rules } from '../access'
import { trackingFields } from './trackingFields'

export const Encounter = list({
  db: {
    extendPrismaSchema(schema) {
      return schema
        .replace(/patient\s+Patient\?/, 'patient Patient')
        .replace(/patientId\s+String\?/, 'patientId String')
        .replace(/provider\s+Provider\?/, 'provider Provider')
        .replace(/providerId\s+String\?/, 'providerId String')
        .replace(/facility\s+Facility\?/, 'facility Facility')
        .replace(/facilityId\s+String\?/, 'facilityId String')
        .replace(/appointmentId\s+String\?(\s+@map)/, 'appointmentId String? @unique$1')
    },
  },
  access: {
    operation: {
      query: isSignedIn,
      create: permissions.canAccessAllClinicalData,
      update: denyAccess,
      delete: denyAccess,
    },
    filter: { query: rules.canReadEncounters },
  },
  graphql: { omit: { create: true, update: true, delete: true } },
  ui: {
    hideDelete: true,
    listView: { initialColumns: ['encounterNumber', 'status', 'patient', 'provider', 'facility'] },
  },
  fields: {
    encounterNumber: text({
      isIndexed: 'unique',
      access: { create: permissions.canAccessAllClinicalData, update: denyAccess },
      validation: { isRequired: true },
    }),
    status: select({
      type: 'string',
      access: { create: permissions.canAccessAllClinicalData, update: denyAccess },
      options: [
        { label: 'Open', value: 'open' },
        { label: 'In progress', value: 'in_progress' },
        { label: 'Closed', value: 'closed' },
        { label: 'Cancelled', value: 'cancelled' },
      ],
      defaultValue: 'open',
      validation: { isRequired: true },
    }),
    transitionVersion: integer({ defaultValue: 1, validation: { isRequired: true, min: 1 } }),
    operationKeyHash: text({
      isIndexed: 'unique',
      access: { read: permissions.canAccessAllClinicalData },
      validation: { isRequired: true },
    }),
    requestHash: text({
      access: { read: permissions.canAccessAllClinicalData },
      validation: { isRequired: true },
    }),
    actorReference: text({
      access: { read: permissions.canReadAuditMetadata },
      validation: { isRequired: true },
    }),
    patient: relationship({ ref: 'Patient', access: { create: permissions.canAccessAllClinicalData, update: denyAccess } }),
    provider: relationship({ ref: 'Provider', access: { create: permissions.canAccessAllClinicalData, update: denyAccess } }),
    appointment: relationship({ ref: 'Appointment', access: { create: permissions.canAccessAllClinicalData, update: denyAccess } }),
    facility: relationship({ ref: 'Facility.encounters', access: { create: permissions.canAccessAllClinicalData, update: denyAccess } }),
    department: relationship({ ref: 'Department', access: { create: permissions.canAccessAllClinicalData, update: denyAccess } }),
    chiefComplaint: text({
      access: { read: permissions.canReadClinicalPhi, create: permissions.canAccessAllClinicalData, update: denyAccess },
      ui: { displayMode: 'textarea' },
    }),
    diagnosisSummary: text({
      access: { read: permissions.canReadClinicalPhi, create: permissions.canAccessAllClinicalData, update: denyAccess },
      ui: { displayMode: 'textarea' },
    }),
    clinicalAuditLogs: relationship({
      ref: 'ClinicalAuditLog.encounter',
      many: true,
      access: { create: () => false, update: () => false },
    }),
    startedAt: timestamp({ access: { create: permissions.canAccessAllClinicalData, update: denyAccess } }),
    endedAt: timestamp({ access: { create: permissions.canAccessAllClinicalData, update: denyAccess } }),
    metadata: json({ access: { read: permissions.canReadClinicalPhi, update: denyAccess } }),
    ...trackingFields,
  },
})
