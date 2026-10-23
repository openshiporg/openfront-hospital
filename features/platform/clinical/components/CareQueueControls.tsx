'use client'
import { useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useDraftExitGuard } from '@/features/lib/useDraftExitGuard'
import { Pill, Track, fieldClass, labelClass } from '@/features/platform/components/ward'
import type { OperationsOption } from '@/features/platform/operations/types'
import { arriveAppointment, transitionCareQueue } from '../actions/careQueue'
import { QueueEncounterPicker } from './QueueEncounterPicker'

type Ticket = { id: string; status: string; transitionVersion: number; encounter?: { id: string } | null; patient?: { id: string } | null; facility?: { id: string } | null }
export function CareQueueControls({ ticket, appointments = [] }: { ticket?: Ticket; appointments?: OperationsOption[] }) {
  const [pending, setPending] = useState(false)
  const [locked, setLocked] = useState(false)
  const [mayStart, setMayStart] = useState(false)
  const [error, setError] = useState('')
  const original = useRef<{ key: string; run: (key: string) => Promise<{ success: boolean; error?: string }> } | null>(null)
  const exitGuard = useDraftExitGuard(locked, locked)
  async function run(action: (key: string) => Promise<{ success: boolean; error?: string }>) {
    if (pending) return
    original.current ||= { key: `queue-ui-${crypto.randomUUID()}`, run: action }
    setPending(true); setLocked(true); setError('')
    try {
      const request = original.current
      const response = await request.run(request.key)
      if (!response.success) setError('Queue outcome could not be verified. Retry the original command; reconcile before another action.')
      else { original.current = null; setLocked(false) }
    } catch { setError('Queue outcome is unknown. Retry the original command; reconcile before another action.') }
    finally { setPending(false) }
  }
  const retry = locked && <Track><Pill variant="primary" disabled={pending} onClick={() => run(original.current!.run)}>Retry original queue command</Pill></Track>
  const feedback = <>
    {pending && <span role="status" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" aria-hidden />Updating queue…</span>}
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </>
  if (!ticket) return <form onSubmit={event => {
    event.preventDefault()
    if (locked) return
    const data = new FormData(event.currentTarget)
    const appointmentId = String(data.get('appointmentId') || '')
    const reasonCode = String(data.get('reasonCode') || 'scheduled_visit')
    void run(idempotencyKey => arriveAppointment({ appointmentId, reasonCode, idempotencyKey }))
  }} className="grid min-w-0 gap-3 rounded-xl border bg-card p-4 md:grid-cols-[minmax(0,1.6fr)_minmax(0,0.8fr)_auto] md:items-end">
    {exitGuard}
    <fieldset className="contents" disabled={pending || locked}>
      <label htmlFor="arrival-appointment" className={labelClass}>Appointment
        <select id="arrival-appointment" name="appointmentId" required className={fieldClass} defaultValue=""><option value="">{appointments.length ? 'Select appointment' : 'No eligible appointments in this page'}</option>{appointments.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
      </label>
      <label htmlFor="arrival-reason" className={labelClass}>Arrival type
        <select id="arrival-reason" name="reasonCode" className={fieldClass} defaultValue="scheduled_visit"><option value="scheduled_visit">Scheduled visit</option><option value="follow_up">Follow-up</option><option value="procedure">Procedure</option></select>
      </label>
      <Track className="justify-self-start"><Pill type="submit" variant="primary" disabled={!appointments.length}>Record arrival</Pill></Track>
    </fieldset>
    {(retry || pending || error) && <div className="flex flex-wrap items-center gap-2 md:col-span-3">{retry}{feedback}</div>}
  </form>
  const move = (toStatus: string, encounterId?: string) => { const id = ticket.id; const expectedVersion = ticket.transitionVersion; return run(operationKey => transitionCareQueue({ ticketId: id, expectedVersion, toStatus, encounterId, operationKey })) }
  return <div className="flex min-w-0 flex-col items-start gap-2 sm:items-end">
    {exitGuard}
    {!locked && <Track>
      {ticket.status === 'waiting' && <Pill size="sm" variant="primary" disabled={pending} onClick={() => move('called')}>Call patient</Pill>}
      {ticket.status === 'called' && <><Pill size="sm" disabled={pending} onClick={() => move('waiting')}>Return to waiting</Pill>{ticket.encounter?.id && <Pill size="sm" variant="primary" disabled={pending} onClick={() => move('in_care')}>Start care</Pill>}</>}
      {ticket.status === 'in_care' && <Pill size="sm" variant="primary" disabled={pending} onClick={() => move('completed')}>Complete</Pill>}
      {['waiting', 'called', 'in_care'].includes(ticket.status) && <Pill size="sm" variant="plain" disabled={pending} onClick={() => move('cancelled')}>Cancel</Pill>}
    </Track>}
    {!locked && ticket.status === 'called' && !ticket.encounter?.id && <form className="flex w-full min-w-0 flex-col gap-2 sm:w-72" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void move('in_care', String(form.get('encounterId') || '')) }}>
      <QueueEncounterPicker ticketId={ticket.id} facilityId={ticket.facility?.id} patientId={ticket.patient?.id} disabled={pending} onReady={setMayStart} />
      <Track className="self-start"><Pill type="submit" size="sm" variant="primary" disabled={pending || !mayStart}>Start care</Pill></Track>
    </form>}
    {retry}{feedback}
  </div>
}
