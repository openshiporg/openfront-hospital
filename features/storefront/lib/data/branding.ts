import { publicPhoneHref } from '@/features/lib/publicPhone'
import { cache } from 'react'

import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import { cachedPublicRead, publicReadOrThrow } from '@/features/storefront/lib/data/public-read-cache'
import { practiceProfile, type PublicHospitalBranding } from '@/features/storefront/lib/practice'

export type HospitalBranding = PublicHospitalBranding

export const getHospitalBranding = cache(async (): Promise<HospitalBranding> => {
  const response = await cachedPublicRead('hospitalBranding', () => keystoneClient<{ hospitalBranding: Omit<HospitalBranding, 'supportPhoneHref' | 'supportEmailHref'> | null }>(`
    query HospitalBranding {
      hospitalBranding {
        name shortName brandTheme logoIcon logoColor market description locationName serviceArea addressLine1 city region postalCode
        supportPhone supportEmail media
      }
    }
  `).then(publicReadOrThrow))
  if (!response.success) throw new Error('Public hospital branding is unavailable')
  const profile = response.data.hospitalBranding
  if (!profile?.name || !profile.shortName) return practiceProfile
  const supportPhone = profile.supportPhone || practiceProfile.supportPhone
  const supportEmail = profile.supportEmail || practiceProfile.supportEmail
  return {
    ...practiceProfile,
    ...profile,
    supportPhone,
    supportEmail,
    supportPhoneHref: publicPhoneHref(supportPhone),
    supportEmailHref: supportEmail ? `mailto:${supportEmail}` : '',
    media: { ...practiceProfile.media, ...(profile.media || {}) },
  }
})
