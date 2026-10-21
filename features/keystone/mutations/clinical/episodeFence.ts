import { Prisma } from '@prisma/client'
import { episodeEligibility, episodeTuple, validateEpisodePolicy, type EpisodeAction } from './episodePolicy'

export const EPISODE_DENIED = 'Current episode authority or scope could not be verified'
export const EPISODE_UNAVAILABLE = 'Episode policy storage is unavailable; additive schema/generation/migration gate is required'
const encounterSelection = 'id status transitionVersion facility { id } patient { id } provider { id } appointment { id }'

/** Call ONLY inside context.transaction / the caller's serializable transaction.
 * Physical row locks (not advisory locks alone) also fence ordinary inverse/raw
 * SQL writers. User/Role locks protect current authority until commit. */
export async function currentEpisodeActor(context: any, permission: 'clinical' | 'billing' | 'configure' | 'appointments' | 'queue' = 'clinical') {
  const session = context.session
  if (session?.listKey !== 'User' || !session.itemId) throw new Error(EPISODE_DENIED)
  const rows: any[] = await context.prisma.$queryRaw(Prisma.sql`
    SELECT u."id" FROM "User" u JOIN "Role" r ON r."id" = u."role"
    WHERE u."id" = ${session.itemId} FOR SHARE OF u, r`)
  if (!rows.length) throw new Error(EPISODE_DENIED)
  // Minimal internal authority material; never returned as a PHI projection.
  const user = await context.prisma.user.findUnique({ where: { id: session.itemId }, select: { id: true, name: true, securityVersion: true, role: true } })
  if (!user?.role || Number(session.data?.securityVersion || 1) !== Number(user.securityVersion || 1)) throw new Error(EPISODE_DENIED)
  const role = user.role
  const allowed = permission === 'configure'
    ? role.canManageRoles === true && role.canManagePatients === true
    : role.canAccessAllClinicalData === true || (permission === 'billing' ? role.canManageBilling === true
      : permission === 'appointments' ? role.canManageAppointments === true
        : permission === 'queue' ? role.canManageAppointments === true || role.canManagePatients === true : role.canManagePatients === true)
  if (!allowed) throw new Error(EPISODE_DENIED)
  return context.withSession({ itemId: user.id, listKey: 'User', data: { name: user.name, securityVersion: user.securityVersion, role } })
}

export async function lockEpisodeFacility(context: any, facilityId: string, providerId?: string | null) {
  const prisma = context.prisma
  await prisma.$queryRaw(Prisma.sql`SELECT "id" FROM "Facility" WHERE "id" = ${facilityId} FOR UPDATE`)
  const facility = await context.query.Facility.findOne({ where: { id: facilityId }, query: 'id status' })
  if (!facility || facility.status !== 'active') throw new Error(EPISODE_DENIED)
  const staff: any[] = await prisma.$queryRaw(Prisma.sql`SELECT "A" FROM "_Facility_staff" WHERE "A" = ${facilityId} AND "B" = ${context.session.itemId} FOR SHARE`)
  if (!context.session.data.role.canAccessAllClinicalData && !staff.length) {
    if (!providerId) throw new Error(EPISODE_DENIED)
    await prisma.$queryRaw(Prisma.sql`SELECT "id" FROM "Provider" WHERE "id" = ${providerId} FOR SHARE`)
    const provider = await prisma.provider.findUnique({ where: { id: providerId }, select: { userId: true } })
    if (provider?.userId !== context.session.itemId) throw new Error(EPISODE_DENIED)
  }
}

export async function lockEpisodePatientProvider(context: any, facilityId: string, patientId: string, providerId?: string | null) {
  await context.prisma.$queryRaw(Prisma.sql`SELECT "id" FROM "Patient" WHERE "id" = ${patientId} FOR SHARE`)
  const patientLinks: any[] = await context.prisma.$queryRaw(Prisma.sql`SELECT "A" FROM "_Facility_patients" WHERE "A" = ${facilityId} AND "B" = ${patientId} FOR SHARE`)
  const patient = await context.query.Patient.findOne({ where: { id: patientId }, query: 'id status' })
  if (!patientLinks.length || patient?.status !== 'active') throw new Error(EPISODE_DENIED)
  if (providerId) {
    await context.prisma.$queryRaw(Prisma.sql`SELECT "id" FROM "Provider" WHERE "id" = ${providerId} FOR SHARE`)
    const providerLinks: any[] = await context.prisma.$queryRaw(Prisma.sql`SELECT "A" FROM "_Facility_providers" WHERE "A" = ${facilityId} AND "B" = ${providerId} FOR SHARE`)
    const provider = await context.query.Provider.findOne({ where: { id: providerId }, query: 'id status' })
    if (!providerLinks.length || provider?.status !== 'active') throw new Error(EPISODE_DENIED)
  }
}

