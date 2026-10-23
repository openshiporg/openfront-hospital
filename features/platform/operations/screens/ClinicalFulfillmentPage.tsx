import Link from 'next/link'

import type * as React from 'react'

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
import { BoundedDataNotice } from '@/features/platform/components/BoundedDataNotice'
import { WorkspaceLoadError } from '@/features/platform/components/WorkspaceLoadError'
import { ClinicalCreateForms, TransitionButton } from '../components/WorkflowControls'
import { MedicalOrderCursorPagination } from '../components/MedicalOrderCursorPagination'
import { LabResultCursorPagination } from '../components/LabResultCursorPagination'
import { LabResultReadbackPanel } from '../components/LabResultReadbackPanel'
import { PrescriptionCursorPagination } from '../components/PrescriptionCursorPagination'
import { ProcedureCursorPagination } from '../components/ProcedureCursorPagination'
import { CarePlanCursorPagination } from '../components/CarePlanCursorPagination'
import { getOperationsWorkspaceOptions } from '../lib/getOperationsWorkspaceOptions'
import {
  medicalOrderCursorHref,
  medicalOrderCursorMembershipWhere,
  medicalOrderCursorOrderBy,
  medicalOrderQueueWhere,
  parseMedicalOrderCursor,
  parseMedicalOrdersCount,
  shapeMedicalOrderCursorPage,
  validateMedicalOrderCursorMembership,
  type MedicalOrderCursorDirection,
  type MedicalOrderCursorPage,
  type MedicalOrderCursorRequest,
} from '../lib/medicalOrderCursor'
import {
  labResultCursorMembershipWhere,
  labResultCursorOrderBy,
  labResultQueueWhere,
  labResultCursorHref,
  parseLabResultCursor,
  parseLabResultsCount,
  shapeLabResultCursorPage,
  validateLabResultCursorMembership,
  type LabResultCursorDirection,
  type LabResultCursorPage,
  type LabResultCursorRequest,
} from '../lib/labResultCursor'
import {
  prescriptionCursorHref,
  prescriptionCursorMembershipWhere,
  prescriptionCursorOrderBy,
  prescriptionQueueWhere,
  parsePrescriptionCursor,
  parsePrescriptionsCount,
  shapePrescriptionCursorPage,
  validatePrescriptionCursorMembership,
  type PrescriptionCursorDirection,
  type PrescriptionCursorPage,
  type PrescriptionCursorRequest,
} from '../lib/prescriptionCursor'
import {
  procedureCursorHref,
  procedureCursorMembershipWhere,
  procedureCursorOrderBy,
  procedureQueueWhere,
  parseProcedureCursor,
  parseProceduresCount,
  shapeProcedureCursorPage,
  validateProcedureCursorMembership,
  type ProcedureCursorDirection,
  type ProcedureCursorPage,
  type ProcedureCursorRequest,
} from '../lib/procedureCursor'
import {
  carePlanCursorHref,
  carePlanCursorMembershipWhere,
  carePlanCursorOrderBy,
  carePlanQueueWhere,
  parseCarePlanCursor,
  parseCarePlansCount,
  shapeCarePlanCursorPage,
  validateCarePlanCursorMembership,
  type CarePlanCursorDirection,
  type CarePlanCursorPage,
  type CarePlanCursorRequest,
} from '../lib/carePlanCursor'

type Row = {
  id: string
  status: string
  transitionVersion: number
  patient?: { displayName?: string | null } | null
}

type Data = {
  medicalOrders?: unknown
  medicalOrdersCount: unknown
  labResults?: unknown
  labResultsCount: unknown
  prescriptions?: unknown
  prescriptionsCount: unknown
  procedures?: unknown
  proceduresCount: unknown
  carePlans?: unknown
  carePlansCount: unknown
}

type MedicalOrderProjection = { medicalOrders: unknown; medicalOrdersCount: unknown }
type LabResultProjection = { labResults: unknown; labResultsCount: unknown }
type PrescriptionProjection = { prescriptions: unknown; prescriptionsCount: unknown }
type ProcedureProjection = { procedures: unknown; proceduresCount: unknown }
type CarePlanProjection = { carePlans: unknown; carePlansCount: unknown }
type MedicalOrderQueueResult = {
  state: 'ready' | 'empty' | 'denied' | 'unavailable' | 'stale' | 'inconsistent'
  page: MedicalOrderCursorPage | null
  totalCount: number | null
  direction: MedicalOrderCursorDirection
  cursorId: string | null
}
type LabResultQueueResult = {
  state: 'ready' | 'empty' | 'denied' | 'unavailable' | 'stale' | 'inconsistent'
  page: LabResultCursorPage | null
  totalCount: number | null
  direction: LabResultCursorDirection
  cursorId: string | null
}
type PrescriptionQueueResult = {
  state: 'ready' | 'empty' | 'denied' | 'unavailable' | 'stale' | 'inconsistent'
  page: PrescriptionCursorPage | null
  totalCount: number | null
  direction: PrescriptionCursorDirection
  cursorId: string | null
}
type ProcedureQueueResult = {
  state: 'ready' | 'empty' | 'denied' | 'unavailable' | 'stale' | 'inconsistent'
  page: ProcedureCursorPage | null
  totalCount: number | null
  direction: ProcedureCursorDirection
  cursorId: string | null
}
type CarePlanQueueResult = {
  state: 'ready' | 'empty' | 'denied' | 'unavailable' | 'stale' | 'inconsistent'
  page: CarePlanCursorPage | null
  totalCount: number | null
  direction: CarePlanCursorDirection
  cursorId: string | null
}
type ClinicalFulfillmentResult = { ordersQueue: MedicalOrderQueueResult; resultsQueue: LabResultQueueResult; prescriptionsQueue: PrescriptionQueueResult; proceduresQueue: ProcedureQueueResult; carePlansQueue: CarePlanQueueResult; data: Data }
type ClinicalFulfillmentCursorMembershipProjection = Data & {
  cursorMedicalOrders?: unknown
  cursorMedicalOrdersCount?: unknown
  cursorLabResults?: unknown
  cursorLabResultsCount?: unknown
  cursorPrescriptions?: unknown
  cursorPrescriptionsCount?: unknown
  cursorProcedures?: unknown
  cursorProceduresCount?: unknown
  cursorCarePlans?: unknown
  cursorCarePlansCount?: unknown
}

type QueueKind = 'order' | 'result' | 'prescription' | 'procedure' | 'carePlan'

function nextStatus(kind: QueueKind, status: string) {
  const transitions: Record<QueueKind, Record<string, string>> = {
    order: { draft: 'ordered', ordered: 'in_progress', in_progress: 'completed' },
    result: { pending: 'final', preliminary: 'final', final: 'acknowledged', corrected: 'acknowledged' },
    prescription: { recorded_manual: 'cancelled', draft: 'cancelled', active: 'cancelled', held: 'cancelled' },
    procedure: { scheduled: 'in_progress', in_progress: 'completed' },
    carePlan: { draft: 'active', active: 'completed' },
  }
  return transitions[kind][status]
}

