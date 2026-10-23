'use client'

import { useEffect, useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Pill, Track, fieldClass, labelClass } from '@/features/platform/components/ward'
import { FacilitySearchField } from '@/features/platform/facilities/components/FacilitySearchField'
import { loadEpisode, loadEpisodeChildren, loadEpisodePolicy, recoverEpisode, reviewEpisodePolicy } from '../actions/episodes'
import { transitionEncounter, type EncounterTransitionInput } from '../actions/transitions'
import { LabResultReadbackPanel } from '@/features/platform/operations/components/LabResultReadbackPanel'

const selectStyle = fieldClass
const detailsClass = 'group min-w-0 rounded-xl border bg-card'
const summaryClass = 'flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-semibold marker:hidden md:px-5 [&::-webkit-details-marker]:hidden'
const chevron = <span aria-hidden className="text-xs font-normal text-muted-foreground group-open:rotate-180">▾</span>
const choices = {
  operationalClosure: ['enabled', 'blocked_pending_review'], legacyEpisodes: ['reviewed_late_only', 'block_pending_review'],
  newCare: ['new_encounter_required'], lateResults: ['allow_existing_order', 'block_pending_review'],
  resultCorrections: ['allow_recorded_human_review', 'block_pending_review'], claims: ['allow_reconciliation', 'block_pending_review'],
  retention: ['unchanged_separate_retention_policy'], admission: ['separate_admission_discharge_workflow'],
}
const labels: Record<string, string> = { operationalClosure: 'Operational closure', legacyEpisodes: 'Legacy episodes without receipts',
  newCare: 'Subsequent new care', lateResults: 'Late results from existing orders', resultCorrections: 'Externally issued corrections',
  claims: 'Claims and reconciliation', retention: 'Retention and holds', admission: 'Admission / discharge authority' }
function errorText(error: unknown) { return error instanceof Error ? error.message : 'The result is unavailable; no success or empty state is inferred.' }

