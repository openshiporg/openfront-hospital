export const departmentStatusOptions = [
  { label: 'Active', value: 'active' },
  { label: 'Closed', value: 'closed' },
]
export function parseDepartmentStatus(value: unknown): 'active' | 'closed' {
  if (value === undefined) return 'active'
  if (value === 'active' || value === 'closed') return value
  throw new Error('Department status must be active or closed')
}
