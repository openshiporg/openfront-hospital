import assert from 'node:assert/strict'
import test from 'node:test'
import { GraphQLError, locatedError } from 'graphql'

import { constraintRefusal, HospitalRefusal } from './constraint-errors'
import { maskGraphqlError } from './graphql-error-mask'
import { publicGraphQLErrorMessage } from '../../dashboard/lib/security'

const keystonePrismaError = (debug: string) =>
  new GraphQLError('Prisma error', { path: ['createRoom'], extensions: { code: 'KS_PRISMA_ERROR', debug: { message: debug } } })

test('a CHECK violation named in the Prisma message maps to its rule', () => {
  const error = Object.assign(new Error('violates check constraint "Bed_occupancy_matches_patient"'), { code: 'P2004' })
  assert.equal(constraintRefusal(error)?.code, 'HOSPITAL_BED_OCCUPANCY_MISMATCH')
})

test('a trigger refusal is found by the rule name at the start of its RAISE text', () => {
  const refusal = constraintRefusal(new Error('ERROR: Room_delete_in_use: room still has beds'))
  assert.equal(refusal?.code, 'HOSPITAL_ROOM_IN_USE')
})

test('the pre-existing refund guard is named too', () => {
  assert.equal(constraintRefusal(new Error('PatientRefund_total_guard: Refund total exceeds payment amount'))?.code, 'HOSPITAL_REFUND_EXCEEDS_PAYMENT')
  assert.equal(constraintRefusal(new Error('db error: ERROR: Refund total exceeds payment amount'))?.code, 'HOSPITAL_REFUND_EXCEEDS_PAYMENT')
})

test('P2002 by target fields finds the composite unique', () => {
  const error = Object.assign(new Error('Unique constraint failed'), { code: 'P2002', meta: { target: ['bedNumber', 'room'] } })
  assert.equal(constraintRefusal(error)?.code, 'HOSPITAL_DUPLICATE_BED')
})

test('Keystone "Prisma error" wrapper is read through extensions.debug', () => {
  const masked = maskGraphqlError(keystonePrismaError('Unique constraint failed on the fields: (`roomNumber`)'), 'Unexpected error.', false) as GraphQLError
  assert.equal(masked.message, 'A room with this number already exists.')
  assert.equal(masked.extensions.code, 'HOSPITAL_DUPLICATE_ROOM')
  assert.equal(masked.extensions.debug, undefined)
})

test('Postgres key detail from raw SQL maps by fields', () => {
  assert.equal(constraintRefusal(new Error('Key (facility, "aggregateType", "aggregateId")=(a, b, c) already exists.'))?.code, 'HOSPITAL_DUPLICATE_RECORD_HOLD')
})

test('a HospitalRefusal passes the production mask as written', () => {
  // As graphql-js delivers it: locatedError(refusal, nodes, path) — a GraphQLError with the same message
  const masked = maskGraphqlError(locatedError(new HospitalRefusal('Bed changed or remains occupied'), undefined, ['transitionBedReadiness']), 'Unexpected error.', false) as GraphQLError
  assert.equal(masked.message, 'Bed changed or remains occupied')
  assert.equal(masked.extensions.code, 'HOSPITAL_REFUSED')
})

test('a plain Error from a resolver (configuration failures) stays masked', () => {
  const masked = maskGraphqlError(locatedError(new Error('Card payments are not configured for this workspace'), undefined, ['x']), 'Unexpected error.', false) as GraphQLError
  assert.equal(masked.message, 'Unexpected error.')
})

test('an unknown error stays masked with a correlation id', () => {
  const masked = maskGraphqlError(new Error('connect ECONNREFUSED 10.0.0.1:5432'), 'Unexpected error.', false) as GraphQLError
  assert.equal(masked.message, 'Unexpected error.')
  assert.equal(masked.extensions.code, 'INTERNAL_SERVER_ERROR')
  assert.match(String(masked.extensions.correlationId), /^[0-9a-f-]{36}$/)
})

test('the dashboard shows HOSPITAL_* refusals and still hides unknown codes', () => {
  assert.equal(publicGraphQLErrorMessage({ response: { errors: [{ message: 'This room still has beds. Move or retire its beds before deleting it.', extensions: { code: 'HOSPITAL_ROOM_IN_USE' } }] } }),
    'This room still has beds. Move or retire its beds before deleting it.')
  assert.equal(publicGraphQLErrorMessage({ response: { errors: [{ message: 'Unexpected error.', extensions: { code: 'INTERNAL_SERVER_ERROR' } }] } }),
    'Unable to complete the request. Please try again.')
})

test('a field-only unique conflict is named for its own list, not another list with the same field', () => {
  const returned = (modelName: string) => new GraphQLError('Prisma error: Unique constraint failed on the fields: (`code`)', { extensions: { code: 'KS_PRISMA_ERROR', prisma: { code: 'P2002', meta: { modelName, target: ['code'] } } } })
  assert.equal(constraintRefusal(returned('LabTest'))?.code, 'HOSPITAL_DUPLICATE_LAB_TEST')
  assert.equal(constraintRefusal(returned('Department'))?.code, 'HOSPITAL_DUPLICATE_DEPARTMENT')
})
