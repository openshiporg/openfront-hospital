import { useState } from 'react'
import { getSeedForTemplate } from '../utils/dataUtils'
import seedData from '../lib/seed.json'
import type { OnboardingAccessLink } from '../actions/onboarding'

export type OnboardingStep = 'template' | 'custom' | 'progress' | 'done'
export type TemplateType = 'full' | 'minimal' | 'custom'

export interface OnboardingState {
  step: OnboardingStep
  selectedTemplate: TemplateType
  currentJsonData: any
  customJsonApplied: boolean
  progressMessage: string
  loadingItems: Record<string, string[]>
  completedItems: Record<string, string[]>
  error: string | null
  itemErrors: Record<string, Record<string, string | undefined>>
  isLoading: boolean
  onboardingLinks: OnboardingAccessLink[]
}

const initialItemsState = {
  practiceInfo: [],
  departments: [],
  facilities: [],
  providers: [],
  clinicians: [],
  appointmentTypes: [],
  scheduleBlocks: [],
  patients: [],
  appointments: [],
  intakeForms: [],
  messages: [],
}

export function useOnboardingState() {
  const [state, setState] = useState<OnboardingState>({
    step: 'template',
    selectedTemplate: 'full',
    currentJsonData: getSeedForTemplate('full', seedData),
    customJsonApplied: false,
    progressMessage: '',
    loadingItems: { ...initialItemsState },
    completedItems: { ...initialItemsState },
    error: null,
    itemErrors: {},
    isLoading: false,
    onboardingLinks: [],
  })

  const setStep = (step: OnboardingStep) => setState((prev) => ({ ...prev, step }))
  const setSelectedTemplate = (template: TemplateType) => {
    const templateToUse = template === 'custom' ? 'minimal' : template
    const templateData = getSeedForTemplate(templateToUse, seedData)
    setState((prev) => ({ ...prev, selectedTemplate: template, currentJsonData: templateData, customJsonApplied: false }))
  }
  const setCurrentJsonData = (data: any) => setState((prev) => ({ ...prev, currentJsonData: data }))
  const setCustomJsonApplied = (applied: boolean) => setState((prev) => ({ ...prev, customJsonApplied: applied }))
  const setIsLoading = (loading: boolean) => setState((prev) => ({ ...prev, isLoading: loading }))
  const setError = (error: string | null) => setState((prev) => ({ ...prev, error }))
  const setOnboardingLinks = (onboardingLinks: OnboardingAccessLink[]) => setState((prev) => ({ ...prev, onboardingLinks }))

  const setProgress = (message: string) => setState(prev => ({ ...prev, progressMessage: message }))

  const setItemLoading = (type: string, item: string) => {
    setState((prev) => ({
      ...prev,
      loadingItems: { ...prev.loadingItems, [type]: [...(prev.loadingItems[type] || []), item] },
      itemErrors: { ...prev.itemErrors, [type]: { ...(prev.itemErrors[type] || {}), [item]: undefined } },
    }))
  }

  const setItemCompleted = (type: string, item: string) => {
    setState((prev) => ({
      ...prev,
      loadingItems: { ...prev.loadingItems, [type]: (prev.loadingItems[type] || []).filter((i) => i !== item) },
      completedItems: { ...prev.completedItems, [type]: [...(prev.completedItems[type] || []), item] },
      itemErrors: { ...prev.itemErrors, [type]: { ...(prev.itemErrors[type] || {}), [item]: undefined } },
    }))
  }

  const setItemError = (type: string, item: string, errorMessage: string) => {
    setState((prev) => ({
      ...prev,
      loadingItems: { ...prev.loadingItems, [type]: (prev.loadingItems[type] || []).filter((i) => i !== item) },
      itemErrors: { ...prev.itemErrors, [type]: { ...(prev.itemErrors[type] || {}), [item]: errorMessage } },
    }))
  }

  const resetOnboardingState = () => {
    setState((prev) => ({
      ...prev,
      progressMessage: '',
      loadingItems: { ...initialItemsState },
      completedItems: { ...initialItemsState },
      itemErrors: {},
      error: null,
      onboardingLinks: [],
    }))
  }

  return {
    ...state,
    setStep,
    setSelectedTemplate,
    setCurrentJsonData,
    setCustomJsonApplied,
    setProgress,
    setItemLoading,
    setItemCompleted,
    setItemError,
    setError,
    setIsLoading,
    setOnboardingLinks,
    resetOnboardingState,
  }
}
