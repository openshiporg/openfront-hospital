import { list } from '@keystone-6/core'
import { integer, relationship, select, text, timestamp } from '@keystone-6/core/fields'
import { denyAccess, isSignedIn, permissions, rules } from '../access'
import { trackingFields } from './trackingFields'

export const BedReservation = list({
  db: { extendPrismaSchema(schema) { return schema
    .replace(/facility\s+Facility\?/, 'facility Facility').replace(/facilityId\s+String\?/, 'facilityId String')
    .replace(/patient\s+Patient\?/, 'patient Patient').replace(/patientId\s+String\?/, 'patientId String')
    .replace(/bed\s+Bed\?/, 'bed Bed').replace(/bedId\s+String\?/, 'bedId String') } },
  access: { operation: { query: isSignedIn, create: denyAccess, update: denyAccess, delete: denyAccess }, filter: { query: rules.canReadBedReservations } },
  graphql: { omit: { create: true, update: true, delete: true } },
  ui: { hideCreate: true, hideDelete: true, listView: { initialColumns: ['reservationNumber', 'status', 'bed', 'patient', 'expiresAt'] } },
  fields: {
    reservationNumber: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    status: select({ type: 'string', options: [{ label: 'Active', value: 'active' }, { label: 'Consumed', value: 'consumed' }, { label: 'Released', value: 'released' }, { label: 'Expired', value: 'expired' }], defaultValue: 'active', validation: { isRequired: true } }),
    transitionVersion: integer({ defaultValue: 1, validation: { isRequired: true, min: 1 } }),
    operationKeyHash: text({ isIndexed: 'unique', access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }), requestHash: text({ access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
    facility: relationship({ ref: 'Facility' }), patient: relationship({ ref: 'Patient' }), bed: relationship({ ref: 'Bed' }), admission: relationship({ ref: 'Admission' }),
    actorReference: text({ access: { read: permissions.canReadAuditMetadata }, validation: { isRequired: true } }), reasonCode: text(),
    expiresAt: timestamp({ validation: { isRequired: true } }), releasedAt: timestamp(), consumedAt: timestamp(), ...trackingFields,
  },
})
