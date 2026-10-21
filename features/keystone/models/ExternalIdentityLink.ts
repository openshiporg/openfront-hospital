import { list } from '@keystone-6/core'
import { relationship, select, text, timestamp } from '@keystone-6/core/fields'
import { denyAccess, isSignedIn, permissions, rules } from '../access'

export const ExternalIdentityLink = list({
  db: { extendPrismaSchema(schema) { return schema
    .replace(/facility\s+Facility\?/, 'facility Facility').replace(/facilityId\s+String\?/, 'facilityId String')
    .replace(/\n}\s*$/, '\n\n  @@unique([facilityId, system, resourceType, externalId], map: "ExternalIdentityLink_external_key")\n}') } },
  access: { operation: { query: isSignedIn, create: denyAccess, update: denyAccess, delete: denyAccess }, filter: { query: rules.canReadExternalIdentityLinks } },
  graphql: { omit: { create: true, update: true, delete: true } },
  ui: { hideCreate: true, hideDelete: true, listView: { initialColumns: ['system', 'resourceType', 'externalId', 'localType', 'status'] } },
  fields: {
    linkNumber: text({ isIndexed: 'unique', validation: { isRequired: true } }), facility: relationship({ ref: 'Facility' }),
    system: text({ validation: { isRequired: true } }), resourceType: text({ validation: { isRequired: true } }), externalId: text({ access: { read: permissions.canManageIntegrations }, validation: { isRequired: true } }),
    localType: text({ validation: { isRequired: true } }), localId: text({ validation: { isRequired: true }, isIndexed: true }),
    status: select({ type: 'string', options: [{ label: 'Active', value: 'active' }, { label: 'Superseded', value: 'superseded' }], defaultValue: 'active', validation: { isRequired: true } }),
    operationKeyHash: text({ isIndexed: 'unique', access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }), requestHash: text({ access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }), actorReference: text({ access: { read: permissions.canReadAuditMetadata }, validation: { isRequired: true } }), createdAt: timestamp({ defaultValue: { kind: 'now' }, validation: { isRequired: true } }),
  },
})
