'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'

import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import { unverifiedCoverageCandidateWhere } from '../lib/coverageSearch'
import { inventoryCandidateWhere, normalizeInventorySearch } from '../lib/inventorySearch'
import { activeIntegrationCandidateWhere, normalizeIntegrationSearch } from '../lib/integrationSearch'
import { activeFabricPatientCandidateWhere } from '../lib/patientSearch'
import { currentConsentCandidateWhere, currentGrantedConsentCandidateWhere } from '../lib/consentSearch'
import { paymentClaimCandidateWhere } from '../lib/paymentClaimSearch'
import { succeededPaymentCandidateWhere } from '../lib/paymentSearch'
import { encounterHoldCandidateWhere } from '../lib/encounterHoldSearch'
import { deriveOperationalFabricAccess, type OperationalFabricRole } from '../lib/workspaceAccess'

const path = '/dashboard/platform/operational-fabric'
const operationKey = () => `hospital-ui-${randomUUID()}`
const controlled = 'id status transitionVersion replayed'

const inventorySearchAuthorityQuery = `
  query OperationalFabricInventorySearchAuthority {
    authenticatedItem {
      ... on User {
        id
        role { canManageInventory canAccessAllClinicalData }
      }
    }
  }
`

const integrationSearchAuthorityQuery = `
  query OperationalFabricIntegrationSearchAuthority {
    authenticatedItem {
      ... on User {
        id
        role { canManageIntegrations canAccessAllClinicalData }
      }
    }
  }
`

const refundPaymentSearchAuthorityQuery = `
  query OperationalFabricRefundPaymentSearchAuthority {
    authenticatedItem {
      ... on User {
        id
        role { canManageBilling canAccessAllClinicalData }
      }
    }
  }
`

const paymentClaimSearchAuthorityQuery = `
  query OperationalFabricPaymentClaimSearchAuthority {
    authenticatedItem {
      ... on User {
        id
        role { canManageBilling canAccessAllClinicalData }
      }
    }
  }
`

const encounterHoldSearchAuthorityQuery = `
  query OperationalFabricEncounterHoldSearchAuthority {
    authenticatedItem {
      ... on User {
        id
        role { canManagePatients canManageRetention canAccessAllClinicalData }
      }
    }
  }
`

const patientSearchAuthorityQuery = `
  query OperationalFabricPatientSearchAuthority {
    authenticatedItem {
      ... on User {
        id
        role {
          canAccessAllClinicalData
          canManagePatients
          canManageIntake
          canManageCommunications
          canManageBilling
          canManageInventory
          canManageIntegrations
          canManageDataPortability
          canManageRetention
          canViewReports
        }
      }
    }
  }
`

export type InventoryCandidateSearchResult = {
  inventoryItems: Array<{
    id: string
    sku: string
    name: string
    transitionVersion: number
    quantityOnHand: number
    quantityReserved: number
    facility?: { name?: string | null } | null
  }>
  inventoryItemsCount: number
}

export type IntegrationCandidateSearchResult = {
  integrationInstallations: Array<{
    id: string
    name: string
    kind: string
    facility?: { name?: string | null } | null
  }>
  integrationInstallationsCount: number
}

export type FabricPatientCandidateSearchResult = {
  patients: Array<{ id: string; displayName: string }>
  patientsCount: number
}

export type EncounterHoldCandidateSearchResult = {
  encounters: Array<{ id: string }>
  encountersCount: number
}

export type ConsentCandidateSearchResult = {
  patientConsents: Array<{
    id: string
    consentType: string
    decision: 'granted' | 'declined' | 'withdrawn'
    policyVersion: string
    statementKey: string
    effectiveAt: string
  }>
  patientConsentsCount: number
}

export type PaymentClaimCandidateSearchResult = {
  insuranceClaims: Array<{ id: string; claimNumber: string; status: string }>
  insuranceClaimsCount: number
}

