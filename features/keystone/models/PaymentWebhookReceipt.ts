import { list } from '@keystone-6/core'
import { json, text, timestamp } from '@keystone-6/core/fields'
import { denyAccess, isSignedIn } from '../access'

export const PaymentWebhookReceipt = list({
  db: { extendPrismaSchema(schema) { return schema.replace(/\n  createdAt\s+DateTime\s+@default\(now\)\n  updatedAt\s+DateTime\s+@default\(now\)\s+@updatedAt/, '') } },
  access: { operation: { query: isSignedIn, create: denyAccess, update: denyAccess, delete: denyAccess } },
  graphql: { omit: { create: true, update: true, delete: true } },
  ui: { hideCreate: true, hideDelete: true },
  fields: {
    receiptKey: text({ isIndexed: 'unique', validation: { isRequired: true } }), eventId: text({ validation: { isRequired: true } }),
    eventType: text({ validation: { isRequired: true } }), status: text({ defaultValue: 'received', validation: { isRequired: true } }),
    payloadDigest: text({ validation: { isRequired: true } }), payload: json({ access: { read: denyAccess } }), processedAt: timestamp(),
  },
})
