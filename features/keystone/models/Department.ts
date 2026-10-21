import { departmentStatusOptions } from '../../lib/departmentStatus'
import { list } from '@keystone-6/core'
import { checkbox, integer, json, relationship, select, text, timestamp } from '@keystone-6/core/fields'

import { isSignedIn, permissions, rules } from '../access'
import { trackingFields } from './trackingFields'

export const Department = list({
  access: {
    operation: { query: isSignedIn, create: permissions.canAccessAllClinicalData, update: permissions.canAccessAllClinicalData, delete: permissions.canAccessAllClinicalData },
    filter: { query: rules.canReadDepartments, update: rules.canReadDepartments, delete: rules.canReadDepartments },
  },
  ui: { listView: { initialColumns: ['name', 'code', 'status'] } },
  fields: {
    name: text({ validation: { isRequired: true } }),
    code: text({ isIndexed: 'unique' }),
    status: select({ type: 'string', options: departmentStatusOptions, defaultValue: 'active' }),
    description: text({ ui: { displayMode: 'textarea' } }),
    phone: text(),
    email: text(),
    facilities: relationship({
      ref: 'Facility.departments',
      many: true,
      access: { create: permissions.canAccessAllClinicalData, update: permissions.canAccessAllClinicalData },
    }),
    images: relationship({
      ref: 'DepartmentImage.department',
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
