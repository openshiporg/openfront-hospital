export const VISIT_STATUSES = [
  { value: 'bookable', label: 'Bookable', action: 'Make bookable', tone: 'ok' },
  { value: 'internal', label: 'Internal only', action: 'Internal only', tone: 'info' },
  { value: 'paused', label: 'Paused', action: 'Pause', tone: 'warn' },
] as const

export type VisitStatus = (typeof VISIT_STATUSES)[number]['value']

/** Intake sections the storefront booking flow understands (from the onboarding seed). */
export const INTAKE_SECTIONS = [
  { value: 'contact', label: 'Contact' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'reason_for_visit', label: 'Reason for visit' },
  { value: 'medical_history', label: 'Medical history' },
  { value: 'consent', label: 'Consent' },
] as const

export function visitTone(status: string | null | undefined): 'ok' | 'info' | 'warn' | 'idle' {
  return VISIT_STATUSES.find((s) => s.value === status)?.tone ?? 'idle'
}

export function visitStatusLabel(status: string | null | undefined) {
  return VISIT_STATUSES.find((s) => s.value === status)?.label ?? 'Unknown'
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

export function formatCents(cents: number | null | undefined) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(cents || 0) / 100)
}

export type VisitTypeRow = {
  id: string
  name: string | null
  slug: string | null
  status: string | null
  durationMinutes: number | null
  bufferBeforeMinutes: number | null
  bufferAfterMinutes: number | null
  priceCents: number | null
  formattedPrice: string | null
  providersCount: number | null
  upcomingCount: number | null
}

export type VisitAppointment = {
  id: string
  appointmentNumber: string | null
  status: string | null
  startsAt: string
  provider: { id: string; displayName: string | null } | null
  facility: { id: string; name: string | null; timeZone: string | null } | null
}

export type VisitTypeDetail = VisitTypeRow & {
  description: string | null
  intakeRequirements: unknown
  providers: Array<{ id: string; displayName: string | null; specialty: string | null; status: string | null }> | null
  upcoming: VisitAppointment[] | null
  recent: VisitAppointment[] | null
}

export type VisitTypeInput = {
  name: string
  slug: string
  description: string
  durationMinutes: number
  bufferBeforeMinutes: number
  bufferAfterMinutes: number
  priceCents: number
  intakeSections: string[]
  status: string
  providerIds: string[]
}

export type VisitTypeResult<T = undefined> = { success: true; data?: T } | { success: false; error: string }

export function validateVisitType(input: Partial<VisitTypeInput>, partial: boolean): Partial<Record<keyof VisitTypeInput, string>> {
  const errors: Partial<Record<keyof VisitTypeInput, string>> = {}
  const has = (key: keyof VisitTypeInput) => !partial || input[key] !== undefined
  if (has('name') && !input.name?.trim()) errors.name = 'Required'
  if (has('name') && (input.name?.length ?? 0) > 200) errors.name = 'Too long'
  if (has('slug')) {
    if (!input.slug?.trim()) errors.slug = 'Required'
    else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug)) errors.slug = 'Lowercase letters, numbers, hyphens'
    else if (input.slug.length > 80) errors.slug = 'Too long'
  }
  if ((input.description?.length ?? 0) > 5000) errors.description = 'Too long'
  const int = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max
  if (has('durationMinutes') && !int(input.durationMinutes, 5, 480)) errors.durationMinutes = '5–480'
  if (has('bufferBeforeMinutes') && !int(input.bufferBeforeMinutes, 0, 240)) errors.bufferBeforeMinutes = '0–240'
  if (has('bufferAfterMinutes') && !int(input.bufferAfterMinutes, 0, 240)) errors.bufferAfterMinutes = '0–240'
  if (has('priceCents') && !int(input.priceCents, 0, 100_000_000)) errors.priceCents = 'Invalid amount'
  if (has('status') && !VISIT_STATUSES.some((s) => s.value === input.status)) errors.status = 'Invalid'
  return errors
}
