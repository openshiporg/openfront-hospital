import React, { useState } from 'react'
import { Check, Clipboard, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { validateSetupShape } from '@/features/lib/hospitalSetupShape'
import seedData from '@/features/platform/onboarding/lib/seed.json'

interface CustomSetupStepsProps {
  draft?: string
  onDraftChange?: (value: string) => void
  currentJson?: any
  onJsonUpdate?: (newJson: any) => void
  onBack?: () => void
}

function useCopyToClipboard(): [string | null, (text: string) => Promise<boolean>] {
  const [copiedText, setCopiedText] = useState<string | null>(null)

  const copy = React.useCallback(async (text: string) => {
    if (!navigator.clipboard) return false
    try {
      await navigator.clipboard.writeText(text)
      setCopiedText(text)
      return true
    } catch {
      setCopiedText(null)
      return false
    }
  }, [])

  return [copiedText, copy]
}

export function CustomSetupSteps({ currentJson, draft, onDraftChange, onJsonUpdate = () => {} }: CustomSetupStepsProps) {
  const [, copy] = useCopyToClipboard()
  const [copiedItems, setCopiedItems] = useState<Record<string, boolean>>({})
  const [localJson, setLocalJson] = useState(() => JSON.stringify(currentJson || seedData, null, 2))
  const customJson = draft ?? localJson
  const setCustomJson = (value: string) => { setLocalJson(value); onDraftChange?.(value); setJsonApplied(false) }
  const [jsonError, setJsonError] = useState('')
  const [jsonApplied, setJsonApplied] = useState(false)

  const copyToClipboard = async (text: string, itemKey: string) => {
    const success = await copy(text)
    if (success) {
      setCopiedItems((prev) => ({ ...prev, [itemKey]: true }))
      setTimeout(() => setCopiedItems((prev) => ({ ...prev, [itemKey]: false })), 2000)
    }
  }

  const generateAIPrompt = () => `I need help customizing my healthcare practice onboarding JSON. It currently includes practiceInfo, departments, facilities, providers, clinicians, appointmentTypes, scheduleBlocks, fictional patients, appointments, one-time intake forms, and manual follow-up messages.

Ask me what kind of clinic I run, which departments and facilities I operate, who my clinicians are, what visit types are bookable, and what sample operating data I want. Preserve canonical relative imagePath values under /images/. Then return complete valid JSON using the same keys and structure so I can paste it into the practice onboarding screen.`

  const validateAndApplyJson = () => {
    try {
      const parsed = JSON.parse(customJson)
      const validation = validateSetupShape(parsed)
      if (validation) { setJsonError(validation); return }

      onJsonUpdate(parsed)
      setJsonApplied(true)
      setJsonError('')
    } catch {
      setJsonError('Invalid JSON format. Please check your syntax.')
    }
  }

  return (
    <div className="space-y-6">
      {jsonApplied && (
        <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          Custom configuration applied. Go back to the setup screen and start onboarding.
        </div>
      )}

      <DataCard
        title="Base Healthcare Onboarding Data"
        content={JSON.stringify(seedData, null, 2)}
        onCopy={copyToClipboard}
        copied={copiedItems.json || false}
        copyKey="json"
      />

      <DataCard
        title="AI Customization Prompt"
        content={generateAIPrompt()}
        onCopy={copyToClipboard}
        copied={copiedItems.prompt || false}
        copyKey="prompt"
      />

      <div className="rounded-lg border overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 bg-muted border-b">
          <span className="text-sm font-medium text-muted-foreground">Custom Onboarding Data</span>
          <Button
            size="sm"
            aria-label="Paste custom setup JSON"
            variant="ghost"
            onClick={async () => {
              try {
                const text = await navigator.clipboard.readText()
                setCustomJson(text)
                setJsonError('')
              } catch { setJsonError('Clipboard access is unavailable. Paste into the editor using your keyboard or device menu.') }
            }}
            className="h-6 w-6 p-0 hover:bg-background/80"
          >
            <Clipboard className="h-3 w-3 text-muted-foreground" />
          </Button>
        </div>
        <label htmlFor="hospital-setup-json" className="sr-only">Custom setup JSON</label>
        <Textarea
          id="hospital-setup-json"
          aria-invalid={Boolean(jsonError)}
          aria-describedby={jsonError ? "hospital-setup-json-error" : undefined}
          placeholder="Paste your customized healthcare JSON configuration here..."
          value={customJson}
          onChange={(event) => {
            setCustomJson(event.target.value)
            setJsonError('')
          }}
          className="min-h-[220px] font-mono text-xs resize-none border-0 bg-transparent focus:outline-none p-4 rounded-none"
        />
        {jsonError && <div id="hospital-setup-json-error" role="alert" className="px-4 pb-4 text-xs text-destructive">{jsonError}</div>}
        <div className="flex items-center justify-end px-4 py-2 bg-muted border-t">
          <Button size="sm" onClick={validateAndApplyJson} disabled={!customJson.trim()}>Apply Configuration</Button>
        </div>
      </div>
    </div>
  )
}

function DataCard({
  title,
  content,
  onCopy,
  copied,
  copyKey,
}: {
  title: string
  content: string
  onCopy: (text: string, itemKey: string) => void
  copied: boolean
  copyKey: string
}) {
  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-muted border-b">
        <span className="text-sm font-medium text-muted-foreground">{title}</span>
        <Button size="sm" variant="ghost" aria-label={copied ? `${title} copied` : `Copy ${title}`} onClick={() => onCopy(content, copyKey)} className="h-6 w-6 p-0 hover:bg-background/80">
          {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
        </Button>
      </div>
      <pre className="max-h-64 overflow-auto bg-background p-4 text-xs text-muted-foreground whitespace-pre-wrap">{content}</pre>
    </div>
  )
}
