import type { Metadata } from 'next'
import { Atkinson_Hyperlegible, JetBrains_Mono, Newsreader } from 'next/font/google'
import { getHospitalBranding } from '@/features/storefront/lib/data/branding'
import { practiceProfile } from '@/features/storefront/lib/practice'
import '@/features/storefront/design/storefront.css'

const display = Newsreader({ variable: '--font-newsreader', subsets: ['latin'], axes: ['opsz'] })
const body = Atkinson_Hyperlegible({ variable: '--font-atkinson', subsets: ['latin'], weight: ['400', '700'] })
const mono = JetBrains_Mono({ variable: '--font-jetbrains', subsets: ['latin'] })
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
  return <div className={`${display.variable} ${body.variable} ${mono.variable}`}>{children}</div>
}
