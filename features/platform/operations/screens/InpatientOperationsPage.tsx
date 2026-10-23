import Link from 'next/link'

import type * as React from 'react'

import { cn } from '@/lib/utils'
import {
  Board,
  BoardRow,
  Code,
  EmptyBoard,
  Meter,
  Notice,
  Pill,
  Readout,
  ReadoutStrip,
  StatusTag,
  TitleLine,
  Track,
  WardBody,
  WardHeader,
  WardSection,
  statusLabel,
  toneForStatus,
  type WardTone,
} from '@/features/platform/components/ward'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import {
  AdmissionCreateForm,
  AdmissionDischargeForm,
  AdmissionTransferForm,
  BedButton,
  BedReservationCreateForm,
  BedReservationReleaseForm,
} from '../components/WorkflowControls'
import { AdmissionCursorPagination } from '../components/AdmissionCursorPagination'
import { BedReservationCursorPagination } from '../components/BedReservationCursorPagination'
import { BedCursorPagination } from '../components/BedCursorPagination'
import { BoundedDataNotice } from '@/features/platform/components/BoundedDataNotice'
import { WorkspaceLoadError } from '@/features/platform/components/WorkspaceLoadError'
import { getOperationsWorkspaceOptions } from '../lib/getOperationsWorkspaceOptions'
import {
  activeAdmissionsWhere,
  admissionCursorMembershipWhere,
  admissionCursorOrderBy,
  parseAdmissionCursor,
  parseAdmissionsCount,
  shapeActiveAdmissionsCursorPage,
  validateAdmissionCursorMembership,
  type ActiveAdmissionsCursorPage,
  type AdmissionCursorDirection,
  type AdmissionCursorRequest,
} from '../lib/admissionCursor'
import {
  activeBedReservationsWhere,
  bedReservationCursorMembershipWhere,
  bedReservationCursorOrderBy,
  parseBedReservationCursor,
  parseBedReservationsCount,
  shapeBedReservationCursorPage,
  validateBedReservationCursorMembership,
  type BedReservationCursorDirection,
  type BedReservationCursorPage,
  type BedReservationCursorRequest,
  type BedReservationCursorRow,
} from '../lib/bedReservationCursor'
import { inpatientCursorHref, type InpatientCursor } from '../lib/inpatientCursorHref'
import {
  allBedsWhere,
  bedCursorMembershipWhere,
  bedCursorOrderBy,
  parseBedCounts,
  parseBedCursor,
  parseBedsCount,
  shapeBedCursorPage,
  validateBedCursorMembership,
  type BedCounts,
  type BedCursorDirection,
  type BedCursorPage,
  type BedCursorRequest,
  type BedCursorRow,
} from '../lib/bedCursor'

type Admission = {
  id: string
  admissionNumber: string
  status: string
  transitionVersion: number
  admittedAt?: string | null
  patient?: { displayName?: string | null } | null
  facility?: { id?: string | null; name?: string | null; timeZone?: string | null } | null
  bed?: { id: string; bedNumber?: string | null } | null
  room?: { roomNumber?: string | null } | null
}

type Bed = BedCursorRow
type Reservation = BedReservationCursorRow

type AdmissionPageProjection = { admissions: unknown; admissionsCount: unknown }
type AdmissionCursorMembershipProjection = { cursorAdmissions: unknown; cursorAdmissionsCount: unknown; admissionsCount: unknown }
type BedReservationPageProjection = { bedReservations: unknown; bedReservationsCount: unknown }
type BedReservationCursorMembershipProjection = { cursorBedReservations: unknown; cursorBedReservationsCount: unknown; bedReservationsCount: unknown }
type BedCountsProjection = { bedsCount: unknown; availableBedsCount: unknown; occupiedBedsCount: unknown }
type BedPageProjection = BedCountsProjection & { beds: unknown }
type BedCursorMembershipProjection = { cursorBeds: unknown; cursorBedsCount: unknown; bedsCount: unknown; availableBedsCount: unknown; occupiedBedsCount: unknown }
type AdmissionQueueResult = {
  state: 'ready' | 'empty' | 'denied' | 'unavailable' | 'stale' | 'inconsistent'
  page: ActiveAdmissionsCursorPage | null
  totalCount: number | null
  direction: AdmissionCursorDirection
  cursorId: string | null
}
type BedReservationQueueResult = {
  state: 'ready' | 'empty' | 'denied' | 'unavailable' | 'stale' | 'inconsistent'
  page: BedReservationCursorPage | null
  totalCount: number | null
  direction: BedReservationCursorDirection
  cursorId: string | null
}
type BedQueueResult = {
  state: 'ready' | 'empty' | 'denied' | 'unavailable' | 'stale' | 'inconsistent'
  page: BedCursorPage | null
  totalCount: number | null
  counts: BedCounts | null
  direction: BedCursorDirection
  cursorId: string | null
}

