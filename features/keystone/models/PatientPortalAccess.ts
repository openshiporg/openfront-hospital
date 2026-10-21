import { list } from '@keystone-6/core'
import { text, relationship, select, timestamp } from '@keystone-6/core/fields'

import { denyAccess, permissions } from '../access'
import { trackingFields } from './trackingFields'

export const PatientPortalAccess = list({
  db: {
    extendPrismaSchema(schema) {
      return schema
        .replace(/facility\s+Facility\?/, 'facility Facility')
        .replace(/facilityId\s+String\?/, 'facilityId String')
        .replace(/patient\s+Patient\?/, 'patient Patient')
        .replace(/patientId\s+String\?/, 'patientId String')
        .replace(/\n}\s*$/, '\n\n  @@unique([facilityId, patientId], map: "PatientPortalAccess_facility_patient_key")\n}')
    },
  },
  access: {
    operation: {
      query: permissions.canAccessAllClinicalData,
      create: denyAccess,
      update: denyAccess,
      delete: denyAccess,
    },

  },
  graphql: { omit: { create: true, update: true, delete: true } },
  ui: {
    isHidden: true,
    listView: {
      initialColumns: ['patient', 'status', 'inviteEmail', 'lastLoginAt'],
    },
  },
  fields: {
    operationKeyHash: text({ isIndexed: 'unique', access: { read: denyAccess }, validation: { isRequired: true } }),
    requestHash: text({ access: { read: denyAccess }, validation: { isRequired: true } }),
    facility: relationship({
      ref: 'Facility',
      access: { create: permissions.canAccessAllClinicalData, update: denyAccess },
    }),
    patient: relationship({
      ref: 'Patient.portalAccess',
      access: { create: permissions.canAccessAllClinicalData, update: denyAccess },
    }),
    user: relationship({
      ref: 'User.patientPortalAccess',
      access: { create: permissions.canAccessAllClinicalData, update: denyAccess },
    }),
    status: select({
      type: 'string',
      access: { create: permissions.canManageOnboarding, update: denyAccess },
      options: [
        { label: 'Invited', value: 'invited' },
        { label: 'Active', value: 'active' },
        { label: 'Suspended', value: 'suspended' },
        { label: 'Closed', value: 'closed' },
      ],
      defaultValue: 'invited',
      validation: { isRequired: true },
    }),
    inviteEmail: text({ access: { read: permissions.canReadPortalSensitive } }),
    inviteTokenDigest: text({
      isFilterable: false,
      isOrderable: false,
      access: { read: denyAccess, create: permissions.canManageOnboarding, update: denyAccess },
    }),
    invitedAt: timestamp({ access: { create: permissions.canManageOnboarding, update: denyAccess } }),
    inviteExpiresAt: timestamp({ access: { read: permissions.canReadPortalSensitive, create: permissions.canManageOnboarding, update: denyAccess } }),
    inviteUsedAt: timestamp({ access: { read: permissions.canReadPortalSensitive, create: permissions.canManageOnboarding, update: denyAccess } }),
    inviteRevokedAt: timestamp({ access: { read: permissions.canReadPortalSensitive, create: permissions.canManageOnboarding, update: denyAccess } }),
    acceptedAt: timestamp({ access: { create: permissions.canManageOnboarding, update: denyAccess } }),
    lastLoginAt: timestamp({ access: { create: permissions.canManageOnboarding, update: denyAccess } }),
    ...trackingFields,
  },
})
