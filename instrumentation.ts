// Time-based states settle here every minute: expired bed holds, unconfirmed requests past their slot, and card
// payments whose Checkout Session sat unconfirmed for 10 minutes (payment sweep; covers a payer who never returns).
// Runs inside the web process only; there is no separate worker service. Every sweep is idempotent and compare-and-set.
const INTERVAL_MS = 60_000

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.NODE_ENV !== 'production') return
  const state = globalThis as unknown as { hospitalMaintenanceLoop?: boolean }
  if (state.hospitalMaintenanceLoop) return
  state.hospitalMaintenanceLoop = true
  const [{ PrismaClient }, { pooledPrismaOptions }] = await Promise.all([
    import('@prisma/client'),
    import('./features/keystone/database-url'),
  ])
  const prisma = new PrismaClient(pooledPrismaOptions('worker'))
  let maintaining = false
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
  setInterval(() => { void maintain() }, INTERVAL_MS).unref?.()
  setTimeout(() => { void maintain() }, 15_000).unref?.()
}
