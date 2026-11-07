import { Prisma } from '@prisma/client'

import { appendAuditAndOutbox } from './evidence'

// Time-based state settlement. There is no scheduler besides the in-process loop in instrumentation.ts, so every
// sweep is idempotent, compare-and-set, and safe to run beside other replicas.
const SYSTEM_ACTOR = 'system_maintenance'
export const REQUEST_GRACE_MS = 60 * 60_000
/** A Checkout Session left unconfirmed this long is settled by the sweep (the payer may never load the return page). */
export const STALE_PAYMENT_MS = 10 * 60_000
export const PAYMENT_SWEEP_ACTOR = 'payment_sweep'

async function lock(tx: any, key: string) {
  await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text AS "lock"`)
}

/** Active bed holds past expiresAt become expired and the held bed returns to available. */
export async function expireBedReservations(prisma: any, now = new Date(), limit = 50) {
  const due = await prisma.bedReservation.findMany({ where: { status: 'active', expiresAt: { lte: now } }, select: { id: true, bedId: true }, orderBy: { expiresAt: 'asc' }, take: limit })
  let expired = 0
  for (const row of due) {
    const done = await prisma.$transaction(async (tx: any) => {
      await lock(tx, `bed:${row.bedId}`)
      const current = await tx.bedReservation.findUnique({ where: { id: row.id } })
      if (!current || current.status !== 'active' || current.expiresAt > now) return false
      const updated = await tx.bedReservation.update({ where: { id: current.id }, data: { status: 'expired', transitionVersion: { increment: 1 }, releasedAt: now, actorReference: SYSTEM_ACTOR } })
      const bed = await tx.bed.findUnique({ where: { id: current.bedId } })
      if (bed && bed.status === 'reserved' && !bed.currentPatientId) {
        await tx.bed.update({ where: { id: bed.id }, data: { status: 'available', transitionVersion: { increment: 1 } } })
      }
      await appendAuditAndOutbox(tx, {
        eventKey: `bed_reservation:${updated.id}:v${updated.transitionVersion}:expired`, eventType: 'bed_reservation.expired',
        aggregateType: 'bed_reservation', aggregateId: updated.id, facilityId: updated.facilityId, patientId: updated.patientId,
        actorReference: SYSTEM_ACTOR, occurredAt: now,
        metadata: { source: 'maintenance_sweep', aggregateId: updated.id, bedId: updated.bedId, fromStatus: 'active', status: 'expired', transitionVersion: updated.transitionVersion },
      })
      return true
    }, { timeout: 30_000 })
    if (done) expired += 1
  }
  return expired
}

/** Portal requests nobody confirmed before the slot ended are cancelled, which frees the slot and the request cap. */
export async function expireUnconfirmedAppointments(prisma: any, now = new Date(), limit = 50) {
  const cutoff = new Date(now.getTime() - REQUEST_GRACE_MS)
  const due = await prisma.appointment.findMany({ where: { status: 'requested', endsAt: { lte: cutoff } }, select: { id: true }, orderBy: { endsAt: 'asc' }, take: limit })
  let expired = 0
  for (const row of due) {
    const done = await prisma.$transaction(async (tx: any) => {
      await lock(tx, `appointment:${row.id}`)
      const current = await tx.appointment.findUnique({ where: { id: row.id } })
      if (!current || current.status !== 'requested' || current.endsAt > cutoff) return false
      const nextVersion = current.transitionVersion + 1
      const updated = await tx.appointment.update({ where: { id: current.id }, data: {
        status: 'cancelled', transitionVersion: nextVersion, cancellationReason: 'Request expired: not confirmed before the appointment time',
        bookingLockKey: `released:${current.id}:${now.getTime()}`,
      } })
      const metadata = { source: 'maintenance_sweep', aggregateType: 'appointment', aggregateId: current.id, fromStatus: 'requested', status: 'cancelled', transitionVersion: nextVersion, reasonProvided: true }
      await tx.clinicalAuditLog.create({ data: { eventType: 'appointment.cancelled', occurredAt: now, actorType: 'system', actorReference: SYSTEM_ACTOR, facilityId: current.facilityId, patientId: current.patientId, appointmentId: current.id, metadata } })
      await tx.clinicalOutboxEvent.create({ data: { eventKey: `appointment:${current.id}:v${nextVersion}:${updated.status}`, eventType: 'appointment.cancelled', aggregateType: 'appointment', aggregateId: current.id, status: 'recorded', attempts: 0, nextAttemptAt: null, facilityId: current.facilityId, patientId: current.patientId, appointmentId: current.id, payload: metadata } })
      return true
    }, { timeout: 30_000 })
    if (done) expired += 1
  }
  return expired
}

/**
 * Pending online card payments whose Checkout Session has sat unconfirmed for STALE_PAYMENT_MS: ask the provider
 * (the authority) through the same settle path as the return page. Paid settles, with the same amount/currency
 * check and compare-and-set; an expired session clears the dead link so the bill (still owed) can be paid afresh.
 * The session reference is written when checkout starts, which bumps updatedAt, so the age is measured from there.
 * Only rows that have a session are selected, so never-started bills can't crowd the batch.
 */
export async function reconcileStalePayments(prisma: any, settle: (paymentId: string) => Promise<unknown>, now = new Date(), limit = 25) {
  const cutoff = new Date(now.getTime() - STALE_PAYMENT_MS)
  const stale = await prisma.patientPayment.findMany({
    where: { status: 'pending', method: 'card_online', providerPaymentId: { not: null }, updatedAt: { lte: cutoff } },
    select: { id: true }, orderBy: { updatedAt: 'asc' }, take: limit,
  })
  let touched = 0
  for (const payment of stale) {
    try { await settle(payment.id); touched += 1 } catch (error) {
      console.error(JSON.stringify({ component: 'hospital-maintenance', task: 'payment-sweep', paymentId: payment.id, error: error instanceof Error ? error.message : String(error) }))
    }
  }
  return touched
}

/**
 * A Checkout Session that expired unpaid leaves the bill pointing at a dead link. The bill itself is still owed,
 * so it stays pending; the dead session reference is cleared (compare-and-set on the reference) and the version
 * bumped so the next attempt gets a fresh provider idempotency key and a new session.
 */
export async function resetExpiredPaymentSession(prisma: any, paymentId: string, expiredSessionId: string, now = new Date(), actorReference = SYSTEM_ACTOR) {
  return prisma.$transaction(async (tx: any) => {
    await lock(tx, `payment:${paymentId}`)
    const reset = await tx.patientPayment.updateMany({
      where: { id: paymentId, status: 'pending', providerPaymentId: expiredSessionId },
      data: { providerPaymentId: null, transitionVersion: { increment: 1 }, actorReference },
    })
    if (reset.count !== 1) return false
    const current = await tx.patientPayment.findUnique({ where: { id: paymentId } })
    await appendAuditAndOutbox(tx, {
      eventKey: `payment:${paymentId}:v${current.transitionVersion}:session_expired`, eventType: 'payment.session_expired', aggregateType: 'payment', aggregateId: paymentId,
      facilityId: current.facilityId, patientId: current.patientId, actorReference, occurredAt: now,
      metadata: { source: actorReference === PAYMENT_SWEEP_ACTOR ? 'payment_sweep' : 'maintenance_sweep', aggregateId: paymentId, status: 'pending', transitionVersion: current.transitionVersion },
    })
    return true
  }, { timeout: 30_000 })
}

export async function runHospitalMaintenance(prisma: any, settle: (paymentId: string) => Promise<unknown>, now = new Date()) {
  const bedReservations = await expireBedReservations(prisma, now)
  const appointments = await expireUnconfirmedAppointments(prisma, now)
  const payments = await reconcileStalePayments(prisma, settle, now)
  return { bedReservations, appointments, payments }
}
