import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import { type OperationsOption, type OperationsWorkspaceOptions } from '../types'

type WorkspaceData = {
  facilitiesCount: number
  patients: Array<{ id: string; displayName?: string | null }>
  patientsCount: number
  appointments: Array<{
    id: string
    appointmentNumber: string
    patient?: { displayName?: string | null } | null
    provider?: { displayName?: string | null } | null
    facility?: { name?: string | null } | null
  }>
  appointmentsCount: number
  encounters: Array<{
    id: string
    encounterNumber: string
    status: string
    patient?: { displayName?: string | null } | null
    facility?: { name?: string | null } | null
  }>
  encountersCount: number
  medicalOrders: Array<{
    id: string
    orderNumber: string
    orderType: string
    status: string
    patient?: { displayName?: string | null } | null
  }>
  medicalOrdersCount: number
  labResults: Array<{
    id: string
    resultNumber: string
    version: number
    status: string
    patient?: { displayName?: string | null } | null
    supersedingResult?: { id: string } | null
  }>
  labResultsCount: number
}

const scopeQuery = `
  query OperationsWorkspaceScope {
    facilitiesCount(where:{status:{equals:"active"}})
    patients(where:{status:{equals:"active"}},orderBy:[{lastName:asc},{firstName:asc}],take:100){id displayName}
    patientsCount(where:{status:{equals:"active"}})
  }
`

const careQuery = `
  query OperationsWorkspaceCare {
    appointments(where:{status:{in:["checked_in","in_visit"]}},orderBy:[{startsAt:asc}],take:100){
      id appointmentNumber patient{displayName} provider{displayName} facility{name}
    }
    appointmentsCount(where:{status:{in:["checked_in","in_visit"]}})
    encounters(where:{status:{in:["open","in_progress"]}},orderBy:[{createdAt:desc}],take:100){
      id encounterNumber status patient{displayName} facility{name}
    }
    encountersCount(where:{status:{in:["open","in_progress"]}})
  }
`

const fulfillmentQuery = `
  query OperationsWorkspaceFulfillment {
    medicalOrders(where:{status:{in:["draft","ordered","in_progress"]}},orderBy:[{createdAt:desc}],take:100){
      id orderNumber orderType status patient{displayName}
    }
    medicalOrdersCount(where:{status:{in:["draft","ordered","in_progress"]}})
    labResults(where:{status:{in:["final","acknowledged","corrected"]}},orderBy:[{createdAt:desc}],take:100){
      id resultNumber version status patient{displayName} supersedingResult{id}
    }
    labResultsCount(where:{status:{in:["final","acknowledged","corrected"]}})
  }
`

function option(value: string, label: string): OperationsOption {
  return { value, label }
}

function boundedNotice(label: string, total: number, loaded: number) {
  return total > loaded ? `${label}: showing the first ${loaded} of ${total}. Use the dedicated workspace or narrow the operational status before acting on records outside this list.` : null
}

export async function getClaimsWorkspaceOptions(): Promise<Pick<OperationsWorkspaceOptions, 'facilitiesCount'>> {
  const query = `
    query ClaimsWorkspaceOptions {
      facilitiesCount(where:{status:{equals:"active"}})
    }
  `
  const response = await keystoneClient<{
    facilitiesCount: number
  }>(query)
  if (!response.success) throw new Error('Billing selectors are unavailable')
  return { facilitiesCount: response.data.facilitiesCount }
}

export async function getOperationsWorkspaceOptions(): Promise<OperationsWorkspaceOptions> {
  const [scopeResponse, careResponse, fulfillmentResponse] = await Promise.all([
    keystoneClient<Pick<WorkspaceData, 'facilitiesCount' | 'patients' | 'patientsCount'>>(scopeQuery),
    keystoneClient<Pick<WorkspaceData, 'appointments' | 'appointmentsCount' | 'encounters' | 'encountersCount'>>(careQuery),
    keystoneClient<Pick<WorkspaceData, 'medicalOrders' | 'medicalOrdersCount' | 'labResults' | 'labResultsCount'>>(fulfillmentQuery),
  ])
  if (!scopeResponse.success || !careResponse.success || !fulfillmentResponse.success) {
    throw new Error('Operations workspace options are unavailable')
  }
  const data: WorkspaceData = { ...scopeResponse.data, ...careResponse.data, ...fulfillmentResponse.data }
  const notices = [
    boundedNotice('Patients', data.patientsCount, data.patients.length),
    boundedNotice('Checked-in appointments', data.appointmentsCount, data.appointments.length),
    boundedNotice('Active encounters', data.encountersCount, data.encounters.length),
    boundedNotice('Open orders', data.medicalOrdersCount, data.medicalOrders.length),
    boundedNotice('Correctable results', data.labResultsCount, data.labResults.length),
  ].filter((message): message is string => Boolean(message))
  const orders = data.medicalOrders.map(row => option(
    row.id,
    `${row.orderNumber} · ${row.orderType.replaceAll('_', ' ')} · ${row.patient?.displayName || 'Patient'} · ${row.status.replaceAll('_', ' ')}`,
  ))
  const encounterOptions = data.encounters.map(row => option(
    row.id,
    `${row.encounterNumber} · ${row.patient?.displayName || 'Patient'} · ${row.facility?.name || 'Facility'} · ${row.status.replaceAll('_', ' ')}`,
  ))

  return {
    notices,
    facilitiesCount: data.facilitiesCount,
    patients: data.patients.map(row => option(row.id, row.displayName || 'Restricted patient')),
    checkedInAppointments: data.appointments.map(row => option(
      row.id,
      `${row.appointmentNumber} · ${row.patient?.displayName || 'Patient'} · ${row.provider?.displayName || 'Provider'} · ${row.facility?.name || 'Facility'}`,
    )),
    encounters: encounterOptions,
    inProgressEncounters: data.encounters
      .filter(row => row.status === 'in_progress')
      .map(row => encounterOptions[data.encounters.indexOf(row)]),
    orders,
    labOrders: data.medicalOrders
      .filter(row => row.orderType === 'lab' && ['ordered', 'in_progress'].includes(row.status))
      .map(row => option(row.id, `${row.orderNumber} · ${row.patient?.displayName || 'Patient'} · ${row.status.replaceAll('_', ' ')}`)),
    medicationOrders: data.medicalOrders
      .filter(row => row.orderType === 'medication' && ['ordered', 'in_progress'].includes(row.status))
      .map(row => option(row.id, `${row.orderNumber} · ${row.patient?.displayName || 'Patient'} · ${row.status.replaceAll('_', ' ')}`)),
    procedureOrders: data.medicalOrders
      .filter(row => row.orderType === 'procedure' && ['ordered', 'in_progress'].includes(row.status))
      .map(row => option(row.id, `${row.orderNumber} · ${row.patient?.displayName || 'Patient'} · ${row.status.replaceAll('_', ' ')}`)),
    correctableResults: data.labResults
      .filter(row => !row.supersedingResult)
      .map(row => option(row.id, `${row.resultNumber} · v${row.version} · ${row.patient?.displayName || 'Patient'} · ${row.status}`)),
  }
}
