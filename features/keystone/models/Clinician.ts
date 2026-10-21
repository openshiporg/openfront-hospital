import { list } from '@keystone-6/core'
import { checkbox, integer, json, relationship, select, text, timestamp } from '@keystone-6/core/fields'

import { isSignedIn, permissions, rules } from '../access'
import { trackingFields } from './trackingFields'

export const Clinician = list({
  access: {
    operation: { query: isSignedIn, create: permissions.canAccessAllClinicalData, update: permissions.canAccessAllClinicalData, delete: permissions.canAccessAllClinicalData },
    filter: { query: rules.canReadClinicians, update: rules.canReadClinicians, delete: rules.canReadClinicians },
  },
  ui: { listView: { initialColumns: ['displayName', 'clinicianType', 'department'] } },
  fields: {
    onboardingKey: text({
      db: { isNullable: true },
      isIndexed: 'unique',
      access: { read: permissions.canAccessAllClinicalData, create: () => false, update: () => false },
      ui: { description: 'Stable setup key; not a license or provider identifier.' },
    }),
    displayName: text({ validation: { isRequired: true } }),
    clinicianType: select({ type: 'string', options: [{ label: 'Physician', value: 'physician' }, { label: 'Nurse', value: 'nurse' }, { label: 'Therapist', value: 'therapist' }, { label: 'Technician', value: 'technician' }], defaultValue: 'physician' }),
    provider: relationship({ ref: 'Provider.clinicians', access: { create: permissions.canAccessAllClinicalData, update: () => false } }),
    department: relationship({ ref: 'Department', access: { create: permissions.canAccessAllClinicalData, update: () => false } }),
    licenseNumber: text({ access: { read: permissions.canReadProviderSensitive } }),
    phone: text({ access: { read: permissions.canReadProviderSensitive } }),
    email: text({ access: { read: permissions.canReadProviderSensitive } }),
    active: checkbox({ defaultValue: true }),
    images: relationship({
      ref: 'ClinicianImage.clinician',
      many: true,
      ui: {
        displayMode: 'cards',
        cardFields: ['image', 'imagePath', 'altText', 'order'],
        inlineCreate: { fields: ['image', 'imagePath', 'altText', 'order'] },
        inlineEdit: { fields: ['image', 'imagePath', 'altText', 'order'] },
        inlineConnect: true,
        removeMode: 'disconnect',
      },
    }),
    metadata: json({ access: { read: permissions.canReadProviderSensitive } }),
    ...trackingFields,
  },
})
