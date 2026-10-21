import { publicPhoneHref } from '@/features/lib/publicPhone'
import { DEFAULT_STORE_LOGO_ICON, DEFAULT_STORE_LOGO_COLOR, normalizeStoreLogoColor } from './store-logo'
import {
  DEFAULT_HOSPITAL_BRAND_THEME,
  isHospitalBrandTheme,
  type HospitalBrandTheme,
} from '@/features/lib/hospitalBrandTheme'

export type HospitalStorefrontSettingsInput = {
  name: string
  shortName: string
  description: string
  locationName: string
  serviceArea: string
  addressLine1: string
  city: string
  region: string
  postalCode: string
  supportPhone: string
  supportEmail: string
  logoIcon: string
  logoColor: string
  brandTheme: HospitalBrandTheme
}

export type HospitalStorefrontSettingsRecord = HospitalStorefrontSettingsInput & {
  id?: string
}

const limits: Record<Exclude<keyof HospitalStorefrontSettingsInput, 'brandTheme' | 'logoIcon' | 'logoColor'>, number> = {
  name: 200,
  shortName: 80,
  description: 2_000,
  locationName: 300,
  serviceArea: 500,
  addressLine1: 300,
  city: 150,
  region: 150,
  postalCode: 40,
  supportPhone: 40,
  supportEmail: 254,
}

const labels: Record<Exclude<keyof HospitalStorefrontSettingsInput, 'brandTheme' | 'logoIcon' | 'logoColor'>, string> = {
  name: 'Organization name',
  shortName: 'Short name',
  description: 'Public summary',
  locationName: 'Primary location',
  serviceArea: 'Service area',
  addressLine1: 'Street address',
  city: 'City',
  region: 'Region',
  postalCode: 'Postal code',
  supportPhone: 'Scheduling phone',
  supportEmail: 'Scheduling email',
}

const textKeys = Object.keys(limits) as Array<Exclude<keyof HospitalStorefrontSettingsInput, 'brandTheme' | 'logoIcon' | 'logoColor'>>
const controlCharacters = /[\u0000-\u001f\u007f]/

export function emptyHospitalStorefrontSettings(): HospitalStorefrontSettingsInput {
  return {
    name: '',
    shortName: '',
    description: '',
    locationName: '',
    serviceArea: '',
    addressLine1: '',
    city: '',
    region: '',
    postalCode: '',
    supportPhone: '',
    supportEmail: '',
    logoIcon: DEFAULT_STORE_LOGO_ICON,
    logoColor: DEFAULT_STORE_LOGO_COLOR,
    brandTheme: DEFAULT_HOSPITAL_BRAND_THEME,
  }
}

export function parseHospitalStorefrontSettingsInput(input: unknown):
  | { success: true; data: HospitalStorefrontSettingsInput }
  | { success: false; error: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { success: false, error: 'Storefront settings are invalid.' }
  }

  const source = input as Record<string, unknown>
  const data = emptyHospitalStorefrontSettings()

  for (const key of textKeys) {
    if (typeof source[key] !== 'string') return { success: false, error: `${labels[key]} is invalid.` }
    const value = source[key].replace(/\r\n?/g, '\n').trim()
    const invalidControls = key === 'description' ? /[\u0000-\u0009\u000b-\u001f\u007f]/ : controlCharacters
    if (invalidControls.test(value)) return { success: false, error: `${labels[key]} contains unsupported characters.` }
    if (value.length > limits[key]) return { success: false, error: `${labels[key]} is too long.` }
    data[key] = value
  }

  if (!data.name) return { success: false, error: 'Organization name is required.' }
  if (!data.shortName) return { success: false, error: 'Short name is required.' }
  if (data.supportEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.supportEmail)) {
    return { success: false, error: 'Scheduling email is invalid.' }
  }
  if (data.supportPhone && !publicPhoneHref(data.supportPhone)) return { success: false, error: 'Scheduling phone must contain a dialable number, optionally followed by an extension.' }
  if (!isHospitalBrandTheme(source.brandTheme)) {
    return { success: false, error: 'Brand theme must be selected from the approved themes.' }
  }

  if (source.logoIcon !== undefined && (typeof source.logoIcon !== 'string' || source.logoIcon.length > 100_000)) return { success: false, error: 'Logo is invalid.' }
  data.logoIcon = typeof source.logoIcon === 'string' && source.logoIcon.trim() ? source.logoIcon : DEFAULT_STORE_LOGO_ICON
  data.logoColor = normalizeStoreLogoColor(source.logoColor)
  data.supportEmail = data.supportEmail.toLowerCase()
  data.brandTheme = source.brandTheme
  return { success: true, data }
}
