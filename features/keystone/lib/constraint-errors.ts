import { GraphQLError } from 'graphql'

/**
 * Database rules and what a person should read when one refuses a write. Names come from the migrations;
 * 20261107160000_hospital_invariants adds the round-2 rules. `fields` lets a unique violation that Prisma
 * reports by column list (P2002 without the index name) still find its message.
 */
export const CONSTRAINT_MESSAGES: Record<string, { code: string; message: string; fields?: string[] }> = {
  // Round 2
  Bed_room_bedNumber_key: { code: 'HOSPITAL_DUPLICATE_BED', message: 'That room already has a bed with this number.', fields: ['room', 'bedNumber'] },
  Bed_one_per_current_patient: { code: 'HOSPITAL_PATIENT_ALREADY_IN_BED', message: 'This patient already occupies another bed. Transfer or discharge them first.', fields: ['currentPatient'] },
  Bed_status_valid: { code: 'HOSPITAL_INVALID_BED_STATUS', message: 'That is not a valid bed status.' },
  Bed_occupancy_matches_patient: { code: 'HOSPITAL_BED_OCCUPANCY_MISMATCH', message: 'A bed is occupied exactly when it has a patient. Admit, transfer or discharge through the admission workflow.' },
  RecordHold_one_active_per_record: { code: 'HOSPITAL_DUPLICATE_RECORD_HOLD', message: 'An active hold already exists for this record.', fields: ['facility', 'aggregateType', 'aggregateId'] },
  InsuranceClaim_amounts_valid: { code: 'HOSPITAL_INVALID_AMOUNT', message: 'Claim amounts can’t be negative, and the paid amount can’t exceed the billed amount.' },
  Appointment_fee_non_negative: { code: 'HOSPITAL_INVALID_AMOUNT', message: 'An estimated fee can’t be negative.' },
  AppointmentType_price_non_negative: { code: 'HOSPITAL_INVALID_AMOUNT', message: 'A visit price can’t be negative.' },
  Ward_capacity_non_negative: { code: 'HOSPITAL_INVALID_CAPACITY', message: 'Ward capacity can’t be negative.' },
  Admission_discharge_after_admit: { code: 'HOSPITAL_INVALID_TIME_RANGE', message: 'Discharge can’t be before admission.' },
  Encounter_end_after_start: { code: 'HOSPITAL_INVALID_TIME_RANGE', message: 'An encounter can’t end before it starts.' },
  PatientCoverage_term_range: { code: 'HOSPITAL_INVALID_TIME_RANGE', message: 'Coverage must end after it becomes effective.' },
  BedReservation_expires_after_created: { code: 'HOSPITAL_INVALID_TIME_RANGE', message: 'A bed hold must expire after it is placed.' },
  PatientPayment_refund_ledger: { code: 'HOSPITAL_REFUND_LEDGER_MISMATCH', message: 'The payment’s refunded total must equal its completed refunds. Nothing was saved; reload and try again.' },
  Room_delete_in_use: { code: 'HOSPITAL_ROOM_IN_USE', message: 'This room still has beds. Move or retire its beds before deleting it.' },
  Ward_delete_in_use: { code: 'HOSPITAL_WARD_IN_USE', message: 'This ward still has rooms. Move or retire its rooms before deleting it.' },
  Department_delete_in_use: { code: 'HOSPITAL_DEPARTMENT_IN_USE', message: 'This department still has wards, clinicians or encounter history. Mark it inactive instead of deleting it.' },
  // Earlier migrations, previously shown as "Unexpected error." or "Unable to complete the request."
  PatientRefund_total_guard: { code: 'HOSPITAL_REFUND_EXCEEDS_PAYMENT', message: 'Refunds can’t exceed the payment amount.' },
  'Refund total exceeds payment amount': { code: 'HOSPITAL_REFUND_EXCEEDS_PAYMENT', message: 'Refunds can’t exceed the payment amount.' },
  PatientPayment_money_check: { code: 'HOSPITAL_INVALID_AMOUNT', message: 'A payment must be a positive amount in a three-letter currency, and can’t refund more than was paid.' },
  PatientRefund_money_check: { code: 'HOSPITAL_INVALID_AMOUNT', message: 'A refund must be a positive amount.' },
  PatientPayment_providerPaymentId_key: { code: 'HOSPITAL_DUPLICATE_PAYMENT_REFERENCE', message: 'That card payment has already been recorded.', fields: ['providerPaymentId'] },
  InventoryItem_balance_check: { code: 'HOSPITAL_INSUFFICIENT_STOCK', message: 'Stock can’t go below zero, and reserved stock can’t exceed what is on hand.' },
  InventoryMovement_balance_check: { code: 'HOSPITAL_INSUFFICIENT_STOCK', message: 'Stock can’t go below zero, and reserved stock can’t exceed what is on hand.' },
  InventoryItem_facility_sku_key: { code: 'HOSPITAL_DUPLICATE_SKU', message: 'This facility already has an item with that SKU.', fields: ['facility', 'sku'] },
  Appointment_active_provider_no_overlap: { code: 'HOSPITAL_SLOT_TAKEN', message: 'That provider is already booked at this time. Choose another time.' },
  ProviderScheduleBlock_available_no_overlap: { code: 'HOSPITAL_SCHEDULE_OVERLAP', message: 'This availability overlaps another block for the same provider.' },
  Admission_active_bed_key: { code: 'HOSPITAL_BED_TAKEN', message: 'That bed already has an admitted patient.' },
  Admission_active_patient_key: { code: 'HOSPITAL_PATIENT_ALREADY_ADMITTED', message: 'This patient is already admitted.' },
  BedReservation_active_bed_key: { code: 'HOSPITAL_BED_HELD', message: 'That bed is already held for another admission.' },
  CommunicationTemplate_facility_key: { code: 'HOSPITAL_DUPLICATE_TEMPLATE', message: 'This facility already has a template with that key.', fields: ['facility', 'templateKey'] },
  RetentionPolicy_facility_record_key: { code: 'HOSPITAL_DUPLICATE_RETENTION_POLICY', message: 'This facility already has a retention policy for that record type.', fields: ['facility', 'recordType'] },
  Room_roomNumber_key: { code: 'HOSPITAL_DUPLICATE_ROOM', message: 'A room with this number already exists.', fields: ['roomNumber'] },
  Department_code_key: { code: 'HOSPITAL_DUPLICATE_DEPARTMENT', message: 'A department with this code already exists.', fields: ['code'] },
  AppointmentType_slug_key: { code: 'HOSPITAL_DUPLICATE_VISIT_TYPE', message: 'A visit type with this web address already exists.', fields: ['slug'] },
  Facility_slug_key: { code: 'HOSPITAL_DUPLICATE_FACILITY', message: 'A facility with this web address already exists.', fields: ['slug'] },
  Facility_timeZone_nonempty: { code: 'HOSPITAL_INVALID_TIME_ZONE', message: 'Choose the facility’s time zone.' },
}

