import assert from 'node:assert/strict'
import test from 'node:test'

import { expireBedReservations, expireUnconfirmedAppointments, resetExpiredPaymentSession } from './maintenance'

function fakePrisma(state: any) {
  const tx: any = {
    $queryRaw: async () => [],
    bedReservation: {
      findUnique: async () => state.reservation,
      update: async ({ data }: any) => { state.reservation = { ...state.reservation, status: data.status, transitionVersion: state.reservation.transitionVersion + 1 }; return state.reservation },
    },
    bed: { findUnique: async () => state.bed, update: async ({ data }: any) => { state.bed = { ...state.bed, ...data } } },
    appointment: {
      findUnique: async () => state.appointment,
      update: async ({ data }: any) => { state.appointment = { ...state.appointment, status: data.status }; return state.appointment },
    },
    patientPayment: {
      updateMany: async ({ where }: any) => ({ count: state.payment.status === where.status && state.payment.providerPaymentId === where.providerPaymentId ? 1 : 0 }),
      findUnique: async () => state.payment,
    },
    clinicalAuditLog: { create: async ({ data }: any) => { state.audit.push(data); return { id: 'a' } } },
    clinicalOutboxEvent: { create: async ({ data }: any) => { state.outbox.push(data); return { id: 'o' } } },
  }
  return {
    ...tx,
    bedReservation: { ...tx.bedReservation, findMany: async () => (state.reservation?.status === 'active' ? [state.reservation] : []) },
    appointment: { ...tx.appointment, findMany: async () => (state.appointment?.status === 'requested' ? [state.appointment] : []) },
    $transaction: async (fn: any) => fn(tx),
  }
}

test('expired bed hold is released and the reserved bed becomes available, once', async () => {
  const now = new Date('2026-01-01T12:00:00Z')
  const state: any = { reservation: { id: 'r', bedId: 'b', status: 'active', expiresAt: new Date('2026-01-01T11:00:00Z'), transitionVersion: 1, facilityId: 'f', patientId: 'p' }, bed: { id: 'b', status: 'reserved', currentPatientId: null }, audit: [], outbox: [] }
  const prisma = fakePrisma(state)
  assert.equal(await expireBedReservations(prisma, now), 1)
  assert.equal(state.reservation.status, 'expired')
  assert.equal(state.bed.status, 'available')
  assert.equal(await expireBedReservations(prisma, now), 0)
})

test('an occupied bed is not freed when its stale hold expires', async () => {
  const now = new Date('2026-01-01T12:00:00Z')
  const state: any = { reservation: { id: 'r', bedId: 'b', status: 'active', expiresAt: new Date('2026-01-01T11:00:00Z'), transitionVersion: 1, facilityId: 'f', patientId: 'p' }, bed: { id: 'b', status: 'occupied', currentPatientId: 'p' }, audit: [], outbox: [] }
  await expireBedReservations(fakePrisma(state), now)
  assert.equal(state.bed.status, 'occupied')
})

test('requested appointment past its slot is cancelled with audit and outbox; a future one is untouched', async () => {
  const now = new Date('2026-01-01T12:00:00Z')
  const state: any = { appointment: { id: 'a', status: 'requested', endsAt: new Date('2026-01-01T09:00:00Z'), transitionVersion: 1, facilityId: 'f', patientId: 'p' }, audit: [], outbox: [] }
  assert.equal(await expireUnconfirmedAppointments(fakePrisma(state), now), 1)
  assert.equal(state.appointment.status, 'cancelled')
  assert.equal(state.outbox.length, 1)
  const future: any = { appointment: { id: 'a', status: 'requested', endsAt: new Date('2026-01-01T12:30:00Z'), transitionVersion: 1, facilityId: 'f', patientId: 'p' }, audit: [], outbox: [] }
  assert.equal(await expireUnconfirmedAppointments(fakePrisma(future), now), 0)
  assert.equal(future.appointment.status, 'requested')
})

test('expired payment session reset only applies to the same dead session', async () => {
  const state: any = { payment: { id: 'x', status: 'pending', providerPaymentId: 'cs_old', transitionVersion: 2, facilityId: 'f', patientId: 'p' }, audit: [], outbox: [] }
  const prisma = fakePrisma(state)
  assert.equal(await resetExpiredPaymentSession(prisma, 'x', 'cs_other'), false)
})
