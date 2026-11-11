import { gatePlatformPage } from '@/features/dashboard/lib/platformGate'
import { PatientListPage } from '@/features/platform/patients/screens/PatientListPage'

export default gatePlatformPage('patients', PatientListPage)
