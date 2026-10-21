'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'

export type IntakeQueueItem = {
  id: string
  title: string
  status: string
  transitionVersion: number
  templateKey?: string | null
  responses?: any
  submittedAt?: string | null
  reviewedAt?: string | null
  reviewNotes?: string | null
  patient?: {
    id: string
    displayName?: string | null
    email?: string | null
    phone?: string | null
    preferredContactMethod?: string | null
    insuranceSummary?: any
  } | null
  appointment?: {
    id: string
    appointmentNumber?: string | null
    status?: string | null
    startsAt?: string | null
    reasonForVisit?: string | null
    facility?: { id: string; name?: string | null; timeZone?: string | null } | null
    provider?: { id: string; displayName?: string | null; specialty?: string | null } | null
    appointmentType?: { id: string; name?: string | null } | null
  } | null
  reviewedBy?: { id: string; name?: string | null; email?: string | null } | null
}

const INTAKE_SELECTION = `
  id
  title
  status
  transitionVersion
  templateKey
  responses
  submittedAt
  reviewedAt
  reviewNotes
  patient { id displayName email phone preferredContactMethod insuranceSummary }
  appointment {
    id
    appointmentNumber
    status
    startsAt
    reasonForVisit
    facility { id name timeZone }
    provider { id displayName specialty }
    appointmentType { id name }
  }
  reviewedBy { id name email }
`

function buildWhere(status?: string | null, view?: string | null, search?: string | null) {
  const where: Record<string, unknown> = {}

  if (view === 'needs_review') {
    where.status = { in: ['submitted', 'needs_review'] }
  } else if (view === 'not_ready') {
    where.status = { in: ['not_sent', 'sent', 'in_progress'] }
  }

  if (status && status !== 'all') {
    where.status = { equals: status }
  }

  const boundedSearch = search?.trim().slice(0, 80)
  if (boundedSearch) {
    where.OR = [
      { title: { contains: boundedSearch, mode: 'insensitive' } },
      { patient: { OR: [
        { firstName: { contains: boundedSearch, mode: 'insensitive' } },
        { lastName: { contains: boundedSearch, mode: 'insensitive' } },
      ] } },
      { appointment: { appointmentNumber: { contains: boundedSearch, mode: 'insensitive' } } },
      { appointment: { facility: { name: { contains: boundedSearch, mode: 'insensitive' } } } },
    ]
  }

  return where
}

export async function getIntakeQueue(status?: string | null, view?: string | null, search?: string | null, sort = 'updated_desc', cursor?: string) {
  const where = buildWhere(status, view, search)
  if (cursor) {
    if (cursor.length > 200 || !/^[A-Za-z0-9_-]+$/.test(cursor)) return { success: false as const, error: 'Intake cursor is invalid; return to the first page.' }
    const anchor = await keystoneClient<{ intakeForms: Array<{ id: string }> }>(`query IntakeQueueAnchor($where:IntakeFormWhereInput!){intakeForms(where:$where,take:1){id}}`, { where: { AND: [where, { id: { equals: cursor } }] } })
    if (!anchor.success || anchor.data.intakeForms.length !== 1) return { success: false as const, error: 'The page anchor is no longer accessible in this intake queue. Return to the first page.' }
  }
  const query = `
    query IntakeQueue($where: IntakeFormWhereInput, $take: Int!, $skip: Int!, $orderBy: [IntakeFormOrderByInput!]!, $cursor: IntakeFormWhereUniqueInput) {
      intakeForms(where: $where, take: $take, skip: $skip, cursor: $cursor, orderBy: $orderBy) {
        ${INTAKE_SELECTION}
      }
      intakeFormsCount(where: $where)
    }
  `

  const response = await keystoneClient<{ intakeForms: IntakeQueueItem[]; intakeFormsCount: number }>(query, {
    where,
    take: 76,
    skip: cursor ? 1 : 0,
    cursor: cursor ? { id: cursor } : null,
    orderBy: [{ updatedAt: sort === 'updated_asc' ? 'asc' : 'desc' }, { id: sort === 'updated_asc' ? 'asc' : 'desc' }],
  })

  if (!response.success) return response
  const items = response.data.intakeForms.slice(0, 75)
  const more = response.data.intakeForms.length > 75
  const count = response.data.intakeFormsCount
  return { success: true as const, data: { items, count, truncated: more, nextCursor: more ? items.at(-1)!.id : null, notice: more ? 'More matching intake records are available on the next page.' : null } }
}

export async function getIntakeStatusCounts() {
  const query = `
    query IntakeStatusCounts {
      all: intakeFormsCount
      not_sent: intakeFormsCount(where: { status: { equals: "not_sent" } })
      sent: intakeFormsCount(where: { status: { equals: "sent" } })
      in_progress: intakeFormsCount(where: { status: { equals: "in_progress" } })
      submitted: intakeFormsCount(where: { status: { equals: "submitted" } })
      needs_review: intakeFormsCount(where: { status: { equals: "needs_review" } })
      reviewed: intakeFormsCount(where: { status: { equals: "reviewed" } })
    }
  `

  const response = await keystoneClient<Record<string, number>>(query)
  if (!response.success) return response
  return { success: true as const, data: response.data }
}

export async function updateIntakeStatus(id: string, status: string, expectedVersion: number, reviewNotes?: string, operationKey?: string) {
  const mutation = `
    mutation TransitionIntakeReview($operationKey: String!, $intakeFormId: ID!, $toStatus: String!, $expectedVersion: Int!, $reviewNotes: String) {
      transitionIntakeReview(operationKey: $operationKey, intakeFormId: $intakeFormId, toStatus: $toStatus, expectedVersion: $expectedVersion, reviewNotes: $reviewNotes) {
        id
        fromStatus
        status
        transitionVersion
        reviewedAt
        reviewedById
        replayed
      }
    }
  `

  const response = await keystoneClient<{ transitionIntakeReview: IntakeQueueItem }>(mutation, {
    operationKey: operationKey || `hospital-ui-${randomUUID()}`,
    intakeFormId: id,
    toStatus: status,
    expectedVersion,
    reviewNotes,
  })
  revalidatePath('/dashboard/platform/intake')
  return response
}

export async function markIntakeNeedsReview(id: string, expectedVersion: number, operationKey: string) {
  return updateIntakeStatus(id, 'needs_review', expectedVersion, undefined, operationKey)
}

export async function markIntakeReviewed(id: string, expectedVersion: number, reviewNotes: string, operationKey: string) {
  return updateIntakeStatus(id, 'reviewed', expectedVersion, reviewNotes, operationKey)
}

export async function reopenIntake(id: string, expectedVersion: number, operationKey: string) {
  return updateIntakeStatus(id, 'needs_review', expectedVersion, undefined, operationKey)
}
