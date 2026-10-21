import { Prisma } from '@prisma/client'
import type { Context } from '.keystone/types'

type Capability = 'canManagePatients' | 'canManageIntake' | 'canManageRetention' | 'canManageDataPortability'
/** Transaction-local human authority. Physical locks participate with ordinary
 * User/Role writers; the returned Context carries the current role, not request-entry flags. */
export async function currentHospitalActor(context: Context, capabilities: readonly Capability[]) {
  const session = context.session
  if (session?.listKey !== 'User' || !session.itemId) throw new Error('Current human authority could not be verified')
  const rows = await context.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT u."id" FROM "User" u JOIN "Role" r ON r."id" = u."role"
    WHERE u."id" = ${session.itemId} FOR SHARE OF u, r`)
  if (rows.length !== 1) throw new Error('Current human authority could not be verified')
  const user = await context.prisma.user.findUnique({ where: { id: session.itemId }, select: { id: true, name: true, securityVersion: true, role: true } })
  if (!user?.role || !Number.isInteger(session.data?.securityVersion) || session.data.securityVersion !== user.securityVersion || !capabilities.some(capability => user.role?.[capability] === true)) {
    throw new Error('Current human capability or credential version could not be verified')
  }
  return context.withSession({ itemId: user.id, listKey: 'User', data: { name: user.name, securityVersion: user.securityVersion, role: user.role } })
}

/** SHARE fences deactivation and existing membership removal while remaining
 * compatible with FK KEY SHARE reads by other append-only writers. */
export async function lockCurrentHospitalFacility(context: Context, facilityId: string) {
  await context.prisma.$queryRaw(Prisma.sql`SELECT "id" FROM "Facility" WHERE "id" = ${facilityId} FOR SHARE`)
  const facility = await context.query.Facility.findOne({ where: { id: facilityId }, query: 'id status' })
  if (!facility || facility.status !== 'active') throw new Error('Current facility scope could not be verified')
  const staff = await context.prisma.$queryRaw<Array<{ A: string }>>(Prisma.sql`SELECT "A" FROM "_Facility_staff" WHERE "A" = ${facilityId} AND "B" = ${context.session!.itemId} FOR SHARE`)
  if (!context.session?.data.role?.canAccessAllClinicalData && staff.length !== 1) throw new Error('Current facility membership could not be verified')
}
