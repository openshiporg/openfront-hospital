import { DEFAULT_STORE_LOGO_ICON } from '@/features/platform/store-settings/lib/store-logo'
import type { HospitalBrandTheme } from '@/features/lib/hospitalBrandTheme'

/** Generic public fallback used before persisted onboarding exists; contains no patient data. */
export type PublicHospitalBranding = {
  name: string
  shortName: string
  logoIcon: string
  logoColor: string
  brandTheme: HospitalBrandTheme
  market: string
  locationName: string
  addressLine1: string
  city: string
  region: string
  postalCode: string
  serviceArea: string
  supportPhone: string
  supportPhoneHref: string
  supportEmail: string
  supportEmailHref: string
  description: string
  media: { hero: string; primaryCare: string; behavioralHealth: string; telehealth: string; clinic: string }
}

export const practiceProfile: PublicHospitalBranding = {
  name: 'Hospital patient services',
  shortName: 'Hospital',
  brandTheme: 'evergreen',
  logoIcon: DEFAULT_STORE_LOGO_ICON,
  logoColor: '275',
  market: 'Patient registration and scheduling',
  locationName: 'Facility details pending setup',
  addressLine1: '',
  city: '',
  region: '',
  postalCode: '',
  serviceArea: 'Service area not configured',
  supportPhone: '',
  supportPhoneHref: '',
  supportEmail: '',
  supportEmailHref: '',
  description: 'Request an appointment and complete one-time pre-visit intake.',
  media: {
    hero: '/images/hero/family-consultation.jpg',
    primaryCare: '/images/care/primary-care-consultation.jpg',
    behavioralHealth: '/images/care/behavioral-health-session.jpg',
    telehealth: '/images/care/telehealth-consultation.jpg',
    clinic: '/images/care/primary-care-consultation.jpg',
  },
}
