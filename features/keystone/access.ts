export type Session = {
  itemId: string
  listKey: string
  data: {
    name: string
    role: {
      id: string
      name: string
      canManageAppointments: boolean
      canManageScheduling: boolean
      canManagePatients: boolean
      canManageProviders: boolean
      canManageIntake: boolean
      canManageCommunications: boolean
      canManageBilling: boolean
      canManageInventory: boolean
      canManageIntegrations: boolean
      canManageDataPortability: boolean
      canManageRetention: boolean
      canViewReports: boolean
      canManageOnboarding: boolean
      canSeeOtherPeople: boolean
      canEditOtherPeople: boolean
      canManagePeople: boolean
      canManageRoles: boolean
      canAccessDashboard: boolean
      canAccessAllClinicalData: boolean
    }
  }
}

type AccessArgs = {
  session?: Session
}

type AccessFilter = boolean | Record<string, unknown>
type ScopeBuilder = (userId: string) => Record<string, unknown>[]

const byId = (userId: string) => ({ id: { equals: userId } })
const appointmentBranches = (userId: string, field = 'appointment', includeCareTeamScope = false) => [
  { [field]: { patient: { user: byId(userId) } } },
  ...(includeCareTeamScope
    ? [
        { [field]: { provider: { user: byId(userId) } } },
        { [field]: { facility: { staff: { some: byId(userId) } } } },
      ]
    : []),
]
const encounterBranches = (userId: string, field = 'encounter', includeCareTeamScope = false) => [
  { [field]: { patient: { user: byId(userId) } } },
  ...(includeCareTeamScope
    ? [
        { [field]: { provider: { user: byId(userId) } } },
        { [field]: { facility: { staff: { some: byId(userId) } } } },
        { [field]: { department: { facilities: { some: { staff: { some: byId(userId) } } } } } },
      ]
    : []),
]

export function isSignedIn({ session }: AccessArgs) {
  return Boolean(session)
}

export const denyAccess = () => false

export function hasGlobalClinicalAccess({ session }: AccessArgs) {
  return session?.data.role?.canAccessAllClinicalData ?? false
}

function scoped(args: AccessArgs, buildScope: ScopeBuilder, allowGlobal = true): AccessFilter {
  if (!args.session) return false
  if (allowGlobal && hasGlobalClinicalAccess(args)) return true
  return { OR: buildScope(args.session.itemId) }
}

function rolePermission(
  args: AccessArgs,
  permission: keyof Session['data']['role'],
) {
  return args.session?.listKey === 'User' && args.session.data.role?.[permission] === true
}