export function EpisodePolicyConfiguration() {
  const id = useId()
  const [facilityId, setFacilityId] = useState('')
  const [workspace, setWorkspace] = useState<any>(null)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState('')
  const [saved, setSaved] = useState<Record<string, unknown> | null>(null)
  async function load(beforeRevision?: number) {
    setPending(true); setMessage('')
    try {
      const response = await loadEpisodePolicy(facilityId, beforeRevision)
      if (!response.success) throw new Error(response.error)
      const next = response.data.episodePolicyWorkspace
      setWorkspace(next)
      try {
        const stored = JSON.parse(sessionStorage.getItem(`hospital:episode-policy:${next.actorId}:${facilityId}`) || 'null')
        if (stored) setSaved(stored)
        else if (workspace?.actorId !== next.actorId) setSaved(null)
      } catch { /* Preserve in-memory intent if storage is unavailable. */ }
    } catch (error) { setWorkspace(null); setMessage(errorText(error)) }
    finally { setPending(false) }
  }
  async function submit(form: FormData) {
    setPending(true); setMessage('')
    const definition = Object.fromEntries(Object.keys(choices).map(key => [key, form.get(key)]))
    const command = saved || { operationKey: `episode-policy-${crypto.randomUUID()}`, facilityId,
      expectedRevision: workspace.effective?.revision || 0, definition, reviewReference: String(form.get('reviewReference') || ''), attested: form.get('attested') === 'on' }
    setSaved(command)
    try { sessionStorage.setItem(`hospital:episode-policy:${workspace.actorId}:${facilityId}`, JSON.stringify(command)) } catch { /* In-memory retry only. */ }
    try {
      const response = await reviewEpisodePolicy(command)
      if (!response.success) throw new Error(response.error)
      setSaved(null)
      try { sessionStorage.removeItem(`hospital:episode-policy:${workspace.actorId}:${facilityId}`) } catch { /* Readback still distinguishes original/current. */ }
      await load()
      setMessage(`Policy revision ${response.data.reviewEpisodePolicy.original.revision} accepted. No clinical or retention authority was asserted.`)
    } catch (error) { setMessage(`${errorText(error)} Original command retained in this tab; retry does not change its identity.`) }
    finally { setPending(false) }
  }
  return <details className={detailsClass}>
    <summary className={summaryClass}><span>Closure policy</span>{chevron}</summary>
    <div className="min-w-0 border-t p-4 md:p-5">
    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end [&>*:first-child]:min-w-0 [&>*:first-child]:flex-1">
      <FacilitySearchField id={`${id}-facility`} name="episodePolicyFacility" disabled={pending} onSelect={value => { setFacilityId(value); setWorkspace(null); setSaved(null); setMessage('') }} />
      <Track className="self-start sm:self-end"><Pill disabled={!facilityId || pending} onClick={() => load()}>Load policy</Pill></Track>
    </div>
    {workspace && <div className="mt-4 space-y-4">
      <p role="status" className="text-sm font-medium">{workspace.effective ? `Effective reviewed revision ${workspace.effective.revision}` : 'No reviewed policy. Closure is unavailable.'}</p>
      <ul className="divide-y rounded-lg border text-sm">{workspace.history.map((entry: any) => <li key={entry.id} className="min-w-0 p-3">
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground"><span className="font-medium text-foreground">Revision {entry.revision}</span><span>{String(entry.effectiveAt)}</span><span className="break-all">Review {entry.reviewReference}</span></p>
        <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">{Object.entries(entry.definition).map(([key, value]) => <div key={key} className="flex min-w-0 justify-between gap-2"><dt className="text-muted-foreground">{labels[key]}</dt><dd className="text-right">{String(value).replaceAll('_', ' ')}</dd></div>)}</dl>
      </li>)}</ul>
      {workspace.nextRevision && <Track><Pill size="sm" disabled={pending} onClick={() => load(workspace.nextRevision)}>Older revisions</Pill></Track>}
      {workspace.canConfigure ? <form className="grid min-w-0 gap-3 sm:grid-cols-2" action={submit} key={workspace.effective?.id || 'unconfigured'}>
        {Object.entries(choices).map(([key, options]) => <div key={key} className="grid min-w-0 gap-1.5">
          <label htmlFor={`${id}-${key}`} className={labelClass}>{labels[key]}</label>
          <select id={`${id}-${key}`} name={key} required disabled={pending || Boolean(saved)} className={selectStyle} defaultValue={workspace.effective?.definition?.[key] || ''}>
            <option value="">Select option</option>{options.map(value => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}
          </select>
        </div>)}
        <div className="grid min-w-0 gap-1.5"><label htmlFor={`${id}-reference`} className={labelClass}>Review reference (no PHI)</label><input id={`${id}-reference`} className={fieldClass} name="reviewReference" required maxLength={200} disabled={Boolean(saved)} /></div>
        <label className="flex items-baseline gap-2 text-sm sm:col-span-2"><input name="attested" type="checkbox" required disabled={Boolean(saved)} className="translate-y-0.5" />I reviewed these operational options; no diagnosis, legal retention, or clinical-safety decision is made by software.</label>
        <Track className="justify-self-start sm:col-span-2"><Pill type="submit" variant="primary" disabled={pending}>{saved ? 'Retry exact policy command' : 'Record new revision'}</Pill></Track>
      </form> : <p className="text-sm text-muted-foreground">Configuring the policy is denied for this role.</p>}
    </div>}
    {pending && <p role="status" className="mt-3 text-sm text-muted-foreground">Checking current authority and policy…</p>}
    {message && <p role="status" className="mt-3 text-sm">{message}</p>}
    </div>
  </details>
}

export function EpisodeClosurePanel({ encounterId }: { encounterId: string }) {
  const router = useRouter()
  const id = useId()
  const [workspace, setWorkspace] = useState<any>(null)
  const [children, setChildren] = useState<any>(null)
  const [model, setModel] = useState('MedicalOrder')
  const [saved, setSaved] = useState<(EncounterTransitionInput & { actorId?: string }) | null>(null)
  const [recovery, setRecovery] = useState<any>(null)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState('')
  const storageKey = `hospital:episode-command:${encounterId}`
  async function refresh(beforeVersion?: number, beforeRejectedId?: string) {
    setPending(true); setMessage('')
    try {
      const response = await loadEpisode(encounterId, beforeVersion, beforeRejectedId)
      if (!response.success) throw new Error(response.error)
      const result = response.data.episodeClosureWorkspace
      setWorkspace(result)
      try {
        const command = JSON.parse(sessionStorage.getItem(storageKey) || 'null')
        if (command?.actorId === result.actorId) setSaved(command)
        else if (saved?.actorId !== result.actorId) setSaved(null)
      } catch { /* Existing in-memory command is preserved when storage is unavailable. */ }
    } catch (error) { setWorkspace(null); setChildren(null); setMessage(errorText(error)) }
    finally { setPending(false) }
  }
  useEffect(() => { setWorkspace(null); setChildren(null); setSaved(null); setRecovery(null); setMessage('') }, [encounterId])
  function remember(command: EncounterTransitionInput & { actorId?: string }) {
    setSaved(command)
    try { sessionStorage.setItem(storageKey, JSON.stringify(command)) } catch { /* Never claim reload recovery without persisted intent. */ }
  }
  async function send(command: EncounterTransitionInput & { actorId?: string }) {
    setPending(true); setMessage(''); remember(command)
    try {
      const input: EncounterTransitionInput = { operationKey: command.operationKey, encounterId: command.encounterId, toStatus: command.toStatus,
        expectedVersion: command.expectedVersion, reason: command.reason, expectedReviewFingerprint: command.expectedReviewFingerprint, reviewedTuple: command.reviewedTuple }
      const response = await transitionEncounter(input)
      if (!response.success) throw new Error(response.error)
      const result = (response.data as any).transitionEncounter
      setMessage(result.outcome === 'rejected' ? `Original command durably rejected: ${result.reasonCode}. No transition was performed. Verify the rejected receipt, then make a new reviewed command.` : 'Server acknowledgement accepted. The original receipt is not a claim about current child or appointment state; read it back below.')
      router.replace(`/dashboard/platform/encounters?encounterId=${encodeURIComponent(encounterId)}`)
      // Retain exact original command until its read-only recovery receipt is checked.
    } catch (error) { setMessage(`${errorText(error)} Outcome is not inferred. Keep the exact command and use read-only recovery before retrying.`) }
    finally { setPending(false) }
  }
  async function recover() {
    if (!saved) return
    setPending(true); setMessage('')
    try {
      const response = await recoverEpisode(encounterId, saved.operationKey)
      if (!response.success) throw new Error(response.error)
      setRecovery(response.data.recoverEpisodeClosure)
    } catch (error) { setRecovery(null); setMessage(errorText(error)) }
    finally { setPending(false) }
  }
  async function loadChildren(cursorId?: string, childId?: string, beforeChildVersion?: number) {
    setPending(true); setMessage(''); setChildren(null)
    try {
      const response = await loadEpisodeChildren(encounterId, model, cursorId, childId, beforeChildVersion)
      if (!response.success) throw new Error(response.error)
      setChildren(response.data.episodeChildWorkspace)
    } catch (error) { setMessage(errorText(error)) }
    finally { setPending(false) }
  }
  return <section className="min-w-0 space-y-3 rounded-lg border bg-muted/30 p-3" aria-label="Episode review, receipt and recovery">
    <Track><Pill size="sm" disabled={pending} onClick={() => refresh()}>{workspace ? 'Refresh episode' : 'Review episode'}</Pill></Track>
    {workspace && <>
      <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
        <div className="flex min-w-0 gap-2"><dt className="text-muted-foreground">Encounter</dt><dd>{workspace.status} · v{workspace.transitionVersion}</dd></div>
        <div className="flex min-w-0 gap-2"><dt className="text-muted-foreground">Appointment</dt><dd>{workspace.appointment ? `${workspace.appointment.status} / v${workspace.appointment.transitionVersion}` : 'none'}</dd></div>
        <div className="flex min-w-0 gap-2"><dt className="text-muted-foreground">Policy</dt><dd>{workspace.policy ? `revision ${workspace.policy.revision}` : 'not configured'}</dd></div>
      </dl>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>{workspace.legacyState.replaceAll('_', ' ')}</span>
        <Track><Pill size="sm" asChild><Link href="/dashboard/platform/operational-fabric">Holds / retention</Link></Pill><Pill size="sm" asChild><Link href="/dashboard/platform/clinical-fulfillment">Fulfillment</Link></Pill></Track>
      </div>
      <ul className="space-y-0.5 text-xs">{workspace.eligibility.map((entry: any) => <li key={entry.action} className="flex flex-wrap gap-x-2"><span className="font-medium">{entry.action.replaceAll('_', ' ')}</span><span className={entry.allowed ? 'text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground'}>{entry.allowed ? 'eligible' : 'not eligible'}</span><span className="text-muted-foreground">{entry.code.replaceAll('_', ' ')}</span></li>)}</ul>
      {!saved && ['open', 'in_progress'].includes(workspace.status) && <form className="grid min-w-0 gap-2" action={form => {
        const toStatus = String(form.get('toStatus')) as EncounterTransitionInput['toStatus']
        return send({ operationKey: `episode-${crypto.randomUUID()}`, encounterId, toStatus, expectedVersion: workspace.transitionVersion,
          expectedReviewFingerprint: workspace.reviewFingerprint, reviewedTuple: workspace.tuple, reason: String(form.get('reason') || ''), actorId: workspace.actorId })
      }}>
        <label htmlFor={`${id}-transition`} className={labelClass}>Transition</label>
        <select className={selectStyle} name="toStatus" id={`${id}-transition`} required>
          {workspace.status === 'open' && <option value="in_progress">Start operational encounter</option>}
          {workspace.status === 'in_progress' && <option value="closed">Close operational encounter</option>}
          <option value="cancelled">Cancel operational encounter</option>
        </select>
        <label htmlFor={`${id}-reason`} className={labelClass}>Administrative reason (no PHI)</label>
        <textarea name="reason" id={`${id}-reason`} maxLength={1000} required rows={2} className={`${fieldClass} h-auto py-2`} />
        <Track className="justify-self-start"><Pill type="submit" size="sm" variant="primary" disabled={pending || (workspace.status === 'in_progress' && workspace.policy?.definition.operationalClosure !== 'enabled')}>Apply transition</Pill></Track>
      </form>}
      <ul className="space-y-1 font-mono text-[11px] text-muted-foreground">{workspace.history.map((entry: any) => <li key={entry.id}>v{entry.toVersion}: {entry.fromStatus} → {entry.toStatus} · {entry.provenance.replaceAll('_', ' ')} · policy {entry.policy?.revision || 'unknown'} · {entry.owned ? 'your receipt' : 'another authorized operator'}</li>)}</ul>
      <ul className="space-y-1 text-xs text-red-700 dark:text-red-300">{workspace.rejectedHistory.map((entry: any) => <li key={entry.id}>Owned rejected command at v{entry.observedVersion}: {entry.reasonCode.replaceAll('_', ' ')} · policy {entry.policyRevision || 'unconfigured'} · no transition performed</li>)}</ul>
      {(workspace.nextRejectedId || workspace.nextVersion) && <Track>
        {workspace.nextRejectedId && <Pill size="sm" disabled={pending} onClick={() => refresh(undefined, workspace.nextRejectedId)}>Older rejections</Pill>}
        {workspace.nextVersion && <Pill size="sm" disabled={pending} onClick={() => refresh(workspace.nextVersion)}>Older receipts</Pill>}
      </Track>}
      {!workspace.history.length && <p className="text-xs text-muted-foreground">No transition receipt recorded.</p>}
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center"><label className="sr-only" htmlFor={`${id}-children`}>Child worklist</label><select id={`${id}-children`} className={`${selectStyle} sm:max-w-xs`} value={model} onChange={event => { setModel(event.target.value); setChildren(null) }}>
        {['MedicalOrder', 'LabResult', 'Prescription', 'Procedure', 'CarePlan', 'InsuranceClaim', 'Specimen', 'ClinicalDocument'].map(value => <option key={value}>{value}</option>)}
      </select><Track className="self-start sm:self-auto"><Pill size="sm" disabled={pending} onClick={() => loadChildren()}>Load child records</Pill></Track></div>
      {children && <div className="min-w-0 space-y-2 text-xs"><p className="text-muted-foreground">Showing {children.rows.length} of {children.count} {model} rows</p><ul className="divide-y rounded-lg border bg-card">{children.rows.map((row: any) => <li key={row.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 px-3 py-1.5"><span className="min-w-0 break-all font-mono text-[11px]">{row.id} · {row.status} · v{row.transitionVersion}</span><Track><Pill size="sm" disabled={pending} onClick={() => loadChildren(undefined, row.id)}>History</Pill></Track></li>)}</ul>{!children.rows.length && <p className="text-muted-foreground">No accessible matching child rows.</p>}{children.childId && <div className="min-w-0 space-y-1 rounded-lg border bg-card p-2"><p className="break-all font-medium">Owned receipts for {children.childId}</p><ul className="font-mono text-[11px] text-muted-foreground">{children.ownedHistory.map((entry: any) => <li key={entry.id}>v{entry.fromVersion} → v{entry.toVersion}: {entry.fromStatus} → {entry.toStatus}</li>)}</ul>{!children.ownedHistory.length && <p className="text-muted-foreground">No owned transition receipt in this page.</p>}{children.nextHistoryVersion && <Track><Pill size="sm" disabled={pending} onClick={() => loadChildren(undefined, children.childId, children.nextHistoryVersion)}>Older child receipts</Pill></Track>}</div>}{children.nextCursor && <Track><Pill size="sm" disabled={pending} onClick={() => loadChildren(children.nextCursor)}>Next page</Pill></Track>}</div>}
    </>}
    {children?.model === 'LabResult' && children.childId && <LabResultReadbackPanel key={children.childId} resultId={children.childId} />}
    {saved && <div className="min-w-0 space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-900 dark:text-amber-100">
      <p>Original command retained: {saved.toStatus} from version {saved.expectedVersion}.</p>
      <Track><Pill size="sm" disabled={pending} onClick={recover}>Recover receipt</Pill><Pill size="sm" variant="primary" disabled={pending || recovery?.outcome === 'accepted' || recovery?.outcome === 'rejected' || recovery?.outcome === 'legacy_unknown'} onClick={() => send(saved)}>Retry original command</Pill>
        {['accepted', 'rejected'].includes(recovery?.outcome) && <Pill size="sm" onClick={() => { setSaved(null); try { sessionStorage.removeItem(storageKey) } catch {} }}>Release saved command</Pill>}</Track>
    </div>}
    {recovery && <div role="status" className="space-y-0.5 text-xs"><p>Recovery: {recovery.outcome}. Original acknowledged status/version: {recovery.original ? `${recovery.original.status} / v${recovery.original.transitionVersion}` : 'not established; not a rejection'}.</p><p>Current status/version: {recovery.current.status} / v{recovery.current.transitionVersion}. Applied policy: {recovery.original?.episodeReceipt?.policy?.revision || 'unknown'}; current policy: {recovery.policy?.revision || 'unconfigured'}.</p></div>}
    {pending && <p role="status" className="text-xs text-muted-foreground">Loading episode…</p>}
    {message && <p role="status" className="text-xs">{message}</p>}
  </section>
}

export function EpisodeReceiptLookup({ initialEncounterId = '' }: { initialEncounterId?: string }) {
  const [encounterId, setEncounterId] = useState(initialEncounterId)
  const [selected, setSelected] = useState(initialEncounterId)
  const id = useId()
  useEffect(() => { setSelected(initialEncounterId); setEncounterId(initialEncounterId) }, [initialEncounterId])
  return <details className={detailsClass} open={Boolean(initialEncounterId)}>
    <summary className={summaryClass}><span>Receipt lookup</span>{chevron}</summary>
    <div className="min-w-0 space-y-3 border-t p-4 md:p-5">
    <form className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center" action={() => setSelected(encounterId.trim())}>
      <label className="sr-only" htmlFor={`${id}-lookup`}>Encounter ID from the original work item</label><input id={`${id}-lookup`} className={fieldClass} required maxLength={128} value={encounterId} onChange={event => setEncounterId(event.target.value)} placeholder="Encounter ID" /><Track className="self-start sm:self-auto"><Pill type="submit">Open review</Pill></Track>
    </form>
    {selected && <EpisodeClosurePanel key={selected} encounterId={selected} />}
    </div>
  </details>
}
