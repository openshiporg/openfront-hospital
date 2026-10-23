import Link from 'next/link'

import {
  Board,
  BoardRow,
  Code,
  EmptyBoard,
  Notice,
  Pill,
  Readout,
  ReadoutStrip,
  StatusTag,
  Track,
  WardBody,
  WardHeader,
  WardSection,
  statusLabel,
  toneForStatus,
} from '@/features/platform/components/ward'
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
    return (
      <PageContainer title="Claims operations" breadcrumbs={breadcrumbs} header={<WardHeader eyebrow="Permission required" title="Claims" tone="warn" status="Unavailable" />}>
        <WardBody>
          <Notice tone="warn" role="alert">
            <p className="font-medium">Claims workspace is unavailable for this role.</p>
            <p className="mt-1">Billing workflow authority and facility-scoped record access are required. No empty claim queue is being inferred.</p>
          </Notice>
        </WardBody>
      </PageContainer>
    )
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
        <WardHeader
          eyebrow="Billing"
          title="Claims"
          tone={queueState === 'unavailable' || queueState === 'inconsistent' ? 'bad' : totalCount ? 'warn' : 'ok'}
          status={totalCount === null ? 'Claim counts unavailable' : `${totalCount} open claims`}
          meta="Preparation, submission evidence, acknowledgements and corrections"
        />
      )}
    >
      <WardBody>
        <ReadoutStrip>
          <Readout label="Open claims" tone="warn" value={totalCount ?? '—'} sub={totalCount === null ? 'Unavailable' : undefined} />
          <Readout label="Awaiting response" tone="info" value={submittedCount ?? '—'} sub={submittedCount === null ? 'Unavailable' : undefined} />
          <Readout label="To prepare or correct" tone="accent" value={totalCount !== null && submittedCount !== null ? Math.max(0, totalCount - submittedCount) : '—'} />
        </ReadoutStrip>

        <WardSection id="claim-queue" title="Claim work queue" count={totalCount ?? undefined}>
          <div className="space-y-3">
            {queueState === 'unavailable' && <Notice tone="bad" role="alert">Claim work items or billing scope could not be verified. No empty queue is being inferred.</Notice>}
            {queueState === 'stale' && (
              <Notice tone="warn" role="status">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span>This claims cursor is stale or outside the claims accessible to this session. No claim page was loaded.</span>
                  <Track><Pill asChild size="sm"><Link href={claimsCursorHref(null, null, params.status)}>First page</Link></Pill></Track>
                </div>
              </Notice>
            )}
            {queueState === 'inconsistent' && <Notice tone="bad" role="alert">Claim worklist cursor, count, or row data could not be reconciled. No empty queue is being inferred.</Notice>}
            {queueState === 'empty' && page?.state === 'empty' && page.totalCount === 0 && paginationDirection === 'first' && <EmptyBoard title="No active claim tasks" />}
            {queueState === 'empty' && page?.state === 'empty' && page.totalCount > 0 && <Notice>No additional claims on this side of the cursor.</Notice>}
            {queueState === 'ready' && page?.state === 'ready' && (
              <Board>
                {page.claims.map((claim: ClaimsQueueRow) => {
                  const toStatus = nextStatus(claim.status)
                  return (
                    <BoardRow
                      key={claim.id}
                      tone={toneForStatus(claim.status)}
                      status={statusLabel(claim.status)}
                      title={<Code className="text-sm font-semibold text-foreground">{claim.claimNumber}</Code>}
                      meta={<>
                        <span>{claim.patient?.displayName ?? 'Restricted patient'}</span>
                        <span>{claim.facility?.name || 'Facility'}</span>
                        {claim.status === 'submitted' && <span>Awaiting signed external acknowledgement</span>}
                      </>}
                      aside={<>
                        <StatusTag status={claim.status} />
                        {toStatus && <ClaimButton id={claim.id} toStatus={toStatus} version={claim.transitionVersion} />}
                      </>}
                    />
                  )
                })}
              </Board>
            )}
            {(queueState === 'ready' || queueState === 'empty') && page && page.state !== 'inconsistent' && (
              <ClaimsCursorPagination page={page} direction={paginationDirection} cursorId={paginationCursorId} status={params.status} />
            )}
          </div>
        </WardSection>

        <ClaimCreateForm options={options} />
      </WardBody>
    </PageContainer>
  )
}
