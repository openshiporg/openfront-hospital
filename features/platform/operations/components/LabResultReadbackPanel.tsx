'use client'

import { useId, useState } from 'react'
import { cn } from '@/lib/utils'
import { Notice, Pill, Track, fieldClass } from '@/features/platform/components/ward'
import { loadLabResult } from '../actions/labResults'

export function LabResultReadbackPanel({ resultId }: { resultId?: string }) {
  const id = useId()
  const [lookup, setLookup] = useState(resultId || '')
  const [readback, setReadback] = useState<unknown>(null)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const nextVersion = readback && typeof readback === 'object' && 'nextVersion' in readback && typeof readback.nextVersion === 'number' ? readback.nextVersion : undefined
  async function load(beforeVersion?: number) {
    setPending(true); setReadback(null); setError('')
    try {
      const response = await loadLabResult(lookup.trim(), beforeVersion)
      if (!response.success || !response.data) setError(response.error || 'Scoped result readback unavailable. No absence or rollback is inferred.')
      else setReadback(response.data.labResultReadback)
    } catch { setError('Scoped result readback unavailable. Retain the original command identity.') }
    finally { setPending(false) }
  }
  return <details className="group rounded-xl border bg-card">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-semibold text-foreground [&::-webkit-details-marker]:hidden">
      Result readback and correction lineage
      <span aria-hidden="true" className="text-muted-foreground transition-transform group-open:rotate-90">›</span>
    </summary>
    <div className="space-y-3 border-t px-4 py-3">
      <form className="flex min-w-0 flex-wrap items-center gap-2" action={() => load()}>
        <label className="sr-only" htmlFor={id}>Result ID from the work item</label>
        <input id={id} required maxLength={128} value={lookup} disabled={pending} onChange={event => { setLookup(event.target.value); setReadback(null) }} placeholder="Result ID" className={cn(fieldClass, 'w-auto flex-1 basis-48')} />
        <Track><Pill type="submit" size="sm" disabled={pending}>{pending ? 'Checking scope…' : 'Read result'}</Pill></Track>
      </form>
      {error && <Notice tone="bad" role="alert">{error}</Notice>}
      {readback != null && <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-3 font-mono text-xs">{JSON.stringify(readback, null, 2)}</pre>}
      {nextVersion && <Track><Pill size="sm" disabled={pending} onClick={() => load(nextVersion)}>Older transition receipts</Pill></Track>}
    </div>
  </details>
}
