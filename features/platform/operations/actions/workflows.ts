'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { keystoneClient, type KeystoneResponse } from '@/features/dashboard/lib/keystoneClient'
import { activeFacilityClinicianCandidateWhere, activeFacilityPatientCandidateWhere, activeLabOrderCandidateWhere, activeLabTestCandidateWhere, activeMedicationOrderCandidateWhere, activeProcedureOrderCandidateWhere, correctableLabResultCandidateWhere, availableBedCandidateWhere, departmentCandidateWhere, encounterPatientCandidateWhere, normalizeSelectorSearch, patientCoverageCandidateWhere, providerCandidateWhere } from '../lib/selectorSearch'

async function run<T>(mutation: string, variables: Record<string, unknown>, paths: string[]) {
  const response = await keystoneClient<T>(mutation, variables)
  for (const path of paths) revalidatePath(path)
  return response
}

const result = 'id status transitionVersion replayed'
const inpatientPath = ['/dashboard/platform/inpatient']
const fulfillmentPath = ['/dashboard/platform/clinical-fulfillment']
const claimsPath = ['/dashboard/platform/claims']
const operationKey = () => `hospital-ui-${randomUUID()}`

const encounterOpeningSearchAuthorityQuery = `
  query EncounterOpeningSearchAuthority {
    authenticatedItem {
      ... on User {
        id
        role { canManagePatients canAccessAllClinicalData }
      }
    }
  }
`

const admissionPatientSearchAuthorityQuery = `
  query AdmissionPatientSearchAuthority {
    authenticatedItem {
      ... on User {
        id
        role { canManagePatients canAccessAllClinicalData }
      }
    }
  }
`

const clinicalCorrectionSearchAuthorityQuery = `
  query ClinicalCorrectionSearchAuthority {
    authenticatedItem {
      ... on User {
        id
        role { canManagePatients canAccessAllClinicalData }
      }
    }
  }
`

const medicationOrderSearchAuthorityQuery = `
  query MedicationOrderSearchAuthority {
    authenticatedItem {
      ... on User {
        id
        role { canManagePatients canAccessAllClinicalData }
      }
    }
  }
`

const procedureOrderSearchAuthorityQuery = `
  query ProcedureOrderSearchAuthority {
    authenticatedItem {
      ... on User {
        id
        role { canManagePatients canAccessAllClinicalData }
      }
    }
  }
`


