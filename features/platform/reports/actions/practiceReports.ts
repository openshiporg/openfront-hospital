'use server'

import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'

const REPORT_PAGE_SIZE = 100
const REPORT_SNAPSHOT_LIMIT = 500

export type PracticeReportData = {
  range: { startDate: string; endDate: string; days: number }
  appointmentCounts: Record<string, number>
  intakeCounts: Record<string, number>
  messageCounts: Record<string, number>
  providerCompletion: Array<{
    providerId: string
    providerName: string
    specialty?: string | null
    appointmentCount: number
    completedCount: number
    noShowCount: number
    completionRate: number
  }>
  upcomingAppointments: Array<any>
  intakeNeedsReview: Array<any>
  queuedMessages: Array<any>
  operational: {
    activeQueue: number
    currentAdmissions: number
    unavailableBeds: number
    openOrders: number
    openClaims: number
    lowStockItems: number
    retryEvents: number
    deadLetterEvents: number
  }
}

function getRange(days = 30) {
  const end = new Date()
  const start = new Date()
  start.setDate(end.getDate() - days)
  start.setHours(0, 0, 0, 0)
  return { startDate: start.toISOString(), endDate: end.toISOString(), days }
}

const summaryQuery = `
  query PracticeReportSummary($startDate:DateTime!,$endDate:DateTime!,$now:DateTime!){
    authenticatedItem { ... on User { role { canAccessAllClinicalData canViewReports canManageAppointments canManagePatients canManageIntake canManageCommunications canManageInventory } } }
    appointmentsInRangeCount:appointmentsCount(where:{startsAt:{gte:$startDate,lte:$endDate}})
    intakeFormsReportCount:intakeFormsCount(where:{createdAt:{gte:$startDate,lte:$endDate}})
    patientMessagesInRangeCount:patientMessagesCount(where:{createdAt:{gte:$startDate,lte:$endDate}})
    activeInventoryItemsCount:inventoryItemsCount(where:{status:{equals:"active"}})
    activeQueue:careQueueTicketsCount(where:{status:{in:["waiting","called","in_care"]}})
    currentAdmissions:admissionsCount(where:{status:{in:["admitted","transferred"]}})
    unavailableBeds:bedsCount(where:{status:{in:["occupied","reserved","cleaning","out_of_service"]}})
    openOrders:medicalOrdersCount(where:{status:{in:["draft","ordered","in_progress"]}})
    openClaims:insuranceClaimsCount(where:{status:{in:["draft","prepared","submitted","external_rejected","denied","corrected"]}})
    retryEvents:clinicalOutboxEventsCount(where:{status:{equals:"retry"}})
    deadLetterEvents:clinicalOutboxEventsCount(where:{status:{equals:"dead_letter"}})
    upcomingAppointments:appointments(where:{startsAt:{gte:$now},status:{in:["requested","confirmed","checked_in","in_visit"]}},orderBy:[{startsAt:asc}],take:8){
      id appointmentNumber status startsAt patient{id displayName} provider{id displayName} appointmentType{id name} facility{id name timeZone}
    }
    intakeNeedsReview:intakeForms(where:{status:{in:["submitted","needs_review"]}},orderBy:[{updatedAt:desc}],take:8){
      id title status submittedAt patient{id displayName} appointment{id appointmentNumber startsAt provider{id displayName} facility{id name timeZone}}
    }
    queuedMessages:patientMessages(where:{status:{in:["manual_required","queued","failed"]}},orderBy:[{createdAt:desc}],take:8){
      id status channel direction subject createdAt patient{id displayName} appointment{id appointmentNumber startsAt facility{id name timeZone}}
    }
  }
`

const appointmentPageQuery = `
  query PracticeReportAppointmentPage($startDate:DateTime!,$endDate:DateTime!,$take:Int!,$skip:Int!){
    appointments(where:{startsAt:{gte:$startDate,lte:$endDate}},orderBy:[{startsAt:asc}],take:$take,skip:$skip){
      id status startsAt provider{id displayName specialty}
    }
  }
`

