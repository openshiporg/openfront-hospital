import { Suspense } from 'react'
import { PayBillPage } from '@/features/storefront/screens/pay/PayBillPage'
import { StorefrontShell } from '@/features/storefront/components/StorefrontShell'
import { getHospitalBranding } from '@/features/storefront/lib/data/branding'

export default async function PayPage() {
  const profile = await getHospitalBranding()
  return <StorefrontShell profile={profile} bookingBar={false}><Suspense><PayBillPage /></Suspense></StorefrontShell>
}
