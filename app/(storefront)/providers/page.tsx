import type { Metadata } from 'next'
import { ProvidersPage } from '@/features/storefront/screens/providers/ProvidersPage'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Care team',
  description: 'Meet active clinicians currently accepting online visit requests.',
}

export default ProvidersPage
