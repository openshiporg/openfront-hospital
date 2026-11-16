import type { Metadata } from 'next'
import { Inter, Plus_Jakarta_Sans } from 'next/font/google'
import { getHospitalBranding } from '@/features/storefront/lib/data/branding'
import { practiceProfile } from '@/features/storefront/lib/practice'
import '@/features/storefront/design/leaflet.css'

const display = Plus_Jakarta_Sans({ variable: '--font-jakarta', subsets: ['latin'], weight: ['500', '700', '800'] })
const body = Inter({ variable: '--font-inter', subsets: ['latin'], weight: ['400', '500', '700'] })
export const dynamic = 'force-dynamic'
export async function generateMetadata(): Promise<Metadata> {
  const profile = await getHospitalBranding().catch(() => practiceProfile)
  return {
    title: { default: profile.name, template: `%s | ${profile.name}` },
    description: profile.description,
    applicationName: profile.name,
    openGraph: { type: 'website', siteName: profile.name, title: profile.name, description: profile.description },
  }
}
export default function StorefrontLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${display.variable} ${body.variable}`}>{children}</div>
}
