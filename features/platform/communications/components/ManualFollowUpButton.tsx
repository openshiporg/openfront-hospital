'use client'

import { useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'

import { Pill, Track } from '@/features/platform/components/ward'
import { completeManualFollowUp } from '../actions/messages'

export function ManualFollowUpButton({ messageId, version }: { messageId: string; version: number }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const original = useRef<{ key: string; id: string; version: number } | null>(null)
  return (
    <div className="flex min-w-0 flex-col items-start gap-1 sm:items-end">
      <Track>
        <Pill
          size="sm"
          variant="primary"
          disabled={pending}
          aria-busy={pending}
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
          {pending && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />}
          {error ? 'Retry completion' : 'Mark follow-up done'}
        </Pill>
      </Track>
      {error && <span role="alert" className="max-w-xs text-xs text-red-700 dark:text-red-300">{error}</span>}
    </div>
  )
}
