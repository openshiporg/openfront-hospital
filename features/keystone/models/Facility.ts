import { list } from '@keystone-6/core'
import { json, relationship, select, text } from '@keystone-6/core/fields'

import { isSignedIn, permissions, rules } from '../access'
import { assertIanaTimeZone } from '../mutations/scheduling/facilityTime'
import { trackingFields } from './trackingFields'

export const Facility = list({
  access: {
    operation: {
      query: isSignedIn,
      // Facilities define tenant boundaries. Scoped managers use reviewed
      // workflows inside an existing facility; only the global administrator
      // may create, mutate, or remove the boundary itself.
      create: permissions.canAccessAllClinicalData,
      update: permissions.canAccessAllClinicalData,
      delete: permissions.canAccessAllClinicalData,
    },
    filter: {
      query: rules.canReadFacilities,
      update: rules.canReadFacilities,
      delete: rules.canReadFacilities,
    },
  },
  hooks: {
    resolveInput: async ({ resolvedData }) => ({
      ...resolvedData,
      ...(resolvedData.timeZone !== undefined ? { timeZone: assertIanaTimeZone(resolvedData.timeZone) } : {}),
    }),
  },
  ui: { listView: { initialColumns: ['name', 'facilityType', 'status', 'timeZone', 'city'] } },
  fields: {
    name: text({ validation: { isRequired: true } }),
    slug: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    facilityType: select({
      type: 'string',
      options: [
        { label: 'Clinic', value: 'clinic' },
        { label: 'Hospital', value: 'hospital' },
        { label: 'Telehealth', value: 'telehealth' },
      ],
      defaultValue: 'clinic',
      validation: { isRequired: true },
    }),
    status: select({
      type: 'string',
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Inactive', value: 'inactive' },
      ],
      defaultValue: 'active',
      validation: { isRequired: true },
    }),
    addressLine1: text(),
    addressLine2: text(),
    city: text(),
    region: text(),
    postalCode: text(),
    phone: text(),
    timeZone: text({
      defaultValue: 'UTC',
      validation: { isRequired: true },
      ui: { description: 'IANA time zone used for local scheduling dates and displayed appointment times.' },
    }),
    staff: relationship({
      ref: 'User.facilities',
      many: true,
      access: { create: permissions.canAccessAllClinicalData, update: permissions.canAccessAllClinicalData },
    }),
    providers: relationship({
      ref: 'Provider.facilities',
      many: true,
      access: { create: permissions.canAccessAllClinicalData, update: permissions.canAccessAllClinicalData },
    }),
    patients: relationship({
      ref: 'Patient.facilities',
      many: true,
      access: { create: permissions.canAccessAllClinicalData, update: permissions.canAccessAllClinicalData },
    }),
    patientIdentifiers: relationship({
      ref: 'PatientIdentifier.facility',
      many: true,
      access: { create: () => false, update: () => false },
    }),
    patientRegistrations: relationship({
      ref: 'PatientRegistration.facility',
      many: true,
      access: { create: () => false, update: () => false },
    }),
    appointments: relationship({
      ref: 'Appointment.facility',
      many: true,
      access: { create: () => false, update: () => false },
    }),
    encounters: relationship({
      ref: 'Encounter.facility',
      many: true,
      access: { create: permissions.canAccessAllClinicalData, update: permissions.canAccessAllClinicalData },
    }),
    departments: relationship({
      ref: 'Department.facilities',
      many: true,
      access: { create: permissions.canAccessAllClinicalData, update: permissions.canAccessAllClinicalData },
    }),
    images: relationship({
      ref: 'FacilityImage.facility',
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
    metadata: json({ access: { read: permissions.canReadFacilitySensitive } }),
    ...trackingFields,
  },
})
