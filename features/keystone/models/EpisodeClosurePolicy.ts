import { list } from '@keystone-6/core'
import { integer, json, relationship, text, timestamp } from '@keystone-6/core/fields'
import { denyAccess, permissions, rules } from '../access'
import { trackingFields } from './trackingFields'

export const EpisodeClosurePolicy = list({
  db: { extendPrismaSchema: schema => schema.replace(/facility\s+Facility\?/, 'facility Facility').replace(/facilityId\s+String\?/, 'facilityId String') },
  access: {
    operation: { query: permissions.canReadPatientPhi, create: denyAccess, update: denyAccess, delete: denyAccess },
    filter: { query: args => {
      const scope = rules.canReadFacilities(args)
      return typeof scope === 'boolean' ? scope : { facility: scope }
    } },
  },
  graphql: { omit: { create: true, update: true, delete: true } },
  ui: { hideCreate: true, hideDelete: true, listView: { initialColumns: ['facility', 'revision', 'effectiveAt', 'reviewReference'] } },
  hooks: { validateInput: ({ operation, addValidationError }) => {
    if (operation === 'update') addValidationError('Reviewed policy revisions are immutable; create a superseding revision')
  }, validateDelete: ({ addValidationError }) => addValidationError('Reviewed policy history cannot be deleted') },
  fields: {
    facility: relationship({ ref: 'Facility' }),
    revision: integer({ validation: { isRequired: true, min: 1 } }),
    revisionKey: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    definition: json(),
    reviewReference: text({ validation: { isRequired: true } }),
    reviewedByReference: text({ validation: { isRequired: true } }),
    reviewedRoleReference: text({ validation: { isRequired: true } }),
    operationKeyHash: text({ isIndexed: 'unique', access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
    requestHash: text({ access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
    originalCommand: json({ access: { read: permissions.canAccessAllClinicalData } }),
    effectiveAt: timestamp({ validation: { isRequired: true } }),
    ...trackingFields,
  },
})
