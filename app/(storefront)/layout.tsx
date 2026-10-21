import type { Metadata } from 'next'
import { DM_Sans, Fraunces } from 'next/font/google'
import { getHospitalBranding } from '@/features/storefront/lib/data/branding'
import { practiceProfile } from '@/features/storefront/lib/practice'
import '@/features/storefront/design/storefront.css'

const heading = Fraunces({ variable: '--font-fraunces', subsets: ['latin'], axes: ['SOFT', 'WONK', 'opsz'] })
const body = DM_Sans({ variable: '--font-dm-sans', subsets: ['latin'] })
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
  return <div className={`${heading.variable} ${body.variable}`}>{children}</div>
}
