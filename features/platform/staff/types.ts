export const PERMISSION_GROUPS = [
  {
    key: 'scheduling',
    label: 'Scheduling',
    flags: [
      { key: 'canManageAppointments', label: 'Manage appointments' },
      { key: 'canManageScheduling', label: 'Manage schedules' },
    ],
  },
  {
    key: 'patients',
    label: 'Patients',
    flags: [
      { key: 'canManagePatients', label: 'Manage patients' },
      { key: 'canManageIntake', label: 'Manage intake' },
      { key: 'canManageCommunications', label: 'Manage communications' },
    ],
  },
  {
    key: 'clinical',
    label: 'Clinical',
    flags: [
      { key: 'canManageProviders', label: 'Manage providers' },
      { key: 'canAccessAllClinicalData', label: 'All clinical data (global)' },
    ],
  },
  {
    key: 'billing',
    label: 'Billing',
    flags: [
      { key: 'canManageBilling', label: 'Manage billing' },
      { key: 'canManageInventory', label: 'Manage inventory' },
    ],
  },
  {
    key: 'operations',
    label: 'Operations',
    flags: [
      { key: 'canViewReports', label: 'View reports and audit' },
      { key: 'canManageIntegrations', label: 'Manage integrations' },
      { key: 'canManageDataPortability', label: 'Manage data exports' },
      { key: 'canManageRetention', label: 'Manage retention' },
      { key: 'canManageOnboarding', label: 'Manage onboarding' },
    ],
  },
  {
    key: 'administration',
    label: 'Administration',
    flags: [
      { key: 'canAccessDashboard', label: 'Access dashboard' },
      { key: 'canSeeOtherPeople', label: 'See other people' },
      { key: 'canEditOtherPeople', label: 'Edit other people' },
      { key: 'canManagePeople', label: 'Manage people' },
      { key: 'canManageRoles', label: 'Manage roles' },
    ],
  },
] as const

export type PermissionFlag = (typeof PERMISSION_GROUPS)[number]['flags'][number]['key']

export const PERMISSION_FLAGS: PermissionFlag[] = PERMISSION_GROUPS.flatMap(group => group.flags.map(flag => flag.key))

/** Flags that only a global clinical-data role may set (Role.canAccessAllClinicalData field access). */
export const GLOBAL_ONLY_FLAGS: PermissionFlag[] = ['canAccessAllClinicalData']

export type RoleFlags = Partial<Record<PermissionFlag, boolean | null>>

export type StaffRole = RoleFlags & {
  id: string
  name?: string | null
  assignedToCount?: number | null
}

export type StaffUser = {
  id: string
  name?: string | null
  email?: string | null
  onboardingStatus?: string | null
  role?: { id: string; name?: string | null; canAccessAllClinicalData?: boolean | null } | null
  facilities?: Array<{ id: string; name?: string | null }> | null
  facilitiesCount?: number | null
}

export type StaffViewer = {
  id: string
  role: RoleFlags | null
}

export type FacilityOption = { id: string; name?: string | null }

export type StaffUserInput = {
  name?: string
  email?: string
  password?: string
  roleId?: string | null
  facilityIds?: string[]
}

export type RoleInput = {
  name: string
  flags: RoleFlags
}

export const PASSWORD_MIN_LENGTH = 16
export const PASSWORD_MAX_LENGTH = 200