const admissionsCountsQuery = `
  query ActiveAdmissionsCount($where: AdmissionWhereInput!) {
    admissionsCount(where: $where)
  }
`

const admissionsFirstPageQuery = `
  query ActiveAdmissionsFirstPage($where: AdmissionWhereInput!) {
    admissions(where: $where, orderBy: [{ admittedAt: asc }, { id: asc }], take: 26) {
      id admissionNumber status transitionVersion admittedAt patient{displayName} facility{id name timeZone} bed{id bedNumber} room{roomNumber}
    }
    admissionsCount(where: $where)
  }
`

const admissionsCursorMembershipQuery = `
  query ActiveAdmissionsCursorMembership($where: AdmissionWhereInput!, $cursorWhere: AdmissionWhereInput!) {
    cursorAdmissions: admissions(where: $cursorWhere, orderBy: [{ id: asc }], take: 2) { id }
    cursorAdmissionsCount: admissionsCount(where: $cursorWhere)
    admissionsCount(where: $where)
  }
`

const admissionsCursorPageQuery = `
  query ActiveAdmissionsCursorPage($where: AdmissionWhereInput!, $cursor: AdmissionWhereUniqueInput!, $orderBy: [AdmissionOrderByInput!]!) {
    admissions(where: $where, orderBy: $orderBy, take: 26, cursor: $cursor, skip: 1) {
      id admissionNumber status transitionVersion admittedAt patient{displayName} facility{id name timeZone} bed{id bedNumber} room{roomNumber}
    }
    admissionsCount(where: $where)
  }
`

const bedReservationsCountsQuery = `
  query ActiveBedReservationsCount($where: BedReservationWhereInput!) {
    bedReservationsCount(where: $where)
  }
`

const bedReservationsFirstPageQuery = `
  query ActiveBedReservationsFirstPage($where: BedReservationWhereInput!) {
    bedReservations(where: $where, orderBy: [{ expiresAt: asc }, { id: asc }], take: 26) {
      id reservationNumber status transitionVersion expiresAt patient{displayName} bed{bedNumber} facility{name timeZone}
    }
    bedReservationsCount(where: $where)
  }
`

const bedReservationsCursorMembershipQuery = `
  query ActiveBedReservationsCursorMembership($where: BedReservationWhereInput!, $cursorWhere: BedReservationWhereInput!) {
    cursorBedReservations: bedReservations(where: $cursorWhere, orderBy: [{ id: asc }], take: 2) { id }
    cursorBedReservationsCount: bedReservationsCount(where: $cursorWhere)
    bedReservationsCount(where: $where)
  }
`

const bedReservationsCursorPageQuery = `
  query ActiveBedReservationsCursorPage($where: BedReservationWhereInput!, $cursor: BedReservationWhereUniqueInput!, $orderBy: [BedReservationOrderByInput!]!) {
    bedReservations(where: $where, orderBy: $orderBy, take: 26, cursor: $cursor, skip: 1) {
      id reservationNumber status transitionVersion expiresAt patient{displayName} bed{bedNumber} facility{name timeZone}
    }
    bedReservationsCount(where: $where)
  }
`

