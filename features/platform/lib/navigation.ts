import {
  BarChart3,
  Cable,
  CalendarDays,
  ClipboardList,
  MessageSquare,
  Palette,
  Stethoscope,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react'

export interface PlatformNavItem {
  title: string
  href: string
  color: string
  description: string
  icon: LucideIcon
  group?: string
}

export interface PlatformNavGroup {
  id: string
  title: string
  icon: LucideIcon
  items: PlatformNavItem[]
}

// Practice operations, in sidebar order. Visibility is presentation only: each screen and the
// Keystone list/field access rules enforce the operator's clinical, billing, and reporting scopes.
export const platformNavItems: PlatformNavItem[] = [
  { title: 'Appointments', href: '/platform/appointments', color: 'blue', description: 'Review appointment requests and status, check in, and close patient appointments.', icon: CalendarDays, group: 'standalone' },
  { title: 'Care queue', href: '/platform/care-queue', color: 'cyan', description: 'Work the follow-up and care tasks waiting on the team.', icon: ClipboardList, group: 'standalone' },
  { title: 'Encounters', href: '/platform/encounters', color: 'teal', description: 'Track encounter progress from arrival to operational closure.', icon: Stethoscope, group: 'standalone' },
  { title: 'Inpatient operations', href: '/platform/inpatient', color: 'indigo', description: 'Manage admissions, beds, transfers, and discharges.', icon: Stethoscope, group: 'standalone' },
  { title: 'Clinical overview', href: '/platform/clinical-operations', color: 'sky', description: 'See clinical workload and operational status across facilities.', icon: ClipboardList, group: 'standalone' },
  { title: 'Clinical fulfillment', href: '/platform/clinical-fulfillment', color: 'emerald', description: 'Follow orders, results, and referrals through fulfillment.', icon: ClipboardList, group: 'standalone' },
  { title: 'Claims operations', href: '/platform/claims', color: 'amber', description: 'Prepare, submit, and reconcile insurance claims.', icon: BarChart3, group: 'standalone' },
  { title: 'Operational fabric', href: '/platform/operational-fabric', color: 'slate', description: 'Billing, inventory, integrations, communications, portability, and retention.', icon: Cable, group: 'standalone' },
  { title: 'Registration', href: '/platform/registration', color: 'green', description: 'Register patients and resolve duplicate records.', icon: UserPlus, group: 'standalone' },
  { title: 'Patients', href: '/platform/patients', color: 'purple', description: 'Search and manage accessible patient records.', icon: Users, group: 'standalone' },
  { title: 'Provider schedules', href: '/platform/schedules', color: 'violet', description: 'Set provider availability, visit types, and schedule blocks.', icon: Stethoscope, group: 'standalone' },
  { title: 'Intake queue', href: '/platform/intake', color: 'orange', description: 'Review submitted intake forms and route them to care.', icon: ClipboardList, group: 'standalone' },
  { title: 'Communications', href: '/platform/communications', color: 'pink', description: 'Send and track patient messages and reminders.', icon: MessageSquare, group: 'standalone' },
  { title: 'Storefront settings', href: '/platform/store-settings', color: 'rose', description: 'Configure the public practice site and booking branding.', icon: Palette, group: 'standalone' },
  { title: 'Reports', href: '/platform/reports', color: 'indigo', description: 'Operational reports across appointments, patients, intake, and inventory.', icon: BarChart3, group: 'standalone' },
]

export const platformStandaloneItems = platformNavItems.filter((item) => item.group === 'standalone')

export const platformNavGroups: PlatformNavGroup[] = []

export function getPlatformNavItemsWithBasePath(basePath: string) {
  return platformNavItems.map((item) => ({
    ...item,
    href: `${basePath}${item.href}`,
  }))
}