export async function admitPatient(data: Record<string, unknown>) {
  return run(`mutation($data:AdmissionWorkflowInput!){admitPatient(data:$data){${result}}}`, { data }, inpatientPath)
}
export async function moveAdmission(variables: Record<string, unknown>) {
  const { operationKey: suppliedKey, ...payload } = variables
  const input = { ...payload, operationKey: typeof suppliedKey === 'string' ? suppliedKey : operationKey() }
  return run(`mutation($operationKey:String!,$admissionId:ID!,$toStatus:String!,$expectedVersion:Int!,$bedId:ID,$reasonCode:String,$dischargeDisposition:String){transitionAdmission(operationKey:$operationKey,admissionId:$admissionId,toStatus:$toStatus,expectedVersion:$expectedVersion,bedId:$bedId,reasonCode:$reasonCode,dischargeDisposition:$dischargeDisposition){${result}}}`, input, inpatientPath)
}
export async function setBedReadiness(bedId: string, toStatus: string, expectedVersion: number, suppliedKey?: string) {
  return run(`mutation($operationKey:String!,$bedId:ID!,$toStatus:String!,$expectedVersion:Int!){transitionBedReadiness(operationKey:$operationKey,bedId:$bedId,toStatus:$toStatus,expectedVersion:$expectedVersion){id status transitionVersion replayed}}`, { operationKey: suppliedKey || operationKey(), bedId, toStatus, expectedVersion }, inpatientPath)
}
export async function reserveBed(data: Record<string, unknown>) {
  return run(`mutation($data:BedReservationWorkflowInput!){reserveBed(data:$data){${result}}}`, { data }, inpatientPath)
}
export async function releaseBedReservation(reservationId: string, expectedVersion: number, reasonCode: string, suppliedKey?: string) {
  return run(`mutation($operationKey:String!,$reservationId:ID!,$expectedVersion:Int!,$reasonCode:String!){releaseBedReservation(operationKey:$operationKey,reservationId:$reservationId,expectedVersion:$expectedVersion,reasonCode:$reasonCode){${result}}}`, { operationKey: suppliedKey || operationKey(), reservationId, expectedVersion, reasonCode }, inpatientPath)
}
export async function placeMedicalOrder(data: Record<string, unknown>) {
  return run(`mutation($data:MedicalOrderWorkflowInput!){placeMedicalOrder(data:$data){${result}}}`, { data }, fulfillmentPath)
}
export async function moveMedicalOrder(orderId: string, toStatus: string, expectedVersion: number, suppliedKey?: string) {
  return run(`mutation($operationKey:String!,$orderId:ID!,$toStatus:String!,$expectedVersion:Int!){transitionMedicalOrder(operationKey:$operationKey,orderId:$orderId,toStatus:$toStatus,expectedVersion:$expectedVersion){${result}}}`, { operationKey: suppliedKey || operationKey(), orderId, toStatus, expectedVersion }, fulfillmentPath)
}
export async function recordLabResult(data: Record<string, unknown>) {
  const response = await run<{ recordLabResult: { originalAcknowledgement?: { state?: string } } }>(`mutation($data:LabResultWorkflowInput!){recordLabResult(data:$data){${result} originalAcknowledgement}}`, { data }, fulfillmentPath)
  if (response.data?.recordLabResult.originalAcknowledgement?.state?.startsWith('legacy_')) return { ...response, success: false, error: 'Existing result identity verified; original body/status/version remain unknown. Retain the exact command and use read-only readback.' }
  return response
}
export async function correctLabResult(data: Record<string, unknown>) {
  const response = await run<{ correctLabResult: { originalAcknowledgement?: { state?: string } } }>(`mutation($data:LabResultCorrectionInput!){correctLabResult(data:$data){${result} originalAcknowledgement}}`, { data }, fulfillmentPath)
  if (response.data?.correctLabResult.originalAcknowledgement?.state?.startsWith('legacy_')) return { ...response, success: false, error: 'Existing correction identity verified; original body/status/version remain unknown. Retain the exact command and use read-only readback.' }
  return response
}
export async function moveLabResult(resultId: string, toStatus: string, expectedVersion: number, suppliedKey?: string) {
  if (!suppliedKey) return { success: false, error: 'An exact lab transition operation key is required; no replacement identity was generated.' }
  const response = await run<{ transitionLabResult: { originalAcknowledgement?: { state?: string } } }>(`mutation($operationKey:String!,$resultId:ID!,$toStatus:String!,$expectedVersion:Int!){transitionLabResult(operationKey:$operationKey,resultId:$resultId,toStatus:$toStatus,expectedVersion:$expectedVersion){${result} originalAcknowledgement}}`, { operationKey: suppliedKey, resultId, toStatus, expectedVersion }, fulfillmentPath)
  if (response.data?.transitionLabResult.originalAcknowledgement?.state?.startsWith('legacy_')) return { ...response, success: false, error: 'Original transition status/version are known, but its full command is unavailable. Retain the identity and inspect owned result history; do not invent the body or a replacement key.' }
  return response
}
export async function recordPrescription(data: Record<string, unknown>) {
  return run(`mutation($data:PrescriptionWorkflowInput!){recordPrescription(data:$data){${result}}}`, { data }, fulfillmentPath)
}
export async function movePrescription(prescriptionId: string, toStatus: string, expectedVersion: number, suppliedKey?: string) {
  return run(`mutation($operationKey:String!,$prescriptionId:ID!,$toStatus:String!,$expectedVersion:Int!){transitionPrescription(operationKey:$operationKey,prescriptionId:$prescriptionId,toStatus:$toStatus,expectedVersion:$expectedVersion){${result}}}`, { operationKey: suppliedKey || operationKey(), prescriptionId, toStatus, expectedVersion }, fulfillmentPath)
}
export async function scheduleProcedure(data: Record<string, unknown>) {
  return run(`mutation($data:ProcedureWorkflowInput!){scheduleProcedure(data:$data){${result}}}`, { data }, fulfillmentPath)
}
export async function moveProcedure(procedureId: string, toStatus: string, expectedVersion: number, suppliedKey?: string) {
  return run(`mutation($operationKey:String!,$procedureId:ID!,$toStatus:String!,$expectedVersion:Int!){transitionProcedure(operationKey:$operationKey,procedureId:$procedureId,toStatus:$toStatus,expectedVersion:$expectedVersion){${result}}}`, { operationKey: suppliedKey || operationKey(), procedureId, toStatus, expectedVersion }, fulfillmentPath)
}
export async function draftClinicalDocument(data: Record<string, unknown>) {
  return run(`mutation($data:ClinicalDocumentWorkflowInput!){draftClinicalDocument(data:$data){${result}}}`, { data }, fulfillmentPath)
}
export async function collectSpecimen(data: Record<string, unknown>) {
  return run(`mutation($data:SpecimenWorkflowInput!){collectSpecimen(data:$data){${result}}}`, { data }, fulfillmentPath)
}
export async function recordVitalSign(data: Record<string, unknown>) {
  return run(`mutation($data:VitalSignWorkflowInput!){recordVitalSign(data:$data){id recordedAt replayed}}`, { data }, fulfillmentPath)
}
export async function establishCarePlan(data: Record<string, unknown>) {
  return run(`mutation($data:CarePlanWorkflowInput!){establishCarePlan(data:$data){${result}}}`, { data }, fulfillmentPath)
}
export async function moveCarePlan(carePlanId: string, toStatus: string, expectedVersion: number, suppliedKey?: string) {
  return run(`mutation($operationKey:String!,$carePlanId:ID!,$toStatus:String!,$expectedVersion:Int!){transitionCarePlan(operationKey:$operationKey,carePlanId:$carePlanId,toStatus:$toStatus,expectedVersion:$expectedVersion){${result}}}`, { operationKey: suppliedKey || operationKey(), carePlanId, toStatus, expectedVersion }, fulfillmentPath)
}
export async function prepareInsuranceClaim(data: Record<string, unknown>) {
  return run(`mutation($data:InsuranceClaimWorkflowInput!){prepareInsuranceClaim(data:$data){${result}}}`, { data }, claimsPath)
}
export async function moveInsuranceClaim(variables: Record<string, unknown>) {
  const { operationKey: suppliedKey, ...payload } = variables
  const input = { ...payload, operationKey: typeof suppliedKey === 'string' ? suppliedKey : operationKey() }
  return run(`mutation($operationKey:String!,$claimId:ID!,$toStatus:String!,$expectedVersion:Int!,$reasonCode:String,$notes:String){transitionInsuranceClaim(operationKey:$operationKey,claimId:$claimId,toStatus:$toStatus,expectedVersion:$expectedVersion,reasonCode:$reasonCode,notes:$notes){${result}}}`, input, claimsPath)
}

