export const HOSPITAL_BRAND_THEMES = ['evergreen', 'navy', 'plum'] as const

export type HospitalBrandTheme = (typeof HOSPITAL_BRAND_THEMES)[number]

export const DEFAULT_HOSPITAL_BRAND_THEME: HospitalBrandTheme = 'evergreen'

export const HOSPITAL_BRAND_THEME_OPTIONS: ReadonlyArray<{
  label: string
  value: HospitalBrandTheme
  swatch: string
}> = [
  { label: 'Evergreen', value: 'evergreen', swatch: '#155c4d' },
  { label: 'Navy', value: 'navy', swatch: '#24527a' },
  { label: 'Plum', value: 'plum', swatch: '#6d3f65' },
]

export function isHospitalBrandTheme(value: unknown): value is HospitalBrandTheme {
  return typeof value === 'string' && HOSPITAL_BRAND_THEMES.includes(value as HospitalBrandTheme)
}

export function normalizeHospitalBrandTheme(value: unknown): HospitalBrandTheme {
  return isHospitalBrandTheme(value) ? value : DEFAULT_HOSPITAL_BRAND_THEME
}