export const permissions = {
  canManageAppointments: ({ session }: AccessArgs) => session?.data.role?.canManageAppointments ?? false,
  canManageScheduling: ({ session }: AccessArgs) => session?.data.role?.canManageScheduling ?? false,
  canManagePatients: ({ session }: AccessArgs) => session?.data.role?.canManagePatients ?? false,
  canManageProviders: ({ session }: AccessArgs) => session?.data.role?.canManageProviders ?? false,
  canManageIntake: ({ session }: AccessArgs) => session?.data.role?.canManageIntake ?? false,
  canManageCommunications: ({ session }: AccessArgs) => session?.data.role?.canManageCommunications ?? false,
  canManageBilling: (args: AccessArgs) => rolePermission(args, 'canManageBilling'),
  canManageInventory: (args: AccessArgs) => rolePermission(args, 'canManageInventory'),
  canManageIntegrations: (args: AccessArgs) => rolePermission(args, 'canManageIntegrations'),
  canManageDataPortability: (args: AccessArgs) => rolePermission(args, 'canManageDataPortability'),
  canManageRetention: (args: AccessArgs) => rolePermission(args, 'canManageRetention'),
  canViewReports: ({ session }: AccessArgs) => session?.data.role?.canViewReports ?? false,
  canManageOnboarding: ({ session }: AccessArgs) => session?.data.role?.canManageOnboarding ?? false,
  canManagePeople: ({ session }: AccessArgs) => session?.data.role?.canManagePeople ?? false,
  canManageRoles: ({ session }: AccessArgs) => session?.data.role?.canManageRoles ?? false,
  canAccessAllClinicalData: hasGlobalClinicalAccess,
  canReadPatientPhi: (args: AccessArgs) => [
    'canManagePatients',
    'canManageAppointments',
    'canManageIntake',
    'canManageCommunications',
    'canManageBilling',
    'canManageDataPortability',
    'canManageRetention',
  ].some(permission => rolePermission(args, permission as keyof Session['data']['role'])),
  canReadClinicalPhi: (args: AccessArgs) => rolePermission(args, 'canManagePatients'),
  canReadAppointmentPhi: (args: AccessArgs) =>
    rolePermission(args, 'canManageAppointments') || rolePermission(args, 'canManagePatients'),
  canReadIntakePhi: (args: AccessArgs) => rolePermission(args, 'canManageIntake'),
  canReadMessageContent: (args: AccessArgs) => rolePermission(args, 'canManageCommunications'),
  canReadProviderSensitive: (args: AccessArgs) => rolePermission(args, 'canManageProviders'),
  canReadFacilitySensitive: (args: AccessArgs) => rolePermission(args, 'canManageProviders'),
  canReadPortalSensitive: (args: AccessArgs) => rolePermission(args, 'canManagePatients'),
  canReadAuditMetadata: (args: AccessArgs) => rolePermission(args, 'canViewReports'),
}

