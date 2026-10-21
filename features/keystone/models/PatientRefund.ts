import { list } from '@keystone-6/core'
import { integer, relationship, select, text, timestamp } from '@keystone-6/core/fields'
import { denyAccess, isSignedIn, permissions, rules } from '../access'
import { trackingFields } from './trackingFields'

export const PatientRefund = list({
  db: { extendPrismaSchema(schema) { return schema
    .replace(/facility\s+Facility\?/, 'facility Facility').replace(/facilityId\s+String\?/, 'facilityId String')
    .replace(/patient\s+Patient\?/, 'patient Patient').replace(/patientId\s+String\?/, 'patientId String')
    .replace(/payment\s+PatientPayment\?/, 'payment PatientPayment').replace(/paymentId\s+String\?/, 'paymentId String') } },
  access: { operation: { query: isSignedIn, create: denyAccess, update: denyAccess, delete: denyAccess }, filter: { query: rules.canReadBillingRecords } },
  graphql: { omit: { create: true, update: true, delete: true } },
  ui: { hideCreate: true, hideDelete: true, listView: { initialColumns: ['refundNumber', 'status', 'amountCents', 'payment', 'patient'] } },
  fields: {
    refundNumber: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    status: select({ type: 'string', options: [
      { label: 'Pending', value: 'pending' }, { label: 'Succeeded', value: 'succeeded' },
      { label: 'Failed', value: 'failed' }, { label: 'Cancelled', value: 'cancelled' },
    ], defaultValue: 'pending', validation: { isRequired: true } }),
    transitionVersion: integer({ defaultValue: 1, validation: { isRequired: true, min: 1 } }),
    operationKeyHash: text({ isIndexed: 'unique', access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
    requestHash: text({ access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
    actorReference: text({ access: { read: permissions.canReadAuditMetadata }, validation: { isRequired: true } }),
    facility: relationship({ ref: 'Facility' }), patient: relationship({ ref: 'Patient' }), payment: relationship({ ref: 'PatientPayment' }), installation: relationship({ ref: 'IntegrationInstallation' }),
    amountCents: integer({ validation: { isRequired: true, min: 1 }, access: { read: permissions.canManageBilling } }),
    reasonCode: text({ validation: { isRequired: true } }), externalReference: text({ access: { read: permissions.canManageBilling } }),
    completedAt: timestamp(), failedAt: timestamp(), ...trackingFields,
  },
})
