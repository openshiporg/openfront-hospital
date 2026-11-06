import { ConfirmEmailPage } from '@/features/storefront/screens/account/ConfirmEmailPage'
import { StorefrontShell } from '@/features/storefront/components/StorefrontShell'
import { getHospitalBranding } from '@/features/storefront/lib/data/branding'

export const metadata = { title: 'Confirm your email' }

export default async function ConfirmEmailRoute() {
  const profile = await getHospitalBranding()
  return <StorefrontShell profile={profile} bookingBar={false}><ConfirmEmailPage /></StorefrontShell>
}
