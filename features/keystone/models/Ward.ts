import { list } from '@keystone-6/core'
import { checkbox, integer, json, relationship, select, text, timestamp } from '@keystone-6/core/fields'

import { isSignedIn, permissions, rules } from '../access'
import { trackingFields } from './trackingFields'

export const Ward = list({
  access: {
    operation: { query: isSignedIn, create: permissions.canAccessAllClinicalData, update: permissions.canAccessAllClinicalData, delete: permissions.canAccessAllClinicalData },
    filter: { query: rules.canReadWards, update: rules.canReadWards, delete: rules.canReadWards },
  },
  ui: { listView: { initialColumns: ['name', 'department', 'floor', 'status'] } },
  fields: {
    name: text({ validation: { isRequired: true } }),
    department: relationship({ ref: 'Department', access: { create: permissions.canAccessAllClinicalData, update: () => false } }),
    floor: text(),
    status: select({ type: 'string', options: [{ label: 'Open', value: 'open' }, { label: 'Closed', value: 'closed' }], defaultValue: 'open' }),
    capacity: integer({ defaultValue: 0, validation: { min: 0 } }),
    metadata: json(),
    ...trackingFields,
  },
})
