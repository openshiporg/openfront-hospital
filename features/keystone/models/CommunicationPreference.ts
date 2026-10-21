import { list } from '@keystone-6/core'
import { integer, relationship, select, text, timestamp } from '@keystone-6/core/fields'
import { denyAccess, isSignedIn, permissions, rules } from '../access'
import { trackingFields } from './trackingFields'

export const CommunicationPreference = list({
  db: { extendPrismaSchema(schema) { return schema
    .replace(/facility\s+Facility\?/, 'facility Facility').replace(/facilityId\s+String\?/, 'facilityId String')
    .replace(/patient\s+Patient\?/, 'patient Patient').replace(/patientId\s+String\?/, 'patientId String')
    .replace(/\n}\s*$/, '\n\n  @@unique([facilityId, patientId, channel, purpose], map: "CommunicationPreference_scope_key")\n}') } },
  access: { operation: { query: isSignedIn, create: denyAccess, update: denyAccess, delete: denyAccess }, filter: { query: rules.canReadCommunicationPreferences } },
  graphql: { omit: { create: true, update: true, delete: true } },
  ui: { hideCreate: true, hideDelete: true, listView: { initialColumns: ['patient', 'channel', 'purpose', 'status', 'facility'] } },
  fields: {
    channel: select({ type: 'string', options: [{ label: 'SMS', value: 'sms' }, { label: 'Email', value: 'email' }, { label: 'Phone', value: 'phone' }, { label: 'Legacy portal (read only)', value: 'portal' }], validation: { isRequired: true } }),
    purpose: select({ type: 'string', options: [{ label: 'Care operations', value: 'care_operations' }, { label: 'Billing', value: 'billing' }, { label: 'General', value: 'general' }], validation: { isRequired: true } }),
    status: select({ type: 'string', options: [{ label: 'Allowed', value: 'allowed' }, { label: 'Opted out', value: 'opted_out' }], defaultValue: 'allowed', validation: { isRequired: true } }),
    transitionVersion: integer({ defaultValue: 1, validation: { isRequired: true, min: 1 } }),
    operationKeyHash: text({ isIndexed: 'unique', access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }), requestHash: text({ access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
    facility: relationship({ ref: 'Facility' }), patient: relationship({ ref: 'Patient' }),
    actorReference: text({ access: { read: permissions.canReadAuditMetadata }, validation: { isRequired: true } }), reasonCode: text(), changedAt: timestamp(), ...trackingFields,
  },
})
