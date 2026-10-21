import { list } from '@keystone-6/core'
import { integer, relationship, select, text, timestamp } from '@keystone-6/core/fields'
import { denyAccess, isSignedIn, permissions, rules } from '../access'
import { trackingFields } from './trackingFields'

export const PatientPayment = list({
  db: { extendPrismaSchema(schema) { return schema
    .replace(/facility\s+Facility\?/, 'facility Facility').replace(/facilityId\s+String\?/, 'facilityId String')
    .replace(/patient\s+Patient\?/, 'patient Patient').replace(/patientId\s+String\?/, 'patientId String') } },
  access: { operation: { query: isSignedIn, create: denyAccess, update: denyAccess, delete: denyAccess }, filter: { query: rules.canReadBillingRecords } },
  graphql: { omit: { create: true, update: true, delete: true } },
  ui: { hideCreate: true, hideDelete: true, listView: { initialColumns: ['paymentNumber', 'status', 'amountCents', 'method', 'patient', 'facility'] } },
  fields: {
    paymentNumber: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    status: select({ type: 'string', options: [
      { label: 'Pending', value: 'pending' }, { label: 'Succeeded', value: 'succeeded' },
      { label: 'Failed', value: 'failed' }, { label: 'Cancelled', value: 'cancelled' },
    ], defaultValue: 'pending', validation: { isRequired: true } }),
    transitionVersion: integer({ defaultValue: 1, validation: { isRequired: true, min: 1 } }),
    operationKeyHash: text({ isIndexed: 'unique', access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
    requestHash: text({ access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
    actorReference: text({ access: { read: permissions.canReadAuditMetadata }, validation: { isRequired: true } }),
    facility: relationship({ ref: 'Facility' }), patient: relationship({ ref: 'Patient' }), claim: relationship({ ref: 'InsuranceClaim' }), installation: relationship({ ref: 'IntegrationInstallation' }),
    amountCents: integer({ validation: { isRequired: true, min: 1 }, access: { read: permissions.canManageBilling } }),
    refundedAmountCents: integer({ defaultValue: 0, validation: { isRequired: true, min: 0 }, access: { read: permissions.canManageBilling } }),
    currency: text({ defaultValue: 'USD', validation: { isRequired: true } }),
    method: select({ type: 'string', options: [
      { label: 'Cash', value: 'cash' }, { label: 'Check', value: 'check' },
      { label: 'External card', value: 'card_external' }, { label: 'External bank', value: 'bank_external' },
    ], validation: { isRequired: true } }),
    externalReference: text({ isIndexed: true, access: { read: permissions.canManageBilling } }),
    receivedAt: timestamp(), failedAt: timestamp(), ...trackingFields,
  },
})
