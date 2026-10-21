import { list } from '@keystone-6/core'
import { integer, json, relationship, select, text, timestamp } from '@keystone-6/core/fields'
import { denyAccess, isSignedIn, permissions, rules } from '../access'
import { trackingFields } from './trackingFields'

export const IntegrationInstallation = list({
  db: { extendPrismaSchema(schema) { return schema
    .replace(/facility\s+Facility\?/, 'facility Facility').replace(/facilityId\s+String\?/, 'facilityId String')
    .replace(/\n}\s*$/, '\n\n  @@unique([facilityId, installationKey], map: "IntegrationInstallation_facility_key")\n}') } },
  access: { operation: { query: isSignedIn, create: denyAccess, update: denyAccess, delete: denyAccess }, filter: { query: rules.canReadIntegrations } },
  graphql: { omit: { create: true, update: true, delete: true } },
  ui: { hideCreate: true, hideDelete: true, listView: { initialColumns: ['name', 'kind', 'status', 'facility', 'lastSuccessAt'] } },
  fields: {
    installationKey: text({ isIndexed: 'unique', validation: { isRequired: true } }), name: text({ validation: { isRequired: true } }),
    kind: select({ type: 'string', options: [
      { label: 'Communications', value: 'communications' }, { label: 'Payment', value: 'payment' },
      { label: 'Laboratory', value: 'laboratory' }, { label: 'Pharmacy', value: 'pharmacy' },
      { label: 'General webhook', value: 'webhook' },
    ], validation: { isRequired: true } }),
    status: select({ type: 'string', options: [{ label: 'Active', value: 'active' }, { label: 'Paused', value: 'paused' }, { label: 'Revoked', value: 'revoked' }], defaultValue: 'active', validation: { isRequired: true } }),
    transitionVersion: integer({ defaultValue: 1, validation: { isRequired: true, min: 1 } }),
    operationKeyHash: text({ isIndexed: 'unique', access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }), requestHash: text({ access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
    facility: relationship({ ref: 'Facility' }), endpointUrl: text({ access: { read: permissions.canManageIntegrations }, validation: { isRequired: true } }),
    allowedEventTypes: json(), signingSecretCiphertext: text({ access: { read: denyAccess } }), signingSecretIv: text({ access: { read: denyAccess } }), signingSecretTag: text({ access: { read: denyAccess } }), keyVersion: integer({ defaultValue: 1, validation: { isRequired: true, min: 1 } }),
    actorReference: text({ access: { read: permissions.canReadAuditMetadata }, validation: { isRequired: true } }),
    lastSuccessAt: timestamp(), lastErrorAt: timestamp(), lastErrorCode: text(), ...trackingFields,
  },
})
