/** Practice-structure options, types and validation shared by the facility screens and server actions. */

export type FormValues = Record<string, string>
export type FieldErrors = Record<string, string>
export type MutationResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; error: string; fieldErrors?: FieldErrors }

export const FACILITY_TYPES = [
  { value: 'clinic', label: 'Clinic' },
  { value: 'hospital', label: 'Hospital' },
  { value: 'telehealth', label: 'Telehealth' },
] as const
export const FACILITY_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
] as const
export const DEPARTMENT_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'closed', label: 'Closed' },
] as const
export const WARD_STATUSES = [
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
] as const
export const ROOM_TYPES = [
  { value: 'private', label: 'Private' },
  { value: 'semi_private', label: 'Semi private' },
  { value: 'icu', label: 'ICU' },
  { value: 'procedure', label: 'Procedure' },
] as const
export const ROOM_STATUSES = [
  { value: 'available', label: 'Available' },
  { value: 'occupied', label: 'Occupied' },
  { value: 'cleaning', label: 'Cleaning' },
  { value: 'maintenance', label: 'Maintenance' },
] as const

const values = (options: ReadonlyArray<{ value: string }>) => new Set(options.map(option => option.value))
const FACILITY_TYPE_SET = values(FACILITY_TYPES)
const FACILITY_STATUS_SET = values(FACILITY_STATUSES)
const DEPARTMENT_STATUS_SET = values(DEPARTMENT_STATUSES)
const WARD_STATUS_SET = values(WARD_STATUSES)
const ROOM_TYPE_SET = values(ROOM_TYPES)
const ROOM_STATUS_SET = values(ROOM_STATUSES)

export function optionLabel(options: ReadonlyArray<{ value: string; label: string }>, value: string | null | undefined) {
  return options.find(option => option.value === value)?.label ?? (value || 'Not set')
}

export type FacilityListItem = {
  id: string
  name: string
  slug: string
  facilityType: string
  status: string
  city?: string | null
  region?: string | null
  timeZone: string
  phone?: string | null
  departmentsCount: number
  providersCount: number
}

export type FacilityRecord = Omit<FacilityListItem, 'departmentsCount' | 'providersCount'> & {
  postalCode?: string | null
  addressLine1?: string | null
  addressLine2?: string | null
  departmentsCount: number
  providersCount: number
}

export type DepartmentRecord = {
  id: string
  name: string
  code?: string | null
  status?: string | null
  description?: string | null
  phone?: string | null
  email?: string | null
}
export type WardRecord = { id: string; name: string; floor?: string | null; capacity?: number | null; status?: string | null; department?: { id: string } | null }
export type RoomRecord = { id: string; roomNumber: string; roomType?: string | null; status?: string | null; ward?: { id: string } | null }
export type BedRecord = { id: string; bedNumber: string; status: string; room?: { id: string } | null }

export type FacilityFilters = { search: string; status: 'active' | 'inactive' | 'all'; facilityType: string }

export function normalizeFacilityFilters(input: Record<string, string | string[] | undefined>): FacilityFilters {
  const value = (key: string) => (typeof input[key] === 'string' ? (input[key] as string).trim() : '')
  const status = value('status')
  const facilityType = value('type')
  return {
    search: value('search').slice(0, 80),
    status: status === 'inactive' || status === 'all' ? status : 'active',
    facilityType: FACILITY_TYPE_SET.has(facilityType) ? facilityType : 'all',
  }
}

const trim = (input: FormValues, key: string) => String(input[key] ?? '').trim()
const optional = (value: string) => (value ? value : null)
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return true
  } catch {
    return false
  }
}

type Validated<T> = { data: T; fieldErrors: FieldErrors }

export function validateFacility(input: FormValues): Validated<Record<string, string | null>> {
  const fieldErrors: FieldErrors = {}
  const name = trim(input, 'name')
  const slug = trim(input, 'slug').toLowerCase()
  const facilityType = trim(input, 'facilityType')
  const timeZone = trim(input, 'timeZone')
  const status = trim(input, 'status')
  if (!name) fieldErrors.name = 'Required'
  else if (name.length > 160) fieldErrors.name = 'Max 160 characters'
  if (!slug) fieldErrors.slug = 'Required'
  else if (!SLUG.test(slug) || slug.length > 80) fieldErrors.slug = 'Lowercase letters, numbers and single hyphens'
  if (!FACILITY_TYPE_SET.has(facilityType)) fieldErrors.facilityType = 'Choose a type'
  if (!timeZone) fieldErrors.timeZone = 'Required'
  else if (!isTimeZone(timeZone)) fieldErrors.timeZone = 'Unknown IANA time zone'
  if (!FACILITY_STATUS_SET.has(status)) fieldErrors.status = 'Choose a status'
  const phone = trim(input, 'phone')
  if (phone.length > 40) fieldErrors.phone = 'Max 40 characters'
  return {
    fieldErrors,
    data: {
      name,
      slug,
      facilityType,
      timeZone,
      status,
      phone: optional(phone),
      city: optional(trim(input, 'city')),
      region: optional(trim(input, 'region')),
      postalCode: optional(trim(input, 'postalCode')),
    },
  }
}

