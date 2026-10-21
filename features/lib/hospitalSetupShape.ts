/** Shared preview/backend shape gate; this never certifies clinical facts or consent. */
const sections = ['departments', 'facilities', 'providers', 'clinicians', 'appointmentTypes', 'scheduleBlocks', 'patients', 'appointments', 'intakeForms', 'messages'] as const
function record(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value) }
export function validateSetupShape(value: unknown): string | null {
  if (!record(value) || !record(value.practiceInfo)) return 'practiceInfo must be an object.'
  try { if (new TextEncoder().encode(JSON.stringify(value)).length > 500_000) return 'Configuration exceeds 500,000 bytes.' } catch { return 'Configuration must be JSON.' }
  const numeric = new Set(['dayOffset', 'startHour', 'endHour', 'startMinute', 'endMinute', 'durationMinutes', 'bufferBeforeMinutes', 'bufferAfterMinutes', 'priceCents', 'maxAppointments'])
  const lists = new Set(['departmentCodes', 'providerKeys', 'providerLastNames', 'facilitySlugs'])
  const objects = new Set(['media', 'insuranceSummary', 'formSchema', 'intakeRequirements'])
  const typedRecord = (row: Record<string, unknown>, path: string): string | null => {
    for (const [field, item] of Object.entries(row)) {
      if (item === undefined || item === null) continue
      if (numeric.has(field)) { if (typeof item !== 'number' || !Number.isSafeInteger(item)) return `${path}.${field} must be an integer.` }
      else if (field === 'active') { if (typeof item !== 'boolean') return `${path}.${field} must be a boolean.` }
      else if (lists.has(field)) { if (!Array.isArray(item) || item.some(entry => typeof entry !== 'string')) return `${path}.${field} must be a list of strings.` }
      else if (objects.has(field)) { if (!record(item)) return `${path}.${field} must be an object.` }
      else if (typeof item !== 'string') return `${path}.${field} must be text.`
    }
    return null
  }
  const profileError = typedRecord(value.practiceInfo, 'practiceInfo')
  if (profileError) return profileError
  for (const section of sections) {
    const rows = value[section]
    if (!Array.isArray(rows) || rows.length > 100) return `${section} must be an array with at most 100 entries.`
    for (let index = 0; index < rows.length; index++) {
      if (!record(rows[index])) return `${section}[${index}] must be an object.`
      const error = typedRecord(rows[index], `${section}[${index}]`)
      if (error) return error
    }
  }
  const walk = (item: unknown, path: string, depth: number): string | null => {
    if (depth > 8) return `${path} is too deeply nested.`
    if (typeof item === 'string' && (item.length > 50_000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(item))) return `${path} contains invalid text.`
    if (typeof item === 'number' && !Number.isFinite(item)) return `${path} must be finite.`
    if (Array.isArray(item)) {
      if (item.length > 100) return `${path} has too many entries.`
      for (let i = 0; i < item.length; i++) { const error = walk(item[i], `${path}[${i}]`, depth + 1); if (error) return error }
    } else if (record(item)) {
      for (const [key, nested] of Object.entries(item)) { const error = walk(nested, `${path}.${key}`, depth + 1); if (error) return error }
    }
    return null
  }
  return walk(value, 'configuration', 0)
}
