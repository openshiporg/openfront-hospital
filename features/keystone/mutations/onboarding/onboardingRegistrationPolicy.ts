import { REGISTRATION_CONSENT, type RegistrationConsentInput } from '../registration/registrationPolicy'

type ExistingRegistration = {
  patientId: string
  duplicateResolution: string
  consent: { policyVersion: string; statementKey: string }
}

type DuplicateCandidate = {
  patientId: string
  reasons: string[]
}

export function onboardingRegistrationReplayFields(existing: ExistingRegistration | null) {
  if (!existing) {
    return {
      consent: {
        accepted: true,
        policyVersion: REGISTRATION_CONSENT.policyVersion,
        statementKey: REGISTRATION_CONSENT.statementKey,
      } satisfies RegistrationConsentInput,
      duplicateResolution: null,
      duplicatePatientId: null,
    }
  }

  const duplicateResolution = existing.duplicateResolution === 'link_existing' || existing.duplicateResolution === 'create_new'
    ? existing.duplicateResolution
    : null

  return {
    consent: {
      accepted: true,
      policyVersion: existing.consent.policyVersion,
      statementKey: existing.consent.statementKey,
    } satisfies RegistrationConsentInput,
    duplicateResolution,
    duplicatePatientId: duplicateResolution === 'link_existing' ? existing.patientId : null,
  }
}

export function selectDeterministicOnboardingDuplicate(candidates: DuplicateCandidate[]) {
  if (candidates.length !== 1) return null
  const [candidate] = candidates
  const hasName = candidate.reasons.includes('date_of_birth_and_name')
  const hasContact = candidate.reasons.includes('date_of_birth_and_email') || candidate.reasons.includes('date_of_birth_and_phone')
  return hasName && hasContact ? candidate.patientId : null
}
