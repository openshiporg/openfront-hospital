export type OperationalFabricRole = Partial<Record<
  | 'canAccessAllClinicalData'
  | 'canManagePatients'
  | 'canManageIntake'
  | 'canManageCommunications'
  | 'canManageBilling'
  | 'canManageInventory'
  | 'canManageIntegrations'
  | 'canManageDataPortability'
  | 'canManageRetention'
  | 'canViewReports',
  boolean
>>

export type FabricQueryKey =
  | 'facilities'
  | 'patients'
  | 'billing'
  | 'consents'
  | 'inventory'
  | 'integrations'
  | 'retention'
  | 'portability'
  | 'encounters'
  | 'outbox'

export function deriveOperationalFabricAccess(role: OperationalFabricRole | null | undefined) {
  const global = role?.canAccessAllClinicalData === true
  const has = (permission: keyof OperationalFabricRole) => role?.[permission] === true
  const billing = has('canManageBilling')
  const inventory = has('canManageInventory')
  const integrations = has('canManageIntegrations')
  const communications = has('canManageCommunications')
  const dataPortability = has('canManageDataPortability')
  const retention = has('canManageRetention')
  const clinicalOperations = has('canManagePatients')
  const intakeOperations = has('canManageIntake')
  const mayRecordConsent = clinicalOperations || intakeOperations
  const hasOperationalAccess = billing || inventory || integrations || communications || dataPortability || retention || mayRecordConsent
  const maySelectPatients = hasOperationalAccess && (billing || communications || mayRecordConsent)
  // Outbox list/count access is explicitly canViewReports in the installed List policy;
  // unlike the custom worker mutation, global authority is not an implicit bypass here.
  const mayReadOutbox = hasOperationalAccess && role?.canViewReports === true

  const capabilities = {
    hasOperationalAccess,
    global,
    billing,
    inventory,
    integrations,
    communications,
    dataPortability,
    retention,
    clinicalOperations,
    mayRecordConsent,
    maySelectPatients,
    mayDispatchOutbox: global && integrations,
    mayReadOutbox,
    mayPlaceEncounterHold: retention && clinicalOperations,
    mayLinkPatientIdentity: integrations && clinicalOperations,
  }

  const queries: FabricQueryKey[] = []
  if (hasOperationalAccess) queries.push('facilities')
  if (maySelectPatients) queries.push('patients')
  if (billing) queries.push('billing')
  if (mayRecordConsent) queries.push('consents')
  if (inventory) queries.push('inventory')
  if (integrations) queries.push('integrations')
  if (retention) queries.push('retention')
  if (dataPortability) queries.push('portability')
  // Encounter display is only needed for the explicitly gated clinical hold picker.
  if (capabilities.mayPlaceEncounterHold) queries.push('encounters')
  if (mayReadOutbox) queries.push('outbox')

  return { capabilities, queries }
}