export async function searchOperationalPatients(facilityId: string, rawSearch: string) {
  const search = String(rawSearch || '').trim().slice(0, 100)
  if (!facilityId || search.length < 2) return { success: true, data: { workflowPatientCandidates: [] } }
  return keystoneClient<{ workflowPatientCandidates: Array<{ id: string; displayName: string }> }>(
    `query WorkflowPatientCandidates($facilityId:ID!,$search:String!){workflowPatientCandidates(facilityId:$facilityId,search:$search,take:25){id displayName}}`,
    { facilityId, search },
  )
}

export async function searchOperationalEncounters(facilityId: string, patientId: string, rawSearch: string) {
  const search = normalizeSelectorSearch(rawSearch)
  if (!facilityId || !patientId || search.length < 2) return { success: true, data: { workflowEncounterCandidates: [] } }
  return keystoneClient<{ workflowEncounterCandidates: Array<{ id: string; encounterNumber: string; status: string }> }>(
    `query WorkflowEncounterCandidates($facilityId:ID!,$patientId:ID!,$search:String!){workflowEncounterCandidates(facilityId:$facilityId,patientId:$patientId,search:$search,take:25,skip:0){id encounterNumber status}}`,
    { facilityId, patientId, search },
  )
}

export async function searchOperationalDepartments(facilityId: string, rawSearch: string) {
  const facility = String(facilityId || '').trim().slice(0, 200)
  const where = departmentCandidateWhere(facility, rawSearch)
  if (!where) return { success: true as const, data: { departments: [], departmentsCount: 0 } }

  const authority = await keystoneClient<{
    authenticatedItem?: { id?: string; role?: { canManagePatients?: boolean; canAccessAllClinicalData?: boolean } | null } | null
  }>(encounterOpeningSearchAuthorityQuery)
  const actor = authority.success ? authority.data.authenticatedItem : null
  if (!actor?.id || !actor.role || (!actor.role.canManagePatients && !actor.role.canAccessAllClinicalData)) {
    return { success: false as const, error: 'Encounter-opening authority could not be verified for this session.' }
  }

  const facilityWhere = { id: { equals: facility }, status: { equals: 'active' } }
  const facilityResponse = await keystoneClient<{ facilitiesCount: number }>(
    `query EncounterDepartmentFacility($where:FacilityWhereInput!){facilitiesCount(where:$where)}`,
    { where: facilityWhere },
  )
  if (!facilityResponse.success || !facilityResponse.data || !Number.isSafeInteger(facilityResponse.data.facilitiesCount) || facilityResponse.data.facilitiesCount !== 1) {
    return { success: false as const, error: 'An accessible active facility could not be verified for department search.' }
  }

  const response = await keystoneClient<{ departments: Array<{ id: string; name: string }>; departmentsCount: number }>(
    `query EncounterDepartmentCandidates($where:DepartmentWhereInput!){departments(where:$where,orderBy:[{name:asc},{id:asc}],take:25){id name} departmentsCount(where:$where)}`,
    { where },
  )
  if (!response.success) return response
  const rows = response.data?.departments
  const count = response.data?.departmentsCount
  if (!Array.isArray(rows) || rows.length > 25 || !rows.every(row => typeof row.id === 'string' && typeof row.name === 'string') || typeof count !== 'number' || !Number.isSafeInteger(count) || count < rows.length || (count > 25 ? rows.length !== 25 : count !== rows.length)) {
    return { success: false as const, error: 'Department candidates could not be verified for this session.' }
  }
  return response
}

export async function searchEncounterOpenPatientCandidates(facilityId: string, rawSearch: string) {
  const facility = String(facilityId || '').trim().slice(0, 200)
  const where = encounterPatientCandidateWhere(facility, rawSearch)
  if (!where) return { success: true as const, data: { patients: [], patientsCount: 0 } }

  const authority = await keystoneClient<{
    authenticatedItem?: { id?: string; role?: { canManagePatients?: boolean; canAccessAllClinicalData?: boolean } | null } | null
  }>(encounterOpeningSearchAuthorityQuery)
  const actor = authority.success ? authority.data.authenticatedItem : null
  if (!actor?.id || !actor.role || (!actor.role.canManagePatients && !actor.role.canAccessAllClinicalData)) {
    return { success: false as const, error: 'Encounter-opening authority could not be verified for this patient search.' }
  }

  const facilityWhere = { id: { equals: facility }, status: { equals: 'active' } }
  const facilityResponse = await keystoneClient<{ facilitiesCount: number }>(
    `query EncounterPatientFacility($where:FacilityWhereInput!){facilitiesCount(where:$where)}`,
    { where: facilityWhere },
  )
  if (!facilityResponse.success || !facilityResponse.data || !Number.isSafeInteger(facilityResponse.data.facilitiesCount) || facilityResponse.data.facilitiesCount !== 1) {
    return { success: false as const, error: 'An accessible active facility could not be verified for patient search.' }
  }

  const response = await keystoneClient<{
    patients: Array<{ id: string; displayName?: string | null }>
    patientsCount: number
  }>(
    `query EncounterOpenPatientCandidates($where:PatientWhereInput!){patients(where:$where,orderBy:[{lastName:asc},{firstName:asc},{id:asc}],take:25){id displayName} patientsCount(where:$where)}`,
    { where },
  )
  if (!response.success) return response
  const rows = response.data?.patients
  const count = response.data?.patientsCount
  if (!Array.isArray(rows) || rows.length > 25 || !rows.every(row => typeof row.id === 'string' && typeof row.displayName === 'string' && Boolean(row.displayName.trim())) || typeof count !== 'number' || !Number.isSafeInteger(count) || count < rows.length || (count > 25 ? rows.length !== 25 : count !== rows.length)) {
    return { success: false as const, error: 'Patient candidates could not be verified for this session.' }
  }
  return response
}

