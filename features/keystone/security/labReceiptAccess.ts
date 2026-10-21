import { permissions, rules } from '../access'

type Args = Parameters<typeof permissions.canReadClinicalPhi>[0]
const clinicalReceipts = ['lab_result_creation', 'encounter', 'lab_result', 'medical_order', 'prescription', 'procedure', 'care_plan', 'clinical_document', 'specimen', 'admission', 'vital_sign']
function bodyPermission(args: Args, aggregateType: unknown) {
  if (aggregateType === 'appointment' || aggregateType === 'care_queue_ticket') return permissions.canReadAppointmentPhi(args)
  if (typeof aggregateType === 'string' && clinicalReceipts.includes(aggregateType)) return permissions.canReadClinicalPhi(args)
  // Unknown/legacy bodies have not been reviewed as nonprivate audit metadata.
  return false
}
export function canReadWorkflowTransitionRows(args: Args) {
  const scope = rules.canReadWorkflowTransitions(args)
  if (!scope) return false
  const permitted = [
    ...(permissions.canReadClinicalPhi(args) ? clinicalReceipts : []),
    ...(permissions.canReadAppointmentPhi(args) ? ['appointment', 'care_queue_ticket'] : []),
  ]
  return { AND: [...(scope === true ? [] : [scope]), { aggregateType: { in: permitted } }] }
}
export function canReadWorkflowTransitionResult(args: Args, aggregateType: unknown) {
  return bodyPermission(args, aggregateType)
}
