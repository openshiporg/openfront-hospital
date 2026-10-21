import { list } from '@keystone-6/core'
import { integer, relationship, select, text } from '@keystone-6/core/fields'
import { denyAccess, isSignedIn, permissions, rules } from '../access'
import { trackingFields } from './trackingFields'

export const CommunicationTemplate = list({
  db: { extendPrismaSchema(schema) { return schema
    .replace(/facility\s+Facility\?/, 'facility Facility').replace(/facilityId\s+String\?/, 'facilityId String')
    .replace(/\n}\s*$/, '\n\n  @@unique([facilityId, templateKey], map: "CommunicationTemplate_facility_key")\n}') } },
  access: { operation: { query: isSignedIn, create: denyAccess, update: denyAccess, delete: denyAccess }, filter: { query: rules.canReadCommunicationTemplates } },
  graphql: { omit: { create: true, update: true, delete: true } },
  ui: { hideCreate: true, hideDelete: true, listView: { initialColumns: ['templateKey', 'name', 'channel', 'status', 'facility'] } },
  fields: {
    templateKey: text({ validation: { isRequired: true } }), name: text({ validation: { isRequired: true } }),
    channel: select({ type: 'string', options: [{ label: 'SMS', value: 'sms' }, { label: 'Email', value: 'email' }, { label: 'Legacy portal (read only)', value: 'portal' }], validation: { isRequired: true } }),
    status: select({ type: 'string', options: [{ label: 'Active', value: 'active' }, { label: 'Inactive', value: 'inactive' }], defaultValue: 'active', validation: { isRequired: true } }),
    version: integer({ defaultValue: 1, validation: { isRequired: true, min: 1 } }),
    transitionVersion: integer({ defaultValue: 1, validation: { isRequired: true, min: 1 } }),
    operationKeyHash: text({ isIndexed: 'unique', access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
    requestHash: text({ access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
    actorReference: text({ access: { read: permissions.canReadAuditMetadata }, validation: { isRequired: true } }),
    facility: relationship({ ref: 'Facility' }),
    subjectTemplate: text(), bodyTemplate: text({ validation: { isRequired: true }, ui: { displayMode: 'textarea' } }), ...trackingFields,
  },
})