export type RefundPaymentCandidateSearchResult = {
  patientPayments: Array<{
    id: string
    paymentNumber: string
    status: string
    amountCents: number
    refundedAmountCents: number
    currency: string
    method: string
  }>
  patientPaymentsCount: number
}

export async function searchInventoryCandidates(rawSearch: string) {
  const search = normalizeInventorySearch(rawSearch)
  const where = inventoryCandidateWhere(search)
  if (!where) return { success: true as const, data: { inventoryItems: [], inventoryItemsCount: 0 } }

  const authority = await keystoneClient<{
    authenticatedItem?: { id?: string; role?: { canManageInventory?: boolean; canAccessAllClinicalData?: boolean } | null } | null
  }>(inventorySearchAuthorityQuery)
  const actor = authority.success ? authority.data.authenticatedItem : null
  if (!actor?.id || !actor.role || (!actor.role.canManageInventory && !actor.role.canAccessAllClinicalData)) {
    return { success: false as const, error: 'Inventory authority could not be verified for this session.' }
  }

  const response = await keystoneClient<InventoryCandidateSearchResult>(
    `query InventoryCandidates($where:InventoryItemWhereInput!){inventoryItems(where:$where,orderBy:[{sku:asc},{id:asc}],take:25){id sku name transitionVersion quantityOnHand quantityReserved facility{name}} inventoryItemsCount(where:$where)}`,
    { where },
  )
  if (!response.success) return response
  if (!Array.isArray(response.data.inventoryItems) || !Number.isSafeInteger(response.data.inventoryItemsCount) || response.data.inventoryItemsCount < 0) {
    return { success: false as const, error: 'Inventory candidates could not be verified for this session.' }
  }
  return response
}

export async function searchActiveIntegrationCandidates(rawSearch: string) {
  const search = normalizeIntegrationSearch(rawSearch)
  const where = activeIntegrationCandidateWhere(search)
  if (!where) return { success: true as const, data: { integrationInstallations: [], integrationInstallationsCount: 0 } }

  const authority = await keystoneClient<{
    authenticatedItem?: { id?: string; role?: { canManageIntegrations?: boolean; canAccessAllClinicalData?: boolean } | null } | null
  }>(integrationSearchAuthorityQuery)
  const actor = authority.success ? authority.data.authenticatedItem : null
  if (!actor?.id || !actor.role || (!actor.role.canManageIntegrations && !actor.role.canAccessAllClinicalData)) {
    return { success: false as const, error: 'Integration authority could not be verified for this session.' }
  }

  const response = await keystoneClient<IntegrationCandidateSearchResult>(
    `query ActiveIntegrationCandidates($where:IntegrationInstallationWhereInput!){integrationInstallations(where:$where,orderBy:[{name:asc},{id:asc}],take:25){id name kind facility{name}} integrationInstallationsCount(where:$where)}`,
    { where },
  )
  if (!response.success) return response
  if (!Array.isArray(response.data.integrationInstallations) || !Number.isSafeInteger(response.data.integrationInstallationsCount) || response.data.integrationInstallationsCount < 0) {
    return { success: false as const, error: 'Integration candidates could not be verified for this session.' }
  }
  return response
}

async function run<T>(mutation: string, variables: Record<string, unknown>) {
  const response = await keystoneClient<T>(mutation, variables)
  revalidatePath(path)
  return response
}

function withKey(data: Record<string, unknown>) {
  return { ...data, operationKey: String(data.operationKey || operationKey()) }
}

export const recordCoverage = async (data: Record<string, unknown>) => run(`mutation($data:PatientCoverageWorkflowInput!){recordPatientCoverage(data:$data){${controlled}}}`, { data: withKey(data) })
export const transitionCoverage = async (data: Record<string, unknown>) => run(`mutation($operationKey:String!,$coverageId:ID!,$toStatus:String!,$expectedVersion:Int!,$reasonCode:String){transitionPatientCoverage(operationKey:$operationKey,coverageId:$coverageId,toStatus:$toStatus,expectedVersion:$expectedVersion,reasonCode:$reasonCode){${controlled}}}`, withKey(data))

