import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import { WorkspaceLoadError } from '@/features/platform/components/WorkspaceLoadError'
import { ClaimButton, ClaimCreateForm } from '../components/WorkflowControls'
import { ClaimsCursorPagination } from '../components/ClaimsCursorPagination'
import { getClaimsWorkspaceOptions } from '../lib/getOperationsWorkspaceOptions'
import {
  claimsCursorHref,
  claimsCursorMembershipWhere,
  claimsCursorOrderBy,
  claimsQueueWhere,
  parseClaimsCounts,
  parseClaimsCursor,
  shapeClaimsCursorPage,
  validateClaimsCursorMembership,
  type ClaimsCursorPage,
  type ClaimsQueueRow,
} from '../lib/claimsCursor'

type ClaimAuthority = {
  canAccessAllClinicalData?: boolean | null
  canManageBilling?: boolean | null
}

type ClaimsProjection = {
  insuranceClaims: unknown
  insuranceClaimsCount: unknown
  submittedCount: unknown
}

type ClaimsCursorMembershipProjection = {
  cursorClaims: unknown
  cursorClaimsCount: unknown
  insuranceClaimsCount: unknown
  submittedCount: unknown
}

function nextStatus(status: string) {
  return ({
    draft: 'prepared',
    prepared: 'submitted',
    external_rejected: 'corrected',
    denied: 'corrected',
    corrected: 'prepared',
  } as Record<string, string>)[status]
}

const authorityQuery = `query ClaimsAuthority { authenticatedItem { ... on User { role { canAccessAllClinicalData canManageBilling } } } }`

const claimsCountsQuery = `
  query ClaimsOperationsCounts($where: InsuranceClaimWhereInput!) {
    insuranceClaimsCount(where: $where)
    submittedCount: insuranceClaimsCount(where: { status: { equals: "submitted" } })
  }
`

const claimsFirstPageQuery = `
  query ClaimsOperationsFirstPage($where: InsuranceClaimWhereInput!) {
    insuranceClaims(where: $where, orderBy: [{ createdAt: asc }, { id: asc }], take: 26) {
      id claimNumber status transitionVersion
      patient { displayName }
      facility { name }
    }
    insuranceClaimsCount(where: $where)
    submittedCount: insuranceClaimsCount(where: { status: { equals: "submitted" } })
  }
`

const claimsCursorMembershipQuery = `
  query ClaimsCursorMembership($where: InsuranceClaimWhereInput!, $cursorWhere: InsuranceClaimWhereInput!) {
    cursorClaims: insuranceClaims(where: $cursorWhere, orderBy: [{ id: asc }], take: 2) { id }
    cursorClaimsCount: insuranceClaimsCount(where: $cursorWhere)
    insuranceClaimsCount(where: $where)
    submittedCount: insuranceClaimsCount(where: { status: { equals: "submitted" } })
  }
`

const claimsCursorPageQuery = `
  query ClaimsOperationsCursorPage($where: InsuranceClaimWhereInput!, $cursor: InsuranceClaimWhereUniqueInput!, $orderBy: [InsuranceClaimOrderByInput!]!) {
    insuranceClaims(where: $where, orderBy: $orderBy, take: 26, cursor: $cursor, skip: 1) {
      id claimNumber status transitionVersion
      patient { displayName }
      facility { name }
    }
    insuranceClaimsCount(where: $where)
    submittedCount: insuranceClaimsCount(where: { status: { equals: "submitted" } })
  }
`