type ErrorLink = {
  message?: unknown
  code?: unknown
  meta?: { target?: unknown } & Record<string, unknown>
  originalError?: unknown
  cause?: unknown
  extensions?: { debug?: { message?: unknown }; prisma?: { meta?: unknown } }
}

function chain(error: unknown) {
  const out: ErrorLink[] = []
  let current = error as ErrorLink
  for (let depth = 0; current && depth < 6; depth++) { out.push(current); current = (current.originalError ?? current.cause) as ErrorLink }
  return out
}

/** The readable, coded refusal for a known database rule anywhere in the error's cause chain, or null. */
export function constraintRefusal(error: unknown): { code: string; message: string } | null {
  for (const link of chain(error)) {
    const text = [
      String(link?.message ?? ''), typeof link?.meta === 'object' ? JSON.stringify(link.meta) : '',
      String(link?.extensions?.debug?.message ?? ''), link?.extensions?.prisma?.meta ? JSON.stringify(link.extensions.prisma.meta) : '',
    ].join(' ')
    for (const [name, rule] of Object.entries(CONSTRAINT_MESSAGES)) if (text.includes(name)) return rule
    // Prisma sometimes reports a unique violation by its fields instead of the index name.
    const listed = /Unique constraint failed on the fields: \(([^)]*)\)/.exec(text)?.[1]?.match(/`([^`]+)`/g)?.map(field => field.slice(1, -1))
    // Raw SQL writes surface Postgres's own detail instead: Key (room, "bedNumber")=(…) already exists.
    const keyed = /Key \(([^)]*)\)=\(.*\) already exists/.exec(text)?.[1]?.split(',').map(field => field.trim().replace(/^"|"$/g, ''))
    const target = link?.code === 'P2002' && Array.isArray(link?.meta?.target) ? link.meta.target as string[] : listed ?? keyed
    if (target?.length) {
      const key = [...target].map(String).sort().join(',')
      const match = Object.values(CONSTRAINT_MESSAGES).find(rule => rule.fields && [...rule.fields].sort().join(',') === key)
      if (match) return match
    }
  }
  return null
}

/**
 * A refusal written for the person who made the request: wrong state, stale version, out of scope, bad input.
 * It is a GraphQLError, so production masking shows it as written instead of "Unexpected error.".
 * Configuration and internal failures stay plain Errors and remain masked behind a correlation ID.
 */
export class HospitalRefusal extends GraphQLError {
  constructor(message: string) { super(message, { extensions: { code: 'HOSPITAL_REFUSED' } }) }
}
