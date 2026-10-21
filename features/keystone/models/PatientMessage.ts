import { list, graphql } from '@keystone-6/core'
import { integer, text, relationship, select, timestamp, json, virtual } from '@keystone-6/core/fields'

import { denyAccess, isSignedIn, permissions, rules } from '../access'

const denyMutation = () => false
import { trackingFields } from './trackingFields'

export const PatientMessage = list({
  db: {
    extendPrismaSchema(schema) {
      return schema
        .replace(/facility\s+Facility\?/, 'facility Facility')
        .replace(/facilityId\s+String\?/, 'facilityId String')
    },
  },
  access: {
    operation: {
      query: isSignedIn,
      create: denyMutation,
      update: denyMutation,
      delete: denyMutation,
    },
    filter: {
      query: rules.canReadPatientMessages,
      update: rules.canReadPatientMessages,
    },
  },
  graphql: {
    omit: { create: true, update: true, delete: true },
  },
  ui: {
    hideCreate: true,
    hideDelete: true,
    listView: {
      initialColumns: ['messageLabel', 'channel', 'status', 'patient', 'appointment'],
    },
  },
  fields: {
    operationKeyHash: text({ isIndexed: 'unique', access: { read: denyAccess }, validation: { isRequired: true } }),
    requestHash: text({ access: { read: denyAccess }, validation: { isRequired: true } }),
    transitionVersion: integer({ defaultValue: 1, validation: { isRequired: true, min: 1 }, access: { update: denyAccess } }),
    purpose: select({ type: 'string', access: { update: denyAccess }, options: [
      { label: 'Care operations', value: 'care_operations' },
      { label: 'Billing', value: 'billing' },
      { label: 'General', value: 'general' },
    ], defaultValue: 'care_operations', validation: { isRequired: true } }),
    facility: relationship({ ref: 'Facility', access: { create: denyAccess, update: denyAccess } }),
    installation: relationship({ ref: 'IntegrationInstallation', access: { create: denyAccess, update: denyAccess } }),
    template: relationship({ ref: 'CommunicationTemplate', access: { create: denyAccess, update: denyAccess } }),
    patient: relationship({ ref: 'Patient.messages', access: { update: denyMutation } }),
    appointment: relationship({ ref: 'Appointment.messages', access: { update: denyMutation } }),
    direction: select({
      type: 'string',
      access: { update: denyMutation },
      options: [
        { label: 'Outbound', value: 'outbound' },
        { label: 'Inbound', value: 'inbound' },
      ],
      defaultValue: 'outbound',
      validation: { isRequired: true },
    }),
    channel: select({
      type: 'string',
      access: { update: denyMutation },
      options: [
        { label: 'SMS', value: 'sms' },
        { label: 'Email', value: 'email' },
        { label: 'Phone', value: 'phone' },
        { label: 'Legacy portal (read only)', value: 'portal' },
      ],
      defaultValue: 'sms',
      validation: { isRequired: true },
    }),
    subject: text({ access: { read: permissions.canReadMessageContent, update: denyMutation } }),
    body: text({
      access: { read: permissions.canReadMessageContent, update: denyMutation },
      validation: { isRequired: true },
      ui: { displayMode: 'textarea' },
    }),
    status: select({
      type: 'string',
      access: { update: denyMutation },
      options: [
        { label: 'Draft', value: 'draft' },
        { label: 'Manual follow-up required', value: 'manual_required' },
        { label: 'Manual follow-up completed', value: 'completed' },
        { label: 'Queued', value: 'queued' },
        { label: 'Sent', value: 'sent' },
        { label: 'Delivered', value: 'delivered' },
        { label: 'Failed', value: 'failed' },
        { label: 'Received', value: 'received' },
      ],
      defaultValue: 'draft',
      validation: { isRequired: true },
    }),
    sentAt: timestamp({ access: { update: denyMutation } }),
    deliveredAt: timestamp({ access: { update: denyMutation } }),
    externalId: text({
      isIndexed: true,
      access: { read: permissions.canReadMessageContent, update: denyMutation },
    }),
    metadata: json({ access: { read: permissions.canReadMessageContent, update: denyMutation } }),
    messageLabel: virtual({
      field: graphql.field({
        type: graphql.String,
        resolve(item) {
          return `${item.channel || 'message'} • ${item.status || 'draft'}`
        },
      }),
    }),
    ...trackingFields,
  },
})