const fulfillmentFirstPageQuery = `
  query ClinicalFulfillmentFirstPage($ordersWhere: MedicalOrderWhereInput!, $resultsWhere: LabResultWhereInput!, $prescriptionsWhere: PrescriptionWhereInput!, $proceduresWhere: ProcedureWhereInput!, $carePlansWhere: CarePlanWhereInput!) {
    medicalOrders(where: $ordersWhere, orderBy: [{ createdAt: asc }, { id: asc }], take: 26) {
      id orderNumber orderType status transitionVersion patient { displayName }
    }
    medicalOrdersCount(where: $ordersWhere)
    labResults(where: $resultsWhere, orderBy: [{ createdAt: asc }, { id: asc }], take: 26) {
      id resultNumber version status transitionVersion patient { displayName }
    }
    labResultsCount(where: $resultsWhere)
    prescriptions(where: $prescriptionsWhere, orderBy: [{ createdAt: asc }, { id: asc }], take: 26) {
      id prescriptionNumber status transitionVersion patient { displayName }
    }
    prescriptionsCount(where: $prescriptionsWhere)
    procedures(where: $proceduresWhere, orderBy: [{ createdAt: asc }, { id: asc }], take: 26) {
      id procedureNumber status transitionVersion patient { displayName }
    }
    proceduresCount(where: $proceduresWhere)
    carePlans(where: $carePlansWhere, orderBy: [{ createdAt: asc }, { id: asc }], take: 26) {
      id title status transitionVersion patient { displayName }
    }
    carePlansCount(where: $carePlansWhere)
  }
`

const fulfillmentCursorMembershipQuery = `
  query ClinicalFulfillmentCursorMembership(
    $ordersWhere: MedicalOrderWhereInput!, $ordersCursorWhere: MedicalOrderWhereInput!, $checkOrdersCursor: Boolean!, $loadOrdersFirst: Boolean!,
    $resultsWhere: LabResultWhereInput!, $resultsCursorWhere: LabResultWhereInput!, $checkResultsCursor: Boolean!, $loadResultsFirst: Boolean!,
    $prescriptionsWhere: PrescriptionWhereInput!, $prescriptionsCursorWhere: PrescriptionWhereInput!, $checkPrescriptionsCursor: Boolean!, $loadPrescriptionsFirst: Boolean!,
    $proceduresWhere: ProcedureWhereInput!, $proceduresCursorWhere: ProcedureWhereInput!, $checkProceduresCursor: Boolean!, $loadProceduresFirst: Boolean!,
    $carePlansWhere: CarePlanWhereInput!, $carePlansCursorWhere: CarePlanWhereInput!, $checkCarePlansCursor: Boolean!, $loadCarePlansFirst: Boolean!
  ) {
    cursorMedicalOrders: medicalOrders(where: $ordersCursorWhere, orderBy: [{ id: asc }], take: 2) @include(if: $checkOrdersCursor) { id }
    cursorMedicalOrdersCount: medicalOrdersCount(where: $ordersCursorWhere) @include(if: $checkOrdersCursor)
    medicalOrders(where: $ordersWhere, orderBy: [{ createdAt: asc }, { id: asc }], take: 26) @include(if: $loadOrdersFirst) {
      id orderNumber orderType status transitionVersion patient { displayName }
    }
    medicalOrdersCount(where: $ordersWhere)
    cursorLabResults: labResults(where: $resultsCursorWhere, orderBy: [{ id: asc }], take: 2) @include(if: $checkResultsCursor) { id }
    cursorLabResultsCount: labResultsCount(where: $resultsCursorWhere) @include(if: $checkResultsCursor)
    labResults(where: $resultsWhere, orderBy: [{ createdAt: asc }, { id: asc }], take: 26) @include(if: $loadResultsFirst) {
      id resultNumber version status transitionVersion patient { displayName }
    }
    labResultsCount(where: $resultsWhere)
    cursorPrescriptions: prescriptions(where: $prescriptionsCursorWhere, orderBy: [{ id: asc }], take: 2) @include(if: $checkPrescriptionsCursor) { id }
    cursorPrescriptionsCount: prescriptionsCount(where: $prescriptionsCursorWhere) @include(if: $checkPrescriptionsCursor)
    prescriptions(where: $prescriptionsWhere, orderBy: [{ createdAt: asc }, { id: asc }], take: 26) @include(if: $loadPrescriptionsFirst) {
      id prescriptionNumber status transitionVersion patient { displayName }
    }
    prescriptionsCount(where: $prescriptionsWhere)
    cursorProcedures: procedures(where: $proceduresCursorWhere, orderBy: [{ id: asc }], take: 2) @include(if: $checkProceduresCursor) { id }
    cursorProceduresCount: proceduresCount(where: $proceduresCursorWhere) @include(if: $checkProceduresCursor)
    procedures(where: $proceduresWhere, orderBy: [{ createdAt: asc }, { id: asc }], take: 26) @include(if: $loadProceduresFirst) {
      id procedureNumber status transitionVersion patient { displayName }
    }
    proceduresCount(where: $proceduresWhere)
    cursorCarePlans: carePlans(where: $carePlansCursorWhere, orderBy: [{ id: asc }], take: 2) @include(if: $checkCarePlansCursor) { id }
    cursorCarePlansCount: carePlansCount(where: $carePlansCursorWhere) @include(if: $checkCarePlansCursor)
    carePlans(where: $carePlansWhere, orderBy: [{ createdAt: asc }, { id: asc }], take: 26) @include(if: $loadCarePlansFirst) {
      id title status transitionVersion patient { displayName }
    }
    carePlansCount(where: $carePlansWhere)
  }
`

const medicalOrdersCursorPageQuery = `
  query MedicalOrdersCursorPage($where: MedicalOrderWhereInput!, $cursor: MedicalOrderWhereUniqueInput!, $orderBy: [MedicalOrderOrderByInput!]!) {
    medicalOrders(where: $where, orderBy: $orderBy, take: 26, cursor: $cursor, skip: 1) {
      id orderNumber orderType status transitionVersion patient { displayName }
    }
    medicalOrdersCount(where: $where)
  }
`

const labResultsCursorPageQuery = `
  query LabResultsCursorPage($where: LabResultWhereInput!, $cursor: LabResultWhereUniqueInput!, $orderBy: [LabResultOrderByInput!]!) {
    labResults(where: $where, orderBy: $orderBy, take: 26, cursor: $cursor, skip: 1) {
      id resultNumber version status transitionVersion patient { displayName }
    }
    labResultsCount(where: $where)
  }
`

const prescriptionsCursorPageQuery = `
  query PrescriptionsCursorPage($where: PrescriptionWhereInput!, $cursor: PrescriptionWhereUniqueInput!, $orderBy: [PrescriptionOrderByInput!]!) {
    prescriptions(where: $where, orderBy: $orderBy, take: 26, cursor: $cursor, skip: 1) {
      id prescriptionNumber status transitionVersion patient { displayName }
    }
    prescriptionsCount(where: $where)
  }
`

