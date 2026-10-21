import { list, graphql } from '@keystone-6/core'
import { text, relationship, select, json, virtual } from '@keystone-6/core/fields'

import { isSignedIn, permissions, rules } from '../access'
import { trackingFields } from './trackingFields'

export const Provider = list({
  access: {
    operation: {
      query: isSignedIn,
      create: permissions.canAccessAllClinicalData,
      update: permissions.canAccessAllClinicalData,
      delete: permissions.canAccessAllClinicalData,
    },
    filter: {
      query: rules.canReadProviders,
      update: rules.canReadProviders,
      delete: rules.canReadProviders,
    },
  },
  ui: {
    listView: {
      initialColumns: ['displayName', 'status', 'specialty', 'locationName'],
    },
  },
  fields: {
    onboardingKey: text({
      db: { isNullable: true },
      isIndexed: 'unique',
      access: { read: permissions.canAccessAllClinicalData, create: () => false, update: () => false },
      ui: { description: 'Stable setup key. It is never used as a clinical credential or public identifier.' },
    }),
    firstName: text({ validation: { isRequired: true } }),
    lastName: text({ validation: { isRequired: true } }),
    displayName: virtual({
      field: graphql.field({
        type: graphql.String,
        resolve(item) {
          const credentials = item.credentials ? `, ${item.credentials}` : ''
          return `${(item.firstName as string) || ''} ${(item.lastName as string) || ''}${credentials}`.trim()
        },
      }),
    }),
    credentials: text({ ui: { description: 'Examples: MD, DO, NP, PA, LCSW' } }),
    specialty: text(),
    status: select({
      type: 'string',
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Unavailable', value: 'unavailable' },
        { label: 'Inactive', value: 'inactive' },
      ],
      defaultValue: 'active',
      validation: { isRequired: true },
    }),
    bio: text({ ui: { displayMode: 'textarea' } }),
    locationName: text({ label: 'Primary location' }),
    facilities: relationship({
      ref: 'Facility.providers',
      many: true,
      access: { create: permissions.canAccessAllClinicalData, update: permissions.canAccessAllClinicalData },
    }),
    appointmentTypes: relationship({ ref: 'AppointmentType.providers', many: true }),
    scheduleBlocks: relationship({
      ref: 'ProviderScheduleBlock.provider',
      many: true,
      access: { create: () => false, update: () => false },
    }),
    appointments: relationship({
      ref: 'Appointment.provider',
      many: true,
      access: { create: () => false, update: () => false },
    }),
    clinicians: relationship({
      ref: 'Clinician.provider',
      many: true,
      access: { create: () => false, update: () => false },
    }),
    user: relationship({
      ref: 'User.providerProfile',
      access: { create: permissions.canAccessAllClinicalData, update: permissions.canAccessAllClinicalData },
    }),
    metadata: json({ access: { read: permissions.canReadProviderSensitive } }),
    ...trackingFields,
  },
})
