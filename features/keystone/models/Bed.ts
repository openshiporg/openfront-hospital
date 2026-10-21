import { list } from '@keystone-6/core'
import { integer, json, relationship, select, text } from '@keystone-6/core/fields'

import { denyAccess, isSignedIn, permissions, rules } from '../access'
import { trackingFields } from './trackingFields'

export const Bed = list({
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
      // Bed placement defines a facility/room ownership chain. Lifecycle changes
      // run through controlled bed workflows rather than generic CRUD.
      create: permissions.canAccessAllClinicalData,
      update: denyAccess,
      delete: denyAccess,
    },
    filter: { query: rules.canReadBeds },
  },
  graphql: { omit: { update: true, delete: true } },
  ui: {
    hideDelete: true,
    listView: { initialColumns: ['bedNumber', 'room', 'status', 'currentPatient'] },
  },
  hooks: {
    validateInput: async ({ operation, resolvedData, addValidationError }) => {
      if (operation === 'create' && (!resolvedData.room?.connect?.id || !resolvedData.facility?.connect?.id)) {
        addValidationError('Room and facility are required for a bed')
      }
    },
  },
  fields: {
    bedNumber: text({ validation: { isRequired: true } }),
    transitionVersion: integer({ defaultValue: 1, validation: { isRequired: true, min: 1 }, access: { update: denyAccess } }),
    facility: relationship({
      ref: 'Facility',
      access: { create: permissions.canAccessAllClinicalData, update: denyAccess },
    }),
    room: relationship({
      ref: 'Room',
      access: { create: permissions.canAccessAllClinicalData, update: denyAccess },
    }),
    status: select({
      type: 'string',
      access: { create: permissions.canAccessAllClinicalData, update: denyAccess },
      options: [
        { label: 'Available', value: 'available' },
        { label: 'Occupied', value: 'occupied' },
        { label: 'Reserved', value: 'reserved' },
        { label: 'Cleaning', value: 'cleaning' },
        { label: 'Out of service', value: 'out_of_service' },
      ],
      defaultValue: 'available',
      validation: { isRequired: true },
    }),
    currentPatient: relationship({ ref: 'Patient', access: { create: denyAccess, update: denyAccess } }),
    metadata: json(),
    ...trackingFields,
  },
})
