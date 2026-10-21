export type OperatorOnboardingStatus = 'not_started' | 'in_progress' | 'completed' | 'dismissed' | string | null | undefined

export function onboardingEntryState(input: {
  canManageOnboarding: boolean
  onboardingStatus: OperatorOnboardingStatus
}): 'available' | 'hidden' {
  if (!input.canManageOnboarding) return 'hidden'
  return input.onboardingStatus === 'not_started' || input.onboardingStatus === 'in_progress'
    ? 'available'
    : 'hidden'
}
