import { gatePlatformPage } from '@/features/dashboard/lib/platformGate'
import { ProviderListPage } from '@/features/platform/providers/screens/ProviderListPage'

export const dynamic = 'force-dynamic'

export default gatePlatformPage('providers', ProviderListPage)