const bedsCountsQuery = `
  query InpatientBedCounts($where: BedWhereInput!) {
    bedsCount(where: $where)
    availableBedsCount: bedsCount(where: { AND: [$where, { status: { equals: "available" } }] })
    occupiedBedsCount: bedsCount(where: { AND: [$where, { status: { equals: "occupied" } }] })
  }
`

const bedsFirstPageQuery = `
  query InpatientBedsFirstPage($where: BedWhereInput!) {
    beds(where: $where, orderBy: [{ bedNumber: asc }, { id: asc }], take: 26) {
      id bedNumber status transitionVersion currentPatient{displayName} room{roomNumber ward{name}}
    }
    bedsCount(where: $where)
    availableBedsCount: bedsCount(where: { AND: [$where, { status: { equals: "available" } }] })
    occupiedBedsCount: bedsCount(where: { AND: [$where, { status: { equals: "occupied" } }] })
  }
`

const bedsCursorMembershipQuery = `
  query InpatientBedsCursorMembership($where: BedWhereInput!, $cursorWhere: BedWhereInput!) {
    cursorBeds: beds(where: $cursorWhere, orderBy: [{ id: asc }], take: 2) { id }
    cursorBedsCount: bedsCount(where: $cursorWhere)
    bedsCount(where: $where)
    availableBedsCount: bedsCount(where: { AND: [$where, { status: { equals: "available" } }] })
    occupiedBedsCount: bedsCount(where: { AND: [$where, { status: { equals: "occupied" } }] })
  }
`

const bedsCursorPageQuery = `
  query InpatientBedsCursorPage($where: BedWhereInput!, $cursor: BedWhereUniqueInput!, $orderBy: [BedOrderByInput!]!) {
    beds(where: $where, orderBy: $orderBy, take: 26, cursor: $cursor, skip: 1) {
      id bedNumber status transitionVersion currentPatient{displayName} room{roomNumber ward{name}}
    }
    bedsCount(where: $where)
    availableBedsCount: bedsCount(where: { AND: [$where, { status: { equals: "available" } }] })
    occupiedBedsCount: bedsCount(where: { AND: [$where, { status: { equals: "occupied" } }] })
  }
`

async function getActiveAdmissionsQueue(request: AdmissionCursorRequest): Promise<AdmissionQueueResult> {
  const where = activeAdmissionsWhere()
  const direction = request.state === 'ready' ? request.direction : 'first'
  const cursorId = request.state === 'ready' ? request.cursorId : null

  if (request.state !== 'ready') {
    const response = await keystoneClient<{ admissionsCount: unknown }>(admissionsCountsQuery, { where }).catch(() => null)
    if (!response?.success) return { state: 'unavailable', page: null, totalCount: null, direction, cursorId }
    const totalCount = parseAdmissionsCount(response.data.admissionsCount)
    return { state: totalCount === null ? 'inconsistent' : request.state, page: null, totalCount, direction, cursorId }
  }

  if (request.direction === 'first') {
    const response = await keystoneClient<AdmissionPageProjection>(admissionsFirstPageQuery, { where }).catch(() => null)
    if (!response?.success) return { state: 'unavailable', page: null, totalCount: null, direction, cursorId }
    const page = shapeActiveAdmissionsCursorPage(response.data.admissions, response.data.admissionsCount, 'first', false)
    const totalCount = page.state === 'inconsistent' ? parseAdmissionsCount(response.data.admissionsCount) : page.totalCount
    return { state: page.state, page, totalCount, direction, cursorId }
  }

  const safeCursorId = cursorId as string
  const membershipResponse = await keystoneClient<AdmissionCursorMembershipProjection>(admissionsCursorMembershipQuery, {
    where,
    cursorWhere: admissionCursorMembershipWhere(safeCursorId),
  }).catch(() => null)
  if (!membershipResponse?.success) return { state: 'unavailable', page: null, totalCount: null, direction, cursorId }
  const totalCount = parseAdmissionsCount(membershipResponse.data.admissionsCount)
  const membership = validateAdmissionCursorMembership(safeCursorId, membershipResponse.data.cursorAdmissions, membershipResponse.data.cursorAdmissionsCount)
  if (totalCount === null || membership === 'inconsistent') return { state: 'inconsistent', page: null, totalCount, direction, cursorId }
  if (membership === 'denied') return { state: 'denied', page: null, totalCount, direction, cursorId }

  const response = await keystoneClient<AdmissionPageProjection>(admissionsCursorPageQuery, {
    where,
    cursor: { id: safeCursorId },
    orderBy: admissionCursorOrderBy(request.direction),
  }).catch(() => null)
  if (!response?.success) return { state: 'unavailable', page: null, totalCount, direction, cursorId }
  const page = shapeActiveAdmissionsCursorPage(response.data.admissions, response.data.admissionsCount, request.direction, true)
  const verifiedCount = page.state === 'inconsistent' ? parseAdmissionsCount(response.data.admissionsCount) : page.totalCount
  return { state: page.state, page, totalCount: verifiedCount ?? totalCount, direction, cursorId }
}

