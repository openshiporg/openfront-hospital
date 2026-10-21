'use server'

import { sanitizeStoreLogoSvg } from '@/features/keystone/utils/storeLogo'
import { DEFAULT_STORE_LOGO_ICON, normalizeStoreLogoColor } from '../lib/store-logo'
import { revalidatePath } from 'next/cache'

import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import {
  parseHospitalStorefrontSettingsInput,
  type HospitalStorefrontSettingsInput,
  type HospitalStorefrontSettingsRecord,
} from '@/features/platform/store-settings/lib/storefrontSettings'

export type HospitalStorefrontSettingsAccess = {
  authenticatedItem: {
    id: string
    role?: { canManageOnboarding?: boolean | null } | null
  } | null
  hospitalProfiles: Array<HospitalStorefrontSettingsRecord & { id: string; status: string }>
}

export async function getHospitalStorefrontSettings() {
  const response = await keystoneClient<HospitalStorefrontSettingsAccess>(`
    query HospitalStorefrontSettings {
      authenticatedItem {
        ... on User {
          id
          role { canManageOnboarding }
        }
      }
      hospitalProfiles(
        where: { profileKey: { equals: "primary" } }
        take: 1
      ) {
        id
        status
        name
        shortName
        description
        locationName
        serviceArea
        addressLine1
        city
        region
        postalCode
        supportPhone
        supportEmail
        brandTheme
        logoIcon
        logoColor
      }
    }
  `)
  if (!response.success) return response
  return { ...response, data: { ...response.data, hospitalProfiles: response.data.hospitalProfiles.map(profile => ({ ...profile, logoIcon: sanitizeStoreLogoSvg(profile.logoIcon || '') || DEFAULT_STORE_LOGO_ICON, logoColor: profile.logoColor == null ? ({ evergreen: '275', navy: '335', plum: '75' }[profile.brandTheme] || '0') : normalizeStoreLogoColor(profile.logoColor) })) } }
}

export async function saveHospitalStorefrontSettings(input: HospitalStorefrontSettingsInput) {
  const parsed = parseHospitalStorefrontSettingsInput(input)
  if (!parsed.success) return parsed
  const safeLogo = sanitizeStoreLogoSvg(parsed.data.logoIcon)
  if (!safeLogo) return { success: false as const, error: 'Logo must be a valid, safe SVG document.' }
  parsed.data.logoIcon = safeLogo

  const current = await getHospitalStorefrontSettings()
  if (!current.success) return { success: false as const, error: 'Storefront settings could not be loaded.' }
  if (current.data.authenticatedItem?.role?.canManageOnboarding !== true) {
    return { success: false as const, error: 'Storefront settings authority is required.' }
  }

  const profile = current.data.hospitalProfiles[0]
  const mutation = profile?.id
    ? `
      mutation UpdateHospitalStorefrontSettings($id: ID!, $data: HospitalProfileUpdateInput!) {
        updateHospitalProfile(where: { id: $id }, data: $data) { id brandTheme updatedAt }
      }
    `
    : `
      mutation CreateHospitalStorefrontSettings($data: HospitalProfileCreateInput!) {
        createHospitalProfile(data: $data) { id brandTheme updatedAt }
      }
    `

  const data = profile?.id
    ? parsed.data
    : { ...parsed.data, profileKey: 'primary', status: 'active' }
  const response = await keystoneClient(mutation, profile?.id ? { id: profile.id, data } : { data })
  if (!response.success) return { success: false as const, error: 'Storefront settings could not be saved.' }

  revalidatePath('/', 'layout')
  revalidatePath('/dashboard/platform/store-settings')
  return { success: true as const, data: parsed.data }
}
