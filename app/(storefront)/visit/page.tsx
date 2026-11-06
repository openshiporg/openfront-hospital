import { VisitPage } from '@/features/storefront/screens/visit/VisitPage'
import { StorefrontShell } from '@/features/storefront/components/StorefrontShell'
import { getHospitalBranding } from '@/features/storefront/lib/data/branding'

export const metadata = { title: 'Your visit' }

export default async function PatientVisitRoute() {
  const profile = await getHospitalBranding()
  return <StorefrontShell profile={profile} bookingBar={false}><VisitPage /></StorefrontShell>
}
