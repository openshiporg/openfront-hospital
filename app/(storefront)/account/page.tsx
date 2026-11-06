import { AccountPage } from '@/features/storefront/screens/account/AccountPage'
import { StorefrontShell } from '@/features/storefront/components/StorefrontShell'
import { myAppointmentsAction } from '@/features/storefront/actions/account'
import { getHospitalBranding } from '@/features/storefront/lib/data/branding'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Your account' }

export default async function PatientAccountRoute({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const [profile, data, params] = await Promise.all([getHospitalBranding(), myAppointmentsAction(), searchParams])
  return <StorefrontShell profile={profile} current="account" bookingBar={false}><AccountPage data={data} next={params.next || '/account'} /></StorefrontShell>
}
