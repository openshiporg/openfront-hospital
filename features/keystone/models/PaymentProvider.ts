import { list } from '@keystone-6/core'
import { checkbox, json, relationship, text } from '@keystone-6/core/fields'
import { denyAccess, isSignedIn, permissions } from '../access'
import { trackingFields } from './trackingFields'

const canManageBilling = (args: any) => isSignedIn(args) && permissions.canManageBilling(args)
export const PaymentProvider = list({
  db: { extendPrismaSchema(schema) { return schema
    .replace(/facility\s+Facility\?/, 'facility Facility').replace(/facilityId\s+String\?/, 'facilityId String')
    .replace(/@@index\(\[facilityId\]\)/, '@@unique([facilityId, code], map: "PaymentProvider_facility_code")') } },
  access: { operation: { query: canManageBilling, create: canManageBilling, update: canManageBilling, delete: denyAccess }, filter: {
    query: ({ session }: any) => session?.data.role?.canAccessAllClinicalData ? true : session?.itemId ? { facility: { staff: { some: { id: { equals: session.itemId } } } } } : false,
    update: ({ session }: any) => session?.data.role?.canAccessAllClinicalData ? true : session?.itemId ? { facility: { staff: { some: { id: { equals: session.itemId } } } } } : false,
    delete: denyAccess,
  } },
  graphql: { omit: { create: true, update: true, delete: true } },
  ui: { hideCreate: true, hideDelete: true, listView: { initialColumns: ['name', 'code', 'isInstalled', 'facility'] } },
  fields: {
    name: text({ validation: { isRequired: true } }), code: text({ validation: { isRequired: true, match: { regex: /^pp_[a-zA-Z0-9_-]+$/ } } }),
    isInstalled: checkbox({ defaultValue: false }), credentials: json({ access: { read: denyAccess }, defaultValue: {} }), metadata: json({ access: { read: canManageBilling }, defaultValue: {} }),
    createPaymentFunction: text({ validation: { isRequired: true } }), capturePaymentFunction: text({ validation: { isRequired: true } }), refundPaymentFunction: text({ validation: { isRequired: true } }),
    getPaymentStatusFunction: text({ validation: { isRequired: true } }), generatePaymentLinkFunction: text({ validation: { isRequired: true } }), handleWebhookFunction: text({ validation: { isRequired: true } }),
    facility: relationship({ ref: 'Facility' }), ...trackingFields,
  },
})
