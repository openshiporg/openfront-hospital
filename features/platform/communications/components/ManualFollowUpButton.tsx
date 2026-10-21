'use client'

import { useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { completeManualFollowUp } from '../actions/messages'

export function ManualFollowUpButton({ messageId, version }: { messageId: string; version: number }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const original = useRef<{ key: string; id: string; version: number } | null>(null)
  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={async () => {
          setPending(true)
          setError('')
          original.current ||= { key: `hospital-ui-${crypto.randomUUID()}`, id: messageId, version }
          try {
            const request = original.current
            const response = await completeManualFollowUp(request.id, request.version, request.key)
            if (!response.success) setError('Completion could not be verified. Retry this same original action; reconcile before starting another.')
            else original.current = null
          } catch { setError('Completion outcome is unknown. Retry this same original action; reconcile before starting another.') }
          finally { setPending(false) }
        }}
      >
        {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
        Mark manual follow-up complete
      </Button>
      {error && <span role="alert" className="text-xs text-destructive">{error}</span>}
    </div>
  )
}