export function validateDepartment(input: FormValues): Validated<Record<string, string | null>> {
  const fieldErrors: FieldErrors = {}
  const name = trim(input, 'name')
  const code = trim(input, 'code').toUpperCase()
  const email = trim(input, 'email')
  const status = trim(input, 'status')
  if (!name) fieldErrors.name = 'Required'
  if (code && !/^[A-Z0-9_-]{1,24}$/.test(code)) fieldErrors.code = 'Letters, numbers, - or _ (max 24)'
  if (email && !EMAIL.test(email)) fieldErrors.email = 'Invalid email'
  if (!DEPARTMENT_STATUS_SET.has(status)) fieldErrors.status = 'Choose a status'
  return {
    fieldErrors,
    data: {
      name,
      code: optional(code),
      status,
      description: optional(trim(input, 'description')),
      phone: optional(trim(input, 'phone')),
      email: optional(email),
    },
  }
}

export function validateWard(input: FormValues): Validated<{ name: string; floor: string | null; capacity: number; status: string; departmentId: string }> {
  const fieldErrors: FieldErrors = {}
  const name = trim(input, 'name')
  const capacityRaw = trim(input, 'capacity')
  const capacity = capacityRaw === '' ? 0 : Number(capacityRaw)
  const status = trim(input, 'status')
  const departmentId = trim(input, 'departmentId')
  if (!name) fieldErrors.name = 'Required'
  if (!Number.isInteger(capacity) || capacity < 0 || capacity > 10000) fieldErrors.capacity = 'Whole number, 0 or more'
  if (!WARD_STATUS_SET.has(status)) fieldErrors.status = 'Choose a status'
  if (!departmentId) fieldErrors.departmentId = 'Choose a department'
  return { fieldErrors, data: { name, floor: optional(trim(input, 'floor')), capacity, status, departmentId } }
}

export function validateRoom(input: FormValues): Validated<{ roomNumber: string; roomType: string; status: string; wardId: string }> {
  const fieldErrors: FieldErrors = {}
  const roomNumber = trim(input, 'roomNumber')
  const roomType = trim(input, 'roomType')
  const status = trim(input, 'status')
  const wardId = trim(input, 'wardId')
  if (!roomNumber) fieldErrors.roomNumber = 'Required'
  else if (roomNumber.length > 40) fieldErrors.roomNumber = 'Max 40 characters'
  if (!ROOM_TYPE_SET.has(roomType)) fieldErrors.roomType = 'Choose a type'
  if (!ROOM_STATUS_SET.has(status)) fieldErrors.status = 'Choose a status'
  if (!wardId) fieldErrors.wardId = 'Choose a ward'
  return { fieldErrors, data: { roomNumber, roomType, status, wardId } }
}

export function validateBed(input: FormValues): Validated<{ bedNumber: string; roomId: string; facilityId: string }> {
  const fieldErrors: FieldErrors = {}
  const bedNumber = trim(input, 'bedNumber')
  const roomId = trim(input, 'roomId')
  const facilityId = trim(input, 'facilityId')
  if (!bedNumber) fieldErrors.bedNumber = 'Required'
  else if (bedNumber.length > 40) fieldErrors.bedNumber = 'Max 40 characters'
  if (!roomId) fieldErrors.roomId = 'Choose a room'
  if (!facilityId) fieldErrors.facilityId = 'Facility missing'
  return { fieldErrors, data: { bedNumber, roomId, facilityId } }
}

export const STATUS_TARGETS = {
  facility: FACILITY_STATUS_SET,
  department: DEPARTMENT_STATUS_SET,
  ward: WARD_STATUS_SET,
  room: ROOM_STATUS_SET,
} as const
export type StructureKind = keyof typeof STATUS_TARGETS

export const hasErrors = (errors: FieldErrors) => Object.keys(errors).length > 0
