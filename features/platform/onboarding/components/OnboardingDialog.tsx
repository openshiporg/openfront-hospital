'use client'

import React from 'react'
import { AlertCircle, Building2, CircleCheck, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge-button'
import { HEALTHCARE_TEMPLATES, SECTION_DEFINITIONS } from '../config/templates'
import { getItemsFromJsonData } from '../utils/dataUtils'
import { useOnboardingApi } from '../hooks/useOnboardingApi'
import { useOnboardingState } from '../hooks/useOnboardingState'
import { CustomSetupSteps } from './CustomSetupSteps'

interface OnboardingDialogProps {
  isOpen: boolean
  onClose: () => void
}

export default function OnboardingDialog({ isOpen, onClose }: OnboardingDialogProps) {
  const onboardingState = useOnboardingState()
  const {
    step,
    selectedTemplate,
    currentJsonData,
    customJsonApplied,
    progressMessage,
    loadingItems,
    completedItems,
    error,
    itemErrors,
    isLoading,
    onboardingLinks,
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
  } = onboardingState

  const { runOnboarding } = useOnboardingApi({
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
  })

  const [editorDraft, setEditorDraft] = React.useState<string | undefined>()
  if (!isOpen) return null

  const templateConfig = HEALTHCARE_TEMPLATES[selectedTemplate]
  const displayNames = currentJsonData
    ? Object.fromEntries(SECTION_DEFINITIONS.map((section) => [section.type, getItemsFromJsonData(currentJsonData, section.type)]))
    : templateConfig.displayNames

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-[95vw] flex-col overflow-hidden p-0 gap-0 sm:max-w-4xl">
        <DialogHeader className="mb-0 shrink-0 border-b px-4 py-4 sm:px-6">
          <DialogTitle>Healthcare Setup</DialogTitle>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
          <aside className="order-1 flex shrink-0 flex-col lg:order-none lg:w-80 lg:shrink lg:overflow-y-auto lg:justify-between lg:border-r">
            <div className="p-4 sm:p-6">
              <div className="flex items-center space-x-3">
                <div className="inline-flex shrink-0 items-center justify-center rounded-sm bg-muted p-3">
                  <Building2 className="size-5 text-foreground" aria-hidden />
                </div>
                <div className="space-y-0.5">
                  <h3 className="text-sm font-medium text-foreground">Practice Setup</h3>
                  <p className="text-sm text-muted-foreground">
                    {step === 'done' ? 'Source setup completed' : 'Create booking-ready operations'}
                  </p>
                </div>
              </div>
              <Separator className="my-4" />

              {step === 'done' ? (
                <div>
                  <h4 className="text-sm font-medium text-foreground mb-2">Setup Complete</h4>
                  <p className="text-sm text-muted-foreground mb-4">
                    The {selectedTemplate === 'minimal' ? 'basic' : 'complete'} source records were applied. Complete the documented migration, runtime, and release gates before deployment.
                  </p>
                  <div className="flex items-center space-x-2 text-sm text-emerald-600 dark:text-emerald-500 mb-4">
                    <CircleCheck className="h-4 w-4 fill-emerald-500 text-background" />
                    <span>Setup complete</span>
                  </div>
                  <p className="text-xs text-muted-foreground">The operation acknowledged completion. Individual item outcomes are not supplied by this backend; the following is the requested configuration.</p>
                  <SummaryList displayNames={displayNames as Record<string, string[]>} />
                </div>
              ) : !isLoading && step !== 'custom' ? (
                <div>
                  <h4 className="text-sm font-medium text-foreground mb-4">Setup Type</h4>
                  <RadioGroup value={selectedTemplate} onValueChange={(value: any) => setSelectedTemplate(value)} className="space-y-3">
                    {(['full', 'minimal', 'custom'] as const).map((template) => {
                      const config = HEALTHCARE_TEMPLATES[template]
                      return (
                        <div key={template} className="flex items-start space-x-3 rounded-lg border p-3">
                          <RadioGroupItem value={template} id={template} className="mt-1" />
                          <Label htmlFor={template} className="flex-1 cursor-pointer space-y-1">
                            <div className="flex items-center gap-2 text-sm font-medium">
                              {config.icon}
                              {config.name}
                            </div>
                            <p className="text-xs leading-5 text-muted-foreground">{config.description}</p>
                          </Label>
                        </div>
                      )
                    })}
                  </RadioGroup>
                </div>
              ) : isLoading ? (
                <div className="space-y-4">
                  <h4 className="text-sm font-medium text-foreground">Creating records</h4>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {progressMessage || 'Working...'}
                  </div>
                </div>
              ) : (
                <div>
                  <h4 className="text-sm font-medium text-foreground mb-2">Custom Setup</h4>
                  <p className="text-sm text-muted-foreground">Paste a custom JSON setup or return to templates.</p>
                </div>
              )}
            </div>

            <div className="border-t p-4 sm:p-6">
              {step === 'custom' ? (
                <Button variant="outline" className="w-full" onClick={() => setStep('template')}>Back to templates</Button>
              ) : step === 'done' ? (
                <Button className="w-full" onClick={onClose}>Close</Button>
              ) : selectedTemplate === 'custom' && !customJsonApplied ? (
                <Button className="w-full" onClick={() => setStep('custom')}>Customize JSON</Button>
              ) : (
                <Button className="w-full" onClick={runOnboarding} disabled={isLoading}>Start setup</Button>
              )}
            </div>
          </aside>

          <main className="order-2 min-w-0 shrink-0 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:order-none">
            <div className="p-4 sm:p-6">
              {step === 'custom' ? (
                <CustomSetupSteps
                  currentJson={currentJsonData}
                  draft={editorDraft}
                  onDraftChange={setEditorDraft}
                  onJsonUpdate={(json) => {
                    setCurrentJsonData(json)
                    setCustomJsonApplied(true)
                    setStep('template')
                  }}
                  onBack={() => setStep('template')}
                />
              ) : (
                <>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-base font-semibold">{templateConfig.name}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{templateConfig.description}</p>
                    </div>
                    {customJsonApplied && <Badge color="blue">Custom JSON applied</Badge>}
                  </div>

                  {error && (
                    <div role="alert" className="mt-4 flex gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  {step === 'done' && onboardingLinks.length > 0 && (
                    <section className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
                      <h4 className="font-medium">One-time intake links</h4>
                      <p className="mt-1">Give each link only to its intended fictional patient. Links are stored only as hashes and stop working after use or expiry.</p>
                      <ul className="mt-3 space-y-2">
                        {onboardingLinks.map(link => (
                          <li key={link.href} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                            <span>{link.label} · expires {new Date(link.expiresAt).toISOString().replace('T', ' ').replace('.000Z', ' UTC')}</span>
                            <a className="font-medium underline underline-offset-4" href={link.href}>Open intake</a>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  <div className="mt-6 space-y-4">
                    {SECTION_DEFINITIONS.map((section) => {
                      const items = (displayNames as any)[section.type] || []
                      const loading = loadingItems[section.type] || []
                      const completed = completedItems[section.type] || []
                      const errors = itemErrors[section.type] || {}

                      return (
                        <section key={section.type} className="rounded-xl border p-4">
                          <div className="flex items-center justify-between gap-4">
                            <div>
                              <h4 className="text-sm font-medium">{section.label}</h4>
                              <p className="text-xs text-muted-foreground">{items.length} item{items.length === 1 ? '' : 's'}</p>
                            </div>
                            {completed.length === items.length && items.length > 0 ? (
                              <CircleCheck className="h-5 w-5 text-emerald-600" />
                            ) : loading.length > 0 ? (
                              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                            ) : null}
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {items.map((item: string) => (
                              <span key={item} className={`rounded-full border px-2.5 py-1 text-xs ${errors[item] ? 'border-destructive/40 bg-destructive/10 text-destructive' : completed.includes(item) ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : loading.includes(item) ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-border bg-muted/50 text-muted-foreground'}`}>
                                {item}
                              </span>
                            ))}
                          </div>
                        </section>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          </main>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function SummaryList({ displayNames }: { displayNames: Record<string, string[]> }) {
  return (
    <div className="space-y-3 text-sm">
      {SECTION_DEFINITIONS.map((section) => (
        <div key={section.type} className="flex items-center space-x-2 text-muted-foreground">
          <span aria-hidden>·</span>
          <span className="font-medium">
            {(displayNames[section.type] || []).length} {section.label.toLowerCase()} item{(displayNames[section.type] || []).length === 1 ? '' : 's'}
          </span>
        </div>
      ))}
    </div>
  )
}
