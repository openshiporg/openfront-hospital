export type ViewerRole = {
  canManageAppointments?: boolean | null
  canManagePatients?: boolean | null
  canManageIntake?: boolean | null
  canManageCommunications?: boolean | null
  canManageBilling?: boolean | null
  canManageDataPortability?: boolean | null
  canManageRetention?: boolean | null
  canViewReports?: boolean | null
  canAccessAllClinicalData?: boolean | null
}

type FacilityRef = { id?: string; name?: string | null; timeZone?: string | null } | null

export type PatientChart = {
  id: string
  displayName?: string | null
  status?: string | null
  dateOfBirth?: string | null
  phone?: string | null
  email?: string | null
  preferredContactMethod?: string | null
  emergencyContactName?: string | null
  emergencyContactPhone?: string | null
  notes?: string | null
  createdAt?: string | null
  facilities?: Array<{ id: string; name?: string | null; city?: string | null; region?: string | null; timeZone?: string | null }> | null
  identifiers?: Array<{ id: string; identifierType?: string | null; maskedValue?: string | null; status?: string | null; createdAt?: string | null; facility?: FacilityRef }> | null
  identifiersCount?: number | null
  appointments?: Array<{
    id: string
    appointmentNumber?: string | null
    status?: string | null
    startsAt?: string | null
    endsAt?: string | null
    facility?: FacilityRef
    provider?: { displayName?: string | null } | null
    appointmentType?: { name?: string | null } | null
  }> | null
  appointmentsCount?: number | null
  intakeForms?: Array<{ id: string; title?: string | null; status?: string | null; submittedAt?: string | null; reviewedAt?: string | null; createdAt?: string | null; appointment?: { appointmentNumber?: string | null } | null; facility?: FacilityRef }> | null
  intakeFormsCount?: number | null
  messages?: Array<{ id: string; channel?: string | null; direction?: string | null; purpose?: string | null; status?: string | null; subject?: string | null; sentAt?: string | null; createdAt?: string | null; appointment?: { appointmentNumber?: string | null } | null; facility?: FacilityRef }> | null
  messagesCount?: number | null
  consents?: Array<{ id: string; consentType?: string | null; decision?: string | null; policyVersion?: string | null; effectiveAt?: string | null; captureMethod?: string | null; facility?: FacilityRef }> | null
  consentsCount?: number | null
  registrations?: Array<{ id: string; status?: string | null; duplicateResolution?: string | null; createdAt?: string | null; facility?: FacilityRef; identifier?: { maskedValue?: string | null } | null }> | null
  registrationsCount?: number | null
}

export type PatientEncounters = {
  encounters: Array<{ id: string; encounterNumber?: string | null; status?: string | null; startedAt?: string | null; endedAt?: string | null; createdAt?: string | null; facility?: FacilityRef; provider?: { displayName?: string | null } | null }>
  encountersCount: number
}

export type PatientBilling = {
  patientCoverages: Array<{ id: string; coverageNumber?: string | null; status?: string | null; payerName?: string | null; effectiveAt?: string | null; terminatesAt?: string | null; facility?: FacilityRef }>
  patientCoveragesCount: number
  patientPayments: Array<{ id: string; paymentNumber?: string | null; status?: string | null; amountCents?: number | null; currency?: string | null; method?: string | null; receivedAt?: string | null; createdAt?: string | null; facility?: FacilityRef }>
  patientPaymentsCount: number
}