export default async function ClaimsOperationsPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = searchParams ? await searchParams : {}
  const cursorRequest = parseClaimsCursor(params.claimsAfter, params.claimsBefore)
  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: '/dashboard' },
    { type: 'page' as const, label: 'Claims' },
  ]
  const authorityResponse = await keystoneClient<{ authenticatedItem?: { role?: ClaimAuthority | null } | null }>(authorityQuery).catch(() => null)
  if (!authorityResponse?.success) {
    return <WorkspaceLoadError title="Claims operations" description="The current claims authority could not be verified." breadcrumbs={breadcrumbs} />
  }
  const authority = authorityResponse.data.authenticatedItem?.role
  const mayOperateClaims = authority?.canAccessAllClinicalData === true || authority?.canManageBilling === true
  if (!mayOperateClaims) {
    return <PageContainer title="Claims operations" breadcrumbs={breadcrumbs} header={<div><p className="text-sm font-medium uppercase tracking-[.2em] text-muted-foreground">Permission required</p><h1 className="mt-2 text-3xl font-semibold">Claims operations</h1></div>}><div className="px-4 pb-8 md:px-6"><div role="alert" className="rounded-lg border border-amber-300/60 bg-amber-50 p-4 text-sm text-amber-950"><p className="font-medium">Claims workspace is unavailable for this role.</p><p className="mt-1">Billing workflow authority and facility-scoped record access are required. No empty claim queue is being inferred.</p></div></div></PageContainer>
  }

  const where = claimsQueueWhere()
  const optionsPromise = getClaimsWorkspaceOptions().catch(() => null)
  let options: Awaited<ReturnType<typeof getClaimsWorkspaceOptions>> | null = null
  let page: ClaimsCursorPage | null = null
  let queueState: 'ready' | 'empty' | 'unavailable' | 'stale' | 'inconsistent' = 'unavailable'
  let totalCount: number | null = null
  let submittedCount: number | null = null

  if (cursorRequest.state !== 'ready') {
    const [countsResponse, loadedOptions] = await Promise.all([
      keystoneClient<{ insuranceClaimsCount: unknown; submittedCount: unknown }>(claimsCountsQuery, { where }).catch(() => null),
      optionsPromise,
    ])
    options = loadedOptions
    queueState = cursorRequest.state
    if (!countsResponse?.success) queueState = 'unavailable'
    else {
      const counts = parseClaimsCounts(countsResponse.data.insuranceClaimsCount, countsResponse.data.submittedCount)
      if (!counts) queueState = 'inconsistent'
      else {
        totalCount = counts.totalCount
        submittedCount = counts.submittedCount
      }
    }
  } else if (cursorRequest.direction === 'first') {
    const [response, loadedOptions] = await Promise.all([
      keystoneClient<ClaimsProjection>(claimsFirstPageQuery, { where }).catch(() => null),
      optionsPromise,
    ])
    options = loadedOptions
    if (!response?.success) queueState = 'unavailable'
    else {
      page = shapeClaimsCursorPage(response.data.insuranceClaims, response.data.insuranceClaimsCount, response.data.submittedCount, 'first', false)
      queueState = page.state
      if (page.state !== 'inconsistent') {
        totalCount = page.totalCount
        submittedCount = page.submittedCount
      }
    }
  } else {
    const cursorWhere = claimsCursorMembershipWhere(cursorRequest.cursorId as string)
    const [membershipResponse, loadedOptions] = await Promise.all([
      keystoneClient<ClaimsCursorMembershipProjection>(claimsCursorMembershipQuery, { where, cursorWhere }).catch(() => null),
      optionsPromise,
    ])
    options = loadedOptions
    if (!membershipResponse?.success) queueState = 'unavailable'
    else {
      const counts = parseClaimsCounts(membershipResponse.data.insuranceClaimsCount, membershipResponse.data.submittedCount)
      const membership = validateClaimsCursorMembership(cursorRequest.cursorId as string, membershipResponse.data.cursorClaims, membershipResponse.data.cursorClaimsCount)
      if (!counts || membership === 'inconsistent') queueState = 'inconsistent'
      else {
        totalCount = counts.totalCount
        submittedCount = counts.submittedCount
        if (membership === 'stale') queueState = 'stale'
        else {
          const response = await keystoneClient<ClaimsProjection>(claimsCursorPageQuery, {
            where,
            cursor: { id: cursorRequest.cursorId },
            orderBy: claimsCursorOrderBy(cursorRequest.direction),
          }).catch(() => null)
          if (!response?.success) queueState = 'unavailable'
          else {
            page = shapeClaimsCursorPage(response.data.insuranceClaims, response.data.insuranceClaimsCount, response.data.submittedCount, cursorRequest.direction, true)
            queueState = page.state
            if (page.state !== 'inconsistent') {
              totalCount = page.totalCount
              submittedCount = page.submittedCount
            }
          }
        }
      }
    }
  }

  if (!options) {
    return <WorkspaceLoadError title="Claims operations" description="Billing workspace options are unavailable." breadcrumbs={breadcrumbs} />
  }
  const paginationDirection = cursorRequest.state === 'ready' ? cursorRequest.direction : 'first'
  const paginationCursorId = cursorRequest.state === 'ready' ? cursorRequest.cursorId : null

  return (
    <PageContainer
      title="Claims operations"
      breadcrumbs={breadcrumbs}
      header={(
        <div>
          <p className="text-sm font-medium uppercase tracking-[.2em] text-muted-foreground">Claim preparation and follow-up</p>
          <h1 className="mt-2 text-3xl font-semibold">Claims operations</h1>
          <p className="mt-2 text-sm text-muted-foreground">Track internal preparation, manual submission evidence, signed external acknowledgements, and corrections. This workspace does not adjudicate claims or confirm insurance acceptance.</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border px-2.5 py-1">Open claims: {totalCount ?? 'Unavailable'}</span>
            <span className="rounded-full border px-2.5 py-1">Awaiting response: {submittedCount ?? 'Unavailable'}</span>
          </div>
        </div>
      )}
    >
      <div className="space-y-5 px-4 pb-8 md:px-6">
        <ClaimCreateForm options={options} />
        <Card>
          <CardHeader>
            <CardTitle>Claim work queue</CardTitle>
            <CardDescription>Ordered by creation time with the next available action in context.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {queueState === 'unavailable' && <p role="alert" className="text-sm text-destructive">Claim work items or billing scope could not be verified. No empty queue is being inferred.</p>}
            {queueState === 'stale' && <div role="status" className="space-y-2 text-sm text-muted-foreground"><p>This claims cursor is stale or outside the claims accessible to this session. No claim page was loaded.</p><Link href={claimsCursorHref(null, null, params.status)} className="inline-flex rounded-md border px-3 py-1.5 text-foreground hover:bg-muted">Return to first page</Link></div>}
            {queueState === 'inconsistent' && <p role="alert" className="text-sm text-destructive">Claim worklist cursor, count, or row data could not be reconciled. No empty queue is being inferred.</p>}
            {queueState === 'empty' && page?.state === 'empty' && page.totalCount === 0 && paginationDirection === 'first' && <p className="text-sm text-muted-foreground">No active claim tasks.</p>}
            {queueState === 'empty' && page?.state === 'empty' && page.totalCount > 0 && <p className="text-sm text-muted-foreground">No additional claims are available on this side of the cursor.</p>}
            {queueState === 'ready' && page?.state === 'ready' && page.claims.map((claim: ClaimsQueueRow) => {
              const toStatus = nextStatus(claim.status)
              return (
                <div key={claim.id} className="rounded-lg border p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium">{claim.claimNumber}</p>
                      <p className="text-sm text-muted-foreground">{claim.patient?.displayName ?? 'Restricted patient'} · {claim.facility?.name || 'Facility'}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>{claim.status.replaceAll('_', ' ')}</Badge>
                      {toStatus && <ClaimButton id={claim.id} toStatus={toStatus} version={claim.transitionVersion} />}
                      {claim.status === 'submitted' && <span className="text-xs text-muted-foreground">Awaiting a signed external acknowledgement</span>}
                    </div>
                  </div>
                </div>
              )
            })}
            {(queueState === 'ready' || queueState === 'empty') && page && page.state !== 'inconsistent' && (
              <ClaimsCursorPagination page={page} direction={paginationDirection} cursorId={paginationCursorId} status={params.status} />
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  )
}
