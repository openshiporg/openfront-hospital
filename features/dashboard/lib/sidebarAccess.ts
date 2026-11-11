/**
 * Sidebar filtering from capabilities the session already has: the role's
 * canAccessDashboard flag and Keystone's per-session list `isHidden` from admin meta.
 * Plain module: no 'use server' / 'use client', no @/ imports.
 */

type SidebarList = { path: string; isHidden?: boolean | null }
type SidebarRole = { canAccessDashboard?: boolean | null } & Record<string, boolean | null | undefined>
type SidebarUser = { role?: SidebarRole | null } | null | undefined

/**
 * Platform pages whose screens answer only "unavailable for this role" without one of these permissions
 * (any one is enough). The global clinical administrator always passes. Pages not listed stay visible.
 */
export const PLATFORM_PAGE_PERMISSIONS: Record<string, string[]> = {
  appointments: ['canManageAppointments', 'canManagePatients'],
  'care-queue': ['canManageAppointments', 'canManagePatients'],
  encounters: ['canManagePatients'],
  inpatient: ['canManagePatients'],
  'clinical-operations': ['canManagePatients'],
  'clinical-fulfillment': ['canManagePatients'],
  claims: ['canManageBilling'],
  'operational-fabric': ['canManageBilling', 'canManageInventory', 'canManageIntegrations', 'canManageCommunications', 'canManageDataPortability', 'canManageRetention', 'canManagePatients', 'canManageIntake'],
  registration: ['canManagePatients'],
  patients: ['canManagePatients', 'canManageAppointments', 'canManageIntake', 'canManageCommunications', 'canManageBilling', 'canManageDataPortability', 'canManageRetention'],
  providers: ['canManageProviders'],
  schedules: ['canManageScheduling', 'canManageAppointments'],
  intake: ['canManageIntake'],
  communications: ['canManageCommunications'],
  audit: ['canViewReports'],
  reports: ['canViewReports'],
  'store-settings': ['canManageOnboarding'],
}

/** An unknown role is left to the middleware; a known role must hold one of the page's permissions. */
export function canUsePlatformPage(slug: string, user: SidebarUser) {
  const needed = PLATFORM_PAGE_PERMISSIONS[slug]
  if (!needed || !user?.role) return true
  if (user.role.canAccessAllClinicalData === true) return true
  return needed.some((permission) => user.role?.[permission] === true)
}

/** Only an explicit false hides navigation; an unknown user is left to the middleware. */
export function canUseDashboardNav(user: SidebarUser) {
  return user?.role?.canAccessDashboard !== false
}

export function visibleSidebarLists<T extends SidebarList>(lists: T[], user: SidebarUser): T[] {
  if (!canUseDashboardNav(user)) return []
  return lists.filter((list) => !list.isHidden)
}

/**
 * A platform page whose first segment is a list path follows that list's visibility;
 * pages that are not tied to one list stay visible to dashboard users.
 */
export function visiblePlatformItems<T extends { href: string }>(
  items: T[],
  lists: SidebarList[],
  user: SidebarUser
): T[] {
  if (!canUseDashboardNav(user)) return []
  const hiddenPaths = new Set(lists.filter((list) => list.isHidden).map((list) => list.path))
  return items.filter((item) => {
    const slug = item.href.split('/platform/')[1]?.split(/[/?#]/)[0]
    return !slug || (!hiddenPaths.has(slug) && canUsePlatformPage(slug, user))
  })
}
