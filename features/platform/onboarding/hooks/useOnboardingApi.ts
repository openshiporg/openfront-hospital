import { applyHospitalOnboarding, type OnboardingAccessLink } from '../actions/onboarding'
import type { OnboardingStep, TemplateType } from './useOnboardingState'

interface OnboardingApiProps {
  selectedTemplate: TemplateType
  currentJsonData: unknown
  completedItems: Record<string, string[]>
  setProgress: (message: string) => void
  setItemLoading: (type: string, item: string) => void
  setItemCompleted: (type: string, item: string) => void
  setItemError: (type: string, item: string, errorMessage: string) => void
  setStep: (step: OnboardingStep) => void
  setError: (error: string | null) => void
  setIsLoading: (loading: boolean) => void
  setOnboardingLinks: (links: OnboardingAccessLink[]) => void
  resetOnboardingState: () => void
}

export function useOnboardingApi({
  selectedTemplate,
  currentJsonData,
  completedItems,
  setProgress,
  setItemLoading,
  setItemCompleted,
  setItemError,
  setStep,
  setError,
  setIsLoading,
  setOnboardingLinks,
  resetOnboardingState,
}: OnboardingApiProps) {
  void selectedTemplate
  void completedItems
  void setItemLoading
  void setItemCompleted
  void setItemError

  const runOnboarding = async () => {
    setIsLoading(true)
    setError(null)
    resetOnboardingState()
    setStep('progress')
    setProgress('Starting hospital setup...')
    try {
      setProgress('Applying deterministic hospital records...')
      const response = await applyHospitalOnboarding(currentJsonData)
      if (!response.success || response.data.applyHospitalOnboarding.status !== 'completed') {
        throw new Error(response.success ? 'Hospital setup did not complete' : response.error)
      }
      setOnboardingLinks(response.data.applyHospitalOnboarding.intakeLinks || [])
      setProgress(`Healthcare setup complete for reference date ${response.data.applyHospitalOnboarding.referenceDate}.`)
      setStep('done')
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Hospital setup failed')
    } finally {
      setIsLoading(false)
    }
  }

  return { runOnboarding }
}
