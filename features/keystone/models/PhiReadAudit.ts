import { list } from '@keystone-6/core'
import { checkbox, integer, json, text, timestamp } from '@keystone-6/core/fields'

import { denyAccess, permissions } from '../access'

/**
 * Append-only request evidence for authenticated GraphQL selections that can
 * resolve PHI. It records names/digests/counts only, never selected values,
 * variables, cookies, tokens, contact data, or clinical content.
 */
export const PhiReadAudit = list({
  access: {
    operation: {
      query: permissions.canAccessAllClinicalData,
      create: denyAccess,
      update: denyAccess,
      delete: denyAccess,
    },
  },
  graphql: { omit: { create: true, update: true, delete: true } },
  ui: {
    hideCreate: true,
    hideDelete: true,
    listView: { initialColumns: ['occurredAt', 'actorReference', 'operationName', 'success', 'resultCount'] },
  },
  fields: {
    eventType: text({ defaultValue: 'phi.read', validation: { isRequired: true } }),
    occurredAt: timestamp({ defaultValue: { kind: 'now' }, validation: { isRequired: true } }),
    actorReference: text({ validation: { isRequired: true } }),
    operationType: text(),
    operationName: text({ validation: { isRequired: true } }),
    rootFields: json(),
    selectedFields: json(),
    selectionDigest: text({ isIndexed: true, validation: { isRequired: true } }),
    resultReferenceDigest: text(),
    resourceReferences: json(),
    scopeReferences: json(),
    authority: json(),
    purpose: text(),
    correlationReference: text(),
    resultCount: integer({ defaultValue: 0, validation: { isRequired: true, min: 0 } }),
    success: checkbox({ defaultValue: true }),
  },
})
