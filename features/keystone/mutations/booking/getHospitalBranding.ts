import { sanitizeStoreLogoSvg } from '../../utils/storeLogo'
import { DEFAULT_STORE_LOGO_ICON, normalizeStoreLogoColor } from '../../../platform/store-settings/lib/store-logo'
import { narrativeText } from '../../../lib/narrativeText'
import type { Context } from '.keystone/types'
import { normalizeHospitalBrandTheme } from '../../../lib/hospitalBrandTheme'

function bounded(value: unknown, maximum: number) {
  const text = String(value || '').trim()
  return text && text.length <= maximum && !/[\u0000-\u001f\u007f]/.test(text) ? text : ''
}

function publicMedia(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([, path]) => typeof path === 'string' && path.startsWith('/images/') && !path.includes('..'))
    .slice(0, 20))
}

export default async function getHospitalBranding(_root: unknown, _args: unknown, context: Context) {
  const prisma = context.sudo().prisma as any
  const profile = await prisma.hospitalProfile.findFirst({
    where: { profileKey: 'primary', status: 'active' },
    select: {
      name: true,
      shortName: true,
      brandTheme: true,
      logoIcon: true,
      logoColor: true,
      market: true,
      description: true,
      locationName: true,
      serviceArea: true,
      addressLine1: true,
      city: true,
      region: true,
      postalCode: true,
      supportPhone: true,
      supportEmail: true,
      media: true,
    },
  })
  if (!profile) return null
  return {
    name: bounded(profile.name, 200),
    shortName: bounded(profile.shortName, 80),
    brandTheme: normalizeHospitalBrandTheme(profile.brandTheme),
    logoIcon: sanitizeStoreLogoSvg(profile.logoIcon || '') || DEFAULT_STORE_LOGO_ICON,
    logoColor: profile.logoColor == null ? ({ evergreen: '275', navy: '335', plum: '75' }[normalizeHospitalBrandTheme(profile.brandTheme)]) : normalizeStoreLogoColor(profile.logoColor),
    market: bounded(profile.market, 300),
    description: (() => { try { return narrativeText(profile.description, 'Public summary', 8_000) } catch { return '' } })(),
    locationName: bounded(profile.locationName, 300),
    serviceArea: bounded(profile.serviceArea, 500),
    addressLine1: bounded(profile.addressLine1, 300),
    city: bounded(profile.city, 150),
    region: bounded(profile.region, 150),
    postalCode: bounded(profile.postalCode, 40),
    supportPhone: bounded(profile.supportPhone, 40),
    supportEmail: bounded(profile.supportEmail, 254),
    media: publicMedia(profile.media),
  }
}
