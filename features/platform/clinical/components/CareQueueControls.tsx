 'use client'
import { useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useDraftExitGuard } from '@/features/lib/useDraftExitGuard'
import type { OperationsOption } from '@/features/platform/operations/types'
import { arriveAppointment, transitionCareQueue } from '../actions/careQueue'
import { QueueEncounterPicker } from './QueueEncounterPicker'

type Ticket = { id: string; status: string; transitionVersion: number; encounter?: { id: string } | null; patient?: { id: string } | null; facility?: { id: string } | null }
const selectClassName = 'h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'
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
  const retry = locked && <Button type="button" disabled={pending} onClick={() => run(original.current!.run)}>Retry original queue command</Button>
  const feedback = <>{pending && <span role="status">Updating queue…</span>}{error && <p role="alert" className="text-xs text-destructive">{error}</p>}</>
  if (!ticket) return <form onSubmit={event => {
    event.preventDefault()
    if (locked) return
    const data = new FormData(event.currentTarget)
    const appointmentId = String(data.get('appointmentId') || '')
    const reasonCode = String(data.get('reasonCode') || 'scheduled_visit')
    void run(idempotencyKey => arriveAppointment({ appointmentId, reasonCode, idempotencyKey }))
  }} className="grid min-w-0 gap-3 rounded-lg border bg-card p-4 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_auto]">
    {exitGuard}
    <fieldset className="contents" disabled={pending || locked}>
      <div className="min-w-0 space-y-2"><Label htmlFor="arrival-appointment">Confirmed appointment or checked-in arrival to reconcile</Label><select id="arrival-appointment" name="appointmentId" required className={selectClassName} defaultValue=""><option value="">{appointments.length ? 'Select appointment' : 'No eligible appointments in this page'}</option>{appointments.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
      <div className="space-y-2"><Label htmlFor="arrival-reason">Arrival type</Label><select id="arrival-reason" name="reasonCode" className={selectClassName} defaultValue="scheduled_visit"><option value="scheduled_visit">Scheduled visit</option><option value="follow_up">Follow-up</option><option value="procedure">Procedure</option></select></div>
      <Button disabled={!appointments.length}>Record arrival</Button>
    </fieldset>
    {retry}{feedback}
  </form>
  const move = (toStatus: string, encounterId?: string) => { const id = ticket.id; const expectedVersion = ticket.transitionVersion; return run(operationKey => transitionCareQueue({ ticketId: id, expectedVersion, toStatus, encounterId, operationKey })) }
  return <div className="min-w-0 space-y-2">
    {exitGuard}
    {!locked && <div className="flex flex-wrap gap-2">
      {ticket.status === 'waiting' && <Button size="sm" disabled={pending} onClick={() => move('called')}>Call patient</Button>}
      {ticket.status === 'called' && <><Button size="sm" variant="outline" disabled={pending} onClick={() => move('waiting')}>Return to waiting</Button>{ticket.encounter?.id && <Button size="sm" disabled={pending} onClick={() => move('in_care')}>Start care</Button>}</>}
      {ticket.status === 'in_care' && <Button size="sm" disabled={pending} onClick={() => move('completed')}>Complete</Button>}
      {['waiting', 'called', 'in_care'].includes(ticket.status) && <Button size="sm" variant="ghost" disabled={pending} onClick={() => move('cancelled')}>Cancel</Button>}
    </div>}
    {!locked && ticket.status === 'called' && !ticket.encounter?.id && <form className="flex w-full min-w-0 flex-col gap-2" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void move('in_care', String(form.get('encounterId') || '')) }}>
      <QueueEncounterPicker ticketId={ticket.id} facilityId={ticket.facility?.id} patientId={ticket.patient?.id} disabled={pending} onReady={setMayStart} />
      <Button size="sm" disabled={pending || !mayStart}>Start care</Button>
    </form>}
    {retry}{feedback}
  </div>
}