export async function lockCurrentEncounter(context: any, encounterId: string) {
  let encounter = await context.query.Encounter.findOne({ where: { id: encounterId }, query: encounterSelection })
  if (!encounter?.facility?.id || !encounter.patient?.id || !encounter.provider?.id) throw new Error(EPISODE_DENIED)
  await lockEpisodeFacility(context, encounter.facility.id, encounter.provider.id)
  await context.prisma.$queryRaw(Prisma.sql`SELECT "id" FROM "Encounter" WHERE "id" = ${encounterId} FOR UPDATE`)
  encounter = await context.query.Encounter.findOne({ where: { id: encounterId }, query: encounterSelection })
  if (!encounter?.facility?.id || !encounter.patient?.id || !encounter.provider?.id) throw new Error(EPISODE_DENIED)
  // The second tuple must still be in the physically locked facility.
  await lockEpisodeFacility(context, encounter.facility.id, encounter.provider.id)
  await lockEpisodePatientProvider(context, encounter.facility.id, encounter.patient.id, encounter.provider.id)
  let appointment: any = null
  if (encounter.appointment?.id) {
    await context.prisma.$queryRaw(Prisma.sql`SELECT "id" FROM "Appointment" WHERE "id" = ${encounter.appointment.id} FOR UPDATE`)
    // An authorized Encounter never authorizes a sudo linked Appointment read.
    appointment = await context.query.Appointment.findOne({ where: { id: encounter.appointment.id }, query: 'id status transitionVersion patient { id } provider { id } facility { id }' })
    if (!appointment || appointment.patient?.id !== encounter.patient.id || appointment.provider?.id !== encounter.provider.id || appointment.facility?.id !== encounter.facility.id) throw new Error(EPISODE_DENIED)
  }
  return { encounter, appointment, tuple: episodeTuple(encounter) }
}

export async function effectiveEpisodePolicy(prisma: any, facilityId: string) {
  if (!prisma.episodeClosurePolicy) throw new Error(EPISODE_UNAVAILABLE)
  try {
    const row = await prisma.episodeClosurePolicy.findFirst({ where: { facilityId, effectiveAt: { lte: new Date() } }, orderBy: { revision: 'desc' } })
    if (row) validateEpisodePolicy(row.definition)
    return row
  } catch (error: any) {
    if (['P2021', 'P2022'].includes(error?.code)) throw new Error(EPISODE_UNAVAILABLE)
    throw error
  }
}

/** Policy adds eligibility constraints; it NEVER grants existing clinical/billing authority. */
export async function guardEpisodeChild(context: any, input: any, action: EpisodeAction, humanReviewed = false, replayOnly = false, permissionOverride?: 'queue') {
  const permission = permissionOverride || (action === 'claim' ? 'billing' : 'clinical')
  const current = await currentEpisodeActor(context, permission)
  let providerId = input.providerId || input.orderingProviderId || input.attendingProviderId
  if (!providerId && input.encounterId) {
    const parent = await current.query.Encounter.findOne({ where: { id: input.encounterId }, query: 'id provider { id }' })
    providerId = parent?.provider?.id
  }
  await lockEpisodeFacility(current, input.facilityId, providerId)
  await lockEpisodePatientProvider(current, input.facilityId, input.patientId, providerId)
  let encounter: any = null
  if (input.encounterId) {
    if (permission === 'billing') {
      // Billing has its own direct, physically fenced facility/patient authority.
      // Only relational eligibility metadata is read internally, never related PHI.
      await current.prisma.$queryRaw(Prisma.sql`SELECT "id" FROM "Encounter" WHERE "id" = ${input.encounterId} FOR UPDATE`)
      const row = await current.prisma.encounter.findUnique({ where: { id: input.encounterId }, select: { id: true, facilityId: true, patientId: true, status: true } })
      if (!row || row.facilityId !== input.facilityId || row.patientId !== input.patientId) throw new Error(EPISODE_DENIED)
      encounter = row
    } else {
      const scoped = await lockCurrentEncounter(current, input.encounterId)
      if (scoped.tuple.facilityId !== input.facilityId || scoped.tuple.patientId !== input.patientId) throw new Error(EPISODE_DENIED)
      encounter = scoped.encounter
    }
  }
  const discharged = Boolean(await current.prisma.admission.findFirst({ where: {
    facilityId: input.facilityId, patientId: input.patientId, status: 'discharged',
    ...(input.encounterId ? { encounterId: input.encounterId } : {}),
  }, select: { id: true } }))
  const policy = await effectiveEpisodePolicy(current.prisma, input.facilityId)
  const receipt = input.encounterId ? await current.prisma.workflowTransition.findFirst({ where: {
    aggregateType: 'encounter', aggregateId: input.encounterId, facilityId: input.facilityId, patientId: input.patientId,
    toStatus: { in: ['closed', 'cancelled'] },
  }, orderBy: { toVersion: 'desc' }, select: { result: true } }) : null
  if (!replayOnly && action === 'new_care' && !input.encounterId && !input.attendingProviderId) throw new Error('Episode action denied: unbound_legacy_new_care_requires_encounter')
  const eligibility = episodeEligibility({ status: encounter?.status || 'unbound_legacy', discharged, receiptPresent: Boolean(receipt?.result?.episodeReceipt), policy: policy?.definition || null, action, humanReviewed })
  const applied = receipt?.result?.episodeReceipt?.policy?.definition
  const originalEligibility = applied ? episodeEligibility({ status: encounter?.status || 'unbound_legacy', discharged,
    receiptPresent: true, policy: validateEpisodePolicy(applied), action, humanReviewed }) : eligibility
  if (!replayOnly && (!eligibility.allowed || !originalEligibility.allowed)) throw new Error(`Episode action denied: ${!originalEligibility.allowed ? originalEligibility.code : eligibility.code}`)
  return { context: current, policy, eligibility }
}

