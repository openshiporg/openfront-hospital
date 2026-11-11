import { gatePlatformPage } from '@/features/dashboard/lib/platformGate'
import { AuditPage } from '@/features/platform/audit/screens/AuditPage'

export const dynamic = 'force-dynamic'

export default gatePlatformPage('audit', AuditPage)
