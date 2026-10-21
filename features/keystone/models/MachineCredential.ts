import { list } from '@keystone-6/core'
import { integer, json, relationship, select, text, timestamp } from '@keystone-6/core/fields'
import { denyAccess, isSignedIn, permissions, rules } from '../access'

export const MachineCredential = list({
  db: { extendPrismaSchema(schema) { return schema
    .replace(/facility\s+Facility\?/, 'facility Facility').replace(/facilityId\s+String\?/, 'facilityId String')
    .replace(/installation\s+IntegrationInstallation\?/, 'installation IntegrationInstallation').replace(/installationId\s+String\?/, 'installationId String')
    .replace(/createdBy\s+User\?/, 'createdBy User').replace(/createdById\s+String\?/, 'createdById String') } },
  access: { operation: { query: isSignedIn, create: denyAccess, update: denyAccess, delete: denyAccess }, filter: { query: rules.canReadIntegrations } },
  graphql: { omit: { create: true, update: true, delete: true } },
  ui: { hideCreate: true, hideDelete: true, listView: { initialColumns: ['name', 'keyPrefix', 'status', 'installation', 'expiresAt'] } },
  fields: {
    name: text({ validation: { isRequired: true } }), keyPrefix: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    transitionVersion: integer({ defaultValue: 1, validation: { isRequired: true, min: 1 } }),
    operationKeyHash: text({ isIndexed: 'unique', access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
    requestHash: text({ access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
    actorReference: text({ access: { read: permissions.canReadAuditMetadata }, validation: { isRequired: true } }),
    secretDigest: text({ isIndexed: 'unique', access: { read: denyAccess }, validation: { isRequired: true } }), scopes: json(),
    status: select({ type: 'string', options: [{ label: 'Active', value: 'active' }, { label: 'Revoked', value: 'revoked' }, { label: 'Expired', value: 'expired' }], defaultValue: 'active', validation: { isRequired: true } }),
    facility: relationship({ ref: 'Facility' }), installation: relationship({ ref: 'IntegrationInstallation' }),
    createdBy: relationship({ ref: 'User' }), createdAt: timestamp({ defaultValue: { kind: 'now' }, validation: { isRequired: true } }),
    expiresAt: timestamp({ validation: { isRequired: true } }), revokedAt: timestamp(), lastUsedAt: timestamp(),
    lastUsedFingerprint: text({ access: { read: permissions.canManageIntegrations } }),
  },
})
