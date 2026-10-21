import { list } from '@keystone-6/core'
import { image, integer, json, relationship, text } from '@keystone-6/core/fields'

import { isSignedIn, permissions, rules } from '../access'
import { trackingFields } from './trackingFields'

export const DepartmentImage = list({
  access: {
    operation: {
      query: isSignedIn,
      create: permissions.canAccessAllClinicalData,
      update: permissions.canAccessAllClinicalData,
      delete: permissions.canAccessAllClinicalData,
    },
    filter: {
      query: rules.canReadDepartmentImages,
      update: rules.canReadDepartmentImages,
      delete: rules.canReadDepartmentImages,
    },
  },
  ui: { listView: { initialColumns: ['imagePath', 'altText', 'department', 'order'] } },
  fields: {
    image: image({ storage: 'my_images' }),
    imagePath: text(),
    altText: text(),
    order: integer({ defaultValue: 0 }),
    department: relationship({ ref: 'Department.images', access: { create: permissions.canAccessAllClinicalData, update: () => false } }),
    metadata: json(),
    ...trackingFields,
  },
})