const intakePageQuery = `
  query PracticeReportIntakePage($startDate:DateTime!,$endDate:DateTime!,$take:Int!,$skip:Int!){
    intakeForms(where:{createdAt:{gte:$startDate,lte:$endDate}},orderBy:[{createdAt:desc}],take:$take,skip:$skip){
      id title status submittedAt reviewedAt patient{id displayName} appointment{id appointmentNumber startsAt provider{id displayName}}
    }
  }
`

const messagePageQuery = `
  query PracticeReportMessagePage($startDate:DateTime!,$endDate:DateTime!,$take:Int!,$skip:Int!){
    patientMessages(where:{createdAt:{gte:$startDate,lte:$endDate}},orderBy:[{createdAt:desc}],take:$take,skip:$skip){
      id status channel direction createdAt
    }
  }
`

const inventoryPageQuery = `
  query PracticeReportInventoryPage($take:Int!,$skip:Int!){
    inventoryItems(where:{status:{equals:"active"}},orderBy:[{createdAt:asc}],take:$take,skip:$skip){
      id quantityOnHand quantityReserved reorderPoint
    }
  }
`

async function loadBoundedSnapshot<T>(
  label: string,
  total: number,
  query: string,
  field: string,
  variables: Record<string, unknown>,
): Promise<T[]> {
  if (!Number.isInteger(total) || total < 0) throw new Error(`${label} reporting count is invalid.`)
  if (total > REPORT_SNAPSHOT_LIMIT) {
    throw new Error(`${label} reporting exceeds the bounded ${REPORT_SNAPSHOT_LIMIT}-item snapshot; narrow or extend the reporting contract.`)
  }
  const pageCount = Math.ceil(total / REPORT_PAGE_SIZE)
  const responses = await Promise.all(Array.from({ length: pageCount }, (_, page) =>
    keystoneClient<Record<string, T[]>>(query, {
      ...variables,
      take: REPORT_PAGE_SIZE,
      skip: page * REPORT_PAGE_SIZE,
    }),
  ))
  const failed = responses.find(response => !response.success)
  if (failed && !failed.success) throw new Error(`${label} reporting page is unavailable: ${failed.error}`)
  const rows = responses.flatMap(response => response.success ? response.data[field] || [] : [])
  if (rows.length !== total) throw new Error(`${label} reporting changed while bounded pages were loading; refresh the report.`)
  return rows
}

