import { IntakeLinkPage } from '@/features/storefront/screens/intake/IntakeLinkPage'
import { getHospitalBranding } from '@/features/storefront/lib/data/branding'

export default async function IntakePage() {
  return <IntakeLinkPage profile={await getHospitalBranding()} />
}