export async function searchRefundPaymentCandidates(rawSearch: string) {
  const where = succeededPaymentCandidateWhere(rawSearch)
  if (!where) return { success: true as const, data: { patientPayments: [], patientPaymentsCount: 0 } }

  const authority = await keystoneClient<{
    authenticatedItem?: { id?: string; role?: { canManageBilling?: boolean; canAccessAllClinicalData?: boolean } | null } | null
  }>(refundPaymentSearchAuthorityQuery)
  const actor = authority.success ? authority.data.authenticatedItem : null
  if (!actor?.id || !actor.role || (!actor.role.canManageBilling && !actor.role.canAccessAllClinicalData)) {
    return { success: false as const, error: 'Billing authority could not be verified for this session.' }
  }

  const response = await keystoneClient<RefundPaymentCandidateSearchResult>(
    `query OperationalFabricRefundPaymentCandidates($where:PatientPaymentWhereInput!){patientPayments(where:$where,orderBy:[{paymentNumber:asc},{id:asc}],take:25){id paymentNumber status amountCents refundedAmountCents currency method} patientPaymentsCount(where:$where)}`,
    { where },
  )
  if (!response.success) return response
  if (!Array.isArray(response.data.patientPayments) || !response.data.patientPayments.every(row => typeof row.id === 'string' && typeof row.paymentNumber === 'string' && row.status === 'succeeded' && Number.isSafeInteger(row.amountCents) && row.amountCents > 0 && Number.isSafeInteger(row.refundedAmountCents) && row.refundedAmountCents >= 0 && typeof row.currency === 'string' && typeof row.method === 'string') || !Number.isSafeInteger(response.data.patientPaymentsCount) || response.data.patientPaymentsCount < 0) {
    return { success: false as const, error: 'Payment candidates could not be verified for this session.' }
  }
  return response
}

export async function searchPaymentClaimCandidates(facilityId: string, patientId: string, rawSearch: string) {
  const where = paymentClaimCandidateWhere(facilityId, patientId, rawSearch)
  if (!where) return { success: true as const, data: { insuranceClaims: [], insuranceClaimsCount: 0 } }

  const authority = await keystoneClient<{
    authenticatedItem?: { id?: string; role?: { canManageBilling?: boolean; canAccessAllClinicalData?: boolean } | null } | null
  }>(paymentClaimSearchAuthorityQuery)
  const actor = authority.success ? authority.data.authenticatedItem : null
  if (!actor?.id || !actor.role || (!actor.role.canManageBilling && !actor.role.canAccessAllClinicalData)) {
    return { success: false as const, error: 'Billing authority could not be verified for this session.' }
  }

  const response = await keystoneClient<PaymentClaimCandidateSearchResult>(
    `query OperationalFabricPaymentClaimCandidates($where:InsuranceClaimWhereInput!){insuranceClaims(where:$where,orderBy:[{claimNumber:asc},{id:asc}],take:25){id claimNumber status} insuranceClaimsCount(where:$where)}`,
    { where },
  )
  if (!response.success) return response
  if (!Array.isArray(response.data.insuranceClaims) || !response.data.insuranceClaims.every(row => typeof row.id === 'string' && typeof row.claimNumber === 'string' && typeof row.status === 'string') || !Number.isSafeInteger(response.data.insuranceClaimsCount) || response.data.insuranceClaimsCount < 0) {
    return { success: false as const, error: 'Claim candidates could not be verified for this session.' }
  }
  return response
}

