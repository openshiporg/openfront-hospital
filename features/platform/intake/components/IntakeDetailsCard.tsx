'use client'

import { useRef, useState, useTransition } from 'react'
import { useDraftExitGuard } from '@/features/platform/lib/useDraftExitGuard'
import { Code, Notice, Pill, StatusDot, TitleLine, Track, type WardTone } from '@/features/platform/components/ward'
import { markIntakeNeedsReview, markIntakeReviewed, reopenIntake, type IntakeQueueItem } from '../actions/intake'

const statusTone: Record<string, WardTone> = {
  not_sent: 'idle',
  sent: 'info',
  in_progress: 'info',
  submitted: 'warn',
  needs_review: 'warn',
  reviewed: 'ok',
}

const sectionLabel = 'tabular-nums text-xs font-medium text-muted-foreground'

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

  const tone = statusTone[intake.status] || 'idle'
  const label = prettyStatus(intake.status)

  return (
    <article className="min-w-0 px-4 py-4 transition-colors hover:bg-muted/30 md:px-5">
      {exitGuard}
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-3">
          <div>
            <TitleLine as="h2" tone={tone} status={label} className="text-sm font-semibold text-foreground">
              {intake.patient?.displayName || 'Unknown patient'}
              <span className="font-normal text-muted-foreground"> · {intake.title}</span>
            </TitleLine>
            <div className="mt-1 flex min-w-0 flex-wrap gap-x-3 gap-y-1 pl-4 text-xs text-muted-foreground">
              <span className="font-medium capitalize text-foreground">{label}</span>
              <span className="tabular-nums">{formatDateTime(intake.appointment?.startsAt, intake.appointment?.facility?.timeZone)}</span>
              <span>{intake.appointment?.provider?.displayName || 'No provider'}</span>
              <span>{intake.appointment?.appointmentType?.name || 'Visit'}</span>
              <Code>{intake.templateKey || 'intake'}</Code>
            </div>
          </div>

          <dl className="grid min-w-0 gap-x-6 gap-y-3 pl-4 text-sm sm:grid-cols-2">
            <div className="min-w-0">
              <dt className={sectionLabel}>Visit reason</dt>
              <dd className="mt-1 break-words leading-6 text-foreground/90">{responses.reasonForVisit || intake.appointment?.reasonForVisit || 'No reason provided.'}</dd>
            </div>
            <div className="min-w-0">
              <dt className={sectionLabel}>Symptoms / updates</dt>
              <dd className="mt-1 break-words leading-6 text-foreground/90">{responses.symptoms || 'No symptoms or updates provided.'}</dd>
            </div>
            <div className="min-w-0">
              <dt className={sectionLabel}>Insurance</dt>
              <dd className="mt-1 break-words text-foreground/90">{insurance.payer || 'No payer provided'} {insurance.memberId ? <Code>· {insurance.memberId}</Code> : ''}</dd>
            </div>
            <div className="min-w-0">
              <dt className={sectionLabel}>History &amp; contact</dt>
              <dd className="mt-1 flex min-w-0 flex-wrap gap-x-3 text-foreground/90">
                <span className="tabular-nums">{medicationCount} medication{medicationCount === 1 ? '' : 's'}</span>
                <span className="tabular-nums">{allergyCount} allerg{allergyCount === 1 ? 'y' : 'ies'}</span>
                {intake.patient?.phone && <span className="tabular-nums text-[13px] ">{intake.patient.phone}</span>}
                {intake.patient?.email && <span className="break-all">{intake.patient.email}</span>}
              </dd>
            </div>
          </dl>
        </div>

        <aside className="min-w-0 space-y-2.5 rounded-[4px] border bg-muted/30 p-3">
          <label className={sectionLabel} htmlFor={`intake-review-notes-${intake.id}`}>Review notes</label>
          <textarea
            id={`intake-review-notes-${intake.id}`}
            readOnly={intake.status === 'reviewed' || locked || isPending}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Internal notes"
            rows={4}
            className="w-full min-w-0 rounded-[4px] border bg-background px-3 py-2 text-sm shadow-[inset_0_1px_1px_rgb(0_0_0/0.04)] outline-none focus-visible:ring-2 focus-visible:ring-ring read-only:bg-muted/40"
          />
          {(locked || ['submitted', 'needs_review', 'reviewed'].includes(intake.status)) && (
            <Track>
              {locked && <Pill variant="primary" disabled={isPending} onClick={() => runTransition(original.current!.action)}>Retry last action</Pill>}
              {!locked && (intake.status === 'submitted' || intake.status === 'needs_review') && (
                <Pill variant="primary" disabled={isPending} onClick={() => runTransition((key) => markIntakeReviewed(intake.id, intake.transitionVersion, notes, key), notes)}>
                  Mark reviewed
                </Pill>
              )}
              {!locked && intake.status === 'submitted' && (
                <Pill disabled={isPending} onClick={() => runTransition((key) => markIntakeNeedsReview(intake.id, intake.transitionVersion, key))}>
                  Needs review
                </Pill>
              )}
              {!locked && intake.status === 'reviewed' && (
                <Pill disabled={isPending} onClick={() => runTransition((key) => reopenIntake(intake.id, intake.transitionVersion, key))}>
                  Reopen review
                </Pill>
              )}
            </Track>
          )}
          {error && <Notice tone="bad" role="alert" className="text-xs">{error}</Notice>}
          {intake.reviewedAt && (
            <p className="flex items-baseline gap-1.5 text-xs text-muted-foreground">
              <StatusDot tone="ok" className="size-1.5 -translate-y-[0.1em] shadow-none" />
              Reviewed {formatDateTime(intake.reviewedAt, intake.appointment?.facility?.timeZone)}
            </p>
          )}
        </aside>
      </div>
    </article>
  )
}