export async function searchAdmissionPatientCandidates(facilityId: string, rawSearch: string) {
  const facility = String(facilityId || '').trim().slice(0, 200)
  const where = activeFacilityPatientCandidateWhere(facility, rawSearch)
  if (!where) return { success: true as const, data: { patients: [], patientsCount: 0 } }

  const authority = await keystoneClient<{
    authenticatedItem?: { id?: string; role?: { canManagePatients?: boolean; canAccessAllClinicalData?: boolean } | null } | null
  }>(admissionPatientSearchAuthorityQuery)
  const actor = authority.success ? authority.data.authenticatedItem : null
  if (!actor?.id || !actor.role || (!actor.role.canManagePatients && !actor.role.canAccessAllClinicalData)) {
    return { success: false as const, error: 'Admission patient-search authority could not be verified for this session.' }
  }

  const facilityWhere = { id: { equals: facility }, status: { equals: 'active' } }
  const facilityResponse = await keystoneClient<{ facilitiesCount: number }>(
    `query AdmissionPatientFacility($where:FacilityWhereInput!){facilitiesCount(where:$where)}`,
    { where: facilityWhere },
  )
  if (!facilityResponse.success || !facilityResponse.data || !Number.isSafeInteger(facilityResponse.data.facilitiesCount) || facilityResponse.data.facilitiesCount !== 1) {
    return { success: false as const, error: 'An accessible active facility could not be verified for admission patient search.' }
  }

  const response = await keystoneClient<{
    patients: Array<{ id: string; displayName?: string | null }>
    patientsCount: number
  }>(
    `query AdmissionPatientCandidates($where:PatientWhereInput!){patients(where:$where,orderBy:[{lastName:asc},{firstName:asc},{id:asc}],take:25){id displayName} patientsCount(where:$where)}`,
    { where },
  )
  if (!response.success) return response
  const rows = response.data?.patients
  const count = response.data?.patientsCount
  if (!Array.isArray(rows) || rows.length > 25 || !rows.every(row => typeof row.id === 'string' && typeof row.displayName === 'string' && Boolean(row.displayName.trim())) || typeof count !== 'number' || !Number.isSafeInteger(count) || count < rows.length || (count > 25 ? rows.length !== 25 : count !== rows.length)) {
    return { success: false as const, error: 'Admission patient candidates could not be verified for this session.' }
  }
  return response
}

export async function searchOperationalLabTests(rawSearch: string) {
  const where = activeLabTestCandidateWhere(rawSearch)
  if (!where) return { success: true as const, data: { labTests: [], labTestsCount: 0 } }

  const authority = await keystoneClient<{
    authenticatedItem?: { id?: string; role?: { canManagePatients?: boolean; canAccessAllClinicalData?: boolean } | null } | null
  }>(encounterOpeningSearchAuthorityQuery)
  const actor = authority.success ? authority.data.authenticatedItem : null
  if (!actor?.id || !actor.role || (!actor.role.canManagePatients && !actor.role.canAccessAllClinicalData)) {
    return { success: false as const, error: 'Clinical fulfillment authority could not be verified for lab-test search.' }
  }

  const response = await keystoneClient<{
    labTests: Array<{ id: string; name: string; code?: string | null }>
    labTestsCount: number
  }>(
    `query OperationalLabTestCandidates($where:LabTestWhereInput!){labTests(where:$where,orderBy:[{name:asc},{id:asc}],take:25){id name code} labTestsCount(where:$where)}`,
    { where },
  )
  if (!response.success) return response
  const rows = response.data?.labTests
  const count = response.data?.labTestsCount
  if (!Array.isArray(rows) || rows.length > 25 || !rows.every(row => typeof row.id === 'string' && typeof row.name === 'string' && Boolean(row.name.trim()) && (row.code == null || typeof row.code === 'string')) || typeof count !== 'number' || !Number.isSafeInteger(count) || count < rows.length || (count > 25 ? rows.length !== 25 : count !== rows.length)) {
    return { success: false as const, error: 'Active lab-test candidates could not be verified for this session.' }
  }
  return response
}