export async function searchEncounterHoldCandidates(facilityId: string, rawSearch: string) {
  const where = encounterHoldCandidateWhere(facilityId, rawSearch)
  if (!where) return { success: true as const, data: { encounters: [], encountersCount: 0 } }

  const authority = await keystoneClient<{
    authenticatedItem?: { id?: string; role?: OperationalFabricRole | null } | null
  }>(encounterHoldSearchAuthorityQuery)
  const actor = authority.success ? authority.data.authenticatedItem : null
  const access = actor?.role ? deriveOperationalFabricAccess(actor.role) : null
  if (!actor?.id || !access || !access.capabilities.hasOperationalAccess || !access.capabilities.clinicalOperations || !access.capabilities.mayPlaceEncounterHold) {
    return { success: false as const, error: 'Encounter-hold authority could not be verified for this session.' }
  }

  const facilityWhere = { id: { equals: String(facilityId).trim() }, status: { equals: 'active' } }
  const [facilityResponse, retentionResponse] = await Promise.all([
    keystoneClient<{ facilitiesCount: number }>(
      `query OperationalFabricEncounterHoldFacility($where:FacilityWhereInput!){facilitiesCount(where:$where)}`,
      { where: facilityWhere },
    ),
    keystoneClient<{ retentionPoliciesCount: number }>(
      `query OperationalFabricEncounterHoldRetentionReadiness { retentionPoliciesCount(where:{status:{equals:"active"}}) }`,
    ),
  ])
  if (!facilityResponse.success || !facilityResponse.data || !Number.isSafeInteger(facilityResponse.data.facilitiesCount) || facilityResponse.data.facilitiesCount !== 1) {
    return { success: false as const, error: 'An accessible active facility could not be verified for encounter search.' }
  }
  if (!retentionResponse.success || !retentionResponse.data || !Number.isSafeInteger(retentionResponse.data.retentionPoliciesCount) || retentionResponse.data.retentionPoliciesCount < 0) {
    return { success: false as const, error: 'Retention readiness could not be verified for this session.' }
  }

  const response = await keystoneClient<EncounterHoldCandidateSearchResult>(
    `query OperationalFabricEncounterHoldCandidates($where:EncounterWhereInput!){encounters(where:$where,orderBy:[{encounterNumber:asc},{id:asc}],take:25){id} encountersCount(where:$where)}`,
    { where },
  )
  if (!response.success) return response
  const rows = response.data?.encounters
  const count = response.data?.encountersCount
  if (!Array.isArray(rows) || rows.length > 25 || !rows.every(row => typeof row.id === 'string') || !Number.isSafeInteger(count) || count < rows.length || (count > 25 ? rows.length !== 25 : count !== rows.length)) {
    return { success: false as const, error: 'Encounter candidates could not be verified for this session.' }
  }
  return response
}

export async function searchOperationalFabricPatientCandidates(facilityId: string, rawSearch: string) {
  const where = activeFabricPatientCandidateWhere(facilityId, rawSearch)
  if (!where) return { success: true as const, data: { patients: [], patientsCount: 0 } }

  const authority = await keystoneClient<{
    authenticatedItem?: { id?: string; role?: OperationalFabricRole | null } | null
  }>(patientSearchAuthorityQuery)
  const actor = authority.success ? authority.data.authenticatedItem : null
  if (!actor?.id || !actor.role || !deriveOperationalFabricAccess(actor.role).capabilities.maySelectPatients) {
    return { success: false as const, error: 'Patient-selection authority could not be verified for this session.' }
  }

  const response = await keystoneClient<FabricPatientCandidateSearchResult>(
    `query OperationalFabricPatientCandidates($where:PatientWhereInput!){patients(where:$where,orderBy:[{lastName:asc},{firstName:asc},{id:asc}],take:25){id displayName} patientsCount(where:$where)}`,
    { where },
  )
  if (!response.success) return response
  if (!Array.isArray(response.data.patients) || !response.data.patients.every(row => typeof row.id === 'string' && typeof row.displayName === 'string') || !Number.isSafeInteger(response.data.patientsCount) || response.data.patientsCount < 0) {
    return { success: false as const, error: 'Patient candidates could not be verified for this session.' }
  }
  return response
}

