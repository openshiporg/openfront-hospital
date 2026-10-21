'use client'

import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  return <details className="rounded-lg border p-3">
    <summary className="cursor-pointer font-medium">Authorized result / original receipt / correction lineage</summary>
    <p className="my-2 text-xs text-muted-foreground">Retired catalog tests do not erase accepted operational evidence. Current clinical authority and each related scope are checked separately. Original acknowledgement is not current status or laboratory certification. Other-operator and legacy original bodies may be unavailable.</p>
    <form className="flex flex-wrap gap-2" action={() => load()}>
      <Label className="sr-only" htmlFor={id}>Result ID from the work item</Label>
      <Input id={id} required maxLength={128} value={lookup} disabled={pending} onChange={event => { setLookup(event.target.value); setReadback(null) }} placeholder="Result ID from original work item" />
      <Button size="sm" variant="outline" disabled={pending}>{pending ? 'Checking current scope…' : 'Read scoped result'}</Button>
    </form>
    {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
    {readback != null && <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-3 text-xs">{JSON.stringify(readback, null, 2)}</pre>}
    {nextVersion && <Button size="sm" variant="outline" disabled={pending} onClick={() => load(nextVersion)}>Older owned transition receipts</Button>}
    <p className="mt-2 text-xs text-muted-foreground">Correction links are independently filtered IDs, not permission to load another result. Read that ID separately. These receipts are not complete clinical history. Private values are not saved to browser storage by this workspace.</p>
  </details>
}