export const rules = {
  canReadPeople: ({ session }: AccessArgs): AccessFilter => {
    if (!session) return false
    if (session.data.role?.canSeeOtherPeople) return true
    return { id: { equals: session.itemId } }
  },
  canUpdatePeople: ({ session }: AccessArgs): AccessFilter => {
    if (!session) return false
    if (session.data.role?.canEditOtherPeople) return true
    return { id: { equals: session.itemId } }
  },
  canReadRoles: (args: AccessArgs): AccessFilter => {
    if (!args.session) return false
    if (permissions.canManageRoles(args)) return true
    return { assignedTo: { some: byId(args.session.itemId) } }
  },
  canReadPatients: (args: AccessArgs) => {
    const canManage = permissions.canReadPatientPhi(args)
    return scoped(args, (userId) => [
      { user: byId(userId) },
      ...(canManage
        ? [
            { facilities: { some: { staff: { some: byId(userId) } } } },
            { appointments: { some: { provider: { user: byId(userId) } } } },
          ]
        : []),
    ])
  },
  canReadProviders: (args: AccessArgs) => scoped(args, (userId) => [
    { user: byId(userId) },
    { facilities: { some: { staff: { some: byId(userId) } } } },
    { appointments: { some: { patient: { user: byId(userId) } } } },
  ]),
  canReadFacilities: (args: AccessArgs) => scoped(args, (userId) => [
    { staff: { some: byId(userId) } },
    { providers: { some: { user: byId(userId) } } },
    { patients: { some: { user: byId(userId) } } },
  ]),
  canReadDepartments: (args: AccessArgs) => scoped(args, (userId) => [
    { facilities: { some: { staff: { some: byId(userId) } } } },
    { facilities: { some: { providers: { some: { user: byId(userId) } } } } },
    { facilities: { some: { patients: { some: { user: byId(userId) } } } } },
  ]),
  canReadWards: (args: AccessArgs) => scoped(args, (userId) => [
    { department: { facilities: { some: { staff: { some: byId(userId) } } } } },
    { department: { facilities: { some: { providers: { some: { user: byId(userId) } } } } } },
  ]),
  canReadRooms: (args: AccessArgs) => scoped(args, (userId) => [
    { ward: { department: { facilities: { some: { staff: { some: byId(userId) } } } } } },
    { ward: { department: { facilities: { some: { providers: { some: { user: byId(userId) } } } } } } },
  ]),
  canReadBeds: (args: AccessArgs) => scoped(args, (userId) => [
    { currentPatient: { user: byId(userId) } },
    { facility: { staff: { some: byId(userId) } } },
    { facility: { providers: { some: { user: byId(userId) } } } },
  ]),
  canReadClinicians: (args: AccessArgs) => scoped(args, (userId) => [
    { provider: { user: byId(userId) } },
    { department: { facilities: { some: { staff: { some: byId(userId) } } } } },
  ]),
  canReadClinicianImages: (args: AccessArgs) => scoped(args, (userId) => [
    { clinician: { provider: { user: byId(userId) } } },
    { clinician: { department: { facilities: { some: { staff: { some: byId(userId) } } } } } },
  ]),
  canReadDepartmentImages: (args: AccessArgs) => scoped(args, (userId) => [
    { department: { facilities: { some: { staff: { some: byId(userId) } } } } },
    { department: { facilities: { some: { providers: { some: { user: byId(userId) } } } } } },
  ]),
  canReadFacilityImages: (args: AccessArgs) => scoped(args, (userId) => [
    { facility: { staff: { some: byId(userId) } } },
    { facility: { providers: { some: { user: byId(userId) } } } },
    { facility: { patients: { some: { user: byId(userId) } } } },
  ]),
  canReadProviderScheduleBlocks: (args: AccessArgs) => {
    const canManage = permissions.canManageScheduling(args) || permissions.canManageAppointments(args)
    return scoped(args, (userId) => [
      { provider: { user: byId(userId) } },
      ...(canManage ? [{ facility: { staff: { some: byId(userId) } } }] : []),
    ])
  },
  canReadAppointments: (args: AccessArgs) => {
    const canManage = permissions.canManageAppointments(args) || permissions.canManagePatients(args)
    return scoped(args, (userId) => [
      { patient: { user: byId(userId) } },
      { provider: { user: byId(userId) } },
      ...(canManage ? [{ facility: { staff: { some: byId(userId) } } }] : []),
    ])
  },
  canReadIntakeForms: (args: AccessArgs) => {
    const canManage = permissions.canManageIntake(args)
    return scoped(args, (userId) => [
      { patient: { user: byId(userId) } },
      { appointment: { provider: { user: byId(userId) } } },
      ...(canManage ? [{ facility: { staff: { some: byId(userId) } } }] : []),
    ])
  },
  canReadPatientMessages: (args: AccessArgs) => {
    const canManage = permissions.canManageCommunications(args)
    return scoped(args, (userId) => [
      { patient: { user: byId(userId) } },
      { appointment: { provider: { user: byId(userId) } } },
      ...(canManage ? [{ facility: { staff: { some: byId(userId) } } }] : []),
    ])
  },
  canReadPatientPortalAccess: (args: AccessArgs) => permissions.canAccessAllClinicalData(args),
  canReadPatientConsents: (args: AccessArgs) => {
    const canManage = permissions.canManageIntake(args) || permissions.canManagePatients(args)
    return scoped(args, (userId) => [
      { patient: { user: byId(userId) } },
      { appointment: { provider: { user: byId(userId) } } },
      ...(canManage ? [{ facility: { staff: { some: byId(userId) } } }] : []),
    ])
  },
  canReadClinicalAuditLogs: (args: AccessArgs) => {
    const canManage = permissions.canViewReports(args)
    return scoped(args, (userId) => [
      { patient: { user: byId(userId) } },
      { appointment: { provider: { user: byId(userId) } } },
      { encounter: { provider: { user: byId(userId) } } },
      ...(canManage ? [{ facility: { staff: { some: byId(userId) } } }] : []),
    ])
  },
  canReadEncounters: (args: AccessArgs) => {
    const canManage = permissions.canManagePatients(args)
    return scoped(args, (userId) => [
      { patient: { user: byId(userId) } },
      { provider: { user: byId(userId) } },
      ...(canManage
        ? [
            { facility: { staff: { some: byId(userId) } } },
          ]
        : []),
      ...appointmentBranches(userId, 'appointment', canManage),
    ])
  },
  canReadPatientIdentifiers: (args: AccessArgs): AccessFilter => {
    if (!permissions.canManagePatients(args)) return false
    return scoped(args, (userId) => [
      { facility: { staff: { some: byId(userId) } } },
    ])
  },
  canReadPatientRegistrations: (args: AccessArgs): AccessFilter => {
    if (!permissions.canManagePatients(args)) return false
    return scoped(args, (userId) => [
      { facility: { staff: { some: byId(userId) } } },
    ])
  },
  canReadCareQueueTickets: (args: AccessArgs): AccessFilter => {
    if (!hasGlobalClinicalAccess(args) && !permissions.canManageAppointments(args) && !permissions.canManagePatients(args)) return false
    return scoped(args, (userId) => [
      { patient: { user: byId(userId) } },
      { appointment: { provider: { user: byId(userId) } } },
      { facility: { staff: { some: byId(userId) } } },
    ])
  },
  canReadClinicalOutboxEvents: (args: AccessArgs): AccessFilter => {
    if (!hasGlobalClinicalAccess(args) && !permissions.canViewReports(args)) return false
    return scoped(args, (userId) => [{ facility: { staff: { some: byId(userId) } } }])
  },
  canReadWorkflowTransitions: (args: AccessArgs): AccessFilter => {
    if (!hasGlobalClinicalAccess(args) && !permissions.canViewReports(args)) return false
    return scoped(args, userId => [{ facility: { staff: { some: byId(userId) } } }])
  },
  canReadAdmissions: (args: AccessArgs) => {
    const canManage = permissions.canManagePatients(args)
    return scoped(args, (userId) => [
      { patient: { user: byId(userId) } },
      { attendingProvider: { user: byId(userId) } },
      ...(canManage ? [{ facility: { staff: { some: byId(userId) } } }] : []),
    ])
  },
  canReadBedOccupancyEvents: (args: AccessArgs): AccessFilter => {
    if (!permissions.canManagePatients(args)) return false
    return scoped(args, (userId) => [
      { patient: { user: byId(userId) } },
      { facility: { staff: { some: byId(userId) } } },
    ])
  },
  canReadCarePlans: (args: AccessArgs) => {
    const canManage = permissions.canManagePatients(args)
    return scoped(args, (userId) => [
      { patient: { user: byId(userId) } }, { provider: { user: byId(userId) } },
      ...(canManage ? [{ facility: { staff: { some: byId(userId) } } }] : []),
    ])
  },
  canReadInsuranceClaims: (args: AccessArgs) => {
    const canManage = permissions.canManageBilling(args)
    return scoped(args, (userId) => [
      { patient: { user: byId(userId) } },
      { encounter: { provider: { user: byId(userId) } } },
      ...(canManage ? [{ facility: { staff: { some: byId(userId) } } }] : []),
    ], canManage)
  },
  canReadLabResults: (args: AccessArgs) => {
    const canManage = permissions.canManagePatients(args)
    return scoped(args, (userId) => [
      { patient: { user: byId(userId) } },
      { encounter: { provider: { user: byId(userId) } } },
      ...(canManage ? [{ facility: { staff: { some: byId(userId) } } }] : []),
    ])
  },
  canReadMedicalOrders: (args: AccessArgs) => {
    const canManage = permissions.canManagePatients(args)
    return scoped(args, (userId) => [
      { patient: { user: byId(userId) } }, { orderingProvider: { user: byId(userId) } }, ...encounterBranches(userId, 'encounter', false),
      ...(canManage ? [{ facility: { staff: { some: byId(userId) } } }] : []),
    ])
  },
  canReadPrescriptions: (args: AccessArgs) => {
    const canManage = permissions.canManagePatients(args)
    return scoped(args, (userId) => [
      { patient: { user: byId(userId) } }, { provider: { user: byId(userId) } }, ...encounterBranches(userId, 'encounter', false),
      ...(canManage ? [{ facility: { staff: { some: byId(userId) } } }] : []),
    ])
  },
  canReadProcedures: (args: AccessArgs) => {
    const canManage = permissions.canManagePatients(args)
    return scoped(args, (userId) => [
      { patient: { user: byId(userId) } }, { provider: { user: byId(userId) } }, ...encounterBranches(userId, 'encounter', false),
      ...(canManage ? [{ facility: { staff: { some: byId(userId) } } }] : []),
    ])
  },
  canReadVitalSigns: (args: AccessArgs) => {
    const canManage = permissions.canManagePatients(args)
    return scoped(args, (userId) => [
      { patient: { user: byId(userId) } },
      { encounter: { provider: { user: byId(userId) } } },
      { recordedBy: { provider: { user: byId(userId) } } },
      ...(canManage ? [{ facility: { staff: { some: byId(userId) } } }] : []),
    ])
  },
  canReadCoverages: (args: AccessArgs) => {
    const canManage = permissions.canManageBilling(args)
    return scoped(args, userId => [
      { patient: { user: byId(userId) } },
      ...(canManage ? [{ facility: { staff: { some: byId(userId) } } }] : []),
    ], canManage)
  },
  canReadBillingRecords: (args: AccessArgs) => {
    const canManage = permissions.canManageBilling(args)
    return scoped(args, userId => [
      { patient: { user: byId(userId) } },
      ...(canManage ? [{ facility: { staff: { some: byId(userId) } } }] : []),
    ], canManage)
  },
  canReadInventory: (args: AccessArgs) => {
    if (!permissions.canManageInventory(args)) return false
    return scoped(args, userId => [{ facility: { staff: { some: byId(userId) } } }])
  },
  canReadCommunicationPreferences: (args: AccessArgs) => {
    const canManage = permissions.canManageCommunications(args)
    return scoped(args, userId => [
      { patient: { user: byId(userId) } },
      ...(canManage ? [{ facility: { staff: { some: byId(userId) } } }] : []),
    ], canManage)
  },
  canReadCommunicationTemplates: (args: AccessArgs) => {
    if (!permissions.canManageCommunications(args)) return false
    return scoped(args, userId => [{ facility: { staff: { some: byId(userId) } } }])
  },
  canReadIntegrations: (args: AccessArgs) => {
    if (!permissions.canManageIntegrations(args)) return false
    return scoped(args, userId => [{ facility: { staff: { some: byId(userId) } } }])
  },
  canReadClinicalDocuments: (args: AccessArgs) => {
    const canManage = permissions.canManagePatients(args)
    return scoped(args, userId => [
      { patient: { user: byId(userId) } },
      { encounter: { provider: { user: byId(userId) } } },
      ...(canManage ? [{ facility: { staff: { some: byId(userId) } } }] : []),
    ])
  },
  canReadSpecimens: (args: AccessArgs) => {
    const canManage = permissions.canManagePatients(args)
    return scoped(args, userId => [
      { patient: { user: byId(userId) } },
      { encounter: { provider: { user: byId(userId) } } },
      ...(canManage ? [{ facility: { staff: { some: byId(userId) } } }] : []),
    ])
  },
  canReadRetentionRecords: (args: AccessArgs) => {
    if (!permissions.canManageRetention(args)) return false
    return scoped(args, userId => [{ facility: { staff: { some: byId(userId) } } }])
  },
  canReadPortabilityRecords: (args: AccessArgs) => {
    if (!permissions.canManageDataPortability(args)) return false
    return scoped(args, userId => [{ facility: { staff: { some: byId(userId) } } }])
  },
  canReadExternalIdentityLinks: (args: AccessArgs) => {
    if (!permissions.canManageIntegrations(args)) return false
    return scoped(args, userId => [{ facility: { staff: { some: byId(userId) } } }])
  },
  canReadBedReservations: (args: AccessArgs) => {
    if (!permissions.canManagePatients(args)) return false
    return scoped(args, userId => [
      { patient: { user: byId(userId) } },
      { facility: { staff: { some: byId(userId) } } },
    ])
  },
}
