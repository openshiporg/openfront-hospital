import { list, graphql } from '@keystone-6/core'
import { text, relationship, select, integer, json, virtual } from '@keystone-6/core/fields'

import { isSignedIn, permissions } from '../access'
import { trackingFields } from './trackingFields'

export const AppointmentType = list({
  access: {
    operation: {
      query: isSignedIn,
      create: permissions.canAccessAllClinicalData,
      update: permissions.canAccessAllClinicalData,
      delete: permissions.canAccessAllClinicalData,
    },
  },
  ui: {
    listView: {
      initialColumns: ['name', 'status', 'durationMinutes', 'priceCents'],
    },
  },
  fields: {
    name: text({ validation: { isRequired: true } }),
    slug: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    description: text({ ui: { displayMode: 'textarea' } }),
    status: select({
      type: 'string',
      options: [
        { label: 'Bookable', value: 'bookable' },
        { label: 'Internal only', value: 'internal' },
        { label: 'Paused', value: 'paused' },
      ],
      defaultValue: 'bookable',
      validation: { isRequired: true },
    }),
    durationMinutes: integer({ validation: { isRequired: true, min: 5, max: 480 }, defaultValue: 30 }),
    bufferBeforeMinutes: integer({ defaultValue: 0, validation: { min: 0, max: 240 } }),
    bufferAfterMinutes: integer({ defaultValue: 0, validation: { min: 0, max: 240 } }),
    priceCents: integer({ defaultValue: 0, validation: { min: 0 }, ui: { description: 'Optional self-pay estimate in cents.' } }),
    formattedPrice: virtual({
      field: graphql.field({
        type: graphql.String,
        resolve(item) {
          const cents = Number(item.priceCents || 0)
          return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
        },
      }),
    }),
    intakeRequirements: json({ ui: { description: 'Checklist of intake forms or documents required before visit.' } }),
    providers: relationship({
      ref: 'Provider.appointmentTypes',
      many: true,
      access: { create: permissions.canAccessAllClinicalData, update: permissions.canAccessAllClinicalData },
    }),
    appointments: relationship({ ref: 'Appointment.appointmentType', many: true, access: { create: () => false, update: () => false } }),
    ...trackingFields,
  },
})
