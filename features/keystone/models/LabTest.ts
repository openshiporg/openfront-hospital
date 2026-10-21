import { list } from '@keystone-6/core'
import { checkbox, integer, json, relationship, select, text, timestamp } from '@keystone-6/core/fields'

import { isSignedIn, permissions } from '../access'
import { trackingFields } from './trackingFields'

export const LabTest = list({
  access: { operation: { query: isSignedIn, create: permissions.canAccessAllClinicalData, update: permissions.canAccessAllClinicalData, delete: permissions.canAccessAllClinicalData } },
  ui: { listView: { initialColumns: ['name', 'code', 'category'] } },
  fields: {
    name: text({ validation: { isRequired: true } }),
    code: text({ isIndexed: 'unique' }),
    category: text(),
    specimenType: text(),
    turnaroundHours: integer({ validation: { min: 0 } }),
    active: checkbox({ defaultValue: true }),
    metadata: json(),
    ...trackingFields,
  },
})
