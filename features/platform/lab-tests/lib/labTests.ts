/** Lab test catalog types, filters and validation shared by the screen and server actions. */

export type LabTestRecord = {
  id: string
  code?: string | null
  name: string
  category?: string | null
  specimenType?: string | null
  turnaroundHours?: number | null
  active?: boolean | null
}

export type LabTestFilters = { search: string; status: 'active' | 'inactive' | 'all'; category: string }

export type LabTestFieldErrors = Record<string, string>
export type LabTestMutationResult = { success: true } | { success: false; error: string; fieldErrors?: LabTestFieldErrors }

export function normalizeLabTestFilters(input: Record<string, string | string[] | undefined>): LabTestFilters {
  const value = (key: string) => (typeof input[key] === 'string' ? (input[key] as string).trim() : '')
  const status = value('status')
  return {
    search: value('search').slice(0, 80),
    status: status === 'inactive' || status === 'all' ? status : 'active',
    category: value('category').slice(0, 80),
  }
}

export function validateLabTest(input: Record<string, string>) {
  const fieldErrors: LabTestFieldErrors = {}
  const text = (key: string) => String(input[key] ?? '').trim()
  const name = text('name')
  const code = text('code').toUpperCase()
  const category = text('category')
  const specimenType = text('specimenType')
  const turnaroundRaw = text('turnaroundHours')
  const turnaroundHours = turnaroundRaw === '' ? null : Number(turnaroundRaw)
  if (!name) fieldErrors.name = 'Required'
  else if (name.length > 160) fieldErrors.name = 'Max 160 characters'
  if (!code) fieldErrors.code = 'Required'
  else if (!/^[A-Z0-9._-]{1,32}$/.test(code)) fieldErrors.code = 'Letters, numbers, . - _ (max 32)'
  if (category.length > 80) fieldErrors.category = 'Max 80 characters'
  if (specimenType.length > 80) fieldErrors.specimenType = 'Max 80 characters'
  if (turnaroundHours !== null && (!Number.isInteger(turnaroundHours) || turnaroundHours < 0 || turnaroundHours > 8760)) {
    fieldErrors.turnaroundHours = 'Whole hours, 0 or more'
  }
  return {
    fieldErrors,
    data: {
      name,
      code,
      category: category || null,
      specimenType: specimenType || null,
      turnaroundHours,
      active: input.active !== 'false',
    },
  }
}