export async function getPracticeReportData(days = 30) {
  const range = getRange(days)
  const summaryResponse = await keystoneClient<any>(summaryQuery, { ...range, now: new Date().toISOString() })
  if (!summaryResponse.success) return summaryResponse
  const summary = summaryResponse.data
  const role = summary.authenticatedItem?.role
  const mayViewCompleteReport = role?.canAccessAllClinicalData === true || (
    role?.canViewReports === true && role?.canManageAppointments === true && role?.canManagePatients === true &&
    role?.canManageIntake === true && role?.canManageCommunications === true && role?.canManageInventory === true
  )
  if (!mayViewCompleteReport) {
    return { success: false as const, error: 'REPORT_PERMISSION_DENIED: Complete reporting requires report access plus appointment, patient, intake, communication, and inventory scope.' }
  }

  let appointments: any[]
  let intakeForms: any[]
  let messages: any[]
  let inventoryForStock: any[]
  try {
    ;[appointments, intakeForms, messages, inventoryForStock] = await Promise.all([
      loadBoundedSnapshot('Appointment', Number(summary.appointmentsInRangeCount || 0), appointmentPageQuery, 'appointments', range),
      loadBoundedSnapshot('Intake', Number(summary.intakeFormsReportCount || 0), intakePageQuery, 'intakeForms', range),
      loadBoundedSnapshot('Communication', Number(summary.patientMessagesInRangeCount || 0), messagePageQuery, 'patientMessages', range),
      loadBoundedSnapshot('Inventory', Number(summary.activeInventoryItemsCount || 0), inventoryPageQuery, 'inventoryItems', {}),
    ])
  } catch (error) {
    return { success: false as const, error: error instanceof Error ? error.message : 'Practice reporting data is unavailable.' }
  }

  const lowStockItems = inventoryForStock.filter((item: any) =>
    Number(item.quantityOnHand || 0) - Number(item.quantityReserved || 0) <= Number(item.reorderPoint || 0),
  ).length

  const appointmentCounts = {
    all: appointments.length,
    requested: appointments.filter((item: any) => item.status === 'requested').length,
    confirmed: appointments.filter((item: any) => item.status === 'confirmed').length,
    checked_in: appointments.filter((item: any) => item.status === 'checked_in').length,
    in_visit: appointments.filter((item: any) => item.status === 'in_visit').length,
    completed: appointments.filter((item: any) => item.status === 'completed').length,
    cancelled: appointments.filter((item: any) => item.status === 'cancelled').length,
    no_show: appointments.filter((item: any) => item.status === 'no_show').length,
  }

  const intakeCounts = {
    all: intakeForms.length,
    not_sent: intakeForms.filter((item: any) => item.status === 'not_sent').length,
    sent: intakeForms.filter((item: any) => item.status === 'sent').length,
    in_progress: intakeForms.filter((item: any) => item.status === 'in_progress').length,
    submitted: intakeForms.filter((item: any) => item.status === 'submitted').length,
    needs_review: intakeForms.filter((item: any) => item.status === 'needs_review').length,
    reviewed: intakeForms.filter((item: any) => item.status === 'reviewed').length,
  }

  const messageCounts = {
    all: messages.length,
    queued: messages.filter((item: any) => item.status === 'queued').length,
    sent: messages.filter((item: any) => item.status === 'sent').length,
    delivered: messages.filter((item: any) => item.status === 'delivered').length,
    failed: messages.filter((item: any) => item.status === 'failed').length,
    received: messages.filter((item: any) => item.status === 'received').length,
    manual_required: messages.filter((item: any) => item.status === 'manual_required').length,
    completed: messages.filter((item: any) => item.status === 'completed').length,
    sms: messages.filter((item: any) => item.channel === 'sms').length,
    email: messages.filter((item: any) => item.channel === 'email').length,
    phone: messages.filter((item: any) => item.channel === 'phone').length,
  }

  const byProvider = new Map<string, any>()
  for (const appointment of appointments) {
    const providerId = appointment.provider?.id || 'unassigned'
    const current = byProvider.get(providerId) || {
      providerId,
      providerName: appointment.provider?.displayName || 'Unassigned',
      specialty: appointment.provider?.specialty,
      appointmentCount: 0,
      completedCount: 0,
      noShowCount: 0,
    }
    current.appointmentCount += 1
    if (appointment.status === 'completed') current.completedCount += 1
    if (appointment.status === 'no_show') current.noShowCount += 1
    byProvider.set(providerId, current)
  }

  const providerCompletion = Array.from(byProvider.values())
    .map((provider: any) => ({
      ...provider,
      completionRate: provider.appointmentCount ? Math.round((provider.completedCount / provider.appointmentCount) * 100) : 0,
    }))
    .sort((a: any, b: any) => b.appointmentCount - a.appointmentCount)

  return {
    success: true as const,
    data: {
      range,
      appointmentCounts,
      intakeCounts,
      messageCounts,
      providerCompletion,
      upcomingAppointments: summary.upcomingAppointments || [],
      intakeNeedsReview: summary.intakeNeedsReview || [],
      queuedMessages: summary.queuedMessages || [],
      operational: {
        activeQueue: summary.activeQueue || 0,
        currentAdmissions: summary.currentAdmissions || 0,
        unavailableBeds: summary.unavailableBeds || 0,
        openOrders: summary.openOrders || 0,
        openClaims: summary.openClaims || 0,
        lowStockItems,
        retryEvents: summary.retryEvents || 0,
        deadLetterEvents: summary.deadLetterEvents || 0,
      },
    } satisfies PracticeReportData,
  }
}
