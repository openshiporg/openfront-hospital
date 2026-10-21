import { currentHospitalActor, lockCurrentHospitalFacility } from '../../security/currentHospitalActor'
import { lockEpisodePatientProvider } from './episodeFence'
import { Prisma } from '@prisma/client'
import type { Context } from '.keystone/types'

import { bounded, lockOperation, operationEvidence, scopedFacilityPatient } from '../operational/evidence'

export default async function recordConsentDecision(
  _root: unknown,
  { data }: { data: any },
  context: Context,
) {
  const role = context.session?.data.role
  if (!role?.canManagePatients && !role?.canManageIntake) {
    throw new Error('Not authorized to record consent decisions')
  }
  await scopedFacilityPatient(context, data.facilityId, data.patientId)
  const decision = bounded(data.decision, 'Consent decision', 40, true)
  if (!['granted', 'declined', 'withdrawn'].includes(decision)) throw new Error('Consent decision is invalid')
  const consentType = bounded(data.consentType, 'Consent type', 100, true)
  const policyVersion = bounded(data.policyVersion, 'Policy version', 100, true)
  const statementKey = bounded(data.statementKey, 'Statement key', 150, true)
  const reasonCode = bounded(data.reasonCode, 'Consent reason code', 80, decision === 'withdrawn')
  const normalized = {
    operationKey: data.operationKey,
    facilityId: data.facilityId,
    patientId: data.patientId,
    consentType,
    policyVersion,
    statementKey,
    decision,
    reasonCode,
    supersedesConsentId: data.supersedesConsentId || null,
  }
  const evidence = operationEvidence(normalized)
  return context.transaction(async (transactionContext: any) => {
    const currentContext = await currentHospitalActor(transactionContext, ['canManagePatients', 'canManageIntake'])
    await lockCurrentHospitalFacility(currentContext, data.facilityId)
    await lockEpisodePatientProvider(currentContext, data.facilityId, data.patientId)
    await scopedFacilityPatient(currentContext, data.facilityId, data.patientId)
    const prisma = currentContext.sudo().prisma as any
    await lockOperation(prisma, 'consent-decision', evidence.operationKeyHash)
    await prisma.$queryRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`consent:${data.facilityId}:${data.patientId}:${consentType}`}, 0))::text AS "lock"`,
    )
    const replay = await prisma.patientConsent.findUnique({ where: { operationKeyHash: evidence.operationKeyHash } })
    if (replay) {
      if (replay.requestHash !== evidence.requestHash) throw new Error('Operation key was reused with a different payload')
      if (replay.facilityId !== data.facilityId || replay.patientId !== data.patientId || replay.evidence?.actorReference !== currentContext.session!.itemId) throw new Error('Original consent owner could not be verified; legacy evidence requires review')
      return { id: replay.id, decision: replay.decision, effectiveAt: replay.effectiveAt, replayed: true }
    }
    if (data.supersedesConsentId) await prisma.$queryRaw(Prisma.sql`SELECT "id" FROM "PatientConsent" WHERE "id" = ${data.supersedesConsentId} FOR SHARE`)
    const previous = data.supersedesConsentId
      ? await currentContext.query.PatientConsent.findOne({
          where: { id: data.supersedesConsentId },
          query: 'id consentType decision facility { id } patient { id } supersedingDecision { id }',
        }) as any
      : null
    if (data.supersedesConsentId && (
      !previous || previous.facility?.id !== data.facilityId || previous.patient?.id !== data.patientId ||
      previous.consentType !== consentType || previous.supersedingDecision
    )) throw new Error('Superseded consent is not the current accessible decision')
    if (decision === 'withdrawn' && (!previous || previous.decision !== 'granted')) {
      throw new Error('Withdrawal must supersede the current granted consent decision')
    }

    const currentDecisions = await prisma.patientConsent.findMany({
      where: {
        facilityId: data.facilityId,
        patientId: data.patientId,
        consentType,
        supersedingDecision: null,
      },
      orderBy: [{ effectiveAt: 'desc' }, { createdAt: 'desc' }],
      take: 2,
      select: { id: true },
    })
    if (currentDecisions.length > 1) throw new Error('Consent history is ambiguous and requires administrator review')
    if (currentDecisions[0] && currentDecisions[0].id !== previous?.id) {
      throw new Error('A current consent decision already exists; select it as the superseded decision')
    }
    if (previous) {
      const current = await prisma.patientConsent.findUnique({
        where: { id: previous.id },
        include: { supersedingDecision: { select: { id: true } } },
      })
      if (!current || current.supersedingDecision) throw new Error('Consent decision changed; refresh before retrying')
    }
    const now = new Date()
    const consent = await prisma.patientConsent.create({
      data: {
        ...evidence,
        consentType,
        policyVersion,
        statementKey,
        decision,
        effectiveAt: now,
        grantedAt: decision === 'granted' ? now : null,
        captureMethod: 'staff_recorded',
        reasonCode,
        facilityId: data.facilityId,
        patientId: data.patientId,
        supersedesId: previous?.id || null,
        evidence: { source: 'consent_decision_workflow', actorReference: currentContext.session!.itemId, decision, reasonProvided: Boolean(reasonCode) },
        createdAt: now,
      },
    })
    const metadata = {
      source: 'consent_decision_workflow',
      aggregateId: consent.id,
      consentType,
      decision,
      supersedesConsentId: previous?.id || null,
      reasonProvided: Boolean(reasonCode),
    }
    const audit = await prisma.clinicalAuditLog.create({ data: {
      eventType: `consent.${decision}`,
      occurredAt: now,
      actorType: 'staff_user',
      actorReference: context.session!.itemId,
      facilityId: data.facilityId,
      patientId: data.patientId,
      consentId: consent.id,
      metadata,
      createdAt: now,
    } })
    await prisma.clinicalOutboxEvent.create({ data: {
      eventKey: `patient_consent:${consent.id}:${decision}`,
      eventType: `consent.${decision}`,
      aggregateType: 'patient_consent',
      aggregateId: consent.id,
      contractVersion: 'hospital.event.v1',
      deliveryMode: 'internal',
      status: 'recorded',
      attempts: 0,
      nextAttemptAt: null,
      facilityId: data.facilityId,
      patientId: data.patientId,
      payload: { ...metadata, auditLogId: audit.id },
      createdAt: now,
    } })
    return { id: consent.id, decision: consent.decision, effectiveAt: consent.effectiveAt, replayed: false }
  }, { timeout: 30_000 })
}
