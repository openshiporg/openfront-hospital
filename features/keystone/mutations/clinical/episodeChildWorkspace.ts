import { currentEpisodeActor, episodeChildModels, lockCurrentEncounter } from './episodeFence'

export async function episodeChildWorkspace(_root: unknown, args: any, context: any) {
  const take = args.take ?? 25
  if (!Object.hasOwn(episodeChildModels, args.model) || !Number.isInteger(take) || take < 1 || take > 25) throw new Error('Episode child page is invalid')
  return context.transaction(async (tx: any) => {
    const current = await currentEpisodeActor(tx)
    if (args.model === 'InsuranceClaim' && !current.session.data.role.canManageBilling && !current.session.data.role.canAccessAllClinicalData) throw new Error('Private claim evidence requires separate billing authority')
    const scope = await lockCurrentEncounter(current, args.encounterId)
    const list = current.query[args.model]
    const where: any = { facility: { id: { equals: scope.tuple.facilityId } }, patient: { id: { equals: scope.tuple.patientId } }, encounter: { id: { equals: args.encounterId } } }
    let continuation: any = where
    if (args.cursorId) {
      const cursor = (await list.findMany({ where: { AND: [where, { id: { equals: args.cursorId } }] }, take: 1, query: 'id createdAt' }))[0]
      if (!cursor) throw new Error('Episode child cursor is stale or unavailable')
      continuation = { AND: [where, { OR: [{ createdAt: { gt: cursor.createdAt } }, { createdAt: { equals: cursor.createdAt }, id: { gt: cursor.id } }] }] }
    }
    const rows = await list.findMany({ where: continuation, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: take + 1,
      query: 'id status transitionVersion createdAt' })
    const count = await list.count({ where })
    let ownedHistory: any[] = []
    let nextHistoryVersion: number | null = null
    if (args.childId) {
      if (args.beforeChildVersion != null && (!Number.isInteger(args.beforeChildVersion) || args.beforeChildVersion < 1)) throw new Error('Owned child history version is invalid')
      const child = (await list.findMany({ where: { AND: [where, { id: { equals: args.childId } }] }, take: 1, query: 'id' }))[0]
      if (!child) throw new Error('Child history is not accessible in this episode')
      const aggregateTypes: Record<string, string> = { Admission: 'admission', MedicalOrder: 'medical_order', LabResult: 'lab_result', Prescription: 'prescription', Procedure: 'procedure', CarePlan: 'care_plan', InsuranceClaim: 'insurance_claim', ClinicalDocument: 'clinical_document', Specimen: 'specimen' }
      const history = await current.prisma.workflowTransition.findMany({ where: { aggregateType: aggregateTypes[args.model], aggregateId: args.childId,
        actorReference: current.session.itemId, facilityId: scope.tuple.facilityId, patientId: scope.tuple.patientId,
        ...(args.beforeChildVersion ? { toVersion: { lt: args.beforeChildVersion } } : {}) }, orderBy: { toVersion: 'desc' }, take: take + 1,
        select: { id: true, fromStatus: true, toStatus: true, fromVersion: true, toVersion: true, occurredAt: true } })
      ownedHistory = history.slice(0, take)
      nextHistoryVersion = history.length > take ? history[take - 1].toVersion : null
    }
    // IDs/status/version only, through independent normal child List access.
    // Never fetch result values, diagnoses, notes, amounts, or provider secrets.
    return { model: args.model, childId: args.childId || null, ownedHistory, nextHistoryVersion,
      historyBoundary: 'owned_transition_receipts_only_not_complete_clinical_or_supersession_history', rows: rows.slice(0, take), count, nextCursor: rows.length > take ? rows[take - 1].id : null,
      encounterStatus: scope.encounter.status, encounterVersion: scope.encounter.transitionVersion,
      interpretation: 'owned_scoped_child_state_not_clinical_readiness_or_cascade' }
  }, { isolationLevel: 'Serializable', timeout: 30_000 })
}