export async function searchOperationalMedicationOrders(facilityId: string, patientId: string, encounterId: string, rawSearch: string) {
  const facility = String(facilityId || '').trim().slice(0, 200)
  const patient = String(patientId || '').trim().slice(0, 200)
  const encounter = String(encounterId || '').trim().slice(0, 200)
  const search = normalizeSelectorSearch(rawSearch)
  const where = activeMedicationOrderCandidateWhere(facility, patient, encounter, search)

  const authority = await keystoneClient<{
    authenticatedItem?: { id?: string; role?: { canManagePatients?: boolean; canAccessAllClinicalData?: boolean } | null } | null
  }>(medicationOrderSearchAuthorityQuery)
  if (!authority.success) {
    return { success: false as const, reason: 'unavailable' as const, error: 'Prescription order-search authority could not be verified for this session.' }
  }
  const actor = authority.data.authenticatedItem
  if (!actor?.id || !actor.role || (!actor.role.canManagePatients && !actor.role.canAccessAllClinicalData)) {
    return { success: false as const, reason: 'denied' as const, error: 'Clinical prescription authority is required for medication-order search.' }
  }
  if (search.length < 2) return { success: true as const, data: { medicalOrders: [], medicalOrdersCount: 0 } }
  if (!facility || !patient || !encounter) {
    return { success: false as const, reason: 'denied' as const, error: 'Select an accessible facility, patient, and encounter before searching medication orders.' }
  }
  if (!where) return { success: false as const, reason: 'unavailable' as const, error: 'Medication-order search scope could not be verified.' }

  const [facilityResponse, patientResponse, encounterResponse] = await Promise.all([
    keystoneClient<{ facilitiesCount: number }>(
      `query MedicationOrderSearchFacility($where:FacilityWhereInput!){facilitiesCount(where:$where)}`,
      { where: { id: { equals: facility }, status: { equals: 'active' } } },
    ),
    keystoneClient<{ patients: Array<{ id: string }>; patientsCount: number }>(
      `query MedicationOrderSearchPatient($where:PatientWhereInput!){patients(where:$where,take:2){id} patientsCount(where:$where)}`,
      { where: { id: { equals: patient }, status: { equals: 'active' }, facilities: { some: { id: { equals: facility } } } } },
    ),
    keystoneClient<{ encounters: Array<{ id: string }>; encountersCount: number }>(
      `query MedicationOrderSearchEncounter($where:EncounterWhereInput!){encounters(where:$where,take:2){id} encountersCount(where:$where)}`,
      { where: { id: { equals: encounter }, facility: { id: { equals: facility } }, patient: { id: { equals: patient } } } },
    ),
  ])
  if (!facilityResponse.success || !patientResponse.success || !encounterResponse.success || !facilityResponse.data || !patientResponse.data || !encounterResponse.data) {
    return { success: false as const, reason: 'unavailable' as const, error: 'Facility, patient, or encounter access could not be verified for medication-order search.' }
  }
  if (!Number.isSafeInteger(facilityResponse.data.facilitiesCount) || facilityResponse.data.facilitiesCount !== 1 ||
    patientResponse.data.patientsCount !== 1 || patientResponse.data.patients?.length !== 1 || patientResponse.data.patients[0]?.id !== patient ||
    encounterResponse.data.encountersCount !== 1 || encounterResponse.data.encounters?.length !== 1 || encounterResponse.data.encounters[0]?.id !== encounter) {
    return { success: false as const, reason: 'denied' as const, error: 'Selected facility, patient, or encounter is not accessible in this scope.' }
  }

  const response = await keystoneClient<{
    medicalOrders: Array<{ id: string; orderNumber: string; status: string }>
    medicalOrdersCount: number
  }>(
    `query OperationalMedicationOrderCandidates($where:MedicalOrderWhereInput!){medicalOrders(where:$where,orderBy:[{orderNumber:asc},{id:asc}],take:25){id orderNumber status} medicalOrdersCount(where:$where)}`,
    { where },
  )
  if (!response.success) return { success: false as const, reason: 'unavailable' as const, error: 'Medication-order candidates could not be loaded for this session.' }
  const rows = response.data?.medicalOrders
  const count = response.data?.medicalOrdersCount
  if (!Array.isArray(rows) || rows.length > 25 || !rows.every(row => typeof row.id === 'string' && typeof row.orderNumber === 'string' && Boolean(row.orderNumber.trim()) && typeof row.status === 'string' && ['ordered', 'in_progress'].includes(row.status)) || typeof count !== 'number' || !Number.isSafeInteger(count) || count < rows.length || (count > 25 ? rows.length !== 25 : count !== rows.length)) {
    return { success: false as const, reason: 'unavailable' as const, error: 'Medication-order candidates could not be verified for this session.' }
  }
  return { success: true as const, data: response.data }
}

