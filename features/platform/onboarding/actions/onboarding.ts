'use server'

import { revalidatePath } from 'next/cache'
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'

export type OnboardingStatus = 'not_started' | 'in_progress' | 'completed' | 'dismissed'

export type OnboardingAccessLink = { label: string; href: string; expiresAt: string }

async function persistOnboardingStatus(status: OnboardingStatus) {
  const response = await keystoneClient<{
    updateActiveUser: { id: string; onboardingStatus: string }
  }>(`
    mutation UpdateOnboardingStatus($data: UserUpdateProfileInput!) {
      updateActiveUser(data: $data) {
        id
        onboardingStatus
      }
    }
  `, { data: { onboardingStatus: status } })

  if (!response.success) {
    throw new Error(response.error || 'Unable to update onboarding status')
  }
  return response.data?.updateActiveUser
}

export async function applyHospitalOnboarding(configuration: unknown) {
  // Keep status transitions and deterministic setup in one server-action round
  // trip. A separate start action refreshes the RSC tree and resets the active
  // dialog before its controlled onboarding mutation can run.
  await persistOnboardingStatus('in_progress')
  const response = await keystoneClient<{
    applyHospitalOnboarding: {
      status: string
      referenceDate: string
      counts: Record<string, number>
      intakeLinks: OnboardingAccessLink[]
    }
  }>(`
    mutation ApplyHospitalOnboarding($configuration: JSON!) {
      applyHospitalOnboarding(configuration: $configuration) {
        status
        referenceDate
        counts
        intakeLinks { label href expiresAt }
      }
    }
  `, { configuration })

  if (response.success && response.data?.applyHospitalOnboarding.status === 'completed') {
    await persistOnboardingStatus('completed')
    revalidatePath('/dashboard')
    revalidatePath('/dashboard/(admin)')
  }
  return response
}

export async function updateOnboardingStatus(status: OnboardingStatus) {
  try {
    const data = await persistOnboardingStatus(status)
    revalidatePath('/dashboard')
    revalidatePath('/dashboard/(admin)')
    return { success: true, data }
  } catch (error) {
    console.error('Error updating onboarding status:', error)
    throw error instanceof Error ? error : new Error('An unexpected error occurred')
  }
}

export async function dismissOnboarding() {
  return updateOnboardingStatus('dismissed')
}

export async function startOnboarding() {
  return updateOnboardingStatus('in_progress')
}

export async function completeOnboarding() {
  return updateOnboardingStatus('completed')
}
