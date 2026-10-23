'use client'

import { useRef, useState, useTransition, type ReactNode } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useDraftExitGuard } from '@/features/platform/lib/useDraftExitGuard'
import { ChevronRight } from 'lucide-react'
import {
  Code,
  Notice,
  Pill,
  StatusDot,
  StatusTag,
  TitleLine,
  Track,
  toneForStatus,
  type WardTone,
} from '@/features/platform/components/ward'
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

const statusTone: Record<string, WardTone> = {
  requested: 'warn',
  confirmed: 'info',
  checked_in: 'info',
  in_visit: 'accent',
  completed: 'ok',
  cancelled: 'idle',
  no_show: 'bad',
}

function EvidenceDisclosure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="group min-w-0">
      <summary className="w-fit cursor-pointer list-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <Track>
          <Pill asChild size="sm" variant="plain">
            <span><ChevronRight className="transition-transform group-open:rotate-90" aria-hidden />{label}</span>
          </Pill>
        </Track>
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  )
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

  const tone = statusTone[appointment.status] || toneForStatus(appointment.status)
  const label = statusLabels[appointment.status] || appointment.status

  return (
    <article className="min-w-0 px-4 py-4 transition-colors hover:bg-muted/30 md:px-5">
      {exitGuard}
      <Dialog open={cancelOpen} onOpenChange={open => { if (!isPending) setCancelOpen(open) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cancel {appointment.appointmentNumber}?</DialogTitle><DialogDescription>{appointment.patient?.displayName || 'This patient'} · {formatDateTime(appointment.startsAt, appointment.facility?.timeZone)}</DialogDescription></DialogHeader>
          <form onSubmit={event => { event.preventDefault(); if (!reason.trim() || unresolved) return; const submittedReason = reason; const id = appointment.id; const version = appointment.transitionVersion; submitOriginal(key => cancelAppointment(id, version, key, submittedReason)) }} className="space-y-4">
            <div className="grid gap-1.5">
              <label htmlFor={`cancel-${appointment.id}`} className="text-xs font-medium text-muted-foreground">Cancellation reason</label>
              <textarea id={`cancel-${appointment.id}`} required maxLength={1000} rows={4} value={reason} disabled={isPending || unresolved} onChange={event => setReason(event.target.value)} className="w-full min-w-0 rounded-lg border bg-background px-3 py-2 text-sm shadow-[inset_0_1px_1px_rgb(0_0_0/0.04)] outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50" />
            </div>
            <Track>
              <Pill type="button" disabled={isPending || unresolved} onClick={() => { setCancelOpen(false); setReason('') }}>Keep appointment</Pill>
              <Pill type="submit" variant="danger" disabled={isPending || unresolved || !reason.trim()}>Record cancellation</Pill>
              {unresolved && <Pill type="button" variant="primary" disabled={isPending} onClick={() => submitOriginal(original.current!.run)}>Retry cancellation</Pill>}
            </Track>
            {error && <Notice tone="bad" role="alert">{error}</Notice>}
          </form>
        </DialogContent>
      </Dialog>

      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <TitleLine as="h2" tone={tone} status={label} className="text-sm font-semibold text-foreground">
            {appointment.patient?.displayName || 'Unknown patient'}
            <span className="font-normal text-muted-foreground"> · {appointment.appointmentType?.name || 'Appointment'}</span>
          </TitleLine>

          <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-1 pl-4 text-xs text-muted-foreground">
            <span className="font-medium tabular-nums text-foreground">{formatDateTime(appointment.startsAt, appointment.facility?.timeZone)}</span>
            <StatusTag status={appointment.status} tone={tone} className="font-normal" />
            <span>{appointment.provider?.displayName || 'No provider'}</span>
            {appointment.locationName && <span>{appointment.locationName}</span>}
            <Code>{appointment.appointmentNumber}</Code>
            {appointment.source && <span>{appointment.source.split('_').join(' ')}</span>}
          </div>

          {appointment.reasonForVisit && (
            <p className="max-w-3xl pl-4 text-sm leading-6 text-foreground/80">{appointment.reasonForVisit}</p>
          )}

          <div className="flex min-w-0 flex-wrap gap-x-4 gap-y-1 pl-4 text-xs">
            <span className="inline-flex items-baseline gap-1.5 text-foreground">
              <StatusDot tone={intakeReady ? 'ok' : 'warn'} className="size-1.5 -translate-y-[0.1em] shadow-none" />
              Intake: {intakeSummary}
            </span>
            <span className="inline-flex items-baseline gap-1.5 text-muted-foreground">
              <StatusDot tone={communicationTasks ? 'warn' : 'idle'} className="size-1.5 -translate-y-[0.1em] shadow-none" />
              {communicationTasks} follow-up task{communicationTasks === 1 ? '' : 's'}
            </span>
            {appointment.patient?.phone && <span className="font-mono tabular-nums text-muted-foreground">{appointment.patient.phone}</span>}
            {Number(appointment.intakeFormsCount || 0) > (appointment.intakeForms?.length || 0) && (
              <span className="text-amber-700 dark:text-amber-300">
                Showing {appointment.intakeForms?.length || 0} of {appointment.intakeFormsCount} intake records
              </span>
            )}
            {Number(appointment.messagesCount || 0) > (appointment.messages?.length || 0) && (
              <span className="text-amber-700 dark:text-amber-300">
                Showing {appointment.messages?.length || 0} of {appointment.messagesCount} messages
              </span>
            )}
          </div>

          <div className="pl-4">
            <EvidenceDisclosure label="Intake and messages">
              <div className="grid gap-3 md:grid-cols-2">
                <section className="min-w-0 rounded-lg border bg-muted/30 p-3">
                  <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">Intake</h3>
                  {appointment.intakeForms?.length ? <ul className="mt-2 space-y-1.5 text-sm">{appointment.intakeForms.map(form => <li key={form.id} className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3"><span className="min-w-0 break-words">{form.title || 'Intake'}</span><StatusTag status={form.status || 'unknown'} /></li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">No intake forms.</p>}
                </section>
                <section className="min-w-0 rounded-lg border bg-muted/30 p-3">
                  <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">Messages</h3>
                  {appointment.messages?.length ? <ul className="mt-2 space-y-1.5 text-sm">{appointment.messages.map(message => <li key={message.id} className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3"><span className="min-w-0 break-words">{message.subject || 'Patient follow-up'} <span className="text-muted-foreground">· {message.channel || 'channel unavailable'}</span></span><StatusTag status={message.status || 'unknown'} /></li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">No messages.</p>}
                </section>
              </div>
            </EvidenceDisclosure>
          </div>
        </div>

        <div className="flex min-w-0 flex-col items-start gap-2 pl-4 lg:items-end lg:pl-0">
          {(actions.length > 0 || unresolved || ['requested', 'confirmed'].includes(appointment.status)) && (
            <Track>
              {!unresolved && actions.map((action) => (
                <Pill
                  key={action.label}
                  variant={action.primary ? 'primary' : 'raised'}
                  disabled={isPending}
                  aria-busy={isPending}
                  onClick={() => submitOriginal(action.action)}
                >
                  {action.label}
                </Pill>
              ))}
              {!unresolved && ['requested', 'confirmed'].includes(appointment.status) && <Pill variant="plain" disabled={isPending} onClick={() => setCancelOpen(true)}>Cancel…</Pill>}
              {unresolved && <Pill variant="primary" disabled={isPending} onClick={() => submitOriginal(original.current!.run)}>Retry last action</Pill>}
            </Track>
          )}
          {error && <Notice tone="bad" role="alert" className="max-w-xs text-xs">{error}</Notice>}
          {!actions.length && <p className="text-xs text-muted-foreground">No action for this status</p>}
        </div>
      </div>
    </article>
  )
}
