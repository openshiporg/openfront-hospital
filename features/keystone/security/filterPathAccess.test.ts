// Filter-path leak proof: a role must not learn hidden values by counting rows through a where-filter.
// Needs a migrated scratch DATABASE_URL (skips without one). Run:
//   DATABASE_URL=<scratch> node --import tsx --test features/keystone/security/filterPathAccess.test.ts
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'

const enabled = /scratch_/.test(process.env.DATABASE_URL || '')

const FLAGS = ['canManageAppointments', 'canManageScheduling', 'canManagePatients', 'canManageProviders', 'canManageIntake',
  'canManageCommunications', 'canManageBilling', 'canManageInventory', 'canManageIntegrations', 'canManageDataPortability',
  'canManageRetention', 'canViewReports', 'canManageOnboarding', 'canSeeOtherPeople', 'canEditOtherPeople', 'canManagePeople',
  'canManageRoles', 'canAccessDashboard', 'canAccessAllClinicalData'] as const

// The live hospital roles (flags read from hospital.openship.org, 2026-11-13).
const ROLES: Record<string, string[]> = {
  'Front Desk': ['canManageAppointments', 'canManageScheduling', 'canManagePatients', 'canManageIntake', 'canAccessDashboard'],
  'Billing Specialist': ['canManagePatients', 'canManageBilling', 'canAccessDashboard'],
  'Inventory Coordinator': ['canManageInventory', 'canAccessDashboard'],
  'Care Communications': ['canManageAppointments', 'canManageCommunications', 'canAccessDashboard'],
  'Compliance Officer': ['canManageDataPortability', 'canManageRetention', 'canViewReports', 'canAccessDashboard'],
  'Practice Manager': ['canManageProviders', 'canManageIntegrations', 'canViewReports', 'canManageOnboarding', 'canSeeOtherPeople', 'canManagePeople', 'canAccessDashboard'],
  'Dashboard Only': ['canAccessDashboard'],
}

// Each probe: a where-filter whose leaf value is hidden from limited roles. Hit = value that exists, miss = one that does not.
// canRead: the role may read the leaf value, so a differing count is its own data, not a leak.
const PHI = (f: string[]) => ['canManagePatients', 'canManageAppointments', 'canManageIntake', 'canManageCommunications', 'canManageBilling', 'canManageDataPortability', 'canManageRetention'].some(x => f.includes(x))
const PROBES: Array<{ name: string; list: string; where: (v: string) => any; hit: string; miss: string; canRead: (f: string[]) => boolean }> = [
  { name: 'beds via currentPatient.firstName', list: 'bedsCount', where: v => ({ currentPatient: { firstName: { startsWith: v } } }), hit: 'Ama', miss: 'Zqx', canRead: PHI },
  { name: 'facilities via patients.email', list: 'facilitiesCount', where: v => ({ patients: { some: { email: { startsWith: v } } } }), hit: 'ama', miss: 'zqx', canRead: PHI },
  { name: 'appointments via patient.lastName', list: 'appointmentsCount', where: v => ({ patient: { lastName: { startsWith: v } } }), hit: 'Fil', miss: 'Zqx', canRead: PHI },
  { name: 'appointment types via appointments.patient.phone', list: 'appointmentTypesCount', where: v => ({ appointments: { some: { patient: { phone: { startsWith: v } } } } }), hit: '555', miss: '999', canRead: () => false },
  { name: 'roles via assignedTo.name', list: 'rolesCount', where: v => ({ assignedTo: { some: { name: { startsWith: v } } } }), hit: 'Hidden', miss: 'Zqx', canRead: f => f.includes('canSeeOtherPeople') },
  { name: 'facilities via staff.name', list: 'facilitiesCount', where: v => ({ staff: { some: { name: { startsWith: v } } } }), hit: 'Hidden', miss: 'Zqx', canRead: f => f.includes('canSeeOtherPeople') },
  { name: 'patients by own firstName', list: 'patientsCount', where: v => ({ firstName: { startsWith: v } }), hit: 'Ama', miss: 'Zqx', canRead: PHI },
  { name: 'payments by amountCents', list: 'patientPaymentsCount', where: v => ({ amountCents: { gt: Number(v) } }), hit: '0', miss: '999999', canRead: f => f.includes('canManageBilling') },
  { name: 'appointments by reasonForVisit', list: 'appointmentsCount', where: v => ({ reasonForVisit: { startsWith: v } }), hit: 'Sec', miss: 'Zqx', canRead: f => f.includes('canManageAppointments') || f.includes('canManagePatients') },
]

async function count(context: any, list: string, where: any): Promise<number | string> {
  const res = await context.graphql.raw({ query: `query($w: ${typeName(list)}!) { n: ${list}(where: $w) }`, variables: { w: where } })
  if (res.errors?.length) return 'error'
  return res.data?.n ?? 'null'
}
function typeName(countField: string) {
  const plural = countField.replace(/Count$/, '')
  const map: Record<string, string> = { beds: 'Bed', facilities: 'Facility', appointments: 'Appointment', appointmentTypes: 'AppointmentType', roles: 'Role', patients: 'Patient', patientPayments: 'PatientPayment' }
  return `${map[plural]}WhereInput`
}

