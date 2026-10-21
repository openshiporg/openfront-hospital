import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
  return (
    <PageContainer
      title="Inpatient operations"
      breadcrumbs={breadcrumbs}
      header={(
        <div>
          <p className="text-sm font-medium uppercase tracking-[.2em] text-muted-foreground">Admission, movement, discharge</p>
          <h1 className="mt-2 text-3xl font-semibold">Inpatient operations</h1>
          <p className="mt-2 text-sm text-muted-foreground">Coordinate active admissions, transfers, discharge, and bed readiness from one workspace.</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border px-2.5 py-1">Active admissions: {admissions.totalCount ?? 'Unavailable'}</span>
            <span className="rounded-full border px-2.5 py-1">Available beds: {bedsQueue.counts?.availableBeds ?? 'Unavailable'}</span>
            <span className="rounded-full border px-2.5 py-1">Occupied beds: {bedsQueue.counts?.occupiedBeds ?? 'Unavailable'}</span>
            <span className="rounded-full border px-2.5 py-1">Active reservations: {reservations.totalCount ?? 'Unavailable'}</span>
          </div>
        </div>
      )}
    >
      <div className="space-y-5 px-4 pb-8 md:px-6">
        <BoundedDataNotice messages={options.notices} />
        <div className="grid gap-3 xl:grid-cols-2">
          <AdmissionCreateForm options={options} />
          <BedReservationCreateForm options={options} />
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Active admissions</CardTitle>
              <CardDescription>Oldest active admissions first, with transfer and discharge actions in context.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {admissions.state === 'denied' && <div role="status" className="space-y-2 text-sm text-muted-foreground"><p>This admission cursor is stale or outside the active admissions accessible to this session. No admission record was loaded.</p><Link href={inpatientCursorHref(null, preservedForAdmissions)} className="inline-flex rounded-md border px-3 py-1.5 text-foreground hover:bg-muted">Return to first admissions page</Link></div>}
              {admissions.state === 'unavailable' && <p role="alert" className="text-sm text-destructive">Active admissions could not be verified. No empty queue is being inferred.</p>}
              {admissions.state === 'stale' && <div role="status" className="space-y-2 text-sm text-muted-foreground"><p>The admission cursor is malformed or stale. Return to the first page to continue.</p><Link href={inpatientCursorHref(null, preservedForAdmissions)} className="inline-flex rounded-md border px-3 py-1.5 text-foreground hover:bg-muted">Return to first admissions page</Link></div>}
              {admissions.state === 'inconsistent' && <p role="alert" className="text-sm text-destructive">Admission rows, cursor membership, and count could not be reconciled. No empty queue is being inferred.</p>}
              {admissions.state === 'empty' && admissions.page?.state === 'empty' && admissions.page.totalCount === 0 && admissions.direction === 'first' && <p role="status" className="text-sm text-muted-foreground">No active admissions.</p>}
              {admissions.state === 'empty' && admissions.page?.state === 'empty' && admissions.page.totalCount > 0 && <p role="status" className="text-sm text-muted-foreground">No active admissions are available on this side of the cursor.</p>}
              {admissions.state === 'ready' && admissions.page?.state === 'ready' && admissions.page.admissions.map((admission: Admission) => (
                <div key={admission.id} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{admission.patient?.displayName ?? 'Restricted patient'}</p>
                      <p className="text-sm text-muted-foreground">
                        {admission.admissionNumber} · {admission.facility?.name || 'Facility'} · bed {admission.bed?.bedNumber ?? '—'}
                      </p>
                      {admission.admittedAt && <p className="mt-1 text-xs text-muted-foreground">Admitted {formatFacilityDateTime(admission.admittedAt, admission.facility?.timeZone)}</p>}
                    </div>
                    <Badge>{admission.status.replaceAll('_', ' ')}</Badge>
                  </div>
                  <AdmissionTransferForm id={admission.id} version={admission.transitionVersion} facilityId={admission.facility?.id || ''} />
                  <AdmissionDischargeForm id={admission.id} version={admission.transitionVersion} />
                </div>
              ))}
              {(admissions.state === 'ready' || admissions.state === 'empty') && admissions.page && admissions.page.state !== 'inconsistent' && (
                <AdmissionCursorPagination page={admissions.page} direction={admissions.direction} cursorId={admissions.cursorId} preservedCursors={preservedForAdmissions} />
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Bed board</CardTitle>
              <CardDescription>Current readiness and occupancy by ward and room; 25 beds visible per cursor page.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {bedsQueue.state === 'denied' && <div role="status" className="sm:col-span-2 space-y-2 text-sm text-muted-foreground"><p>This bed cursor is stale or outside the beds accessible to this session. No bed record was loaded.</p><Link href={inpatientCursorHref(null, preservedForBeds)} className="inline-flex rounded-md border px-3 py-1.5 text-foreground hover:bg-muted">Return to first bed page</Link></div>}
              {bedsQueue.state === 'unavailable' && <p role="alert" className="sm:col-span-2 text-sm text-destructive">The bed list and counts could not be verified. No empty bed board is being inferred.</p>}
              {bedsQueue.state === 'stale' && <div role="status" className="sm:col-span-2 space-y-2 text-sm text-muted-foreground"><p>The bed cursor is malformed or stale. Return to the first page to continue.</p><Link href={inpatientCursorHref(null, preservedForBeds)} className="inline-flex rounded-md border px-3 py-1.5 text-foreground hover:bg-muted">Return to first bed page</Link></div>}
              {bedsQueue.state === 'inconsistent' && <div role="alert" className="sm:col-span-2 space-y-2 text-sm text-destructive"><p>Bed rows, cursor membership, and count could not be reconciled. No empty bed board is being inferred.</p><Link href={inpatientCursorHref(null, preservedForBeds)} className="inline-flex rounded-md border px-3 py-1.5 text-foreground hover:bg-muted">Return to first bed page</Link></div>}
              {bedsQueue.state === 'empty' && bedsQueue.page?.state === 'empty' && bedsQueue.page.totalCount === 0 && bedsQueue.direction === 'first' && <p role="status" className="sm:col-span-2 text-sm text-muted-foreground">No accessible beds.</p>}
              {bedsQueue.state === 'ready' && bedsQueue.page?.state === 'ready' && bedsQueue.page.beds.map((bed: Bed) => (
                <div key={bed.id} className="rounded-lg border p-3">
                  <div className="flex justify-between gap-2">
                    <div>
                      <p className="font-medium">Bed {bed.bedNumber}</p>
                      <p className="text-sm text-muted-foreground">{bed.room?.ward?.name || 'Ward'} · room {bed.room?.roomNumber || '—'}</p>
                    </div>
                    <Badge variant="secondary">{bed.status.replaceAll('_', ' ')}</Badge>
                  </div>
                  <p className="mt-2 text-sm">{bed.currentPatient?.displayName ?? 'Unoccupied'}</p>
                  {bed.status === 'cleaning' && <div className="mt-2"><BedButton id={bed.id} toStatus="available" version={bed.transitionVersion} /></div>}
                </div>
              ))}
              {(bedsQueue.state === 'ready' || bedsQueue.state === 'empty') && bedsQueue.page && bedsQueue.page.state !== 'inconsistent' && (
                <BedCursorPagination page={bedsQueue.page} direction={bedsQueue.direction} cursorId={bedsQueue.cursorId} preservedCursors={preservedForBeds} className="sm:col-span-2" />
              )}
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Active bed reservations</CardTitle>
            <CardDescription>Temporary holds ordered by expiry, 25 visible per cursor page. A reservation does not admit a patient.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 xl:grid-cols-2">
            {reservations.state === 'denied' && <div role="status" className="xl:col-span-2 space-y-2 text-sm text-muted-foreground"><p>This reservation cursor is stale or outside active reservations accessible to this session. No reservation record was loaded.</p><Link href={inpatientCursorHref(null, preservedForReservations)} className="inline-flex rounded-md border px-3 py-1.5 text-foreground hover:bg-muted">Return to first reservations page</Link></div>}
            {reservations.state === 'unavailable' && <p role="alert" className="xl:col-span-2 text-sm text-destructive">Active reservations could not be verified. No empty queue is being inferred.</p>}
            {reservations.state === 'stale' && <div role="status" className="xl:col-span-2 space-y-2 text-sm text-muted-foreground"><p>The reservation cursor is malformed or stale. Return to the first page to continue.</p><Link href={inpatientCursorHref(null, preservedForReservations)} className="inline-flex rounded-md border px-3 py-1.5 text-foreground hover:bg-muted">Return to first reservations page</Link></div>}
            {reservations.state === 'inconsistent' && <div role="alert" className="xl:col-span-2 space-y-2 text-sm text-destructive"><p>Reservation rows, cursor membership, and count could not be reconciled. No empty queue is being inferred.</p><Link href={inpatientCursorHref(null, preservedForReservations)} className="inline-flex rounded-md border px-3 py-1.5 text-foreground hover:bg-muted">Return to first reservations page</Link></div>}
            {reservations.state === 'empty' && reservations.page?.state === 'empty' && reservations.page.totalCount === 0 && reservations.direction === 'first' && <p role="status" className="xl:col-span-2 text-sm text-muted-foreground">No active bed reservations.</p>}
            {reservations.state === 'ready' && reservations.page?.state === 'ready' && reservations.page.reservations.map((reservation: Reservation) => (
              <div key={reservation.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{reservation.patient?.displayName ?? 'Restricted patient'} · bed {reservation.bed?.bedNumber || '—'}</p>
                    <p className="text-sm text-muted-foreground">{reservation.reservationNumber} · {reservation.facility?.name || 'Facility'} · expires {formatFacilityDateTime(reservation.expiresAt, reservation.facility?.timeZone)}</p>
                  </div>
                  <Badge variant="secondary">active hold</Badge>
                </div>
                <BedReservationReleaseForm id={reservation.id} version={reservation.transitionVersion} />
              </div>
            ))}
            {(reservations.state === 'ready' || reservations.state === 'empty') && reservations.page && reservations.page.state !== 'inconsistent' && (
              <BedReservationCursorPagination page={reservations.page} direction={reservations.direction} cursorId={reservations.cursorId} preservedCursors={preservedForReservations} className="xl:col-span-2" />
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  )
}