async function getActiveBedReservationsQueue(request: BedReservationCursorRequest): Promise<BedReservationQueueResult> {
  const where = activeBedReservationsWhere()
  const direction = request.state === 'ready' ? request.direction : 'first'
  const cursorId = request.state === 'ready' ? request.cursorId : null

  if (request.state !== 'ready') {
    const response = await keystoneClient<{ bedReservationsCount: unknown }>(bedReservationsCountsQuery, { where }).catch(() => null)
    if (!response?.success) return { state: 'unavailable', page: null, totalCount: null, direction, cursorId }
    const totalCount = parseBedReservationsCount(response.data.bedReservationsCount)
    return { state: totalCount === null ? 'inconsistent' : request.state, page: null, totalCount, direction, cursorId }
  }

  if (request.direction === 'first') {
    const response = await keystoneClient<BedReservationPageProjection>(bedReservationsFirstPageQuery, { where }).catch(() => null)
    if (!response?.success) return { state: 'unavailable', page: null, totalCount: null, direction, cursorId }
    const page = shapeBedReservationCursorPage(response.data.bedReservations, response.data.bedReservationsCount, 'first', false)
    const totalCount = page.state === 'inconsistent' ? parseBedReservationsCount(response.data.bedReservationsCount) : page.totalCount
    return { state: page.state, page, totalCount, direction, cursorId }
  }

  const safeCursorId = cursorId as string
  const membershipResponse = await keystoneClient<BedReservationCursorMembershipProjection>(bedReservationsCursorMembershipQuery, {
    where,
    cursorWhere: bedReservationCursorMembershipWhere(safeCursorId),
  }).catch(() => null)
  if (!membershipResponse?.success) return { state: 'unavailable', page: null, totalCount: null, direction, cursorId }
  const totalCount = parseBedReservationsCount(membershipResponse.data.bedReservationsCount)
  const membership = validateBedReservationCursorMembership(
    safeCursorId,
    membershipResponse.data.cursorBedReservations,
    membershipResponse.data.cursorBedReservationsCount,
  )
  if (totalCount === null || membership === 'inconsistent') return { state: 'inconsistent', page: null, totalCount, direction, cursorId }
  if (membership === 'denied') return { state: 'denied', page: null, totalCount, direction, cursorId }

  const response = await keystoneClient<BedReservationPageProjection>(bedReservationsCursorPageQuery, {
    where,
    cursor: { id: safeCursorId },
    orderBy: bedReservationCursorOrderBy(request.direction),
  }).catch(() => null)
  if (!response?.success) return { state: 'unavailable', page: null, totalCount, direction, cursorId }
  const page = shapeBedReservationCursorPage(response.data.bedReservations, response.data.bedReservationsCount, request.direction, true)
  const verifiedCount = page.state === 'inconsistent' ? parseBedReservationsCount(response.data.bedReservationsCount) : page.totalCount
  return { state: page.state, page, totalCount: verifiedCount ?? totalCount, direction, cursorId }
}

