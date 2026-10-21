'use client'

import { useRef, useState, useTransition } from 'react'
import { useDraftExitGuard } from '@/features/platform/lib/useDraftExitGuard'
import { CalendarDays, ClipboardCheck, FileText, Mail, Phone, UserRound } from 'lucide-react'
import { markIntakeNeedsReview, markIntakeReviewed, reopenIntake, type IntakeQueueItem } from '../actions/intake'

const statusClass: Record<string, string> = {
  not_sent: 'border-zinc-200 bg-zinc-50 text-zinc-700',
  sent: 'border-blue-200 bg-blue-50 text-blue-800',
  in_progress: 'border-cyan-200 bg-cyan-50 text-cyan-800',
  submitted: 'border-amber-200 bg-amber-50 text-amber-800',
  needs_review: 'border-violet-200 bg-violet-50 text-violet-800',
  reviewed: 'border-emerald-200 bg-emerald-50 text-emerald-800',
}

function formatDateTime(value?: string | null, timeZone?: string | null) {
  if (!value) return 'Not scheduled'
  return `${new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timeZone || 'UTC',
  }).format(new Date(value))} (${timeZone || 'UTC'})`
}

function prettyStatus(status: string) {
  if (status === 'not_sent') return 'access active; delivery not evidenced'
  if (status === 'sent' || status === 'in_progress') return `legacy ${status.split('_').join(' ')}`
  return status.split('_').join(' ')
}

export function IntakeDetailsCard({ intake }: { intake: IntakeQueueItem }) {
  const [notes, setNotes] = useState(intake.reviewNotes || '')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const original = useRef<{ key: string; savedNotes?: string; action: (key: string) => Promise<{ success: boolean; error?: string }> } | null>(null)
  const [locked, setLocked] = useState(false)
  const [savedNotes, setSavedNotes] = useState(intake.reviewNotes || '')
  const exitGuard = useDraftExitGuard(notes !== savedNotes || locked, locked)
  const runTransition = (action: (key: string) => Promise<{ success: boolean; error?: string }>, submittedNotes?: string) => {
    original.current ||= { key: `hospital-ui-${crypto.randomUUID()}`, action, savedNotes: submittedNotes }
    setLocked(true)
    setError(null)
    startTransition(async () => {
      try {
        const request = original.current!
        const response = await request.action(request.key)
        if (!response.success) setError('Intake transition could not be verified. Retry the original command; reconcile before starting another.')
        else { original.current = null; setLocked(false); if (request.savedNotes !== undefined) setSavedNotes(request.savedNotes) }
      } catch { setError('Intake outcome is unknown. Retry the original command; reconcile before starting another.') }
    })
  }
  const responses = intake.responses || {}
  const insurance = responses.insurance || intake.patient?.insuranceSummary || {}
  const medicationCount = Array.isArray(responses.medications) ? responses.medications.length : 0
  const allergyCount = Array.isArray(responses.allergies) ? responses.allergies.length : 0

  return (
    <article className="border-b bg-background p-4 transition hover:bg-muted/30 md:p-6">
      {exitGuard}
      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${statusClass[intake.status] || 'border-border bg-muted text-muted-foreground'}`}>
              {prettyStatus(intake.status)}
            </span>
            <span className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground">{intake.templateKey || 'intake'}</span>
          </div>

          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              {intake.patient?.displayName || 'Unknown patient'} · {intake.title}
            </h2>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4" />{formatDateTime(intake.appointment?.startsAt, intake.appointment?.facility?.timeZone)}</span>
              <span className="inline-flex items-center gap-1.5"><UserRound className="h-4 w-4" />{intake.appointment?.provider?.displayName || 'No provider'}</span>
              <span className="inline-flex items-center gap-1.5"><FileText className="h-4 w-4" />{intake.appointment?.appointmentType?.name || 'Visit'}</span>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <section className="rounded-xl border bg-muted/20 p-4">
              <h3 className="text-sm font-medium">Visit reason</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{responses.reasonForVisit || intake.appointment?.reasonForVisit || 'No reason provided.'}</p>
            </section>
            <section className="rounded-xl border bg-muted/20 p-4">
              <h3 className="text-sm font-medium">Symptoms / updates</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{responses.symptoms || 'No symptoms or updates provided.'}</p>
            </section>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-muted-foreground"><ClipboardCheck className="h-3 w-3" /> {medicationCount} medication{medicationCount === 1 ? '' : 's'}</span>
            <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-muted-foreground"><ClipboardCheck className="h-3 w-3" /> {allergyCount} allerg{allergyCount === 1 ? 'y' : 'ies'}</span>
            {intake.patient?.phone && <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-muted-foreground"><Phone className="h-3 w-3" /> {intake.patient.phone}</span>}
            {intake.patient?.email && <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-muted-foreground"><Mail className="h-3 w-3" /> {intake.patient.email}</span>}
          </div>

          <div className="rounded-xl border bg-muted/20 p-4 text-sm">
            <h3 className="font-medium">Insurance</h3>
            <p className="mt-2 text-muted-foreground">{insurance.payer || 'No payer provided'} {insurance.memberId ? `· ${insurance.memberId}` : ''}</p>
          </div>
        </div>

        <aside className="space-y-3 rounded-xl border bg-card p-4">
          <h3 className="text-sm font-medium">Review workflow</h3>
          <label className="text-xs font-medium text-muted-foreground" htmlFor={`intake-review-notes-${intake.id}`}>Internal review notes</label>
          <textarea
            id={`intake-review-notes-${intake.id}`}
            readOnly={intake.status === 'reviewed' || locked || isPending}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Internal review notes"
            rows={6}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="flex flex-wrap gap-2">
            {locked && <button disabled={isPending} onClick={() => runTransition(original.current!.action)} className="rounded-full border px-3 py-2 text-xs font-semibold">Retry original review command</button>}
            {!locked && intake.status === 'submitted' && (
              <button disabled={isPending} onClick={() => runTransition((key) => markIntakeNeedsReview(intake.id, intake.transitionVersion, key))} className="rounded-full border px-3 py-2 text-xs font-semibold hover:border-zinc-400 disabled:opacity-60">
                Needs review
              </button>
            )}
            {!locked && (intake.status === 'submitted' || intake.status === 'needs_review') && (
              <button disabled={isPending} onClick={() => runTransition((key) => markIntakeReviewed(intake.id, intake.transitionVersion, notes, key), notes)} className="rounded-full bg-foreground px-3 py-2 text-xs font-semibold text-background disabled:opacity-60">
                Mark reviewed
              </button>
            )}
            {!locked && intake.status === 'reviewed' && (
              <button disabled={isPending} onClick={() => runTransition((key) => reopenIntake(intake.id, intake.transitionVersion, key))} className="rounded-full border px-3 py-2 text-xs font-semibold hover:border-zinc-400 disabled:opacity-60">
                Reopen review
              </button>
            )}
          </div>
          {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
          {intake.reviewedAt && <p className="text-xs text-muted-foreground">Reviewed {formatDateTime(intake.reviewedAt, intake.appointment?.facility?.timeZone)}</p>}
        </aside>
      </div>
    </article>
  )
}
