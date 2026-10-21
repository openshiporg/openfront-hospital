import { list } from '@keystone-6/core'
import { relationship, select, text, timestamp } from '@keystone-6/core/fields'

import { denyAccess, isSignedIn, permissions, rules } from '../access'

export const RetentionDisposition = list({
  db: {
    extendPrismaSchema(schema) {
      return schema
        .replace(/facility\s+Facility\?/, 'facility Facility')
        .replace(/facilityId\s+String\?/, 'facilityId String')
        .replace(/policy\s+RetentionPolicy\?/, 'policy RetentionPolicy')
        .replace(/policyId\s+String\?/, 'policyId String')
    },
  },
  access: {
    operation: { query: isSignedIn, create: denyAccess, update: denyAccess, delete: denyAccess },
    filter: { query: rules.canReadRetentionRecords },
  },
  graphql: { omit: { create: true, update: true, delete: true } },
  ui: { hideCreate: true, hideDelete: true, listView: { initialColumns: ['recordType', 'aggregateId', 'decision', 'facility', 'reviewedAt'] } },
  fields: {
    dispositionNumber: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    operationKeyHash: text({ isIndexed: 'unique', access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
    requestHash: text({ access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
    facility: relationship({ ref: 'Facility' }),
    patient: relationship({ ref: 'Patient' }),
    policy: relationship({ ref: 'RetentionPolicy' }),
    recordType: text({ validation: { isRequired: true } }),
    aggregateType: text({ validation: { isRequired: true } }),
    aggregateId: text({ validation: { isRequired: true }, isIndexed: true }),
    decision: select({
      type: 'string',
      options: [
        { label: 'Retained', value: 'retained' },
        { label: 'Blocked by hold', value: 'blocked_by_hold' },
        { label: 'Eligible for review', value: 'eligible_for_review' },
      ],
      validation: { isRequired: true },
    }),
    reasonCode: text({ validation: { isRequired: true } }),
    actorReference: text({ access: { read: permissions.canReadAuditMetadata }, validation: { isRequired: true } }),
    cutoffAt: timestamp({ validation: { isRequired: true } }),
    reviewedAt: timestamp({ defaultValue: { kind: 'now' }, validation: { isRequired: true } }),
  },
})
