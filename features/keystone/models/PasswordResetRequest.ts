import { list } from '@keystone-6/core'
import { relationship, select, text, timestamp } from '@keystone-6/core/fields'

import { denyAccess } from '../access'

/** Internal, hash-only password recovery state. No generic GraphQL surface. */
export const PasswordResetRequest = list({
  db: {
    extendPrismaSchema(schema) {
      return schema
        .replace(/user\s+User\?/, 'user User')
        .replace(/userId\s+String\?/, 'userId String')
        .replace(/\n}\s*$/, '\n\n  @@index([userId, status, expiresAt], map: "PasswordResetRequest_user_status_expiry_idx")\n}')
    },
  },
  access: {
    operation: { query: denyAccess, create: denyAccess, update: denyAccess, delete: denyAccess },
  },
  graphql: { omit: true },
  ui: { isHidden: true },
  fields: {
    tokenDigest: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    accountDigest: text({ isIndexed: true, validation: { isRequired: true } }),
    status: select({
      type: 'string',
      options: [
        { label: 'Pending', value: 'pending' },
        { label: 'Redeemed', value: 'redeemed' },
        { label: 'Superseded', value: 'superseded' },
        { label: 'Expired', value: 'expired' },
        { label: 'Delivery failed', value: 'delivery_failed' },
      ],
      defaultValue: 'pending',
      validation: { isRequired: true },
      isIndexed: true,
    }),
    user: relationship({ ref: 'User', access: { read: denyAccess, create: denyAccess, update: denyAccess } }),
    expiresAt: timestamp({ validation: { isRequired: true }, isIndexed: true }),
    mailSentAt: timestamp(),
    redeemedAt: timestamp(),
    supersededAt: timestamp(),
    deliveryFailedAt: timestamp(),
    createdAt: timestamp({ defaultValue: { kind: 'now' }, validation: { isRequired: true } }),
  },
})
