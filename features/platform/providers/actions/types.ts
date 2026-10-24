export const PROVIDER_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'unavailable', label: 'Unavailable' },
  { value: 'inactive', label: 'Inactive' },
] as const

export const CLINICIAN_TYPES = [
  { value: 'physician', label: 'Physician' },
  { value: 'nurse', label: 'Nurse' },
  { value: 'therapist', label: 'Therapist' },
  { value: 'technician', label: 'Technician' },
] as const

export type Option = { id: string; label: string; sub?: string | null }

export type ProviderRow = {
  id: string
  firstName: string | null
  lastName: string | null
  displayName: string | null
  credentials: string | null
  specialty: string | null
  status: string | null
  locationName: string | null
  appointmentTypesCount: number | null
  upcomingBlocks: number | null
  facilities: Array<{ id: string; name: string | null }> | null
}

export type ProviderFilters = {
  status: string
  facility: string
  specialty: string
  search: string
}

export type ClinicianRecord = {
  id: string
  displayName: string | null
  clinicianType: string | null
  licenseNumber: string | null
  email: string | null
  phone: string | null
  active: boolean | null
  department: { id: string; name: string | null } | null
}

export type ProviderDetail = {
  id: string
  firstName: string | null
  lastName: string | null
  displayName: string | null
  credentials: string | null
  specialty: string | null
  status: string | null
  bio: string | null
  locationName: string | null
  facilities: Array<{ id: string; name: string | null }> | null
  appointmentTypes: Array<{ id: string; name: string | null; status: string | null; durationMinutes: number | null; formattedPrice: string | null }> | null
  scheduleBlocks: Array<{ id: string; blockType: string | null; startsAt: string; endsAt: string; locationName: string | null; facility: { id: string; name: string | null; timeZone: string | null } | null }> | null
  appointments: Array<{ id: string; appointmentNumber: string | null; status: string | null; startsAt: string; appointmentType: { id: string; name: string | null } | null; facility: { id: string; name: string | null; timeZone: string | null } | null }> | null
  clinicians: ClinicianRecord[] | null
}

export type ProviderInput = {
  firstName: string
  lastName: string
  credentials: string
  specialty: string
  bio: string
  locationName: string
  status: string
  facilityIds: string[]
  appointmentTypeIds: string[]
}

export type ClinicianInput = {
  displayName: string
  clinicianType: string
  licenseNumber: string
  email: string
  phone: string
  active: boolean
  departmentId?: string
}

export type ActionResult<T = undefined> = { success: true; data?: T } | { success: false; error: string }

export function providerTone(status: string | null | undefined): 'ok' | 'warn' | 'idle' {
  if (status === 'active') return 'ok'
  if (status === 'unavailable') return 'warn'
  return 'idle'
}

export function providerStatusLabel(status: string | null | undefined) {
  return PROVIDER_STATUSES.find((s) => s.value === status)?.label ?? 'Unknown'
}
