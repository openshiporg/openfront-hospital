'use client'

import { useEffect, useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { FacilitySearchField } from '@/features/platform/facilities/components/FacilitySearchField'
import { loadEpisode, loadEpisodeChildren, loadEpisodePolicy, recoverEpisode, reviewEpisodePolicy } from '../actions/episodes'
import { transitionEncounter, type EncounterTransitionInput } from '../actions/transitions'
import { LabResultReadbackPanel } from '@/features/platform/operations/components/LabResultReadbackPanel'

const selectStyle = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm'
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
  return <details className="rounded-lg border p-4">
    <summary className="cursor-pointer font-medium">Review episode-closure policy and immutable revisions</summary>
    <p className="my-3 text-sm text-muted-foreground">Administrative closure is not clinical discharge. Policy review requires BOTH role-management and patient-operation permission in the current facility. Clinical/result, billing, and retention authority remain separate.</p>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <FacilitySearchField id={`${id}-facility`} name="episodePolicyFacility" disabled={pending} onSelect={value => { setFacilityId(value); setWorkspace(null); setSaved(null); setMessage('') }} />
      <Button variant="outline" disabled={!facilityId || pending} onClick={() => load()}>Load policy and history</Button>
    </div>
    {workspace && <div className="mt-4 space-y-4">
      <p role="status">{workspace.effective ? `Effective reviewed revision ${workspace.effective.revision}` : 'No reviewed policy. Closure is unavailable; no default is silently installed.'}</p>
      <ul className="space-y-2 text-sm">{workspace.history.map((entry: any) => <li key={entry.id} className="rounded border p-3">
        Revision {entry.revision} · {String(entry.effectiveAt)} · review {entry.reviewReference}
        <dl className="mt-2 grid gap-1 sm:grid-cols-2">{Object.entries(entry.definition).map(([key, value]) => <div key={key}><dt className="text-muted-foreground">{labels[key]}</dt><dd>{String(value).replaceAll('_', ' ')}</dd></div>)}</dl>
      </li>)}</ul>
      {workspace.nextRevision && <Button variant="outline" disabled={pending} onClick={() => load(workspace.nextRevision)}>Older policy revisions</Button>}
      {workspace.canConfigure ? <form className="grid gap-3 sm:grid-cols-2" action={submit} key={workspace.effective?.id || 'unconfigured'}>
        {Object.entries(choices).map(([key, options]) => <div key={key} className="space-y-1">
          <Label htmlFor={`${id}-${key}`}>{labels[key]}</Label>
          <select id={`${id}-${key}`} name={key} required disabled={pending || Boolean(saved)} className={selectStyle} defaultValue={workspace.effective?.definition?.[key] || ''}>
            <option value="">Select explicit reviewed option</option>{options.map(value => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}
          </select>
        </div>)}
        <div><Label htmlFor={`${id}-reference`}>Approved human review reference (no PHI)</Label><Input id={`${id}-reference`} name="reviewReference" required maxLength={200} disabled={Boolean(saved)} /></div>
        <label className="flex items-center gap-2 text-sm"><input name="attested" type="checkbox" required disabled={Boolean(saved)} />I reviewed these operational options; no diagnosis, legal retention, or clinical-safety decision is made by software.</label>
        <Button disabled={pending}>{saved ? 'Retry exact policy command' : 'Record superseding reviewed revision'}</Button>
      </form> : <p className="text-sm">Policy history is available. Configuring it is denied for this role; request an authorized human policy reviewer.</p>}
    </div>}
    {pending && <p role="status" className="mt-3 text-sm">Checking current authority and policy…</p>}
    {message && <p role="status" className="mt-3 text-sm">{message}</p>}
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
  return <section className="mt-3 space-y-3 rounded-lg border p-3" aria-label="Episode review, receipt and recovery">
    <Button size="sm" variant="outline" disabled={pending} onClick={() => refresh()}>Review current episode / history / saved intent</Button>
    {workspace && <>
      <p className="text-sm">Current encounter: {workspace.status} · version {workspace.transitionVersion}. Appointment: {workspace.appointment ? `${workspace.appointment.status} / v${workspace.appointment.transitionVersion}` : 'none'}. Policy: {workspace.policy ? `revision ${workspace.policy.revision}` : 'not configured'}.</p>
      <p className="text-xs text-muted-foreground">{workspace.legacyState.replaceAll('_', ' ')}. No descendant closure, admission discharge, diagnosis, or retention disposition is implied. <Link className="underline" href="/dashboard/platform/operational-fabric">Separate holds / retention workspace</Link>; <Link className="underline" href="/dashboard/platform/clinical-fulfillment">authorized fulfillment worklists</Link>.</p>
      <ul className="text-xs">{workspace.eligibility.map((entry: any) => <li key={entry.action}>{entry.action.replaceAll('_', ' ')}: {entry.allowed ? 'eligible subject to separate authority and version' : 'not eligible'} — {entry.code.replaceAll('_', ' ')}</li>)}</ul>
      {!saved && ['open', 'in_progress'].includes(workspace.status) && <form className="space-y-2" action={form => {
        const toStatus = String(form.get('toStatus')) as EncounterTransitionInput['toStatus']
        return send({ operationKey: `episode-${crypto.randomUUID()}`, encounterId, toStatus, expectedVersion: workspace.transitionVersion,
          expectedReviewFingerprint: workspace.reviewFingerprint, reviewedTuple: workspace.tuple, reason: String(form.get('reason') || ''), actorId: workspace.actorId })
      }}>
        <Label htmlFor={`${id}-transition`}>Reviewed operational transition</Label>
        <select className={selectStyle} name="toStatus" id={`${id}-transition`} required>
          {workspace.status === 'open' && <option value="in_progress">Start operational encounter</option>}
          {workspace.status === 'in_progress' && <option value="closed">Close operational encounter</option>}
          <option value="cancelled">Cancel operational encounter</option>
        </select>
        <Label htmlFor={`${id}-reason`}>Administrative reason only (no PHI, diagnosis, clinical readiness, or legal-chart content)</Label>
        <Textarea name="reason" id={`${id}-reason`} maxLength={1000} required />
        <Button size="sm" disabled={pending || (workspace.status === 'in_progress' && workspace.policy?.definition.operationalClosure !== 'enabled')}>Execute reviewed command</Button>
      </form>}
      <ul className="space-y-1 text-xs">{workspace.history.map((entry: any) => <li key={entry.id}>v{entry.toVersion}: {entry.fromStatus} → {entry.toStatus} · {entry.provenance.replaceAll('_', ' ')} · policy {entry.policy?.revision || 'unknown'} · {entry.owned ? 'your receipt' : 'another authorized operator'}</li>)}</ul>
      <ul className="space-y-1 text-xs">{workspace.rejectedHistory.map((entry: any) => <li key={entry.id}>Owned rejected command at v{entry.observedVersion}: {entry.reasonCode.replaceAll('_', ' ')} · policy {entry.policyRevision || 'unconfigured'} · no transition performed</li>)}</ul>
      {workspace.nextRejectedId && <Button size="sm" variant="outline" disabled={pending} onClick={() => refresh(undefined, workspace.nextRejectedId)}>Older owned rejection receipts</Button>}
      {!workspace.history.length && <p className="text-xs">No transition receipt recorded. This is not clinical-history completeness.</p>}
      {workspace.nextVersion && <Button size="sm" variant="outline" disabled={pending} onClick={() => refresh(workspace.nextVersion)}>Older episode receipts</Button>}
      <div className="flex flex-col gap-2 sm:flex-row"><label className="sr-only" htmlFor={`${id}-children`}>Child worklist</label><select id={`${id}-children`} className={selectStyle} value={model} onChange={event => { setModel(event.target.value); setChildren(null) }}>
        {['MedicalOrder', 'LabResult', 'Prescription', 'Procedure', 'CarePlan', 'InsuranceClaim', 'Specimen', 'ClinicalDocument'].map(value => <option key={value}>{value}</option>)}
      </select><Button size="sm" variant="outline" disabled={pending} onClick={() => loadChildren()}>Read authorized child state</Button></div>
      {children && <div className="text-xs"><p>Showing {children.rows.length} of {children.count} independently scoped {model} rows. No private contents are loaded.</p><ul>{children.rows.map((row: any) => <li key={row.id} className="flex flex-wrap items-center gap-2">{row.id} · {row.status} · v{row.transitionVersion}<Button size="sm" variant="ghost" disabled={pending} onClick={() => loadChildren(undefined, row.id)}>Owned history</Button></li>)}</ul>{!children.rows.length && <p>No accessible matching child rows; this does not prove no clinical work exists elsewhere.</p>}{children.childId && <div className="my-2 rounded border p-2"><p>Owned transition receipts for {children.childId}; not complete clinical/supersession history.</p><ul>{children.ownedHistory.map((entry: any) => <li key={entry.id}>v{entry.fromVersion} → v{entry.toVersion}: {entry.fromStatus} → {entry.toStatus}</li>)}</ul>{!children.ownedHistory.length && <p>No owned transition receipt in this page. Creation, correction lineage, and machine/other-operator evidence are not inferred absent.</p>}{children.nextHistoryVersion && <Button size="sm" variant="outline" disabled={pending} onClick={() => loadChildren(undefined, children.childId, children.nextHistoryVersion)}>Older owned child receipts</Button>}</div>}{children.nextCursor && <Button size="sm" variant="outline" disabled={pending} onClick={() => loadChildren(children.nextCursor)}>Next child page</Button>}</div>}
    </>}
    {children?.model === 'LabResult' && children.childId && <LabResultReadbackPanel key={children.childId} resultId={children.childId} />}
    {saved && <div className="space-y-2 rounded border p-3 text-xs">
      <p>Original command retained: {saved.toStatus} from version {saved.expectedVersion}. Do not change its key, reason, or reviewed fingerprint after an unknown outcome.</p>
      <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={pending} onClick={recover}>Read-only owned receipt recovery</Button><Button size="sm" disabled={pending || recovery?.outcome === 'accepted' || recovery?.outcome === 'rejected' || recovery?.outcome === 'legacy_unknown'} onClick={() => send(saved)}>Retry exact original command</Button>
        {['accepted', 'rejected'].includes(recovery?.outcome) && <Button size="sm" variant="outline" onClick={() => { setSaved(null); try { sessionStorage.removeItem(storageKey) } catch {} }}>Receipt verified: release saved command</Button>}</div>
    </div>}
    {recovery && <div role="status" className="text-xs"><p>Recovery: {recovery.outcome}. Original acknowledged status/version: {recovery.original ? `${recovery.original.status} / v${recovery.original.transitionVersion}` : 'not established; not a rejection'}.</p><p>Current status/version: {recovery.current.status} / v{recovery.current.transitionVersion}. Applied policy: {recovery.original?.episodeReceipt?.policy?.revision || 'unknown'}; current policy: {recovery.policy?.revision || 'unconfigured'}.</p></div>}
    {pending && <p role="status" className="text-xs">Re-establishing current authority and scoped state…</p>}
    {message && <p role="status" className="text-xs">{message}</p>}
  </section>
}

export function EpisodeReceiptLookup({ initialEncounterId = '' }: { initialEncounterId?: string }) {
  const [encounterId, setEncounterId] = useState(initialEncounterId)
  const [selected, setSelected] = useState(initialEncounterId)
  const id = useId()
  useEffect(() => { setSelected(initialEncounterId); setEncounterId(initialEncounterId) }, [initialEncounterId])
  return <details className="rounded-lg border p-4" open={Boolean(initialEncounterId)}>
    <summary className="cursor-pointer font-medium">Closed / legacy episode receipts and lost-acknowledgement recovery</summary>
    <form className="mt-3 flex flex-col gap-2 sm:flex-row" action={() => setSelected(encounterId.trim())}>
      <Label className="sr-only" htmlFor={`${id}-lookup`}>Encounter ID from the original work item</Label><Input id={`${id}-lookup`} required maxLength={128} value={encounterId} onChange={event => setEncounterId(event.target.value)} placeholder="Encounter ID from original work item" /><Button variant="outline">Open authorized review</Button>
    </form>
    {selected && <EpisodeClosurePanel key={selected} encounterId={selected} />}
  </details>
}