async function searchCurrentConsentCandidatesForWhere(where: Record<string, unknown> | null) {
  if (!where) return { success: true as const, data: { patientConsents: [], patientConsentsCount: 0 } }

  const authority = await keystoneClient<{
    authenticatedItem?: { id?: string; role?: OperationalFabricRole | null } | null
  }>(patientSearchAuthorityQuery)
  const actor = authority.success ? authority.data.authenticatedItem : null
  const access = actor?.role ? deriveOperationalFabricAccess(actor.role) : null
  if (!actor?.id || !access?.capabilities.hasOperationalAccess || !access.capabilities.mayRecordConsent) {
    return { success: false as const, error: 'Consent-search authority could not be verified for this session.' }
  }

  const response = await keystoneClient<ConsentCandidateSearchResult>(
    `query OperationalFabricCurrentConsentCandidates($where:PatientConsentWhereInput!){patientConsents(where:$where,orderBy:[{effectiveAt:desc},{createdAt:desc},{id:asc}],take:25){id consentType decision policyVersion statementKey effectiveAt} patientConsentsCount(where:$where)}`,
    { where },
  )
  if (!response.success) return response
  const rows = response.data.patientConsents
  const count = response.data.patientConsentsCount
  if (!Array.isArray(rows) || rows.length > 25 || !Number.isSafeInteger(count) || count < rows.length || (count > 25 ? rows.length !== 25 : count !== rows.length) || !rows.every(row => typeof row.id === 'string' && typeof row.consentType === 'string' && ['granted', 'declined', 'withdrawn'].includes(row.decision) && typeof row.policyVersion === 'string' && typeof row.statementKey === 'string' && typeof row.effectiveAt === 'string')) {
    return { success: false as const, error: 'Consent candidates could not be verified for this session.' }
  }
  return response
}

export async function searchCurrentConsentCandidates(facilityId: string, patientId: string, consentType: string) {
  return searchCurrentConsentCandidatesForWhere(currentConsentCandidateWhere(facilityId, patientId, consentType))
}

export async function searchCurrentGrantedConsentCandidates(facilityId: string, patientId: string, consentType: string) {
  return searchCurrentConsentCandidatesForWhere(currentGrantedConsentCandidateWhere(facilityId, patientId, consentType))
}

