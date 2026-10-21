import { list } from '@keystone-6/core'
import { integer, relationship, select, text, timestamp } from '@keystone-6/core/fields'
import { denyAccess, isSignedIn, rules } from '../access'

export const IntegrationDeliveryAttempt = list({
  db: { extendPrismaSchema(schema) { return schema
    .replace(/facility\s+Facility\?/, 'facility Facility').replace(/facilityId\s+String\?/, 'facilityId String')
    .replace(/installation\s+IntegrationInstallation\?/, 'installation IntegrationInstallation').replace(/installationId\s+String\?/, 'installationId String')
    .replace(/outboxEvent\s+ClinicalOutboxEvent\?/, 'outboxEvent ClinicalOutboxEvent').replace(/outboxEventId\s+String\?/, 'outboxEventId String')
    .replace(/\n}\s*$/, '\n\n  @@unique([outboxEventId, installationId, attemptNumber], map: "IntegrationDeliveryAttempt_event_attempt_key")\n}') } },
  access: { operation: { query: isSignedIn, create: denyAccess, update: denyAccess, delete: denyAccess }, filter: { query: rules.canReadIntegrations } },
  graphql: { omit: { create: true, update: true, delete: true } },
  ui: { hideCreate: true, hideDelete: true, listView: { initialColumns: ['installation', 'outboxEvent', 'attemptNumber', 'status', 'startedAt'] } },
  fields: {
    attemptKey: text({ isIndexed: 'unique', validation: { isRequired: true } }), facility: relationship({ ref: 'Facility' }),
    installation: relationship({ ref: 'IntegrationInstallation' }), outboxEvent: relationship({ ref: 'ClinicalOutboxEvent' }),
    attemptNumber: integer({ validation: { isRequired: true, min: 1 } }),
    status: select({ type: 'string', options: [{ label: 'Succeeded', value: 'succeeded' }, { label: 'Retry', value: 'retry' }, { label: 'Failed', value: 'failed' }], validation: { isRequired: true } }),
    responseStatus: integer(), errorCode: text(), responseDigest: text(), startedAt: timestamp({ validation: { isRequired: true } }), completedAt: timestamp({ validation: { isRequired: true } }),
  },
})