export async function searchOperationalProcedureOrders(facilityId: string, patientId: string, encounterId: string, rawSearch: string) {
  const facility = String(facilityId || '').trim().slice(0, 200)
  const patient = String(patientId || '').trim().slice(0, 200)
  const encounter = String(encounterId || '').trim().slice(0, 200)
  const search = normalizeSelectorSearch(rawSearch)
  const where = activeProcedureOrderCandidateWhere(facility, patient, encounter, search)

  const authority = await keystoneClient<{
    authenticatedItem?: { id?: string; role?: { canManagePatients?: boolean; canAccessAllClinicalData?: boolean } | null } | null
  }>(procedureOrderSearchAuthorityQuery)
  if (!authority.success) {
    return { success: false as const, reason: 'unavailable' as const, error: 'Procedure coordination authority could not be verified for order search.' }
  }
  const actor = authority.data.authenticatedItem
  if (!actor?.id || !actor.role || (!actor.role.canManagePatients && !actor.role.canAccessAllClinicalData)) {
    return { success: false as const, reason: 'denied' as const, error: 'Clinical procedure-coordination authority is required for order search.' }
  }
  if (search.length < 2) return { success: true as const, data: { medicalOrders: [], medicalOrdersCount: 0 } }
  if (!facility || !patient || !encounter) {
    return { success: false as const, reason: 'denied' as const, error: 'Select an accessible facility, patient, and encounter before searching procedure orders.' }
  }
  if (!where) return { success: false as const, reason: 'unavailable' as const, error: 'Procedure-order search scope could not be verified.' }

  const [facilityResponse, patientResponse, encounterResponse] = await Promise.all([
    keystoneClient<{ facilitiesCount: number }>(
      `query ProcedureOrderSearchFacility($where:FacilityWhereInput!){facilitiesCount(where:$where)}`,
      { where: { id: { equals: facility }, status: { equals: 'active' } } },
    ),
    keystoneClient<{ patients: Array<{ id: string }>; patientsCount: number }>(
      `query ProcedureOrderSearchPatient($where:PatientWhereInput!){patients(where:$where,take:2){id} patientsCount(where:$where)}`,
      { where: { id: { equals: patient }, status: { equals: 'active' }, facilities: { some: { id: { equals: facility } } } } },
    ),
    keystoneClient<{ encounters: Array<{ id: string }>; encountersCount: number }>(
      `query ProcedureOrderSearchEncounter($where:EncounterWhereInput!){encounters(where:$where,take:2){id} encountersCount(where:$where)}`,
      { where: { id: { equals: encounter }, facility: { id: { equals: facility } }, patient: { id: { equals: patient } } } },
    ),
  ])
  if (!facilityResponse.success || !patientResponse.success || !encounterResponse.success || !facilityResponse.data || !patientResponse.data || !encounterResponse.data) {
    return { success: false as const, reason: 'unavailable' as const, error: 'Facility, patient, or encounter access could not be verified for procedure-order search.' }
  }
  if (!Number.isSafeInteger(facilityResponse.data.facilitiesCount) || facilityResponse.data.facilitiesCount !== 1 ||
    patientResponse.data.patientsCount !== 1 || patientResponse.data.patients?.length !== 1 || patientResponse.data.patients[0]?.id !== patient ||
    encounterResponse.data.encountersCount !== 1 || encounterResponse.data.encounters?.length !== 1 || encounterResponse.data.encounters[0]?.id !== encounter) {
    return { success: false as const, reason: 'denied' as const, error: 'Selected facility, patient, or encounter is not accessible in this scope.' }
  }

  const response = await keystoneClient<{
    medicalOrders: Array<{ id: string; orderNumber: string; status: string }>
    medicalOrdersCount: number
  }>(
    `query OperationalProcedureOrderCandidates($where:MedicalOrderWhereInput!){medicalOrders(where:$where,orderBy:[{orderNumber:asc},{id:asc}],take:25){id orderNumber status} medicalOrdersCount(where:$where)}`,
    { where },
  )
  if (!response.success) return { success: false as const, reason: 'unavailable' as const, error: 'Procedure-order candidates could not be loaded for this session.' }
  const rows = response.data?.medicalOrders
  const count = response.data?.medicalOrdersCount
  if (!Array.isArray(rows) || rows.length > 25 || !rows.every(row => typeof row.id === 'string' && typeof row.orderNumber === 'string' && Boolean(row.orderNumber.trim()) && typeof row.status === 'string' && ['ordered', 'in_progress'].includes(row.status)) || typeof count !== 'number' || !Number.isSafeInteger(count) || count < rows.length || (count > 25 ? rows.length !== 25 : count !== rows.length)) {
    return { success: false as const, reason: 'unavailable' as const, error: 'Procedure-order candidates could not be verified for this session.' }
  }
  return { success: true as const, data: response.data }
}

