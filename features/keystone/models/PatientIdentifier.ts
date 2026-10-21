import { list } from '@keystone-6/core'
import { relationship, select, text, timestamp } from '@keystone-6/core/fields'

import { denyAccess, isSignedIn, permissions, rules } from '../access'

export const PatientIdentifier = list({
  db: {
    extendPrismaSchema(schema) {
      return schema
        .replace(/facility\s+Facility\?/, 'facility Facility')
        .replace(/facilityId\s+String\?/, 'facilityId String')
        .replace(/patient\s+Patient\?/, 'patient Patient')
        .replace(/patientId\s+String\?/, 'patientId String')
        .replace(/createdBy\s+User\?/, 'createdBy User')
        .replace(/createdById\s+String\?/, 'createdById String')
        .replace(
          /\n}\s*$/,
          '\n\n  @@unique([facilityId, normalizedValue], map: "PatientIdentifier_facility_value_key")\n}',
        )
    },
  },
  access: {
    operation: { query: isSignedIn, create: denyAccess, update: denyAccess, delete: denyAccess },
    filter: { query: rules.canReadPatientIdentifiers },
  },
  graphql: { omit: { create: true, update: true, delete: true } },
  ui: {
    hideCreate: true,
    hideDelete: true,
    isHidden: ({ session }) => !session?.data.role?.canManagePatients,
    listView: { initialColumns: ['identifierType', 'maskedValue', 'facility', 'patient', 'status', 'createdAt'] },
  },
  fields: {
    identifierType: select({
      type: 'string',
      options: [{ label: 'Medical record number', value: 'mrn' }],
      defaultValue: 'mrn',
      validation: { isRequired: true },
    }),
    normalizedValue: text({
      access: { read: permissions.canReadPatientPhi },
      validation: { isRequired: true },
      ui: { description: 'Facility-scoped normalized identifier. Writes are available only through registration workflows.' },
    }),
    maskedValue: text({ validation: { isRequired: true } }),
    status: select({
      type: 'string',
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Superseded', value: 'superseded' },
      ],
      defaultValue: 'active',
      validation: { isRequired: true },
    }),
    facility: relationship({ ref: 'Facility.patientIdentifiers' }),
    patient: relationship({ ref: 'Patient.identifiers' }),
    createdBy: relationship({ ref: 'User' }),
    createdAt: timestamp({ validation: { isRequired: true }, defaultValue: { kind: 'now' } }),
  },
})
