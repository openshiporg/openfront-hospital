import assert from 'node:assert/strict'
import test from 'node:test'

import { advanceTimedStates, expireBedReservations, expireUnconfirmedAppointments, PAYMENT_SWEEP_ACTOR, reconcileStalePayments, resetExpiredPaymentSession, STALE_PAYMENT_MS } from './maintenance'

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
  const state: any = { reservation: { id: 'r', bedId: 'b', status: 'active', expiresAt: new Date('2026-01-01T11:00:00Z'), transitionVersion: 1, facilityId: 'f', patientId: 'p' }, bed: { id: 'b', status: 'reserved', currentPatientId: null }, audit: [] }
  const prisma = fakePrisma(state)
  assert.equal(await expireBedReservations(prisma, now), 1)
  assert.equal(state.reservation.status, 'expired')
  assert.equal(state.bed.status, 'available')
  assert.equal(await expireBedReservations(prisma, now), 0)
})

test('an occupied bed is not freed when its stale hold expires', async () => {
  const now = new Date('2026-01-01T12:00:00Z')
  const state: any = { reservation: { id: 'r', bedId: 'b', status: 'active', expiresAt: new Date('2026-01-01T11:00:00Z'), transitionVersion: 1, facilityId: 'f', patientId: 'p' }, bed: { id: 'b', status: 'occupied', currentPatientId: 'p' }, audit: [] }
  await expireBedReservations(fakePrisma(state), now)
  assert.equal(state.bed.status, 'occupied')
})

test('requested appointment past its slot is cancelled with audit; a future one is untouched', async () => {
  const now = new Date('2026-01-01T12:00:00Z')
  const state: any = { appointment: { id: 'a', status: 'requested', endsAt: new Date('2026-01-01T09:00:00Z'), transitionVersion: 1, facilityId: 'f', patientId: 'p' }, audit: [] }
  assert.equal(await expireUnconfirmedAppointments(fakePrisma(state), now), 1)
  assert.equal(state.appointment.status, 'cancelled')
  assert.equal(state.audit.length, 1)
  const future: any = { appointment: { id: 'a', status: 'requested', endsAt: new Date('2026-01-01T12:30:00Z'), transitionVersion: 1, facilityId: 'f', patientId: 'p' }, audit: [] }
  assert.equal(await expireUnconfirmedAppointments(fakePrisma(future), now), 0)
  assert.equal(future.appointment.status, 'requested')
})

test('expired payment session reset only applies to the same dead session', async () => {
  const state: any = { payment: { id: 'x', status: 'pending', providerPaymentId: 'cs_old', transitionVersion: 2, facilityId: 'f', patientId: 'p' }, audit: [] }
  const prisma = fakePrisma(state)
  assert.equal(await resetExpiredPaymentSession(prisma, 'x', 'cs_other'), false)
})

test('payment sweep: only card checkouts with a session left unconfirmed 10+ minutes are settled, each through settle()', async () => {
  const now = new Date('2026-01-01T12:00:00Z')
  let query: any
  const prisma = { patientPayment: { findMany: async (args: any) => { query = args; return [{ id: 'p1' }, { id: 'p2' }] } } }
  const settled: string[] = []
  const touched = await reconcileStalePayments(prisma, async id => { settled.push(id); if (id === 'p2') throw new Error('Provider amount mismatch; reconciliation required') }, now)
  assert.equal(STALE_PAYMENT_MS, 10 * 60_000)
  assert.deepEqual(query.where, { status: 'pending', method: 'card_online', providerPaymentId: { not: null }, updatedAt: { lte: new Date('2026-01-01T11:50:00Z') } })
  assert.deepEqual(settled, ['p1', 'p2'])
  assert.equal(touched, 1, 'a refused settle is logged and skipped, not counted, and does not stop the batch')
})

test('payment sweep: an expired session is cleared once under the sweep actor; the bill stays owed', async () => {
  const state: any = { payment: { id: 'x', status: 'pending', providerPaymentId: 'cs_old', transitionVersion: 2, facilityId: 'f', patientId: 'p' }, audit: [] }
  const prisma = fakePrisma(state)
  assert.equal(await resetExpiredPaymentSession(prisma, 'x', 'cs_old', new Date(), PAYMENT_SWEEP_ACTOR), true)
  assert.equal(state.audit[0].actorReference, PAYMENT_SWEEP_ACTOR)
  assert.equal(state.audit[0].metadata.source, 'payment_sweep')
  state.payment = { ...state.payment, providerPaymentId: null }
  assert.equal(await resetExpiredPaymentSession(prisma, 'x', 'cs_old', new Date(), PAYMENT_SWEEP_ACTOR), false, 'a second sweep finds nothing to clear')
})

test('advanceTimedStates settles on read, shares a pass within the gap, and a forced pass runs again', async () => {
  const state: any = { reservation: { id: 'r', bedId: 'b', status: 'active', expiresAt: new Date(Date.now() - 60_000), transitionVersion: 1, facilityId: 'f', patientId: 'p' }, bed: { id: 'b', status: 'reserved', currentPatientId: null }, audit: [] }
  const prisma = fakePrisma(state)
  ;(globalThis as any).hospitalAdvance = undefined
  const first: any = await advanceTimedStates(prisma)
  assert.equal(first.bedReservations, 1)
  assert.equal(state.reservation.status, 'expired')
  assert.equal(await advanceTimedStates(prisma), null)
  const forced: any = await advanceTimedStates(prisma, { force: true })
  assert.equal(forced.bedReservations, 0)
})