async function getBedsQueue(request: BedCursorRequest): Promise<BedQueueResult> {
  const where = allBedsWhere()
  const direction = request.state === 'ready' ? request.direction : 'first'
  const cursorId = request.state === 'ready' ? request.cursorId : null

  if (request.state !== 'ready') {
    const response = await keystoneClient<BedCountsProjection>(bedsCountsQuery, { where }).catch(() => null)
    if (!response?.success) return { state: 'unavailable', page: null, totalCount: null, counts: null, direction, cursorId }
    const totalCount = parseBedsCount(response.data.bedsCount)
    return {
      state: totalCount === null ? 'inconsistent' : request.state,
      page: null,
      totalCount,
      counts: parseBedCounts(response.data),
      direction,
      cursorId,
    }
  }

  if (request.direction === 'first') {
    const response = await keystoneClient<BedPageProjection>(bedsFirstPageQuery, { where }).catch(() => null)
    if (!response?.success) return { state: 'unavailable', page: null, totalCount: null, counts: null, direction, cursorId }
    const page = shapeBedCursorPage(response.data.beds, response.data.bedsCount, 'first', false)
    const totalCount = page.state === 'inconsistent' ? parseBedsCount(response.data.bedsCount) : page.totalCount
    return { state: page.state, page, totalCount, counts: parseBedCounts(response.data), direction, cursorId }
  }

  const safeCursorId = cursorId as string
  const membershipResponse = await keystoneClient<BedCursorMembershipProjection>(bedsCursorMembershipQuery, {
    where,
    cursorWhere: bedCursorMembershipWhere(safeCursorId),
  }).catch(() => null)
  if (!membershipResponse?.success) return { state: 'unavailable', page: null, totalCount: null, counts: null, direction, cursorId }
  const totalCount = parseBedsCount(membershipResponse.data.bedsCount)
  const counts = parseBedCounts(membershipResponse.data)
  const membership = validateBedCursorMembership(safeCursorId, membershipResponse.data.cursorBeds, membershipResponse.data.cursorBedsCount)
  if (totalCount === null || membership === 'inconsistent') return { state: 'inconsistent', page: null, totalCount, counts, direction, cursorId }
  if (membership === 'denied') return { state: 'denied', page: null, totalCount, counts, direction, cursorId }

  const response = await keystoneClient<BedPageProjection>(bedsCursorPageQuery, {
    where,
    cursor: { id: safeCursorId },
    orderBy: bedCursorOrderBy(request.direction),
  }).catch(() => null)
  if (!response?.success) return { state: 'unavailable', page: null, totalCount, counts, direction, cursorId }
  const page = shapeBedCursorPage(response.data.beds, response.data.bedsCount, request.direction, true)
  const verifiedCount = page.state === 'inconsistent' ? parseBedsCount(response.data.bedsCount) : page.totalCount
  return {
    state: page.state,
    page,
    totalCount: verifiedCount ?? totalCount,
    counts: parseBedCounts(response.data) ?? counts,
    direction,
    cursorId,
  }
}

