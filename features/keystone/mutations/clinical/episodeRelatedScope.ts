import { Prisma } from '@prisma/client'
import { EPISODE_DENIED } from './episodeFence'

/** Recheck independently authorized related IDs after physical locks, not preflight PHI. */
export async function recheckEpisodeRelated(context: any, model: string, input: any, replayOnly = false) {
  if (input.medicalOrderId) {
    await context.prisma.$queryRaw(Prisma.sql`SELECT "id" FROM "MedicalOrder" WHERE "id" = ${input.medicalOrderId} FOR SHARE`)
    const order = await context.query.MedicalOrder.findOne({ where: { id: input.medicalOrderId },
      query: 'id status orderType facility { id } patient { id } encounter { id }' })
    const orderType = model === 'LabResult' || model === 'LabResultCorrection' || model === 'Specimen' ? 'lab' : model === 'Prescription' ? 'medication' : model === 'Procedure' ? 'procedure' : null
    if (!order || order.facility?.id !== input.facilityId || order.patient?.id !== input.patientId ||
      order.encounter?.id !== input.encounterId || (orderType && order.orderType !== orderType) ||
      (!replayOnly && model !== 'LabResultCorrection' && !['ordered', 'in_progress'].includes(order.status))) throw new Error(EPISODE_DENIED)
  }
  if (input.labTestId) {
    await context.prisma.$queryRaw(Prisma.sql`SELECT "id" FROM "LabTest" WHERE "id" = ${input.labTestId} FOR SHARE`)
    const test = await context.query.LabTest.findOne({ where: { id: input.labTestId }, query: 'id active' })
    if (!test?.active) throw new Error(EPISODE_DENIED)
  }
  if (input.coverageId) {
    await context.prisma.$queryRaw(Prisma.sql`SELECT "id" FROM "PatientCoverage" WHERE "id" = ${input.coverageId} FOR SHARE`)
    const coverage = await context.query.PatientCoverage.findOne({ where: { id: input.coverageId }, query: 'id status facility { id } patient { id }' })
    if (!coverage || coverage.facility?.id !== input.facilityId || coverage.patient?.id !== input.patientId ||
      (!replayOnly && coverage.status !== 'active')) throw new Error(EPISODE_DENIED)
  }
}
