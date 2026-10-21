import { list } from '@keystone-6/core'
import { integer, timestamp } from '@keystone-6/core/fields'

import { denyAccess } from '../access'

/**
 * Shared fixed-window counters used before public GraphQL/webhook work. The
 * identifier is a one-way digest; raw IP addresses, session tokens, and
 * installation keys are never persisted.
 */
export const RequestRateLimitBucket = list({
  access: {
    operation: { query: denyAccess, create: denyAccess, update: denyAccess, delete: denyAccess },
  },
  graphql: { omit: true },
  ui: { isHidden: true },
  fields: {
    startedAt: timestamp({ validation: { isRequired: true } }),
    count: integer({ validation: { isRequired: true, min: 1 } }),
    updatedAt: timestamp({ validation: { isRequired: true }, isIndexed: true }),
  },
})
