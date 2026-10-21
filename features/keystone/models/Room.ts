import { list } from '@keystone-6/core'
import { checkbox, integer, json, relationship, select, text, timestamp } from '@keystone-6/core/fields'

import { isSignedIn, permissions, rules } from '../access'
import { trackingFields } from './trackingFields'

export const Room = list({
  access: {
    operation: { query: isSignedIn, create: permissions.canAccessAllClinicalData, update: permissions.canAccessAllClinicalData, delete: permissions.canAccessAllClinicalData },
    filter: { query: rules.canReadRooms, update: rules.canReadRooms, delete: rules.canReadRooms },
  },
  ui: { listView: { initialColumns: ['roomNumber', 'ward', 'roomType', 'status'] } },
  fields: {
    roomNumber: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    ward: relationship({ ref: 'Ward', access: { create: permissions.canAccessAllClinicalData, update: () => false } }),
    roomType: select({ type: 'string', options: [{ label: 'Private', value: 'private' }, { label: 'Semi Private', value: 'semi_private' }, { label: 'ICU', value: 'icu' }, { label: 'Procedure', value: 'procedure' }], defaultValue: 'private' }),
    status: select({ type: 'string', options: [{ label: 'Available', value: 'available' }, { label: 'Occupied', value: 'occupied' }, { label: 'Cleaning', value: 'cleaning' }, { label: 'Maintenance', value: 'maintenance' }], defaultValue: 'available' }),
    metadata: json(),
    ...trackingFields,
  },
})