export const episodeChildModels: Record<string, string> = {
  Admission: 'Admission', MedicalOrder: 'MedicalOrder', LabResult: 'LabResult', Prescription: 'Prescription', Procedure: 'Procedure', CarePlan: 'CarePlan',
  InsuranceClaim: 'InsuranceClaim', ClinicalDocument: 'ClinicalDocument', Specimen: 'Specimen',
}
export async function currentEpisodeChild(context: any, model: string, id: string) {
  if (!Object.hasOwn(episodeChildModels, model)) throw new Error(EPISODE_DENIED)
  const providerField = model === 'Admission' ? 'attendingProvider' : model === 'MedicalOrder' ? 'orderingProvider'
    : model === 'ClinicalDocument' ? 'author' : ['Prescription', 'Procedure', 'CarePlan'].includes(model) ? 'provider' : null
  // Lock order is authority -> facility -> child/episode -> related rows. Taking
  // the child first would deadlock against creation holding the facility and
  // waiting for that child as a related-order FOR SHARE row.
  const first = await context.query[model].findOne({ where: { id }, query: `id facility { id } patient { id } encounter { id }${providerField ? ` ${providerField} { id }` : ''}` })
  if (!first?.facility?.id || !first.patient?.id) throw new Error(EPISODE_DENIED)
  let scopeProviderId = providerField ? first[providerField]?.id : null
  if (!scopeProviderId && first.encounter?.id) {
    const parent = await context.query.Encounter.findOne({ where: { id: first.encounter.id }, query: 'id provider { id }' })
    scopeProviderId = parent?.provider?.id
  }
  await lockEpisodeFacility(context, first.facility.id, scopeProviderId)
  await context.prisma.$queryRaw(Prisma.sql`SELECT "id" FROM ${Prisma.raw(`"${episodeChildModels[model]}"`)} WHERE "id" = ${id} FOR UPDATE`)
  const related = ['LabResult', 'Prescription', 'Procedure', 'Specimen'].includes(model) ? ' medicalOrder { id }' : ''
  const row = await context.query[model].findOne({ where: { id }, query: `id status transitionVersion facility { id } patient { id } encounter { id }${providerField ? ` ${providerField} { id }` : ''}${related}${model === 'LabResult' ? ' labTest { id }' : ''}` })
  if (!row?.facility?.id || !row.patient?.id || (providerField && !row[providerField]?.id) || row.facility.id !== first.facility.id || row.patient.id !== first.patient.id || (row.encounter?.id || null) !== (first.encounter?.id || null) || (providerField && row[providerField].id !== first[providerField]?.id)) throw new Error(EPISODE_DENIED)
  return { row, input: { facilityId: row.facility.id, patientId: row.patient.id, encounterId: row.encounter?.id,
    ...(providerField ? { providerId: row[providerField].id } : {}), medicalOrderId: row.medicalOrder?.id, labTestId: row.labTest?.id } }
}
