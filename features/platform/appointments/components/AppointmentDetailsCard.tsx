'use client'

import { useRef, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useDraftExitGuard } from '@/features/platform/lib/useDraftExitGuard'
import { CalendarDays, CheckCircle2, ClipboardList, Mail, MapPin, Phone, UserRound } from 'lucide-react'
import {
  cancelAppointment,
  checkInAppointment,
  completeAppointment,
  confirmAppointment,
  markAppointmentNoShow,
  startAppointmentVisit,
  type AppointmentQueueItem,
} from '../actions/appointments'

const statusLabels: Record<string, string> = {
  requested: 'Requested',
  confirmed: 'Confirmed',
  checked_in: 'Checked in',
  in_visit: 'In visit',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No show',
}

const statusClass: Record<string, string> = {
  requested: 'border-amber-200 bg-amber-50 text-amber-800',
  confirmed: 'border-blue-200 bg-blue-50 text-blue-800',
  checked_in: 'border-cyan-200 bg-cyan-50 text-cyan-800',
  in_visit: 'border-violet-200 bg-violet-50 text-violet-800',
  completed: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  cancelled: 'border-zinc-200 bg-zinc-50 text-zinc-600',
  no_show: 'border-rose-200 bg-rose-50 text-rose-800',
}

function formatDateTime(value?: string | null, timeZone?: string | null) {
  if (!value) return 'Unscheduled'
  if (!timeZone) return 'Facility time zone unavailable'
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    timeZoneName: 'short',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function actionForStatus(appointment: AppointmentQueueItem) {
  const version = appointment.transitionVersion
  switch (appointment.status) {
    case 'requested':
      return [
        { label: 'Confirm', action: (key: string) => confirmAppointment(appointment.id, version, key), primary: true },
      ]
    case 'confirmed':
      return [
        { label: 'Check in', action: (key: string) => checkInAppointment(appointment.id, version, key), primary: true },
        { label: 'No show', action: (key: string) => markAppointmentNoShow(appointment.id, version, key) },
      ]
    case 'checked_in':
      return [{ label: 'Start visit', action: (key: string) => startAppointmentVisit(appointment.id, version, key), primary: true }]
    case 'in_visit':
      return [{ label: 'Complete', action: (key: string) => completeAppointment(appointment.id, version, key), primary: true }]
    default:
      return []
  }
}

export function AppointmentDetailsCard({ appointment }: { appointment: AppointmentQueueItem }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const actions = actionForStatus(appointment)
  const completeIntake = appointment.intakeFormsCount != null && appointment.intakeForms != null && appointment.intakeFormsCount === appointment.intakeForms.length
  const intakeSummary = !completeIntake ? 'evidence partial or unavailable' : appointment.intakeForms!.length === 0 ? 'no accessible forms' : appointment.intakeForms!.every(form => form.status === 'reviewed') ? 'reviewed' : appointment.intakeForms!.some(form => ['submitted', 'needs_review'].includes(form.status || '')) ? 'received; awaiting review' : 'awaiting submission'
  const intakeReady = completeIntake && Boolean(appointment.intakeForms?.length) && appointment.intakeForms!.every(form => form.status === 'reviewed')
  const [cancelOpen, setCancelOpen] = useState(false)
  const [reason, setReason] = useState('')
  const original = useRef<{ key: string; run: (key: string) => Promise<{ success: boolean; error?: string }> } | null>(null)
  const [unresolved, setUnresolved] = useState(false)
  const exitGuard = useDraftExitGuard(Boolean(reason) || unresolved, unresolved)
  const submitOriginal = (run: (key: string) => Promise<{ success: boolean; error?: string }>) => {
    original.current ||= { key: `hospital-ui-${crypto.randomUUID()}`, run }
    setUnresolved(true)
    setError('')
    startTransition(async () => {
      try {
        const request = original.current!
        const response = await request.run(request.key)
        if (!response.success) { setError('Appointment outcome could not be verified. Retry the original command; reconcile before starting a separate action.'); return }
        original.current = null; setUnresolved(false); setCancelOpen(false); setReason('')
      } catch { setError('Appointment outcome is unknown. Retry the original command; reconcile before starting a separate action.') }
    })
  }
  const communicationTasks = appointment.messages?.filter((message) => ['manual_required', 'queued', 'failed'].includes(message.status || '')).length || 0

  return (
    <article className="border-b bg-background p-4 transition hover:bg-muted/30 md:p-6">
      {exitGuard}
      <Dialog open={cancelOpen} onOpenChange={open => { if (!isPending) setCancelOpen(open) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cancel {appointment.appointmentNumber}?</DialogTitle><DialogDescription>For {appointment.patient?.displayName || 'this patient'}, {formatDateTime(appointment.startsAt, appointment.facility?.timeZone)}. Enter the actual reason; no change is recorded until submission.</DialogDescription></DialogHeader>
          <form onSubmit={event => { event.preventDefault(); if (!reason.trim() || unresolved) return; const submittedReason = reason; const id = appointment.id; const version = appointment.transitionVersion; submitOriginal(key => cancelAppointment(id, version, key, submittedReason)) }} className="space-y-4">
            <label htmlFor={`cancel-${appointment.id}`} className="block text-sm">Operator cancellation reason</label>
            <textarea id={`cancel-${appointment.id}`} required maxLength={1000} value={reason} disabled={isPending || unresolved} onChange={event => setReason(event.target.value)} className="w-full rounded border p-3" />
            <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={isPending || unresolved} onClick={() => { setCancelOpen(false); setReason('') }}>Keep appointment</Button><Button type="submit" disabled={isPending || unresolved || !reason.trim()}>Record cancellation</Button></div>
            {unresolved && <Button type="button" disabled={isPending} onClick={() => submitOriginal(original.current!.run)}>Retry original cancellation command</Button>}
            {error && <p role="alert">{error}</p>}
          </form>
        </DialogContent>
      </Dialog>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass[appointment.status] || 'border-border bg-muted text-muted-foreground'}`}>
              {statusLabels[appointment.status] || appointment.status}
            </span>
            <span className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground">{appointment.appointmentNumber}</span>
            {appointment.source && <span className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground">{appointment.source.split('_').join(' ')}</span>}
          </div>

          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              {appointment.patient?.displayName || 'Unknown patient'} · {appointment.appointmentType?.name || 'Appointment'}
            </h2>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4" />{formatDateTime(appointment.startsAt, appointment.facility?.timeZone)}</span>
              <span className="inline-flex items-center gap-1.5"><UserRound className="h-4 w-4" />{appointment.provider?.displayName || 'No provider'}</span>
              {appointment.locationName && <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" />{appointment.locationName}</span>}
            </div>
          </div>

          {appointment.reasonForVisit && (
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{appointment.reasonForVisit}</p>
          )}

          <div className="flex flex-wrap gap-2 text-xs">
            <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 ${intakeReady ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
              <ClipboardList className="h-3 w-3" /> Intake: {intakeSummary}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-muted-foreground">
              <Mail className="h-3 w-3" /> {communicationTasks} follow-up task{communicationTasks === 1 ? '' : 's'}
            </span>
            {appointment.patient?.phone && (
              <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-muted-foreground">
                <Phone className="h-3 w-3" /> {appointment.patient.phone}
              </span>
            )}
            {Number(appointment.intakeFormsCount || 0) > (appointment.intakeForms?.length || 0) && (
              <span className="rounded-full border px-2.5 py-1 text-amber-800">
                Showing {appointment.intakeForms?.length || 0} of {appointment.intakeFormsCount} intake records
              </span>
            )}
            {Number(appointment.messagesCount || 0) > (appointment.messages?.length || 0) && (
              <span className="rounded-full border px-2.5 py-1 text-amber-800">
                Showing {appointment.messages?.length || 0} of {appointment.messagesCount} communication records
              </span>
            )}
          </div>

          <details>
            <summary className="cursor-pointer rounded-sm text-sm font-medium text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">Expand intake and communication evidence</summary>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <section className="rounded-lg border bg-muted/20 p-3"><h3 className="text-sm font-medium">Intake evidence</h3>{appointment.intakeForms?.length ? <ul className="mt-2 space-y-1 text-sm text-muted-foreground">{appointment.intakeForms.map(form => <li key={form.id}>{form.title || 'Intake'} · {form.status?.replaceAll('_', ' ') || 'unknown'}</li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">No accessible intake evidence.</p>}</section>
              <section className="rounded-lg border bg-muted/20 p-3"><h3 className="text-sm font-medium">Communication evidence</h3>{appointment.messages?.length ? <ul className="mt-2 space-y-1 text-sm text-muted-foreground">{appointment.messages.map(message => <li key={message.id}>{message.channel || 'channel unavailable'} · {message.status?.replaceAll('_', ' ') || 'unknown'} · {message.subject || 'Patient follow-up'}</li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">No accessible communication evidence.</p>}</section>
            </div>
          </details>
        </div>

        <div className="flex flex-col items-start gap-2 lg:items-end">
          <div className="flex flex-wrap gap-2 lg:justify-end">
          {!unresolved && actions.map((action) => (
            <button
              key={action.label}
              type="button"
              disabled={isPending}
              aria-busy={isPending}
              onClick={() => submitOriginal(action.action)}
              className={`rounded-full border px-4 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                action.primary
                  ? 'border-foreground bg-foreground text-background hover:bg-foreground/90'
                  : 'border-border bg-background text-muted-foreground hover:border-zinc-400 hover:text-foreground'
              }`}
            >
              {action.primary && <CheckCircle2 className="mr-1 inline h-3 w-3" />}
              {action.label}
            </button>
          ))}
          {!unresolved && ['requested', 'confirmed'].includes(appointment.status) && <Button variant="outline" disabled={isPending} onClick={() => setCancelOpen(true)}>Cancel appointment…</Button>}
          {unresolved && <Button variant="outline" disabled={isPending} onClick={() => submitOriginal(original.current!.run)}>Retry original appointment command</Button>}
          </div>
          {error && <p role="alert" className="max-w-xs text-xs text-destructive">{error}</p>}
          {!actions.length && <p className="max-w-xs text-xs text-muted-foreground">No in-workspace transition is available for this status.</p>}
        </div>
      </div>
    </article>
  )
}