export async function searchUnverifiedCoverageCandidates(rawSearch: string) {
  const where = unverifiedCoverageCandidateWhere(rawSearch)
  if (!where) return { success: true, data: { patientCoverages: [], patientCoveragesCount: 0 } }
  return keystoneClient<{
    patientCoverages: Array<{ id: string; coverageNumber: string; payerName: string; transitionVersion: number }>
    patientCoveragesCount: number
  }>(
    `query UnverifiedCoverageCandidates($where:PatientCoverageWhereInput!){patientCoverages(where:$where,orderBy:[{coverageNumber:asc},{id:asc}],take:25){id coverageNumber payerName transitionVersion} patientCoveragesCount(where:$where)}`,
    { where },
  )
}
export const recordConsent = async (data: Record<string, unknown>) => run(`mutation($data:ConsentDecisionWorkflowInput!){recordConsentDecision(data:$data){id decision effectiveAt replayed}}`, { data: withKey(data) })
export const recordPayment = async (data: Record<string, unknown>) => run(`mutation($data:PatientPaymentWorkflowInput!){recordPatientPayment(data:$data){${controlled}}}`, { data: withKey(data) })
export const requestRefund = async (data: Record<string, unknown>) => run(`mutation($data:PatientRefundWorkflowInput!){requestPatientRefund(data:$data){${controlled}}}`, { data: withKey(data) })
export const registerInventory = async (data: Record<string, unknown>) => run(`mutation($data:InventoryItemWorkflowInput!){registerInventoryItem(data:$data){id status transitionVersion quantityOnHand quantityReserved replayed}}`, { data: withKey(data) })
export const moveInventory = async (data: Record<string, unknown>) => run(`mutation($data:InventoryMovementWorkflowInput!){moveInventory(data:$data){id status transitionVersion quantityOnHand quantityReserved replayed}}`, { data: withKey(data) })
export const setPreference = async (data: Record<string, unknown>) => run(`mutation($data:CommunicationPreferenceWorkflowInput!){setCommunicationPreference(data:$data){${controlled}}}`, { data: withKey(data) })
export const registerTemplate = async (data: Record<string, unknown>) => run(`mutation($data:CommunicationTemplateWorkflowInput!){registerCommunicationTemplate(data:$data){${controlled}}}`, { data: withKey(data) })
export const installIntegration = async (data: Record<string, unknown>) => run(`mutation($data:IntegrationInstallationWorkflowInput!){installIntegration(data:$data){id status transitionVersion installationKey signingSecret replayed}}`, { data: withKey(data) })
export const issueCredential = async (data: Record<string, unknown>) => run(`mutation($data:MachineCredentialWorkflowInput!){issueMachineCredential(data:$data){id status transitionVersion keyPrefix credential replayed}}`, { data: withKey(data) })
export const establishPolicy = async (data: Record<string, unknown>) => run(`mutation($data:RetentionPolicyWorkflowInput!){establishRetentionPolicy(data:$data){${controlled}}}`, { data: withKey(data) })
export const placeHold = async (data: Record<string, unknown>) => run(`mutation($data:RecordHoldWorkflowInput!){placeRecordHold(data:$data){${controlled}}}`, { data: withKey(data) })
export const recordDisposition = async (data: Record<string, unknown>) => run(`mutation($data:RetentionDispositionWorkflowInput!){recordRetentionDisposition(data:$data){id decision replayed}}`, { data: withKey(data) })
export const previewImport = async (data: Record<string, unknown>) => run(`mutation($data:InventoryImportPreviewInput!){previewInventoryImport(data:$data){id status transitionVersion rowCount errorCount replayed}}`, { data: withKey(data) })
export const requestExport = async (data: Record<string, unknown>) => run(`mutation($data:ExportJobWorkflowInput!){requestExportJob(data:$data){id status transitionVersion accessToken expiresAt replayed}}`, { data: withKey(data) })
export const linkExternalIdentity = async (data: Record<string, unknown>) => run(`mutation($data:ExternalIdentityWorkflowInput!){linkExternalIdentity(data:$data){id status replayed}}`, { data: withKey(data) })

export async function applyImport(batchId: string, expectedVersion: number, suppliedKey?: string) {
  return run(`mutation($operationKey:String!,$batchId:ID!,$expectedVersion:Int!){applyInventoryImport(operationKey:$operationKey,batchId:$batchId,expectedVersion:$expectedVersion){${controlled}}}`, { operationKey: suppliedKey || operationKey(), batchId, expectedVersion })
}
export async function rollbackImport(batchId: string, expectedVersion: number, suppliedKey?: string) {
  return run(`mutation($operationKey:String!,$batchId:ID!,$expectedVersion:Int!,$reasonCode:String!){rollbackInventoryImport(operationKey:$operationKey,batchId:$batchId,expectedVersion:$expectedVersion,reasonCode:$reasonCode){${controlled}}}`, { operationKey: suppliedKey || operationKey(), batchId, expectedVersion, reasonCode: 'operator_rollback' })
}
export async function processExport(jobId: string, expectedVersion: number, suppliedKey?: string) {
  return run(`mutation($operationKey:String!,$jobId:ID!,$expectedVersion:Int!){processExportJob(operationKey:$operationKey,jobId:$jobId,expectedVersion:$expectedVersion){${controlled}}}`, { operationKey: suppliedKey || operationKey(), jobId, expectedVersion })
}
export async function dispatchIntegrations() {
  return run(`mutation{dispatchIntegrationOutbox(limit:10){claimed delivered retried deadLettered}}`, {})
}