function formatFacilityDateTime(value: string, timeZone?: string | null) {
  if (!timeZone) return 'facility time unavailable'
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    timeZoneName: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function InpatientOperationsPage({ searchParams }: PageProps) {
  const params = await searchParams
  const admissionCursorRequest = parseAdmissionCursor(params.admissionsAfter, params.admissionsBefore)
  const reservationCursorRequest = parseBedReservationCursor(params.reservationsAfter, params.reservationsBefore)
  const bedCursorRequest = parseBedCursor(params.bedsAfter, params.bedsBefore)
  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: '/dashboard' },
    { type: 'page' as const, label: 'Inpatient' },
  ]
  const [options, admissions, reservations, bedsQueue] = await Promise.all([
    getOperationsWorkspaceOptions(),
    getActiveAdmissionsQueue(admissionCursorRequest),
    getActiveBedReservationsQueue(reservationCursorRequest),
    getBedsQueue(bedCursorRequest),
  ]).catch(() => [null, null, null, null] as const)
  if (!options || !admissions || !reservations || !bedsQueue) {
    return <WorkspaceLoadError title="Inpatient operations" description="Admission and bed-board data may be incomplete." breadcrumbs={breadcrumbs} />
  }
  const admissionCursor: InpatientCursor | null = admissionCursorRequest.state === 'ready' && admissionCursorRequest.direction !== 'first' && admissionCursorRequest.cursorId
    ? { key: admissionCursorRequest.direction === 'after' ? 'admissionsAfter' : 'admissionsBefore', id: admissionCursorRequest.cursorId }
    : null
  const reservationCursor: InpatientCursor | null = reservationCursorRequest.state === 'ready' && reservationCursorRequest.direction !== 'first' && reservationCursorRequest.cursorId
    ? { key: reservationCursorRequest.direction === 'after' ? 'reservationsAfter' : 'reservationsBefore', id: reservationCursorRequest.cursorId }
    : null
  const bedCursor: InpatientCursor | null = bedCursorRequest.state === 'ready' && bedCursorRequest.direction !== 'first' && bedCursorRequest.cursorId
    ? { key: bedCursorRequest.direction === 'after' ? 'bedsAfter' : 'bedsBefore', id: bedCursorRequest.cursorId }
    : null
  const preservedForAdmissions = [bedCursor, reservationCursor].filter((cursor): cursor is InpatientCursor => cursor !== null)
  const preservedForReservations = [bedCursor, admissionCursor].filter((cursor): cursor is InpatientCursor => cursor !== null)
  const preservedForBeds = [admissionCursor, reservationCursor].filter((cursor): cursor is InpatientCursor => cursor !== null)
  const totalBeds = bedsQueue.counts?.beds ?? null
  return (
    <PageContainer
      title="Inpatient operations"
      breadcrumbs={breadcrumbs}
      header={(
        <WardHeader
          eyebrow="Inpatient"
          title="Bed board"
          tone={bedsQueue.counts ? (bedsQueue.counts.availableBeds > 0 ? 'ok' : 'warn') : 'idle'}
          status={bedsQueue.counts ? `${bedsQueue.counts.availableBeds} beds available` : 'Bed counts unavailable'}
          meta="Admissions, transfers, discharges and bed holds"
        />
      )}
    >
      <WardBody>
        <BoundedDataNotice messages={options.notices} />
        <ReadoutStrip>
          <Readout label="Available beds" tone="ok" value={bedsQueue.counts?.availableBeds ?? '—'} sub={bedsQueue.counts ? undefined : 'Unavailable'} />
          <Readout label="Occupied beds" tone="info" value={bedsQueue.counts?.occupiedBeds ?? '—'} sub={bedsQueue.counts && totalBeds ? <Meter value={bedsQueue.counts.occupiedBeds / totalBeds} tone="info" label="Occupied share" /> : bedsQueue.counts ? undefined : 'Unavailable'} />
          <Readout label="Active admissions" tone="accent" value={admissions.totalCount ?? '—'} sub={admissions.totalCount === null ? 'Unavailable' : undefined} />
          <Readout label="Bed holds" tone="warn" value={reservations.totalCount ?? '—'} sub={reservations.totalCount === null ? 'Unavailable' : undefined} />
        </ReadoutStrip>

        <WardSection id="bed-board" title="Beds" count={bedsQueue.totalCount ?? undefined}>
          {bedsQueue.state === 'denied' && <CursorReset role="status" href={inpatientCursorHref(null, preservedForBeds)} label="First bed page">This bed cursor is stale or outside the beds accessible to this session. No bed record was loaded.</CursorReset>}
          {bedsQueue.state === 'unavailable' && <Notice tone="bad" role="alert">The bed list and counts could not be verified. No empty bed board is being inferred.</Notice>}
          {bedsQueue.state === 'stale' && <CursorReset role="status" href={inpatientCursorHref(null, preservedForBeds)} label="First bed page">The bed cursor is malformed or stale.</CursorReset>}
          {bedsQueue.state === 'inconsistent' && <CursorReset role="alert" href={inpatientCursorHref(null, preservedForBeds)} label="First bed page">Bed rows, cursor membership, and count could not be reconciled. No empty bed board is being inferred.</CursorReset>}
          {bedsQueue.state === 'empty' && bedsQueue.page?.state === 'empty' && bedsQueue.page.totalCount === 0 && bedsQueue.direction === 'first' && <EmptyBoard title="No accessible beds" />}
          {bedsQueue.state === 'ready' && bedsQueue.page?.state === 'ready' && (
            <ul className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {bedsQueue.page.beds.map((bed: Bed) => (
                <li key={bed.id} className={cn('flex min-w-0 flex-col gap-2 rounded-xl border bg-card p-3', bed.status === 'available' && 'border-emerald-500/30')}>
                  <div className="flex min-w-0 items-baseline justify-between gap-2">
                    <TitleLine tone={bedTone(bed.status)} status={statusLabel(bed.status)} className="text-sm font-semibold text-foreground">Bed {bed.bedNumber}</TitleLine>
                    <span className="shrink-0 text-xs text-muted-foreground">{statusLabel(bed.status)}</span>
                  </div>
                  <p className="truncate pl-4 text-xs text-muted-foreground">{bed.room?.ward?.name || 'Ward'} · room {bed.room?.roomNumber || '—'}</p>
                  <p className={cn('truncate pl-4 text-sm', bed.currentPatient?.displayName ? 'font-medium text-foreground' : 'text-muted-foreground')}>{bed.currentPatient?.displayName ?? 'Unoccupied'}</p>
                  {bed.status === 'cleaning' && <div className="pl-4"><BedButton id={bed.id} toStatus="available" version={bed.transitionVersion} /></div>}
                </li>
              ))}
            </ul>
          )}
          {(bedsQueue.state === 'ready' || bedsQueue.state === 'empty') && bedsQueue.page && bedsQueue.page.state !== 'inconsistent' && (
            <BedCursorPagination page={bedsQueue.page} direction={bedsQueue.direction} cursorId={bedsQueue.cursorId} preservedCursors={preservedForBeds} />
          )}
        </WardSection>

        <WardSection id="active-admissions" title="Active admissions" count={admissions.totalCount ?? undefined}>
          <div className="space-y-3">
            {admissions.state === 'denied' && <CursorReset role="status" href={inpatientCursorHref(null, preservedForAdmissions)} label="First admissions page">This admission cursor is stale or outside the active admissions accessible to this session. No admission record was loaded.</CursorReset>}
            {admissions.state === 'unavailable' && <Notice tone="bad" role="alert">Active admissions could not be verified. No empty queue is being inferred.</Notice>}
            {admissions.state === 'stale' && <CursorReset role="status" href={inpatientCursorHref(null, preservedForAdmissions)} label="First admissions page">The admission cursor is malformed or stale.</CursorReset>}
            {admissions.state === 'inconsistent' && <Notice tone="bad" role="alert">Admission rows, cursor membership, and count could not be reconciled. No empty queue is being inferred.</Notice>}
            {admissions.state === 'empty' && admissions.page?.state === 'empty' && admissions.page.totalCount === 0 && admissions.direction === 'first' && <EmptyBoard title="No active admissions" />}
            {admissions.state === 'empty' && admissions.page?.state === 'empty' && admissions.page.totalCount > 0 && <Notice role="status">No active admissions on this side of the cursor.</Notice>}
            {admissions.state === 'ready' && admissions.page?.state === 'ready' && (
              <Board>
                {admissions.page.admissions.map((admission: Admission) => (
                  <BoardRow
                    key={admission.id}
                    tone={toneForStatus(admission.status)}
                    status={statusLabel(admission.status)}
                    title={<>{admission.patient?.displayName ?? 'Restricted patient'}<span className="ml-2 font-normal text-muted-foreground">Bed {admission.bed?.bedNumber ?? '—'}</span></>}
                    meta={<>
                      <Code>{admission.admissionNumber}</Code>
                      <span>{admission.facility?.name || 'Facility'}</span>
                      {admission.room?.roomNumber && <span>Room {admission.room.roomNumber}</span>}
                      {admission.admittedAt && <span>Admitted {formatFacilityDateTime(admission.admittedAt, admission.facility?.timeZone)}</span>}
                    </>}
                    aside={<StatusTag status={admission.status} />}
                  >
                    <div className="flex min-w-0 flex-col gap-2">
                      <AdmissionTransferForm id={admission.id} version={admission.transitionVersion} facilityId={admission.facility?.id || ''} />
                      <AdmissionDischargeForm id={admission.id} version={admission.transitionVersion} />
                    </div>
                  </BoardRow>
                ))}
              </Board>
            )}
            {(admissions.state === 'ready' || admissions.state === 'empty') && admissions.page && admissions.page.state !== 'inconsistent' && (
              <AdmissionCursorPagination page={admissions.page} direction={admissions.direction} cursorId={admissions.cursorId} preservedCursors={preservedForAdmissions} />
            )}
          </div>
        </WardSection>

        <WardSection id="bed-holds" title="Bed holds" count={reservations.totalCount ?? undefined}>
          <div className="space-y-3">
            {reservations.state === 'denied' && <CursorReset role="status" href={inpatientCursorHref(null, preservedForReservations)} label="First reservations page">This reservation cursor is stale or outside active reservations accessible to this session. No reservation record was loaded.</CursorReset>}
            {reservations.state === 'unavailable' && <Notice tone="bad" role="alert">Active reservations could not be verified. No empty queue is being inferred.</Notice>}
            {reservations.state === 'stale' && <CursorReset role="status" href={inpatientCursorHref(null, preservedForReservations)} label="First reservations page">The reservation cursor is malformed or stale.</CursorReset>}
            {reservations.state === 'inconsistent' && <CursorReset role="alert" href={inpatientCursorHref(null, preservedForReservations)} label="First reservations page">Reservation rows, cursor membership, and count could not be reconciled. No empty queue is being inferred.</CursorReset>}
            {reservations.state === 'empty' && reservations.page?.state === 'empty' && reservations.page.totalCount === 0 && reservations.direction === 'first' && <EmptyBoard title="No active bed holds" />}
            {reservations.state === 'ready' && reservations.page?.state === 'ready' && (
              <Board>
                {reservations.page.reservations.map((reservation: Reservation) => (
                  <BoardRow
                    key={reservation.id}
                    tone="warn"
                    status="Active hold"
                    title={<>{reservation.patient?.displayName ?? 'Restricted patient'}<span className="ml-2 font-normal text-muted-foreground">Bed {reservation.bed?.bedNumber || '—'}</span></>}
                    meta={<>
                      <Code>{reservation.reservationNumber}</Code>
                      <span>{reservation.facility?.name || 'Facility'}</span>
                      <span>Expires {formatFacilityDateTime(reservation.expiresAt, reservation.facility?.timeZone)}</span>
                    </>}
                    aside={<StatusTag status="Active hold" tone="warn" />}
                  >
                    <BedReservationReleaseForm id={reservation.id} version={reservation.transitionVersion} />
                  </BoardRow>
                ))}
              </Board>
            )}
            {(reservations.state === 'ready' || reservations.state === 'empty') && reservations.page && reservations.page.state !== 'inconsistent' && (
              <BedReservationCursorPagination page={reservations.page} direction={reservations.direction} cursorId={reservations.cursorId} preservedCursors={preservedForReservations} />
            )}
          </div>
        </WardSection>

        <WardSection id="admit-and-hold" title="Admit or hold a bed">
          <div className="grid min-w-0 gap-4 xl:grid-cols-2">
            <AdmissionCreateForm options={options} />
            <BedReservationCreateForm options={options} />
          </div>
        </WardSection>
      </WardBody>
    </PageContainer>
  )
}

function bedTone(status: string): WardTone {
  if (status === 'available') return 'ok'
  if (status === 'occupied') return 'info'
  if (status === 'cleaning' || status === 'reserved') return 'warn'
  if (status === 'out_of_service' || status === 'maintenance') return 'bad'
  return toneForStatus(status)
}

function CursorReset({ role, href, label, children }: { role: 'alert' | 'status'; href: string; label: string; children: React.ReactNode }) {
  return (
    <Notice tone={role === 'alert' ? 'bad' : 'warn'} role={role}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span>{children}</span>
        <Track><Pill asChild size="sm"><Link href={href}>{label}</Link></Pill></Track>
      </div>
    </Notice>
  )
}