test('limited roles and signed-out visitors get the same answer for every probe value', { skip: !enabled && 'needs a scratch DATABASE_URL' }, async () => {
  const { keystoneContext: context } = await import('../context')
  const db = context.sudo().prisma as any
  const tag = `flt${Date.now()}`
  const facility = await db.facility.create({ data: { name: `Facility ${tag}`, slug: tag } })
  const hiddenRole = await db.role.create({ data: { name: `Hidden ${tag}` } })
  const hiddenUser = await db.user.create({ data: { name: `Hidden person ${tag}`, email: `hidden-${tag}@example.com`, password: 'x'.repeat(60), roleId: hiddenRole.id } })
  const patient = await db.patient.create({ data: { firstName: 'Amara', lastName: 'Filtertest', email: `amara-${tag}@example.com`, phone: '5550100', facilities: { connect: { id: facility.id } } } })
  const provider = await db.provider.create({ data: { firstName: "Pat", lastName: "Provider", facilities: { connect: { id: facility.id } } } })
  const type = await db.appointmentType.create({ data: { name: `Visit ${tag}`, slug: `visit-${tag}` } })
  await db.appointment.create({ data: { appointmentNumber: `APT-${tag}`, patientId: patient.id, providerId: provider.id, facilityId: facility.id, appointmentTypeId: type.id, startsAt: new Date(), endsAt: new Date(Date.now() + 1800e3), reasonForVisit: 'Secret reason', bookingLockKey: `lock-${tag}` } })
  const dept = await db.department.create({ data: { name: `Dept ${tag}`, code: `D-${tag}`, facilities: { connect: { id: facility.id } } } })
  const ward = await db.ward.create({ data: { name: `Ward ${tag}`, departmentId: dept.id } })
  const room = await db.room.create({ data: { roomNumber: `R-${tag}`, wardId: ward.id } })
  await db.bed.create({ data: { bedNumber: `B-${tag}`, facilityId: facility.id, roomId: room.id, status: "occupied", currentPatientId: patient.id } })
  await db.facility.update({ where: { id: facility.id }, data: { staff: { connect: { id: hiddenUser.id } } } })
  const h = (x: string) => createHash('sha256').update(x).digest('hex')
  await db.patientPayment.create({ data: { paymentNumber: `PAY-${tag}`, facilityId: facility.id, patientId: patient.id, amountCents: 5000, method: 'card', operationKeyHash: h(`op-${tag}`), requestHash: h('r'), actorReference: 'a' } })

  const rows: string[] = []
  const leaks: string[] = []
  const sessions: Array<[string, any, string[]]> = [['signed out', null, []]]
  for (const [roleName, flags] of Object.entries(ROLES)) {
    const role = await db.role.create({ data: { name: `${roleName} ${tag}`, ...Object.fromEntries(flags.map(f => [f, true])) } })
    const user = await db.user.create({ data: { name: `${roleName} user ${tag}`, email: `${roleName.replace(/\W/g, '').toLowerCase()}-${tag}@example.com`, password: 'x'.repeat(60), roleId: role.id, facilities: { connect: { id: facility.id } } } })
    sessions.push([roleName, { itemId: user.id, listKey: 'User', data: { name: user.name, role: { id: role.id, name: role.name, ...Object.fromEntries(FLAGS.map(f => [f, flags.includes(f)])) } } }, flags])
  }
  const kept: string[] = []
  for (const [label, session, flags] of sessions) {
    const ctx = session ? context.withSession(session) : context.withSession(undefined as any)
    for (const p of PROBES) {
      const hit = await count(ctx, p.list, p.where(p.hit))
      const miss = await count(ctx, p.list, p.where(p.miss))
      rows.push(`${label} | ${p.name} | hit=${hit} miss=${miss}`)
      if (p.canRead(flags)) { if (hit !== miss) kept.push(`${label}: ${p.name}`) }
      else if (hit !== miss) leaks.push(`${label}: ${p.name} (${hit} vs ${miss})`)
    }
  }
  // Admin keeps its real filters.
  const admin = context.withSession({ itemId: hiddenUser.id, listKey: 'User', data: { name: 'admin', role: { id: 'x', name: 'admin', ...Object.fromEntries(FLAGS.map(f => [f, true])) } } } as any)
  const adminHit = await count(admin, 'bedsCount', { currentPatient: { firstName: { startsWith: 'Ama' } } })
  const adminMiss = await count(admin, 'bedsCount', { currentPatient: { firstName: { startsWith: 'Zqx' } } })
  rows.push(`admin | beds via currentPatient.firstName | hit=${adminHit} miss=${adminMiss}`)
  console.log(rows.join('\n'))
  assert.deepEqual(leaks, [])
  // Roles that may read a value keep a working filter on it (Front Desk on patient names, Billing on amounts).
  assert.ok(kept.includes('Front Desk: beds via currentPatient.firstName'))
  assert.ok(kept.includes('Billing Specialist: payments by amountCents'))
  assert.ok(typeof adminHit === 'number' && adminHit >= 1, 'admin finds the bed by patient name')
  assert.equal(adminMiss, 0)
  await context.prisma.$disconnect()
})
