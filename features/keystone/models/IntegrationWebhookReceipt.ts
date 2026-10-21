import { list } from '@keystone-6/core'
import { relationship, select, text, timestamp } from '@keystone-6/core/fields'
import { denyAccess, isSignedIn, permissions, rules } from '../access'

export const IntegrationWebhookReceipt = list({
  db: { extendPrismaSchema(schema) { return schema
    .replace(/facility\s+Facility\?/, 'facility Facility').replace(/facilityId\s+String\?/, 'facilityId String')
    .replace(/installation\s+IntegrationInstallation\?/, 'installation IntegrationInstallation').replace(/installationId\s+String\?/, 'installationId String') } },
  access: { operation: { query: isSignedIn, create: denyAccess, update: denyAccess, delete: denyAccess }, filter: { query: rules.canReadIntegrations } },
  graphql: { omit: { create: true, update: true, delete: true } },
  ui: { hideCreate: true, hideDelete: true, listView: { initialColumns: ['eventId', 'eventType', 'status', 'installation', 'receivedAt'] } },
  fields: {
    receiptKey: text({ isIndexed: 'unique', validation: { isRequired: true } }), eventId: text({ validation: { isRequired: true } }), eventType: text({ validation: { isRequired: true } }),
    requestDigest: text({ access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
    status: select({ type: 'string', options: [{ label: 'Accepted', value: 'accepted' }, { label: 'Rejected', value: 'rejected' }, { label: 'Processed', value: 'processed' }], validation: { isRequired: true } }),
    facility: relationship({ ref: 'Facility' }), installation: relationship({ ref: 'IntegrationInstallation' }),
    receivedAt: timestamp({ defaultValue: { kind: 'now' }, validation: { isRequired: true } }), processedAt: timestamp(), errorCode: text(),
  },
})
