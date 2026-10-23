 'use client'
import { useEffect, useState } from 'react'
import { fieldClass, labelClass } from '@/features/platform/components/ward'
import { searchQueueEncounters } from '../actions/careQueue'
export function QueueEncounterPicker({ ticketId, facilityId, patientId, disabled, onReady }: { ticketId: string; facilityId?: string; patientId?: string; disabled: boolean; onReady: (ready: boolean) => void }) {
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<Array<{ id: string; encounterNumber: string }>>([])
  const [count, setCount] = useState(0)
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading')
  useEffect(() => {
    let cancelled = false
    if (!facilityId || !patientId) { setState('unavailable'); onReady(false); return }
    const timer = setTimeout(() => {
      setState('loading'); setRows([]); onReady(false)
      void searchQueueEncounters(facilityId, patientId, search).then(response => {
        if (cancelled) return
        if (!response.success) { setState('unavailable'); onReady(false); return }
        setRows(response.data.encounters); setCount(response.data.encountersCount); setState('ready'); onReady(response.data.encounters.length > 0)
      }).catch(() => { if (!cancelled) { setState('unavailable'); onReady(false) } })
    }, 200)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [facilityId, patientId, search, onReady])
  return <div className="grid min-w-0 gap-1.5">
    <label htmlFor={`queue-search-${ticketId}`} className={labelClass}>Encounter</label>
    <input id={`queue-search-${ticketId}`} className={fieldClass} type="search" value={search} maxLength={80} disabled={disabled} placeholder="Search encounter reference" onChange={event => setSearch(event.target.value)} />
    <select id={`queue-encounter-${ticketId}`} aria-label="In-progress encounter for this patient and facility" name="encounterId" required disabled={disabled || state !== 'ready'} defaultValue="" className={fieldClass} key={`${facilityId}:${patientId}:${search}`}>
      <option value="">{state === 'loading' ? 'Searching…' : state === 'unavailable' ? 'Encounter choices unavailable' : 'Select encounter'}</option>
      {rows.map(row => <option key={row.id} value={row.id}>{row.encounterNumber}</option>)}
    </select>
    {state === 'unavailable' && <p role="status" className="text-xs text-muted-foreground">Encounter access is unavailable.</p>}
    {state === 'ready' && <p role="status" className="text-xs text-muted-foreground">{count > rows.length ? `Showing ${rows.length} of ${count}; narrow the reference search.` : `${rows.length} matching encounters`}</p>}
  </div>
}
