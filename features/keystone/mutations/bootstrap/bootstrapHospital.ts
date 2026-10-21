import { Prisma } from '@prisma/client'
import type { Context } from '.keystone/types'

import { safeEqualText } from '../../integrations/crypto'

function bounded(value: unknown, label: string, maximum: number) {
  const text = String(value || '').trim()
  if (!text || text.length > maximum || /[\u0000-\u001f\u007f]/.test(text)) throw new Error(`${label} is invalid`)
  return text
}

export default async function bootstrapHospital(
  _root: unknown,
  { secret, data }: { secret: string; data: { name: string; email: string; password: string } },
  context: Context,
) {
  const configured = String(process.env.BOOTSTRAP_ADMIN_SECRET || '')
  if (configured.length < 48 || !secret || !safeEqualText(configured, String(secret))) {
    throw new Error('Hospital initialization is unavailable')
  }
  const name = bounded(data?.name, 'Administrator name', 150)
  const email = bounded(data?.email, 'Administrator email', 254).toLowerCase()
  const password = bounded(data?.password, 'Administrator password', 200)
  if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 16) throw new Error('Administrator details are invalid')

  return context.transaction(async (transactionContext: any) => {
    const sudo = transactionContext.sudo()
    // Keystone 6.5 declares `isolationLevel` as the enum object while Prisma expects the
    // string, so set it as the transaction's first statement (as in labResultRecovery.ts).
    await sudo.prisma.$executeRaw(Prisma.sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`)
    await sudo.prisma.$queryRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended('hospital-private-bootstrap', 0))::text AS "lock"`,
    )
    if (await sudo.prisma.user.count() !== 0) return { status: 'already_initialized' }
    await sudo.db.User.createOne({
      data: {
        name,
        email,
        password,
        onboardingStatus: 'not_started',
        role: {
          create: {
            name: 'Global Clinical Administrator',
            canManageAppointments: true,
            canManageScheduling: true,
            canManagePatients: true,
            canManageProviders: true,
            canManageIntake: true,
            canManageCommunications: true,
            canManageBilling: true,
            canManageInventory: true,
            canManageIntegrations: true,
            canManageDataPortability: true,
            canManageRetention: true,
            canViewReports: true,
            canManageOnboarding: true,
            canSeeOtherPeople: true,
            canEditOtherPeople: true,
            canManagePeople: true,
            canManageRoles: true,
            canAccessDashboard: true,
            canAccessAllClinicalData: true,
          },
        },
      },
      query: 'id',
    })
    return { status: 'created' }
  }, { timeout: 30_000 })
}
