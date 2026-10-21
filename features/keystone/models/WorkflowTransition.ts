import { list } from '@keystone-6/core'
import { integer, json, relationship, text, timestamp } from '@keystone-6/core/fields'

import { denyAccess, permissions } from '../access'
import { canReadWorkflowTransitionResult, canReadWorkflowTransitionRows } from '../security/labReceiptAccess'

export const WorkflowTransition = list({
  db: {
    extendPrismaSchema(schema) {
      return schema
        .replace(/facility\s+Facility\?/, 'facility Facility')
        .replace(/facilityId\s+String\?/, 'facilityId String')
    },
  },
  access: {
    operation: {
      query: permissions.canViewReports,
      create: denyAccess,
      update: denyAccess,
      delete: denyAccess,
    },
    filter: { query: canReadWorkflowTransitionRows },
  },
  graphql: { omit: { create: true, update: true, delete: true } },
  ui: {
    hideCreate: true,
    hideDelete: true,
    isHidden: ({ session }) => !session?.data.role?.canViewReports,
    listView: {
      initialColumns: ['aggregateType', 'aggregateId', 'fromStatus', 'toStatus', 'toVersion', 'occurredAt'],
    },
  },
  fields: {
    operationKeyHash: text({
      isFilterable: false, isOrderable: false,
      isIndexed: 'unique',
      access: { read: permissions.canAccessAllClinicalData },
      validation: { isRequired: true },
    }),
    requestHash: text({
      isFilterable: false, isOrderable: false,
      access: { read: permissions.canAccessAllClinicalData },
      validation: { isRequired: true },
    }),
    aggregateType: text({ validation: { isRequired: true } }),
    aggregateId: text({ validation: { isRequired: true }, isIndexed: true }),
    fromStatus: text({ validation: { isRequired: true } }),
    toStatus: text({ validation: { isRequired: true } }),
    fromVersion: integer({ validation: { isRequired: true, min: 0 } }),
    toVersion: integer({ validation: { isRequired: true, min: 1 } }),
    actorReference: text({ access: { read: permissions.canReadAuditMetadata }, validation: { isRequired: true } }),
    facility: relationship({ ref: 'Facility' }),
    patient: relationship({ ref: 'Patient' }),
    auditLog: relationship({ ref: 'ClinicalAuditLog' }),
    outboxEvent: relationship({ ref: 'ClinicalOutboxEvent' }),
    // Original lab creation/correction receipts contain private clinical bodies,
    // not audit metadata. Reports-only authority must not disclose them through
    // generated, nested or inverse GraphQL traversal.
    result: json({ access: { read: args => canReadWorkflowTransitionResult(args, args.item.aggregateType) } }),
    occurredAt: timestamp({ validation: { isRequired: true }, defaultValue: { kind: 'now' } }),
  },
})
