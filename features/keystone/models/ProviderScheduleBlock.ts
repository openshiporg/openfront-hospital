import { list, graphql } from '@keystone-6/core'
import { text, relationship, select, timestamp, integer, virtual } from '@keystone-6/core/fields'

import { denyAccess, isSignedIn, permissions, rules } from '../access'
import { trackingFields } from './trackingFields'

export const ProviderScheduleBlock = list({
  db: {
    extendPrismaSchema(schema) {
      return schema
        .replace(/facility\s+Facility\?/, 'facility Facility')
        .replace(/facilityId\s+String\?/, 'facilityId String')
        .replace(
          /\n}\s*$/,
          '\n\n  @@index([providerId, startsAt, endsAt], map: "ProviderScheduleBlock_provider_window_idx")\n}',
        )
    },
  },
  access: {
    operation: {
      query: isSignedIn,
      create: permissions.canManageScheduling,
      update: permissions.canManageScheduling,
      delete: permissions.canManageScheduling,
    },
    filter: {
      query: rules.canReadProviderScheduleBlocks,
      update: rules.canReadProviderScheduleBlocks,
      delete: rules.canReadProviderScheduleBlocks,
    },
  },
  hooks: {
    validate: async ({ operation, inputData, resolvedData, item, context, addValidationError }) => {
      if (operation === 'create') {
        const providerId = (inputData.provider as { connect?: { id?: string } } | undefined)?.connect?.id
        const facilityId = (inputData.facility as { connect?: { id?: string } } | undefined)?.connect?.id
        if (!providerId || !facilityId) {
          addValidationError('Provider and facility are required for a schedule block')
        } else {
          const [provider, facility] = await Promise.all([
            context.query.Provider.findOne({ where: { id: providerId }, query: 'id facilities { id }' }),
            context.query.Facility.findOne({ where: { id: facilityId }, query: 'id status' }),
          ]) as any[]
          if (!provider || !facility || facility.status !== 'active' || !provider.facilities?.some((item: { id: string }) => item.id === facilityId)) {
            addValidationError('Provider and facility are not an accessible active scheduling pair')
          }
        }
      }

      const startsAt = resolvedData?.startsAt ?? item?.startsAt
      const endsAt = resolvedData?.endsAt ?? item?.endsAt
      if (!startsAt || !endsAt || new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
        addValidationError('Schedule block must end after it starts')
      }

      const maxAppointments = resolvedData?.maxAppointments ?? item?.maxAppointments ?? 1
      if (maxAppointments !== 1) {
        addValidationError('Provider schedule blocks currently support exactly one appointment at a time')
      }
    },
  },
  ui: {
    listView: {
      initialColumns: ['scheduleLabel', 'provider', 'blockType', 'startsAt', 'endsAt'],
    },
  },
  fields: {
    provider: relationship({
      ref: 'Provider.scheduleBlocks',
      access: { create: permissions.canManageScheduling, update: denyAccess },
    }),
    facility: relationship({ ref: 'Facility', access: { create: permissions.canManageScheduling, update: denyAccess } }),
    onboardingKey: text({ db: { isNullable: true }, isIndexed: 'unique', ui: { description: 'Stable onboarding identifier used to make seeded schedule blocks rerunnable.' } }),
    blockType: select({
      type: 'string',
      options: [
        { label: 'Available', value: 'available' },
        { label: 'Unavailable', value: 'unavailable' },
        { label: 'On call', value: 'on_call' },
        { label: 'Admin time', value: 'admin_time' },
      ],
      defaultValue: 'available',
      validation: { isRequired: true },
    }),
    startsAt: timestamp({ validation: { isRequired: true } }),
    endsAt: timestamp({ validation: { isRequired: true } }),
    recurrenceRule: text({ ui: { description: 'Optional RRULE-style recurrence for future slot generation.' } }),
    maxAppointments: integer({ defaultValue: 1, validation: { isRequired: true, min: 1, max: 1 } }),
    locationName: text(),
    notes: text({ access: { read: permissions.canReadProviderSensitive }, ui: { displayMode: 'textarea' } }),
    scheduleLabel: virtual({
      field: graphql.field({
        type: graphql.String,
        resolve(item) {
          return `${item.blockType || 'schedule'} • ${item.startsAt || ''}`
        },
      }),
    }),
    ...trackingFields,
  },
})