const proceduresCursorPageQuery = `
  query ProceduresCursorPage($where: ProcedureWhereInput!, $cursor: ProcedureWhereUniqueInput!, $orderBy: [ProcedureOrderByInput!]!) {
    procedures(where: $where, orderBy: $orderBy, take: 26, cursor: $cursor, skip: 1) {
      id procedureNumber status transitionVersion patient { displayName }
    }
    proceduresCount(where: $where)
  }
`

const carePlansCursorPageQuery = `
  query CarePlansCursorPage($where: CarePlanWhereInput!, $cursor: CarePlanWhereUniqueInput!, $orderBy: [CarePlanOrderByInput!]!) {
    carePlans(where: $where, orderBy: $orderBy, take: 26, cursor: $cursor, skip: 1) {
      id title status transitionVersion patient { displayName }
    }
    carePlansCount(where: $where)
  }
`

async function getClinicalFulfillmentData(
  ordersRequest: MedicalOrderCursorRequest,
  resultsRequest: LabResultCursorRequest,
  prescriptionsRequest: PrescriptionCursorRequest,
  proceduresRequest: ProcedureCursorRequest,
  carePlansRequest: CarePlanCursorRequest,
): Promise<ClinicalFulfillmentResult | null> {
  const ordersWhere = medicalOrderQueueWhere()
  const resultsWhere = labResultQueueWhere()
  const prescriptionsWhere = prescriptionQueueWhere()
  const proceduresWhere = procedureQueueWhere()
  const carePlansWhere = carePlanQueueWhere()

  if (ordersRequest.state === 'ready' && ordersRequest.direction === 'first' &&
    resultsRequest.state === 'ready' && resultsRequest.direction === 'first' &&
    prescriptionsRequest.state === 'ready' && prescriptionsRequest.direction === 'first' &&
    proceduresRequest.state === 'ready' && proceduresRequest.direction === 'first' &&
    carePlansRequest.state === 'ready' && carePlansRequest.direction === 'first') {
    const response = await keystoneClient<Data>(fulfillmentFirstPageQuery, {
      ordersWhere,
      resultsWhere,
      prescriptionsWhere,
      proceduresWhere,
      carePlansWhere,
    }).catch(() => null)
    if (!response?.success) return null
    const data = response.data
    const ordersPage = shapeMedicalOrderCursorPage(data.medicalOrders, data.medicalOrdersCount, 'first', false)
    const resultsPage = shapeLabResultCursorPage(data.labResults, data.labResultsCount, 'first', false)
    const prescriptionsPage = shapePrescriptionCursorPage(data.prescriptions, data.prescriptionsCount, 'first', false)
    const proceduresPage = shapeProcedureCursorPage(data.procedures, data.proceduresCount, 'first', false)
    const carePlansPage = shapeCarePlanCursorPage(data.carePlans, data.carePlansCount, 'first', false)
    const ordersCount = ordersPage.state === 'inconsistent' ? parseMedicalOrdersCount(data.medicalOrdersCount) : ordersPage.totalCount
    const resultsCount = resultsPage.state === 'inconsistent' ? parseLabResultsCount(data.labResultsCount) : resultsPage.totalCount
    const prescriptionsCount = prescriptionsPage.state === 'inconsistent' ? parsePrescriptionsCount(data.prescriptionsCount) : prescriptionsPage.totalCount
    const proceduresCount = proceduresPage.state === 'inconsistent' ? parseProceduresCount(data.proceduresCount) : proceduresPage.totalCount
    const carePlansCount = carePlansPage.state === 'inconsistent' ? parseCarePlansCount(data.carePlansCount) : carePlansPage.totalCount
    return {
      ordersQueue: { state: ordersPage.state, page: ordersPage, totalCount: ordersCount, direction: 'first', cursorId: null },
      resultsQueue: { state: resultsPage.state, page: resultsPage, totalCount: resultsCount, direction: 'first', cursorId: null },
      prescriptionsQueue: { state: prescriptionsPage.state, page: prescriptionsPage, totalCount: prescriptionsCount, direction: 'first', cursorId: null },
      proceduresQueue: { state: proceduresPage.state, page: proceduresPage, totalCount: proceduresCount, direction: 'first', cursorId: null },
      carePlansQueue: { state: carePlansPage.state, page: carePlansPage, totalCount: carePlansCount, direction: 'first', cursorId: null },
      data,
    }
  }

  const ordersHasCursor = ordersRequest.state === 'ready' && ordersRequest.direction !== 'first'
  const resultsHaveCursor = resultsRequest.state === 'ready' && resultsRequest.direction !== 'first'
  const prescriptionsHaveCursor = prescriptionsRequest.state === 'ready' && prescriptionsRequest.direction !== 'first'
  const proceduresHaveCursor = proceduresRequest.state === 'ready' && proceduresRequest.direction !== 'first'
  const carePlansHaveCursor = carePlansRequest.state === 'ready' && carePlansRequest.direction !== 'first'
  const ordersDirection = ordersRequest.state === 'ready' ? ordersRequest.direction : 'first'
  const resultsDirection = resultsRequest.state === 'ready' ? resultsRequest.direction : 'first'
  const prescriptionsDirection = prescriptionsRequest.state === 'ready' ? prescriptionsRequest.direction : 'first'
  const proceduresDirection = proceduresRequest.state === 'ready' ? proceduresRequest.direction : 'first'
  const carePlansDirection = carePlansRequest.state === 'ready' ? carePlansRequest.direction : 'first'
  const ordersCursorId = ordersHasCursor ? ordersRequest.cursorId as string : null
  const resultsCursorId = resultsHaveCursor ? resultsRequest.cursorId as string : null
  const prescriptionsCursorId = prescriptionsHaveCursor ? prescriptionsRequest.cursorId as string : null
  const proceduresCursorId = proceduresHaveCursor ? proceduresRequest.cursorId as string : null
  const carePlansCursorId = carePlansHaveCursor ? carePlansRequest.cursorId as string : null
  const membershipResponse = await keystoneClient<ClinicalFulfillmentCursorMembershipProjection>(fulfillmentCursorMembershipQuery, {
    ordersWhere,
    ordersCursorWhere: ordersCursorId ? medicalOrderCursorMembershipWhere(ordersCursorId) : ordersWhere,
    checkOrdersCursor: ordersHasCursor,
    loadOrdersFirst: ordersRequest.state === 'ready' && ordersRequest.direction === 'first',
    resultsWhere,
    resultsCursorWhere: resultsCursorId ? labResultCursorMembershipWhere(resultsCursorId) : resultsWhere,
    checkResultsCursor: resultsHaveCursor,
    loadResultsFirst: resultsRequest.state === 'ready' && resultsRequest.direction === 'first',
    prescriptionsWhere,
    prescriptionsCursorWhere: prescriptionsCursorId ? prescriptionCursorMembershipWhere(prescriptionsCursorId) : prescriptionsWhere,
    checkPrescriptionsCursor: prescriptionsHaveCursor,
    loadPrescriptionsFirst: prescriptionsRequest.state === 'ready' && prescriptionsRequest.direction === 'first',
    proceduresWhere,
    proceduresCursorWhere: proceduresCursorId ? procedureCursorMembershipWhere(proceduresCursorId) : proceduresWhere,
    checkProceduresCursor: proceduresHaveCursor,
    loadProceduresFirst: proceduresRequest.state === 'ready' && proceduresRequest.direction === 'first',
    carePlansWhere,
    carePlansCursorWhere: carePlansCursorId ? carePlanCursorMembershipWhere(carePlansCursorId) : carePlansWhere,
    checkCarePlansCursor: carePlansHaveCursor,
    loadCarePlansFirst: carePlansRequest.state === 'ready' && carePlansRequest.direction === 'first',
  }).catch(() => null)
  if (!membershipResponse?.success) return null
  const data = membershipResponse.data

  let ordersQueue: MedicalOrderQueueResult
  let resultsQueue: LabResultQueueResult
  let prescriptionsQueue: PrescriptionQueueResult
  let proceduresQueue: ProcedureQueueResult
  let carePlansQueue: CarePlanQueueResult
  let ordersCursorIsMember = false
  let resultsCursorIsMember = false
  let prescriptionsCursorIsMember = false
  let proceduresCursorIsMember = false
  let carePlansCursorIsMember = false

  if (ordersRequest.state !== 'ready') {
    const totalCount = parseMedicalOrdersCount(data.medicalOrdersCount)
    ordersQueue = { state: totalCount === null ? 'inconsistent' : ordersRequest.state, page: null, totalCount, direction: 'first', cursorId: null }
  } else if (ordersRequest.direction === 'first') {
    const page = shapeMedicalOrderCursorPage(data.medicalOrders, data.medicalOrdersCount, 'first', false)
    const totalCount = page.state === 'inconsistent' ? parseMedicalOrdersCount(data.medicalOrdersCount) : page.totalCount
    ordersQueue = { state: page.state, page, totalCount, direction: 'first', cursorId: null }
  } else {
    const cursorId = ordersCursorId as string
    const totalCount = parseMedicalOrdersCount(data.medicalOrdersCount)
    const membership = validateMedicalOrderCursorMembership(cursorId, data.cursorMedicalOrders, data.cursorMedicalOrdersCount)
    if (totalCount === null || membership === 'inconsistent') {
      ordersQueue = { state: 'inconsistent', page: null, totalCount, direction: ordersDirection, cursorId }
    } else if (membership === 'stale') {
      ordersQueue = { state: 'denied', page: null, totalCount, direction: ordersDirection, cursorId }
    } else {
      ordersCursorIsMember = true
      ordersQueue = { state: 'ready', page: null, totalCount, direction: ordersDirection, cursorId }
    }
  }

  if (resultsRequest.state !== 'ready') {
    const totalCount = parseLabResultsCount(data.labResultsCount)
    resultsQueue = { state: totalCount === null ? 'inconsistent' : resultsRequest.state, page: null, totalCount, direction: 'first', cursorId: null }
  } else if (resultsRequest.direction === 'first') {
    const page = shapeLabResultCursorPage(data.labResults, data.labResultsCount, 'first', false)
    const totalCount = page.state === 'inconsistent' ? parseLabResultsCount(data.labResultsCount) : page.totalCount
    resultsQueue = { state: page.state, page, totalCount, direction: 'first', cursorId: null }
  } else {
    const cursorId = resultsCursorId as string
    const totalCount = parseLabResultsCount(data.labResultsCount)
    const membership = validateLabResultCursorMembership(cursorId, data.cursorLabResults, data.cursorLabResultsCount)
    if (totalCount === null || membership === 'inconsistent') {
      resultsQueue = { state: 'inconsistent', page: null, totalCount, direction: resultsDirection, cursorId }
    } else if (membership === 'stale') {
      resultsQueue = { state: 'denied', page: null, totalCount, direction: resultsDirection, cursorId }
    } else {
      resultsCursorIsMember = true
      resultsQueue = { state: 'ready', page: null, totalCount, direction: resultsDirection, cursorId }
    }
  }

  if (prescriptionsRequest.state !== 'ready') {
    const totalCount = parsePrescriptionsCount(data.prescriptionsCount)
    prescriptionsQueue = { state: totalCount === null ? 'inconsistent' : prescriptionsRequest.state, page: null, totalCount, direction: 'first', cursorId: null }
  } else if (prescriptionsRequest.direction === 'first') {
    const page = shapePrescriptionCursorPage(data.prescriptions, data.prescriptionsCount, 'first', false)
    const totalCount = page.state === 'inconsistent' ? parsePrescriptionsCount(data.prescriptionsCount) : page.totalCount
    prescriptionsQueue = { state: page.state, page, totalCount, direction: 'first', cursorId: null }
  } else {
    const cursorId = prescriptionsCursorId as string
    const totalCount = parsePrescriptionsCount(data.prescriptionsCount)
    const membership = validatePrescriptionCursorMembership(cursorId, data.cursorPrescriptions, data.cursorPrescriptionsCount)
    if (totalCount === null || membership === 'inconsistent') {
      prescriptionsQueue = { state: 'inconsistent', page: null, totalCount, direction: prescriptionsDirection, cursorId }
    } else if (membership === 'stale') {
      prescriptionsQueue = { state: 'denied', page: null, totalCount, direction: prescriptionsDirection, cursorId }
    } else {
      prescriptionsCursorIsMember = true
      prescriptionsQueue = { state: 'ready', page: null, totalCount, direction: prescriptionsDirection, cursorId }
    }
  }

  if (proceduresRequest.state !== 'ready') {
    const totalCount = parseProceduresCount(data.proceduresCount)
    proceduresQueue = { state: totalCount === null ? 'inconsistent' : proceduresRequest.state, page: null, totalCount, direction: 'first', cursorId: null }
  } else if (proceduresRequest.direction === 'first') {
    const page = shapeProcedureCursorPage(data.procedures, data.proceduresCount, 'first', false)
    const totalCount = page.state === 'inconsistent' ? parseProceduresCount(data.proceduresCount) : page.totalCount
    proceduresQueue = { state: page.state, page, totalCount, direction: 'first', cursorId: null }
  } else {
    const cursorId = proceduresCursorId as string
    const totalCount = parseProceduresCount(data.proceduresCount)
    const membership = validateProcedureCursorMembership(cursorId, data.cursorProcedures, data.cursorProceduresCount)
    if (totalCount === null || membership === 'inconsistent') {
      proceduresQueue = { state: 'inconsistent', page: null, totalCount, direction: proceduresDirection, cursorId }
    } else if (membership === 'stale') {
      proceduresQueue = { state: 'denied', page: null, totalCount, direction: proceduresDirection, cursorId }
    } else {
      proceduresCursorIsMember = true
      proceduresQueue = { state: 'ready', page: null, totalCount, direction: proceduresDirection, cursorId }
    }
  }

  if (carePlansRequest.state !== 'ready') {
    const totalCount = parseCarePlansCount(data.carePlansCount)
    carePlansQueue = { state: totalCount === null ? 'inconsistent' : carePlansRequest.state, page: null, totalCount, direction: 'first', cursorId: null }
  } else if (carePlansRequest.direction === 'first') {
    const page = shapeCarePlanCursorPage(data.carePlans, data.carePlansCount, 'first', false)
    const totalCount = page.state === 'inconsistent' ? parseCarePlansCount(data.carePlansCount) : page.totalCount
    carePlansQueue = { state: page.state, page, totalCount, direction: 'first', cursorId: null }
  } else {
    const cursorId = carePlansCursorId as string
    const totalCount = parseCarePlansCount(data.carePlansCount)
    const membership = validateCarePlanCursorMembership(cursorId, data.cursorCarePlans, data.cursorCarePlansCount)
    if (totalCount === null || membership === 'inconsistent') {
      carePlansQueue = { state: 'inconsistent', page: null, totalCount, direction: carePlansDirection, cursorId }
    } else if (membership === 'stale') {
      carePlansQueue = { state: 'denied', page: null, totalCount, direction: carePlansDirection, cursorId }
    } else {
      carePlansCursorIsMember = true
      carePlansQueue = { state: 'ready', page: null, totalCount, direction: carePlansDirection, cursorId }
    }
  }

  const [ordersPageResponse, resultsPageResponse, prescriptionsPageResponse, proceduresPageResponse, carePlansPageResponse] = await Promise.all([
    ordersCursorIsMember
      ? keystoneClient<MedicalOrderProjection>(medicalOrdersCursorPageQuery, {
          where: ordersWhere,
          cursor: { id: ordersCursorId as string },
          orderBy: medicalOrderCursorOrderBy(ordersDirection as 'after' | 'before'),
        }).catch(() => null)
      : Promise.resolve(null),
    resultsCursorIsMember
      ? keystoneClient<LabResultProjection>(labResultsCursorPageQuery, {
          where: resultsWhere,
          cursor: { id: resultsCursorId as string },
          orderBy: labResultCursorOrderBy(resultsDirection as 'after' | 'before'),
        }).catch(() => null)
      : Promise.resolve(null),
    prescriptionsCursorIsMember
      ? keystoneClient<PrescriptionProjection>(prescriptionsCursorPageQuery, {
          where: prescriptionsWhere,
          cursor: { id: prescriptionsCursorId as string },
          orderBy: prescriptionCursorOrderBy(prescriptionsDirection as 'after' | 'before'),
        }).catch(() => null)
      : Promise.resolve(null),
    proceduresCursorIsMember
      ? keystoneClient<ProcedureProjection>(proceduresCursorPageQuery, {
          where: proceduresWhere,
          cursor: { id: proceduresCursorId as string },
          orderBy: procedureCursorOrderBy(proceduresDirection as 'after' | 'before'),
        }).catch(() => null)
      : Promise.resolve(null),
    carePlansCursorIsMember
      ? keystoneClient<CarePlanProjection>(carePlansCursorPageQuery, {
          where: carePlansWhere,
          cursor: { id: carePlansCursorId as string },
          orderBy: carePlanCursorOrderBy(carePlansDirection as 'after' | 'before'),
        }).catch(() => null)
      : Promise.resolve(null),
  ])

  if (ordersCursorIsMember) {
    if (!ordersPageResponse?.success) {
      ordersQueue = { ...ordersQueue, state: 'unavailable', page: null }
    } else {
      const page = shapeMedicalOrderCursorPage(ordersPageResponse.data.medicalOrders, ordersPageResponse.data.medicalOrdersCount, ordersDirection, true)
      const totalCount = page.state === 'inconsistent' ? parseMedicalOrdersCount(ordersPageResponse.data.medicalOrdersCount) : page.totalCount
      ordersQueue = { ...ordersQueue, state: page.state, page, totalCount: totalCount ?? ordersQueue.totalCount }
    }
  }

  if (resultsCursorIsMember) {
    if (!resultsPageResponse?.success) {
      resultsQueue = { ...resultsQueue, state: 'unavailable', page: null }
    } else {
      const page = shapeLabResultCursorPage(resultsPageResponse.data.labResults, resultsPageResponse.data.labResultsCount, resultsDirection, true)
      const totalCount = page.state === 'inconsistent' ? parseLabResultsCount(resultsPageResponse.data.labResultsCount) : page.totalCount
      resultsQueue = { ...resultsQueue, state: page.state, page, totalCount: totalCount ?? resultsQueue.totalCount }
    }
  }

  if (prescriptionsCursorIsMember) {
    if (!prescriptionsPageResponse?.success) {
      prescriptionsQueue = { ...prescriptionsQueue, state: 'unavailable', page: null }
    } else {
      const page = shapePrescriptionCursorPage(prescriptionsPageResponse.data.prescriptions, prescriptionsPageResponse.data.prescriptionsCount, prescriptionsDirection, true)
      const totalCount = page.state === 'inconsistent' ? parsePrescriptionsCount(prescriptionsPageResponse.data.prescriptionsCount) : page.totalCount
      prescriptionsQueue = { ...prescriptionsQueue, state: page.state, page, totalCount: totalCount ?? prescriptionsQueue.totalCount }
    }
  }

  if (proceduresCursorIsMember) {
    if (!proceduresPageResponse?.success) {
      proceduresQueue = { ...proceduresQueue, state: 'unavailable', page: null }
    } else {
      const page = shapeProcedureCursorPage(proceduresPageResponse.data.procedures, proceduresPageResponse.data.proceduresCount, proceduresDirection, true)
      const totalCount = page.state === 'inconsistent' ? parseProceduresCount(proceduresPageResponse.data.proceduresCount) : page.totalCount
      proceduresQueue = { ...proceduresQueue, state: page.state, page, totalCount: totalCount ?? proceduresQueue.totalCount }
    }
  }

  if (carePlansCursorIsMember) {
    if (!carePlansPageResponse?.success) {
      carePlansQueue = { ...carePlansQueue, state: 'unavailable', page: null }
    } else {
      const page = shapeCarePlanCursorPage(carePlansPageResponse.data.carePlans, carePlansPageResponse.data.carePlansCount, carePlansDirection, true)
      const totalCount = page.state === 'inconsistent' ? parseCarePlansCount(carePlansPageResponse.data.carePlansCount) : page.totalCount
      carePlansQueue = { ...carePlansQueue, state: page.state, page, totalCount: totalCount ?? carePlansQueue.totalCount }
    }
  }

  return { ordersQueue, resultsQueue, prescriptionsQueue, proceduresQueue, carePlansQueue, data }
}

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function ClinicalFulfillmentPage({ searchParams }: PageProps) {
  const params = await searchParams
  const orderCursorRequest = parseMedicalOrderCursor(params.ordersAfter, params.ordersBefore)
  const resultsCursorRequest = parseLabResultCursor(params.resultsAfter, params.resultsBefore)
  const prescriptionsCursorRequest = parsePrescriptionCursor(params.prescriptionsAfter, params.prescriptionsBefore)
  const proceduresCursorRequest = parseProcedureCursor(params.proceduresAfter, params.proceduresBefore)
  const carePlansCursorRequest = parseCarePlanCursor(params.carePlansAfter, params.carePlansBefore)
  const orderCursorParam = orderCursorRequest.state === 'ready' && orderCursorRequest.direction !== 'first'
    ? orderCursorRequest.direction === 'after' ? 'ordersAfter' as const : 'ordersBefore' as const
    : null
  const orderCursorId = orderCursorRequest.state === 'ready' && orderCursorRequest.direction !== 'first'
    ? orderCursorRequest.cursorId
    : null
  const resultsCursorParam = resultsCursorRequest.state === 'ready' && resultsCursorRequest.direction !== 'first'
    ? resultsCursorRequest.direction === 'after' ? 'resultsAfter' as const : 'resultsBefore' as const
    : null
  const resultsCursorId = resultsCursorRequest.state === 'ready' && resultsCursorRequest.direction !== 'first'
    ? resultsCursorRequest.cursorId
    : null
  const prescriptionsCursorParam = prescriptionsCursorRequest.state === 'ready' && prescriptionsCursorRequest.direction !== 'first'
    ? prescriptionsCursorRequest.direction === 'after' ? 'prescriptionsAfter' as const : 'prescriptionsBefore' as const
    : null
  const prescriptionsCursorId = prescriptionsCursorRequest.state === 'ready' && prescriptionsCursorRequest.direction !== 'first'
    ? prescriptionsCursorRequest.cursorId
    : null
  const proceduresCursorParam = proceduresCursorRequest.state === 'ready' && proceduresCursorRequest.direction !== 'first'
    ? proceduresCursorRequest.direction === 'after' ? 'proceduresAfter' as const : 'proceduresBefore' as const
    : null
  const proceduresCursorId = proceduresCursorRequest.state === 'ready' && proceduresCursorRequest.direction !== 'first'
    ? proceduresCursorRequest.cursorId
    : null
  const carePlansCursorParam = carePlansCursorRequest.state === 'ready' && carePlansCursorRequest.direction !== 'first'
    ? carePlansCursorRequest.direction === 'after' ? 'carePlansAfter' as const : 'carePlansBefore' as const
    : null
  const carePlansCursorId = carePlansCursorRequest.state === 'ready' && carePlansCursorRequest.direction !== 'first'
    ? carePlansCursorRequest.cursorId
    : null
  const preservedForOrders = {
    ...(resultsCursorParam && resultsCursorId ? { [resultsCursorParam]: resultsCursorId } : {}),
    ...(prescriptionsCursorParam && prescriptionsCursorId ? { [prescriptionsCursorParam]: prescriptionsCursorId } : {}),
    ...(proceduresCursorParam && proceduresCursorId ? { [proceduresCursorParam]: proceduresCursorId } : {}),
    ...(carePlansCursorParam && carePlansCursorId ? { [carePlansCursorParam]: carePlansCursorId } : {}),
  }
  const preservedForResults = {
    ...(orderCursorParam && orderCursorId ? { [orderCursorParam]: orderCursorId } : {}),
    ...(prescriptionsCursorParam && prescriptionsCursorId ? { [prescriptionsCursorParam]: prescriptionsCursorId } : {}),
    ...(proceduresCursorParam && proceduresCursorId ? { [proceduresCursorParam]: proceduresCursorId } : {}),
    ...(carePlansCursorParam && carePlansCursorId ? { [carePlansCursorParam]: carePlansCursorId } : {}),
  }
  const preservedForPrescriptions = {
    ...(orderCursorParam && orderCursorId ? { [orderCursorParam]: orderCursorId } : {}),
    ...(resultsCursorParam && resultsCursorId ? { [resultsCursorParam]: resultsCursorId } : {}),
    ...(proceduresCursorParam && proceduresCursorId ? { [proceduresCursorParam]: proceduresCursorId } : {}),
    ...(carePlansCursorParam && carePlansCursorId ? { [carePlansCursorParam]: carePlansCursorId } : {}),
  }
  const preservedForProcedures = {
    ...(orderCursorParam && orderCursorId ? { [orderCursorParam]: orderCursorId } : {}),
    ...(resultsCursorParam && resultsCursorId ? { [resultsCursorParam]: resultsCursorId } : {}),
    ...(prescriptionsCursorParam && prescriptionsCursorId ? { [prescriptionsCursorParam]: prescriptionsCursorId } : {}),
    ...(carePlansCursorParam && carePlansCursorId ? { [carePlansCursorParam]: carePlansCursorId } : {}),
  }
  const preservedForCarePlans = {
    ...(orderCursorParam && orderCursorId ? { [orderCursorParam]: orderCursorId } : {}),
    ...(resultsCursorParam && resultsCursorId ? { [resultsCursorParam]: resultsCursorId } : {}),
    ...(prescriptionsCursorParam && prescriptionsCursorId ? { [prescriptionsCursorParam]: prescriptionsCursorId } : {}),
    ...(proceduresCursorParam && proceduresCursorId ? { [proceduresCursorParam]: proceduresCursorId } : {}),
  }

  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: '/dashboard' },
    { type: 'page' as const, label: 'Clinical fulfillment' },
  ]
  const [fulfillment, options] = await Promise.all([
    getClinicalFulfillmentData(orderCursorRequest, resultsCursorRequest, prescriptionsCursorRequest, proceduresCursorRequest, carePlansCursorRequest),
    getOperationsWorkspaceOptions().catch(() => null),
  ])
  if (!fulfillment || !options) {
    return <><WorkspaceLoadError title="Clinical fulfillment" description="Clinical work items or required selectors may be incomplete." breadcrumbs={breadcrumbs} /><section className="px-4 pb-10 md:px-6"><LabResultReadbackPanel /></section></>
  }
  const { ordersQueue, resultsQueue, prescriptionsQueue, proceduresQueue, carePlansQueue } = fulfillment
  const orderRows: Row[] = ordersQueue.page?.state === 'ready' ? ordersQueue.page.orders : []
  const resultRows: Row[] = resultsQueue.page?.state === 'ready' ? resultsQueue.page.results : []
  const prescriptionRows: Row[] = prescriptionsQueue.page?.state === 'ready' ? prescriptionsQueue.page.prescriptions : []
  const procedureRows: Row[] = proceduresQueue.page?.state === 'ready' ? proceduresQueue.page.procedures : []
  const carePlanRows: Row[] = carePlansQueue.page?.state === 'ready' ? carePlansQueue.page.carePlans : []
  const groups: Array<{ kind: QueueKind; title: string; label: string; rows: Row[]; count: number | null }> = [
    { kind: 'result', title: 'Results', label: 'results', rows: resultRows, count: resultsQueue.totalCount },
    { kind: 'order', title: 'Orders', label: 'orders', rows: orderRows, count: ordersQueue.totalCount },
    { kind: 'prescription', title: 'Prescriptions', label: 'prescriptions', rows: prescriptionRows, count: prescriptionsQueue.totalCount },
    { kind: 'procedure', title: 'Procedures', label: 'procedures', rows: procedureRows, count: proceduresQueue.totalCount },
    { kind: 'carePlan', title: 'Care plans', label: 'care plans', rows: carePlanRows, count: carePlansQueue.totalCount },
  ]
  const totalTasks = ordersQueue.totalCount === null || resultsQueue.totalCount === null || prescriptionsQueue.totalCount === null || proceduresQueue.totalCount === null || carePlansQueue.totalCount === null
    ? null
    : ordersQueue.totalCount + resultsQueue.totalCount + prescriptionsQueue.totalCount + proceduresQueue.totalCount + carePlansQueue.totalCount

  return (
    <PageContainer
      title="Clinical fulfillment"
      breadcrumbs={breadcrumbs}
      header={(
        <WardHeader
          eyebrow="Clinical work queues"
          title="Clinical fulfillment"
          tone={totalTasks === null ? 'bad' : totalTasks > 0 ? 'warn' : 'ok'}
          status={totalTasks === null ? 'Task counts unavailable' : `${totalTasks} open tasks`}
          meta={<>Active encounters shown {options.encounters.length}</>}
        />
      )}
    >
      <WardBody>
        <BoundedDataNotice messages={options.notices} />
        <ReadoutStrip>
          {groups.map(({ kind, title, count }) => (
            <Readout key={kind} label={title} tone={count === null ? 'bad' : count > 0 ? (kind === 'result' ? 'warn' : 'accent') : 'ok'} value={count ?? '—'} sub={count === null ? 'Unavailable' : undefined} />
          ))}
        </ReadoutStrip>
        <div className="grid min-w-0 gap-6 xl:grid-cols-2">
          {groups.map(({ kind, title, label, rows, count }) => (
            <WardSection key={kind} id={`queue-${kind}`} title={title} count={count ?? undefined} className={kind === 'result' ? 'xl:col-span-2' : undefined}>
              <div className="space-y-3">
                {kind === 'order' && ordersQueue.state === 'denied' && <CursorReset role="status" href={medicalOrderCursorHref(null, null, preservedForOrders)} label="First orders page">This order cursor is stale or outside the orders accessible to this session. No order record was loaded.</CursorReset>}
                {kind === 'order' && ordersQueue.state === 'stale' && <CursorReset role="status" href={medicalOrderCursorHref(null, null, preservedForOrders)} label="First orders page">The order cursor is malformed or stale.</CursorReset>}
                {kind === 'order' && ordersQueue.state === 'unavailable' && <Notice tone="bad" role="alert">The active orders and their count could not be verified. No empty queue is being inferred.</Notice>}
                {kind === 'order' && ordersQueue.state === 'inconsistent' && <CursorReset role="alert" href={medicalOrderCursorHref(null, null, preservedForOrders)} label="First orders page">Order rows, cursor membership, and count could not be reconciled. No empty queue is being inferred.</CursorReset>}
                {kind === 'order' && ordersQueue.state === 'empty' && ordersQueue.page?.state === 'empty' && ordersQueue.page.totalCount === 0 && ordersQueue.direction === 'first' && <div role="status"><EmptyBoard title="No current tasks" /></div>}
                {kind === 'order' && ordersQueue.state === 'empty' && ordersQueue.page?.state === 'empty' && ordersQueue.page.totalCount > 0 && <Notice role="status">No active orders on this side of the cursor.</Notice>}
                {kind === 'result' && resultsQueue.state === 'denied' && <CursorReset role="status" href={labResultCursorHref(null, null, preservedForResults)} label="First results page">This lab-result cursor is stale or outside the lab results accessible to this session. No lab-result record was loaded.</CursorReset>}
                {kind === 'result' && resultsQueue.state === 'stale' && <CursorReset role="status" href={labResultCursorHref(null, null, preservedForResults)} label="First results page">The lab-result cursor is malformed or stale.</CursorReset>}
                {kind === 'result' && resultsQueue.state === 'unavailable' && <Notice tone="bad" role="alert">The active lab results and their count could not be verified. No empty queue is being inferred.</Notice>}
                {kind === 'result' && resultsQueue.state === 'inconsistent' && <CursorReset role="alert" href={labResultCursorHref(null, null, preservedForResults)} label="First results page">Lab-result rows, cursor membership, and count could not be reconciled. No empty queue is being inferred.</CursorReset>}
                {kind === 'result' && resultsQueue.state === 'empty' && resultsQueue.page?.state === 'empty' && resultsQueue.page.totalCount === 0 && resultsQueue.direction === 'first' && <div role="status"><EmptyBoard title="No current tasks" /></div>}
                {kind === 'result' && resultsQueue.state === 'empty' && resultsQueue.page?.state === 'empty' && resultsQueue.page.totalCount > 0 && <Notice role="status">No active lab results on this side of the cursor.</Notice>}
                {kind === 'prescription' && prescriptionsQueue.state === 'denied' && <CursorReset role="status" href={prescriptionCursorHref(null, null, preservedForPrescriptions)} label="First prescriptions page">This prescription cursor is stale or outside the prescriptions accessible to this session. No prescription record was loaded.</CursorReset>}
                {kind === 'prescription' && prescriptionsQueue.state === 'stale' && <CursorReset role="status" href={prescriptionCursorHref(null, null, preservedForPrescriptions)} label="First prescriptions page">The prescription cursor is malformed or stale.</CursorReset>}
                {kind === 'prescription' && prescriptionsQueue.state === 'unavailable' && <Notice tone="bad" role="alert">The active prescriptions and their count could not be verified. No empty queue is being inferred.</Notice>}
                {kind === 'prescription' && prescriptionsQueue.state === 'inconsistent' && <CursorReset role="alert" href={prescriptionCursorHref(null, null, preservedForPrescriptions)} label="First prescriptions page">Prescription rows, cursor membership, and count could not be reconciled. No empty queue is being inferred.</CursorReset>}
                {kind === 'prescription' && prescriptionsQueue.state === 'empty' && prescriptionsQueue.page?.state === 'empty' && prescriptionsQueue.page.totalCount === 0 && prescriptionsQueue.direction === 'first' && <div role="status"><EmptyBoard title="No current tasks" /></div>}
                {kind === 'prescription' && prescriptionsQueue.state === 'empty' && prescriptionsQueue.page?.state === 'empty' && prescriptionsQueue.page.totalCount > 0 && <Notice role="status">No prescriptions on this side of the cursor.</Notice>}
                {kind === 'procedure' && proceduresQueue.state === 'denied' && <CursorReset role="status" href={procedureCursorHref(null, null, preservedForProcedures)} label="First procedures page">This procedure cursor is stale or outside the procedures accessible to this session. No procedure record was loaded.</CursorReset>}
                {kind === 'procedure' && proceduresQueue.state === 'stale' && <CursorReset role="status" href={procedureCursorHref(null, null, preservedForProcedures)} label="First procedures page">The procedure cursor is malformed or stale.</CursorReset>}
                {kind === 'procedure' && proceduresQueue.state === 'unavailable' && <Notice tone="bad" role="alert">The active procedures and their count could not be verified. No empty queue is being inferred.</Notice>}
                {kind === 'procedure' && proceduresQueue.state === 'inconsistent' && <CursorReset role="alert" href={procedureCursorHref(null, null, preservedForProcedures)} label="First procedures page">Procedure rows, cursor membership, and count could not be reconciled. No empty queue is being inferred.</CursorReset>}
                {kind === 'procedure' && proceduresQueue.state === 'empty' && proceduresQueue.page?.state === 'empty' && proceduresQueue.page.totalCount === 0 && proceduresQueue.direction === 'first' && <div role="status"><EmptyBoard title="No current tasks" /></div>}
                {kind === 'carePlan' && carePlansQueue.state === 'denied' && <CursorReset role="status" href={carePlanCursorHref(null, null, preservedForCarePlans)} label="First care plans page">This care-plan cursor is stale or outside the care plans accessible to this session. No care plan record was loaded.</CursorReset>}
                {kind === 'carePlan' && carePlansQueue.state === 'stale' && <CursorReset role="status" href={carePlanCursorHref(null, null, preservedForCarePlans)} label="First care plans page">The care-plan cursor is malformed or stale.</CursorReset>}
                {kind === 'carePlan' && carePlansQueue.state === 'unavailable' && <Notice tone="bad" role="alert">The active care plans and their count could not be verified. No empty queue is being inferred.</Notice>}
                {kind === 'carePlan' && carePlansQueue.state === 'inconsistent' && <CursorReset role="alert" href={carePlanCursorHref(null, null, preservedForCarePlans)} label="First care plans page">Care-plan rows, cursor membership, and count could not be reconciled. No empty queue is being inferred.</CursorReset>}
                {kind === 'carePlan' && carePlansQueue.state === 'empty' && carePlansQueue.page?.state === 'empty' && carePlansQueue.page.totalCount === 0 && carePlansQueue.direction === 'first' && <div role="status"><EmptyBoard title="No current tasks" /></div>}
                {kind === 'carePlan' && carePlansQueue.state === 'empty' && carePlansQueue.page?.state === 'empty' && carePlansQueue.page.totalCount > 0 && <Notice role="status">No care plans on this side of the cursor.</Notice>}
                {rows.length > 0 && <Board>{rows.map(row => {
                  const toStatus = nextStatus(kind, row.status)
                  const typedRow = row as Row & {
                    orderNumber?: string
                    resultNumber?: string
                    prescriptionNumber?: string
                    procedureNumber?: string
                    title?: string
                    version?: number
                  }
                  const reference = typedRow.orderNumber ?? typedRow.resultNumber ?? typedRow.prescriptionNumber ?? typedRow.procedureNumber ?? typedRow.title
                  return (
                    <BoardRow
                      key={row.id}
                      tone={toneForStatus(row.status)}
                      status={statusLabel(row.status)}
                      title={reference ? <Code className="text-sm font-semibold text-foreground">{reference}</Code> : 'Untitled'}
                      meta={<>
                        <span>{row.patient?.displayName ?? 'Restricted patient'}</span>
                        {typedRow.version ? <span>Version {typedRow.version}</span> : null}
                      </>}
                      aside={<>
                        <StatusTag status={row.status} />
                        {toStatus && <TransitionButton kind={kind} id={row.id} toStatus={toStatus} version={row.transitionVersion} />}
                      </>}
                    >
                      {kind === 'result' ? <LabResultReadbackPanel resultId={row.id} /> : null}
                    </BoardRow>
                  )
                })}</Board>}
                {kind !== 'order' && kind !== 'result' && kind !== 'prescription' && kind !== 'procedure' && kind !== 'carePlan' && !rows.length && <Notice role="status">{count ? `This page no longer contains accessible ${label}.` : 'No current tasks.'}</Notice>}
                {kind === 'order'
                  ? ordersQueue.page && (ordersQueue.state === 'ready' || ordersQueue.state === 'empty') && ordersQueue.page.state !== 'inconsistent'
                    ? <MedicalOrderCursorPagination page={ordersQueue.page} direction={ordersQueue.direction} cursorId={ordersQueue.cursorId} preservedQueueState={preservedForOrders} />
                    : null
                  : kind === 'result'
                    ? resultsQueue.page && (resultsQueue.state === 'ready' || resultsQueue.state === 'empty') && resultsQueue.page.state !== 'inconsistent'
                      ? <LabResultCursorPagination page={resultsQueue.page} direction={resultsQueue.direction} cursorId={resultsQueue.cursorId} preservedQueueState={preservedForResults} />
                      : null
                    : kind === 'prescription'
                      ? prescriptionsQueue.page && (prescriptionsQueue.state === 'ready' || prescriptionsQueue.state === 'empty') && prescriptionsQueue.page.state !== 'inconsistent'
                        ? <PrescriptionCursorPagination page={prescriptionsQueue.page} direction={prescriptionsQueue.direction} cursorId={prescriptionsQueue.cursorId} preservedQueueState={preservedForPrescriptions} />
                        : null
                      : kind === 'procedure'
                        ? proceduresQueue.page && (proceduresQueue.state === 'ready' || proceduresQueue.state === 'empty') && proceduresQueue.page.state !== 'inconsistent'
                          ? <ProcedureCursorPagination page={proceduresQueue.page} direction={proceduresQueue.direction} cursorId={proceduresQueue.cursorId} preservedQueueState={preservedForProcedures} />
                          : null
                        : carePlansQueue.page && (carePlansQueue.state === 'ready' || carePlansQueue.state === 'empty') && carePlansQueue.page.state !== 'inconsistent'
                          ? <CarePlanCursorPagination page={carePlansQueue.page} direction={carePlansQueue.direction} cursorId={carePlansQueue.cursorId} preservedQueueState={preservedForCarePlans} />
                          : null}
              </div>
            </WardSection>
          ))}
        </div>
        <WardSection id="clinical-tools" title="Record and look up">
          <div className="flex min-w-0 flex-col gap-3">
            <ClinicalCreateForms options={options} />
            <LabResultReadbackPanel />
          </div>
        </WardSection>
      </WardBody>
    </PageContainer>
  )
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