export async function searchOperationalLabOrders(facilityId: string, patientId: string, encounterId: string, rawSearch: string) {
  const facility = String(facilityId || '').trim().slice(0, 200)
  const patient = String(patientId || '').trim().slice(0, 200)
  const encounter = String(encounterId || '').trim().slice(0, 200)
  const search = normalizeSelectorSearch(rawSearch)

  const authority = await keystoneClient<{
    authenticatedItem?: { id?: string; role?: { canManagePatients?: boolean; canAccessAllClinicalData?: boolean } | null } | null
  }>(encounterOpeningSearchAuthorityQuery)
  if (!authority.success) return { success: false as const, reason: 'unavailable' as const, error: 'Clinical fulfillment authority could not be verified for lab-order search.' }
  const actor = authority.data.authenticatedItem
  if (!actor?.id || !actor.role || (!actor.role.canManagePatients && !actor.role.canAccessAllClinicalData)) {
    return { success: false as const, reason: 'denied' as const, error: 'Clinical fulfillment authority is required for lab-order search.' }
  }
  if (search.length < 2) return { success: true as const, data: { medicalOrders: [], medicalOrdersCount: 0 } }
  if (!facility || !patient || !encounter) {
    return { success: false as const, reason: 'denied' as const, error: 'Select an accessible facility, patient, and encounter before searching lab orders.' }
  }
  const where = activeLabOrderCandidateWhere(facility, patient, encounter, search)
  if (!where) return { success: false as const, reason: 'unavailable' as const, error: 'Lab-order search scope could not be verified.' }

  const [facilityResponse, patientResponse, encounterResponse] = await Promise.all([
    keystoneClient<{ facilitiesCount: number }>(
      `query LabOrderSearchFacility($where:FacilityWhereInput!){facilitiesCount(where:$where)}`,
      { where: { id: { equals: facility }, status: { equals: 'active' } } },
    ),
    keystoneClient<{ patients: Array<{ id: string }>; patientsCount: number }>(
      `query LabOrderSearchPatient($where:PatientWhereInput!){patients(where:$where,take:2){id} patientsCount(where:$where)}`,
      { where: { id: { equals: patient }, status: { equals: 'active' }, facilities: { some: { id: { equals: facility } } } } },
    ),
    keystoneClient<{ encounters: Array<{ id: string }>; encountersCount: number }>(
      `query LabOrderSearchEncounter($where:EncounterWhereInput!){encounters(where:$where,take:2){id} encountersCount(where:$where)}`,
      { where: { id: { equals: encounter }, facility: { id: { equals: facility } }, patient: { id: { equals: patient } } } },
    ),
  ])
  if (!facilityResponse.success || !patientResponse.success || !encounterResponse.success || !facilityResponse.data || !patientResponse.data || !encounterResponse.data) {
    return { success: false as const, reason: 'unavailable' as const, error: 'Facility, patient, or encounter access could not be verified for lab-order search.' }
  }
  if (!Number.isSafeInteger(facilityResponse.data.facilitiesCount) || facilityResponse.data.facilitiesCount !== 1 ||
    patientResponse.data.patientsCount !== 1 || patientResponse.data.patients?.length !== 1 || patientResponse.data.patients[0]?.id !== patient ||
    encounterResponse.data.encountersCount !== 1 || encounterResponse.data.encounters?.length !== 1 || encounterResponse.data.encounters[0]?.id !== encounter) {
    return { success: false as const, reason: 'denied' as const, error: 'Selected facility, patient, or encounter is not accessible in this scope.' }
  }

  const response = await keystoneClient<{
    medicalOrders: Array<{ id: string; orderNumber: string; status: string }>
    medicalOrdersCount: number
  }>(
    `query OperationalLabOrderCandidates($where:MedicalOrderWhereInput!){medicalOrders(where:$where,orderBy:[{orderNumber:asc},{id:asc}],take:25){id orderNumber status} medicalOrdersCount(where:$where)}`,
    { where },
  )
  if (!response.success) return { success: false as const, reason: 'unavailable' as const, error: 'Active lab-order candidates could not be loaded for this session.' }
  const rows = response.data?.medicalOrders
  const count = response.data?.medicalOrdersCount
  if (!Array.isArray(rows) || rows.length > 25 || !rows.every(row => typeof row.id === 'string' && typeof row.orderNumber === 'string' && Boolean(row.orderNumber.trim()) && typeof row.status === 'string') || typeof count !== 'number' || !Number.isSafeInteger(count) || count < rows.length || (count > 25 ? rows.length !== 25 : count !== rows.length)) {
    return { success: false as const, reason: 'unavailable' as const, error: 'Active lab-order candidates could not be verified for this session.' }
  }
  return { success: true as const, data: response.data }
}

export async function searchCorrectableLabResults(rawSearch: string) {
  const where = correctableLabResultCandidateWhere(rawSearch)
  const authority = await keystoneClient<{
    authenticatedItem?: { id?: string; role?: { canManagePatients?: boolean; canAccessAllClinicalData?: boolean } | null } | null
  }>(clinicalCorrectionSearchAuthorityQuery)
  if (!authority.success) {
    return { success: false as const, reason: 'unavailable' as const, error: 'Clinical correction authority could not be verified for lab-result search.' }
  }
  const actor = authority.data.authenticatedItem
  if (!actor?.id || !actor.role || (!actor.role.canManagePatients && !actor.role.canAccessAllClinicalData)) {
    return { success: false as const, reason: 'denied' as const, error: 'Clinical correction authority is required for lab-result search.' }
  }
  if (!where) return { success: true as const, data: { labResults: [], labResultsCount: 0 } }

  const response = await keystoneClient<{
    labResults: Array<{ id: string; resultNumber: string; version: number; status: string }>
    labResultsCount: number
  }>(
    `query CorrectableLabResultCandidates($where:LabResultWhereInput!){labResults(where:$where,orderBy:[{resultNumber:asc},{id:asc}],take:25){id resultNumber version status} labResultsCount(where:$where)}`,
    { where },
  )
  if (!response.success) {
    return { success: false as const, reason: 'unavailable' as const, error: 'Correctable lab-result candidates could not be loaded for this session.' }
  }
  const rows = response.data?.labResults
  const count = response.data?.labResultsCount
  if (!Array.isArray(rows) || rows.length > 25 || !rows.every(row =>
    typeof row.id === 'string' && typeof row.resultNumber === 'string' && Boolean(row.resultNumber.trim()) &&
    Number.isSafeInteger(row.version) && row.version > 0 && ['final', 'acknowledged', 'corrected'].includes(row.status),
  ) || typeof count !== 'number' || !Number.isSafeInteger(count) || count < rows.length || (count > 25 ? rows.length !== 25 : count !== rows.length)) {
    return { success: false as const, reason: 'unavailable' as const, error: 'Correctable lab-result candidates could not be verified for this session.' }
  }
  return { success: true as const, data: response.data }
}

