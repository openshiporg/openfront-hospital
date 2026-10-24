'use server'

import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import type { PatientBilling, PatientChart, PatientEncounters, ViewerRole } from '../types'

const SECTION_TAKE = 25

const chartQuery = `
  query PatientChart($id: ID!, $take: Int!) {
    patient(where: { id: $id }) {
      id displayName status dateOfBirth phone email preferredContactMethod
      emergencyContactName emergencyContactPhone notes createdAt
      facilities(orderBy: [{ name: asc }], take: 25) { id name city region timeZone }
      identifiers(orderBy: [{ createdAt: desc }], take: $take) { id identifierType maskedValue status createdAt facility { name } }
      identifiersCount
      appointments(orderBy: [{ startsAt: desc }], take: 50) {
        id appointmentNumber status startsAt endsAt
        facility { name timeZone } provider { displayName } appointmentType { name }
      }
      appointmentsCount
      intakeForms(orderBy: [{ createdAt: desc }], take: $take) {
        id title status submittedAt reviewedAt createdAt appointment { appointmentNumber } facility { timeZone }
      }
      intakeFormsCount
      messages(orderBy: [{ createdAt: desc }], take: $take) {
        id channel direction purpose status subject sentAt createdAt appointment { appointmentNumber } facility { timeZone }
      }
      messagesCount
      consents(orderBy: [{ effectiveAt: desc }], take: $take) { id consentType decision policyVersion effectiveAt captureMethod facility { timeZone } }
      consentsCount
      registrations(orderBy: [{ createdAt: desc }], take: $take) {
        id status duplicateResolution createdAt facility { name timeZone } identifier { maskedValue }
      }
      registrationsCount
    }
  }
`

export async function getPatientChart(id: string) {
  return keystoneClient<{ patient: PatientChart | null }>(chartQuery, { id, take: SECTION_TAKE })
}

export async function getPatientEncounters(id: string) {
  const where = { patient: { id: { equals: id } } }
  return keystoneClient<PatientEncounters>(
    `query PatientEncounters($where: EncounterWhereInput!, $take: Int!) {
      encounters(where: $where, orderBy: [{ createdAt: desc }], take: $take) {
        id encounterNumber status startedAt endedAt createdAt facility { name timeZone } provider { displayName }
      }
      encountersCount(where: $where)
    }`,
    { where, take: SECTION_TAKE },
  )
}

export async function getPatientBilling(id: string) {
  const coverageWhere = { patient: { id: { equals: id } } }
  const paymentWhere = { patient: { id: { equals: id } } }
  return keystoneClient<PatientBilling>(
    `query PatientBilling($coverageWhere: PatientCoverageWhereInput!, $paymentWhere: PatientPaymentWhereInput!, $take: Int!) {
      patientCoverages(where: $coverageWhere, orderBy: [{ createdAt: desc }], take: $take) {
        id coverageNumber status payerName effectiveAt terminatesAt facility { name timeZone }
      }
      patientCoveragesCount(where: $coverageWhere)
      patientPayments(where: $paymentWhere, orderBy: [{ createdAt: desc }], take: $take) {
        id paymentNumber status amountCents currency method receivedAt createdAt facility { name timeZone }
      }
      patientPaymentsCount(where: $paymentWhere)
    }`,
    { coverageWhere, paymentWhere, take: SECTION_TAKE },
  )
}

export async function getPatientViewerRole() {
  const response = await keystoneClient<{ authenticatedItem: { role?: ViewerRole | null } | null }>(
    `query PatientChartViewer {
      authenticatedItem {
        ... on User {
          role {
            canManageAppointments canManagePatients canManageIntake canManageCommunications canManageBilling
            canManageDataPortability canManageRetention canViewReports canAccessAllClinicalData
          }
        }
      }
    }`,
  )
  if (!response.success) return null
  return response.data.authenticatedItem?.role ?? null
}
