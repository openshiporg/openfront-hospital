// Drains the external integration outbox inside the production web process, so a deploy without the separate
// `npm run worker:outbox` service still delivers queued patient messages and integration events. Claims use
// FOR UPDATE SKIP LOCKED with leases, so this runs safely beside that worker or other replicas.
const INTERVAL_MS = 60_000

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.NODE_ENV !== 'production') return
  if (process.env.OUTBOX_IN_PROCESS === '0') return
  const state = globalThis as unknown as { hospitalOutboxLoop?: boolean }
  if (state.hospitalOutboxLoop) return
  state.hospitalOutboxLoop = true
  const [{ PrismaClient }, { pooledPrismaOptions }, { dispatchExternalOutbox }] = await Promise.all([
    import('@prisma/client'),
    import('./features/keystone/database-url'),
    import('./features/keystone/integrations/outboxWorker'),
  ])
  const prisma = new PrismaClient(pooledPrismaOptions('worker'))
  let running = false
  let maintaining = false
  // Time-based states settle here every minute: expired bed holds, unconfirmed requests past their slot, and card
  // payments whose Checkout Session sat unconfirmed for 10 minutes (payment sweep; covers a payer who never returns).
  const maintain = async () => {
    if (maintaining) return
    maintaining = true
    try {
      const { runHospitalMaintenance } = await import('./features/keystone/mutations/operational/maintenance')
      await runHospitalMaintenance(prisma, async paymentId => {
        const [{ keystoneContext }, { settleFromProvider }, { PAYMENT_SWEEP_ACTOR }] = await Promise.all([
          import('./features/keystone/context'),
          import('./features/keystone/mutations/payments/patientBillPayments'),
          import('./features/keystone/mutations/operational/maintenance'),
        ])
        return settleFromProvider(keystoneContext, { id: paymentId }, PAYMENT_SWEEP_ACTOR)
      })
    } catch (error) {
      console.error(JSON.stringify({ component: 'hospital-maintenance', status: 'failed', error: error instanceof Error ? error.message : String(error) }))
    } finally { maintaining = false }
  }
  const pass = async () => {
    if (running) return
    running = true
    try { await dispatchExternalOutbox(prisma, 25) } catch (error) {
      console.error(JSON.stringify({ component: 'hospital-web-outbox', status: 'failed', error: error instanceof Error ? error.message : String(error) }))
    } finally { running = false }
  }
  setInterval(() => { void pass(); void maintain() }, INTERVAL_MS).unref?.()
  setTimeout(() => { void pass(); void maintain() }, 15_000).unref?.()
}
