import { list } from '@keystone-6/core'
import { image, integer, json, relationship, text } from '@keystone-6/core/fields'

import { isSignedIn, permissions, rules } from '../access'
import { trackingFields } from './trackingFields'

export const FacilityImage = list({
  access: {
    operation: {
      query: isSignedIn,
      create: permissions.canAccessAllClinicalData,
      update: permissions.canAccessAllClinicalData,
      delete: permissions.canAccessAllClinicalData,
    },
    filter: {
      query: rules.canReadFacilityImages,
      update: rules.canReadFacilityImages,
      delete: rules.canReadFacilityImages,
    },
  },
  ui: { listView: { initialColumns: ['imagePath', 'altText', 'facility', 'order'] } },
  fields: {
    image: image({ storage: 'my_images' }),
    imagePath: text(),
    altText: text(),
    order: integer({ defaultValue: 0 }),
    facility: relationship({ ref: 'Facility.images', access: { create: permissions.canAccessAllClinicalData, update: () => false } }),
    metadata: json(),
    ...trackingFields,
  },
})
