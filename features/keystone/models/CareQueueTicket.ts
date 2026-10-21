import { list } from '@keystone-6/core'
import { integer, relationship, select, text, timestamp } from '@keystone-6/core/fields'
import { denyAccess, isSignedIn, rules } from '../access'
import { afterCareQueueOperation, beforeCareQueueOperation, resolveCareQueueInput, validateCareQueueInput } from '../lib/careQueueHooks'
import { trackingFields } from './trackingFields'

export const CareQueueTicket = list({
  db: { extendPrismaSchema(schema) { return schema
    .replace(/facility\s+Facility\?/, 'facility Facility').replace(/facilityId\s+String\?/, 'facilityId String')
    .replace(/patient\s+Patient\?/, 'patient Patient').replace(/patientId\s+String\?/, 'patientId String')
    .replace(/appointment\s+Appointment\?/, 'appointment Appointment').replace(/appointmentId\s+String\?/, 'appointmentId String @unique')
    .replace(/\n}\s*$/, '\n\n  @@unique([facilityId, queueDate, queuePosition], map: "CareQueueTicket_facility_queue_position_key")\n}') } },
  access: { operation: { query: isSignedIn, create: denyAccess, update: denyAccess, delete: denyAccess }, filter: { query: rules.canReadCareQueueTickets } },
  graphql: { omit: { create: true, update: true, delete: true } },
  hooks: { resolveInput: resolveCareQueueInput, validateInput: validateCareQueueInput, beforeOperation: beforeCareQueueOperation, afterOperation: afterCareQueueOperation },
  ui: { hideCreate: true, hideDelete: true, listView: { initialColumns: ['ticketNumber', 'status', 'priority', 'patient', 'facility', 'arrivedAt'] } },
  fields: {
    ticketNumber: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    status: select({ type: 'string', options: [{ label: 'Waiting', value: 'waiting' }, { label: 'Called', value: 'called' }, { label: 'In care', value: 'in_care' }, { label: 'Completed', value: 'completed' }, { label: 'Cancelled', value: 'cancelled' }], defaultValue: 'waiting', validation: { isRequired: true } }),
    priority: select({ type: 'string', options: [{ label: 'Routine', value: 'routine' }, { label: 'Time sensitive', value: 'time_sensitive' }], defaultValue: 'routine', validation: { isRequired: true } }),
    reasonCode: text({ defaultValue: 'scheduled_visit', validation: { isRequired: true } }),
    queueDate: text({ validation: { isRequired: true } }),
    queuePosition: integer({ validation: { isRequired: true, min: 1 } }),
    transitionVersion: integer({ defaultValue: 1, validation: { isRequired: true, min: 1 } }),
    actorReference: text({ validation: { isRequired: true } }),
    idempotencyKeyHash: text({ validation: { isRequired: true } }),
    requestHash: text({ validation: { isRequired: true } }),
    arrivedAt: timestamp({ validation: { isRequired: true } }), calledAt: timestamp(), completedAt: timestamp(),
    facility: relationship({ ref: 'Facility' }), patient: relationship({ ref: 'Patient' }), appointment: relationship({ ref: 'Appointment.careQueueTickets' }), encounter: relationship({ ref: 'Encounter' }),
    ...trackingFields,
  },
})
