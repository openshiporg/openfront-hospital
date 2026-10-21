import { list } from '@keystone-6/core'
import { integer, json, relationship, select, text, timestamp } from '@keystone-6/core/fields'
import { denyAccess, permissions, rules } from '../access'

export const ClinicalOutboxEvent = list({
  db: { extendPrismaSchema(schema) { return schema
    .replace(/facility\s+Facility\?/, 'facility Facility').replace(/facilityId\s+String\?/, 'facilityId String') } },
  access: { operation: { query: permissions.canViewReports, create: denyAccess, update: denyAccess, delete: denyAccess }, filter: { query: rules.canReadClinicalOutboxEvents } },
  graphql: { omit: { create: true, update: true, delete: true } },
  ui: { hideCreate: true, hideDelete: true, isHidden: ({ session }) => !session?.data.role?.canViewReports, listView: { initialColumns: ['eventType', 'status', 'facility', 'attempts', 'nextAttemptAt'] } },
  fields: {
    eventKey: text({ isIndexed: 'unique', validation: { isRequired: true } }), eventType: text({ isIndexed: true, validation: { isRequired: true } }),
    aggregateType: text({ validation: { isRequired: true } }), aggregateId: text({ isIndexed: true, validation: { isRequired: true } }),
    contractVersion: text({ defaultValue: 'hospital.event.v1', validation: { isRequired: true } }),
    deliveryMode: select({ type: 'string', options: [{ label: 'Internal', value: 'internal' }, { label: 'External', value: 'external' }], defaultValue: 'internal', validation: { isRequired: true }, isIndexed: true }),
    installation: relationship({ ref: 'IntegrationInstallation' }),
    installationVersion: integer({ validation: { min: 1 }, access: { read: permissions.canReadAuditMetadata } }),
    status: select({ type: 'string', options: [{ label: 'Recorded', value: 'recorded' }, { label: 'Pending', value: 'pending' }, { label: 'Processing', value: 'processing' }, { label: 'Retry', value: 'retry' }, { label: 'Delivered', value: 'delivered' }, { label: 'Dead letter', value: 'dead_letter' }], defaultValue: 'recorded', validation: { isRequired: true }, isIndexed: true }),
    attempts: integer({ defaultValue: 0, validation: { isRequired: true, min: 0 } }), nextAttemptAt: timestamp({ isIndexed: true }), deliveredAt: timestamp(), lastError: text(),
    facility: relationship({ ref: 'Facility' }), patient: relationship({ ref: 'Patient' }), appointment: relationship({ ref: 'Appointment' }), encounter: relationship({ ref: 'Encounter' }),
    payload: json({ access: { read: permissions.canReadAuditMetadata } }), createdAt: timestamp({ defaultValue: { kind: 'now' }, validation: { isRequired: true } }),
  },
})