export async function searchOperationalClinicians(facilityId: string, rawSearch: string) {
  const facility = String(facilityId || '').trim().slice(0, 200)
  const where = activeFacilityClinicianCandidateWhere(facility, rawSearch)
  if (!where) return { success: true as const, data: { clinicians: [], cliniciansCount: 0 } }

  const authority = await keystoneClient<{
    authenticatedItem?: { id?: string; role?: { canManagePatients?: boolean; canAccessAllClinicalData?: boolean } | null } | null
  }>(encounterOpeningSearchAuthorityQuery)
  const actor = authority.success ? authority.data.authenticatedItem : null
  if (!actor?.id || !actor.role || (!actor.role.canManagePatients && !actor.role.canAccessAllClinicalData)) {
    return { success: false as const, error: 'Clinical fulfillment authority could not be verified for clinician search.' }
  }

  const facilityResponse = await keystoneClient<{ facilitiesCount: number }>(
    `query OperationalClinicianFacility($where:FacilityWhereInput!){facilitiesCount(where:$where)}`,
    { where: { id: { equals: facility }, status: { equals: 'active' } } },
  )
  if (!facilityResponse.success || !facilityResponse.data || !Number.isSafeInteger(facilityResponse.data.facilitiesCount) || facilityResponse.data.facilitiesCount !== 1) {
    return { success: false as const, error: 'An accessible active facility could not be verified for clinician search.' }
  }

  const response = await keystoneClient<{
    clinicians: Array<{ id: string; displayName?: string | null; clinicianType?: string | null }>
    cliniciansCount: number
  }>(
    `query OperationalClinicianCandidates($where:ClinicianWhereInput!){clinicians(where:$where,orderBy:[{displayName:asc},{id:asc}],take:25){id displayName clinicianType} cliniciansCount(where:$where)}`,
    { where },
  )
  if (!response.success) return response
  const rows = response.data?.clinicians
  const count = response.data?.cliniciansCount
  if (!Array.isArray(rows) || rows.length > 25 || !rows.every(row => typeof row.id === 'string' && typeof row.displayName === 'string' && Boolean(row.displayName.trim()) && (row.clinicianType == null || typeof row.clinicianType === 'string')) || typeof count !== 'number' || !Number.isSafeInteger(count) || count < rows.length || (count > 25 ? rows.length !== 25 : count !== rows.length)) {
    return { success: false as const, error: 'Active clinician candidates could not be verified for this session.' }
  }
  return response
}

type OperationalProviderCandidates = {
  providers: Array<{ id: string; displayName?: string | null; specialty?: string | null }>
  providersCount: number
}

export async function searchOperationalProviders(facilityId: string, rawSearch: string): Promise<KeystoneResponse<OperationalProviderCandidates>> {
  const where = providerCandidateWhere(facilityId, rawSearch)
  if (!where) return { success: true, data: { providers: [], providersCount: 0 } }
  return keystoneClient<OperationalProviderCandidates>(
    `query OperationalProviderCandidates($where:ProviderWhereInput!){providers(where:$where,orderBy:[{firstName:asc},{lastName:asc},{id:asc}],take:25){id displayName specialty} providersCount(where:$where)}`,
    { where },
  )
}

export async function searchOperationalCoverages(facilityId: string, patientId: string, rawSearch: string) {
  const where = patientCoverageCandidateWhere(facilityId, patientId, rawSearch)
  if (!where) return { success: true, data: { patientCoverages: [], patientCoveragesCount: 0 } }
  return keystoneClient<{
    patientCoverages: Array<{ id: string; coverageNumber: string; payerName: string }>
    patientCoveragesCount: number
  }>(
    `query OperationalCoverageCandidates($where:PatientCoverageWhereInput!){patientCoverages(where:$where,orderBy:[{coverageNumber:asc},{id:asc}],take:25){id coverageNumber payerName} patientCoveragesCount(where:$where)}`,
    { where },
  )
}

export async function searchOperationalBeds(facilityId: string, rawSearch: string) {
  const where = availableBedCandidateWhere(facilityId, rawSearch)
  if (!where) return { success: true, data: { beds: [], bedsCount: 0 } }
  return keystoneClient<{
    beds: Array<{
      id: string
      bedNumber: string
      transitionVersion: number
      room?: { roomNumber?: string | null; ward?: { name?: string | null } | null } | null
    }>
    bedsCount: number
  }>(
    `query OperationalBedCandidates($where:BedWhereInput!){beds(where:$where,orderBy:[{bedNumber:asc},{id:asc}],take:25){id bedNumber transitionVersion room{roomNumber ward{name}}} bedsCount(where:$where)}`,
    { where },
  )
}
