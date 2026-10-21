"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key2 of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key2) && key2 !== except)
        __defProp(to, key2, { get: () => from[key2], enumerable: !(desc = __getOwnPropDesc(from, key2)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// features/keystone/access.ts
function isSignedIn({ session }) {
  return Boolean(session);
}
function hasGlobalClinicalAccess({ session }) {
  return session?.data.role?.canAccessAllClinicalData ?? false;
}
function scoped(args, buildScope, allowGlobal = true) {
  if (!args.session) return false;
  if (allowGlobal && hasGlobalClinicalAccess(args)) return true;
  return { OR: buildScope(args.session.itemId) };
}
function rolePermission(args, permission) {
  return args.session?.listKey === "User" && args.session.data.role?.[permission] === true;
}
var byId, appointmentBranches, encounterBranches, denyAccess, permissions, rules;
var init_access = __esm({
  "features/keystone/access.ts"() {
    "use strict";
    byId = (userId) => ({ id: { equals: userId } });
    appointmentBranches = (userId, field = "appointment", includeCareTeamScope = false) => [
      { [field]: { patient: { user: byId(userId) } } },
      ...includeCareTeamScope ? [
        { [field]: { provider: { user: byId(userId) } } },
        { [field]: { facility: { staff: { some: byId(userId) } } } }
      ] : []
    ];
    encounterBranches = (userId, field = "encounter", includeCareTeamScope = false) => [
      { [field]: { patient: { user: byId(userId) } } },
      ...includeCareTeamScope ? [
        { [field]: { provider: { user: byId(userId) } } },
        { [field]: { facility: { staff: { some: byId(userId) } } } },
        { [field]: { department: { facilities: { some: { staff: { some: byId(userId) } } } } } }
      ] : []
    ];
    denyAccess = () => false;
    permissions = {
      canManageAppointments: ({ session }) => session?.data.role?.canManageAppointments ?? false,
      canManageScheduling: ({ session }) => session?.data.role?.canManageScheduling ?? false,
      canManagePatients: ({ session }) => session?.data.role?.canManagePatients ?? false,
      canManageProviders: ({ session }) => session?.data.role?.canManageProviders ?? false,
      canManageIntake: ({ session }) => session?.data.role?.canManageIntake ?? false,
      canManageCommunications: ({ session }) => session?.data.role?.canManageCommunications ?? false,
      canManageBilling: (args) => rolePermission(args, "canManageBilling"),
      canManageInventory: (args) => rolePermission(args, "canManageInventory"),
      canManageIntegrations: (args) => rolePermission(args, "canManageIntegrations"),
      canManageDataPortability: (args) => rolePermission(args, "canManageDataPortability"),
      canManageRetention: (args) => rolePermission(args, "canManageRetention"),
      canViewReports: ({ session }) => session?.data.role?.canViewReports ?? false,
      canManageOnboarding: ({ session }) => session?.data.role?.canManageOnboarding ?? false,
      canManagePeople: ({ session }) => session?.data.role?.canManagePeople ?? false,
      canManageRoles: ({ session }) => session?.data.role?.canManageRoles ?? false,
      canAccessAllClinicalData: hasGlobalClinicalAccess,
      canReadPatientPhi: (args) => [
        "canManagePatients",
        "canManageAppointments",
        "canManageIntake",
        "canManageCommunications",
        "canManageBilling",
        "canManageDataPortability",
        "canManageRetention"
      ].some((permission) => rolePermission(args, permission)),
      canReadClinicalPhi: (args) => rolePermission(args, "canManagePatients"),
      canReadAppointmentPhi: (args) => rolePermission(args, "canManageAppointments") || rolePermission(args, "canManagePatients"),
      canReadIntakePhi: (args) => rolePermission(args, "canManageIntake"),
      canReadMessageContent: (args) => rolePermission(args, "canManageCommunications"),
      canReadProviderSensitive: (args) => rolePermission(args, "canManageProviders"),
      canReadFacilitySensitive: (args) => rolePermission(args, "canManageProviders"),
      canReadPortalSensitive: (args) => rolePermission(args, "canManagePatients"),
      canReadAuditMetadata: (args) => rolePermission(args, "canViewReports")
    };
    rules = {
      canReadPeople: ({ session }) => {
        if (!session) return false;
        if (session.data.role?.canSeeOtherPeople) return true;
        return { id: { equals: session.itemId } };
      },
      canUpdatePeople: ({ session }) => {
        if (!session) return false;
        if (session.data.role?.canEditOtherPeople) return true;
        return { id: { equals: session.itemId } };
      },
      canReadRoles: (args) => {
        if (!args.session) return false;
        if (permissions.canManageRoles(args)) return true;
        return { assignedTo: { some: byId(args.session.itemId) } };
      },
      canReadPatients: (args) => {
        const canManage = permissions.canReadPatientPhi(args);
        return scoped(args, (userId) => [
          { user: byId(userId) },
          ...canManage ? [
            { facilities: { some: { staff: { some: byId(userId) } } } },
            { appointments: { some: { provider: { user: byId(userId) } } } }
          ] : []
        ]);
      },
      canReadProviders: (args) => scoped(args, (userId) => [
        { user: byId(userId) },
        { facilities: { some: { staff: { some: byId(userId) } } } },
        { appointments: { some: { patient: { user: byId(userId) } } } }
      ]),
      canReadFacilities: (args) => scoped(args, (userId) => [
        { staff: { some: byId(userId) } },
        { providers: { some: { user: byId(userId) } } },
        { patients: { some: { user: byId(userId) } } }
      ]),
      canReadDepartments: (args) => scoped(args, (userId) => [
        { facilities: { some: { staff: { some: byId(userId) } } } },
        { facilities: { some: { providers: { some: { user: byId(userId) } } } } },
        { facilities: { some: { patients: { some: { user: byId(userId) } } } } }
      ]),
      canReadWards: (args) => scoped(args, (userId) => [
        { department: { facilities: { some: { staff: { some: byId(userId) } } } } },
        { department: { facilities: { some: { providers: { some: { user: byId(userId) } } } } } }
      ]),
      canReadRooms: (args) => scoped(args, (userId) => [
        { ward: { department: { facilities: { some: { staff: { some: byId(userId) } } } } } },
        { ward: { department: { facilities: { some: { providers: { some: { user: byId(userId) } } } } } } }
      ]),
      canReadBeds: (args) => scoped(args, (userId) => [
        { currentPatient: { user: byId(userId) } },
        { facility: { staff: { some: byId(userId) } } },
        { facility: { providers: { some: { user: byId(userId) } } } }
      ]),
      canReadClinicians: (args) => scoped(args, (userId) => [
        { provider: { user: byId(userId) } },
        { department: { facilities: { some: { staff: { some: byId(userId) } } } } }
      ]),
      canReadClinicianImages: (args) => scoped(args, (userId) => [
        { clinician: { provider: { user: byId(userId) } } },
        { clinician: { department: { facilities: { some: { staff: { some: byId(userId) } } } } } }
      ]),
      canReadDepartmentImages: (args) => scoped(args, (userId) => [
        { department: { facilities: { some: { staff: { some: byId(userId) } } } } },
        { department: { facilities: { some: { providers: { some: { user: byId(userId) } } } } } }
      ]),
      canReadFacilityImages: (args) => scoped(args, (userId) => [
        { facility: { staff: { some: byId(userId) } } },
        { facility: { providers: { some: { user: byId(userId) } } } },
        { facility: { patients: { some: { user: byId(userId) } } } }
      ]),
      canReadProviderScheduleBlocks: (args) => {
        const canManage = permissions.canManageScheduling(args) || permissions.canManageAppointments(args);
        return scoped(args, (userId) => [
          { provider: { user: byId(userId) } },
          ...canManage ? [{ facility: { staff: { some: byId(userId) } } }] : []
        ]);
      },
      canReadAppointments: (args) => {
        const canManage = permissions.canManageAppointments(args) || permissions.canManagePatients(args);
        return scoped(args, (userId) => [
          { patient: { user: byId(userId) } },
          { provider: { user: byId(userId) } },
          ...canManage ? [{ facility: { staff: { some: byId(userId) } } }] : []
        ]);
      },
      canReadIntakeForms: (args) => {
        const canManage = permissions.canManageIntake(args);
        return scoped(args, (userId) => [
          { patient: { user: byId(userId) } },
          { appointment: { provider: { user: byId(userId) } } },
          ...canManage ? [{ facility: { staff: { some: byId(userId) } } }] : []
        ]);
      },
      canReadPatientMessages: (args) => {
        const canManage = permissions.canManageCommunications(args);
        return scoped(args, (userId) => [
          { patient: { user: byId(userId) } },
          { appointment: { provider: { user: byId(userId) } } },
          ...canManage ? [{ facility: { staff: { some: byId(userId) } } }] : []
        ]);
      },
      canReadPatientPortalAccess: (args) => permissions.canAccessAllClinicalData(args),
      canReadPatientConsents: (args) => {
        const canManage = permissions.canManageIntake(args) || permissions.canManagePatients(args);
        return scoped(args, (userId) => [
          { patient: { user: byId(userId) } },
          { appointment: { provider: { user: byId(userId) } } },
          ...canManage ? [{ facility: { staff: { some: byId(userId) } } }] : []
        ]);
      },
      canReadClinicalAuditLogs: (args) => {
        const canManage = permissions.canViewReports(args);
        return scoped(args, (userId) => [
          { patient: { user: byId(userId) } },
          { appointment: { provider: { user: byId(userId) } } },
          { encounter: { provider: { user: byId(userId) } } },
          ...canManage ? [{ facility: { staff: { some: byId(userId) } } }] : []
        ]);
      },
      canReadEncounters: (args) => {
        const canManage = permissions.canManagePatients(args);
        return scoped(args, (userId) => [
          { patient: { user: byId(userId) } },
          { provider: { user: byId(userId) } },
          ...canManage ? [
            { facility: { staff: { some: byId(userId) } } }
          ] : [],
          ...appointmentBranches(userId, "appointment", canManage)
        ]);
      },
      canReadPatientIdentifiers: (args) => {
        if (!permissions.canManagePatients(args)) return false;
        return scoped(args, (userId) => [
          { facility: { staff: { some: byId(userId) } } }
        ]);
      },
      canReadPatientRegistrations: (args) => {
        if (!permissions.canManagePatients(args)) return false;
        return scoped(args, (userId) => [
          { facility: { staff: { some: byId(userId) } } }
        ]);
      },
      canReadCareQueueTickets: (args) => {
        if (!hasGlobalClinicalAccess(args) && !permissions.canManageAppointments(args) && !permissions.canManagePatients(args)) return false;
        return scoped(args, (userId) => [
          { patient: { user: byId(userId) } },
          { appointment: { provider: { user: byId(userId) } } },
          { facility: { staff: { some: byId(userId) } } }
        ]);
      },
      canReadClinicalOutboxEvents: (args) => {
        if (!hasGlobalClinicalAccess(args) && !permissions.canViewReports(args)) return false;
        return scoped(args, (userId) => [{ facility: { staff: { some: byId(userId) } } }]);
      },
      canReadWorkflowTransitions: (args) => {
        if (!hasGlobalClinicalAccess(args) && !permissions.canViewReports(args)) return false;
        return scoped(args, (userId) => [{ facility: { staff: { some: byId(userId) } } }]);
      },
      canReadAdmissions: (args) => {
        const canManage = permissions.canManagePatients(args);
        return scoped(args, (userId) => [
          { patient: { user: byId(userId) } },
          { attendingProvider: { user: byId(userId) } },
          ...canManage ? [{ facility: { staff: { some: byId(userId) } } }] : []
        ]);
      },
      canReadBedOccupancyEvents: (args) => {
        if (!permissions.canManagePatients(args)) return false;
        return scoped(args, (userId) => [
          { patient: { user: byId(userId) } },
          { facility: { staff: { some: byId(userId) } } }
        ]);
      },
      canReadCarePlans: (args) => {
        const canManage = permissions.canManagePatients(args);
        return scoped(args, (userId) => [
          { patient: { user: byId(userId) } },
          { provider: { user: byId(userId) } },
          ...canManage ? [{ facility: { staff: { some: byId(userId) } } }] : []
        ]);
      },
      canReadInsuranceClaims: (args) => {
        const canManage = permissions.canManageBilling(args);
        return scoped(args, (userId) => [
          { patient: { user: byId(userId) } },
          { encounter: { provider: { user: byId(userId) } } },
          ...canManage ? [{ facility: { staff: { some: byId(userId) } } }] : []
        ], canManage);
      },
      canReadLabResults: (args) => {
        const canManage = permissions.canManagePatients(args);
        return scoped(args, (userId) => [
          { patient: { user: byId(userId) } },
          { encounter: { provider: { user: byId(userId) } } },
          ...canManage ? [{ facility: { staff: { some: byId(userId) } } }] : []
        ]);
      },
      canReadMedicalOrders: (args) => {
        const canManage = permissions.canManagePatients(args);
        return scoped(args, (userId) => [
          { patient: { user: byId(userId) } },
          { orderingProvider: { user: byId(userId) } },
          ...encounterBranches(userId, "encounter", false),
          ...canManage ? [{ facility: { staff: { some: byId(userId) } } }] : []
        ]);
      },
      canReadPrescriptions: (args) => {
        const canManage = permissions.canManagePatients(args);
        return scoped(args, (userId) => [
          { patient: { user: byId(userId) } },
          { provider: { user: byId(userId) } },
          ...encounterBranches(userId, "encounter", false),
          ...canManage ? [{ facility: { staff: { some: byId(userId) } } }] : []
        ]);
      },
      canReadProcedures: (args) => {
        const canManage = permissions.canManagePatients(args);
        return scoped(args, (userId) => [
          { patient: { user: byId(userId) } },
          { provider: { user: byId(userId) } },
          ...encounterBranches(userId, "encounter", false),
          ...canManage ? [{ facility: { staff: { some: byId(userId) } } }] : []
        ]);
      },
      canReadVitalSigns: (args) => {
        const canManage = permissions.canManagePatients(args);
        return scoped(args, (userId) => [
          { patient: { user: byId(userId) } },
          { encounter: { provider: { user: byId(userId) } } },
          { recordedBy: { provider: { user: byId(userId) } } },
          ...canManage ? [{ facility: { staff: { some: byId(userId) } } }] : []
        ]);
      },
      canReadCoverages: (args) => {
        const canManage = permissions.canManageBilling(args);
        return scoped(args, (userId) => [
          { patient: { user: byId(userId) } },
          ...canManage ? [{ facility: { staff: { some: byId(userId) } } }] : []
        ], canManage);
      },
      canReadBillingRecords: (args) => {
        const canManage = permissions.canManageBilling(args);
        return scoped(args, (userId) => [
          { patient: { user: byId(userId) } },
          ...canManage ? [{ facility: { staff: { some: byId(userId) } } }] : []
        ], canManage);
      },
      canReadInventory: (args) => {
        if (!permissions.canManageInventory(args)) return false;
        return scoped(args, (userId) => [{ facility: { staff: { some: byId(userId) } } }]);
      },
      canReadCommunicationPreferences: (args) => {
        const canManage = permissions.canManageCommunications(args);
        return scoped(args, (userId) => [
          { patient: { user: byId(userId) } },
          ...canManage ? [{ facility: { staff: { some: byId(userId) } } }] : []
        ], canManage);
      },
      canReadCommunicationTemplates: (args) => {
        if (!permissions.canManageCommunications(args)) return false;
        return scoped(args, (userId) => [{ facility: { staff: { some: byId(userId) } } }]);
      },
      canReadIntegrations: (args) => {
        if (!permissions.canManageIntegrations(args)) return false;
        return scoped(args, (userId) => [{ facility: { staff: { some: byId(userId) } } }]);
      },
      canReadClinicalDocuments: (args) => {
        const canManage = permissions.canManagePatients(args);
        return scoped(args, (userId) => [
          { patient: { user: byId(userId) } },
          { encounter: { provider: { user: byId(userId) } } },
          ...canManage ? [{ facility: { staff: { some: byId(userId) } } }] : []
        ]);
      },
      canReadSpecimens: (args) => {
        const canManage = permissions.canManagePatients(args);
        return scoped(args, (userId) => [
          { patient: { user: byId(userId) } },
          { encounter: { provider: { user: byId(userId) } } },
          ...canManage ? [{ facility: { staff: { some: byId(userId) } } }] : []
        ]);
      },
      canReadRetentionRecords: (args) => {
        if (!permissions.canManageRetention(args)) return false;
        return scoped(args, (userId) => [{ facility: { staff: { some: byId(userId) } } }]);
      },
      canReadPortabilityRecords: (args) => {
        if (!permissions.canManageDataPortability(args)) return false;
        return scoped(args, (userId) => [{ facility: { staff: { some: byId(userId) } } }]);
      },
      canReadExternalIdentityLinks: (args) => {
        if (!permissions.canManageIntegrations(args)) return false;
        return scoped(args, (userId) => [{ facility: { staff: { some: byId(userId) } } }]);
      },
      canReadBedReservations: (args) => {
        if (!permissions.canManagePatients(args)) return false;
        return scoped(args, (userId) => [
          { patient: { user: byId(userId) } },
          { facility: { staff: { some: byId(userId) } } }
        ]);
      }
    };
  }
});

// features/keystone/models/trackingFields.ts
var import_fields, trackingFields;
var init_trackingFields = __esm({
  "features/keystone/models/trackingFields.ts"() {
    "use strict";
    import_fields = require("@keystone-6/core/fields");
    trackingFields = {
      createdAt: (0, import_fields.timestamp)({
        access: { read: () => true, create: () => false, update: () => false },
        validation: { isRequired: true },
        defaultValue: { kind: "now" },
        ui: {
          createView: { fieldMode: "hidden" },
          itemView: { fieldMode: "read" }
        }
      }),
      updatedAt: (0, import_fields.timestamp)({
        access: { read: () => true, create: () => false, update: () => false },
        db: { updatedAt: true },
        validation: { isRequired: true },
        defaultValue: { kind: "now" },
        ui: {
          createView: { fieldMode: "hidden" },
          itemView: { fieldMode: "read" }
        }
      })
    };
  }
});

// features/keystone/models/User.ts
async function hasGlobalClinicalRole(context, item) {
  const roleId = item?.roleId || item?.role;
  if (!roleId) return false;
  const role = await context.sudo().prisma.role.findUnique({
    where: { id: String(roleId) },
    select: { canAccessAllClinicalData: true }
  });
  return role?.canAccessAllClinicalData === true;
}
async function canUpdateCredential({ session, item, context }, allowNonGlobal) {
  if (await hasGlobalClinicalRole(context, item)) return session?.itemId === item?.id;
  return allowNonGlobal;
}
var import_core, import_access, import_fields2, User;
var init_User = __esm({
  "features/keystone/models/User.ts"() {
    "use strict";
    import_core = require("@keystone-6/core");
    import_access = require("@keystone-6/core/access");
    import_fields2 = require("@keystone-6/core/fields");
    init_access();
    init_trackingFields();
    User = (0, import_core.list)({
      access: {
        operation: {
          ...(0, import_access.allOperations)(isSignedIn),
          // Public account creation is intentionally disabled. Empty deployments are
          // initialized only through the secret-gated transactional bootstrap route.
          create: permissions.canManagePeople,
          delete: permissions.canManagePeople
        },
        filter: {
          query: rules.canReadPeople,
          update: rules.canUpdatePeople
        },
        item: {
          delete: async ({ context, item }) => !await hasGlobalClinicalRole(context, item)
        }
      },
      hooks: {
        resolveInput: async ({ operation, resolvedData, item }) => {
          const next = { ...resolvedData };
          if (next.email !== void 0) {
            const email = String(next.email || "").trim().toLowerCase();
            if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) throw new Error("User email is invalid");
            next.email = email;
          }
          if (operation === "update" && (next.password !== void 0 || next.email !== void 0 && next.email !== item?.email)) {
            next.securityVersion = Number(item?.securityVersion || 1) + 1;
          }
          return next;
        },
        afterOperation: async ({ operation, item, originalItem, context }) => {
          if (operation === "update" && originalItem?.email !== item?.email) {
            await context.sudo().prisma.passwordResetRequest.updateMany({
              where: { userId: item.id, status: "pending" },
              data: { status: "superseded", supersededAt: /* @__PURE__ */ new Date() }
            });
          }
        }
      },
      ui: {
        hideCreate: (args) => !permissions.canManagePeople(args),
        hideDelete: (args) => !permissions.canManagePeople(args),
        listView: {
          initialColumns: ["name", "email", "role", "onboardingStatus"]
        },
        itemView: {
          defaultFieldMode: ({ session, item }) => {
            if (session?.data.role?.canEditOtherPeople) return "edit";
            if (session?.itemId === item?.id) return "edit";
            return "read";
          }
        }
      },
      fields: {
        name: (0, import_fields2.text)({
          validation: {
            isRequired: true
          }
        }),
        email: (0, import_fields2.text)({
          isFilterable: false,
          isOrderable: false,
          isIndexed: "unique",
          access: {
            read: ({ session, item }) => permissions.canManagePeople({ session }) || session?.itemId === item.id,
            update: (args) => canUpdateCredential(args, true)
          },
          validation: {
            isRequired: true
          }
        }),
        password: (0, import_fields2.password)({
          access: {
            read: import_access.denyAll,
            update: (args) => canUpdateCredential(
              args,
              permissions.canManagePeople({ session: args.session }) || args.session?.itemId === args.item.id
            )
          },
          validation: { isRequired: true }
        }),
        securityVersion: (0, import_fields2.integer)({
          defaultValue: 1,
          validation: { isRequired: true, min: 1 },
          access: { read: isSignedIn, create: permissions.canAccessAllClinicalData, update: () => false },
          ui: { itemView: { fieldMode: "read" } }
        }),
        // Retained only to avoid destructively dropping columns previously owned by
        // Keystone Auth. Repository-owned reset requests never read or write them.
        passwordResetToken: (0, import_fields2.text)({ db: { isNullable: true }, access: { read: import_access.denyAll, create: import_access.denyAll, update: import_access.denyAll } }),
        passwordResetIssuedAt: (0, import_fields2.timestamp)({ access: { read: import_access.denyAll, create: import_access.denyAll, update: import_access.denyAll } }),
        passwordResetRedeemedAt: (0, import_fields2.timestamp)({ access: { read: import_access.denyAll, create: import_access.denyAll, update: import_access.denyAll } }),
        role: (0, import_fields2.relationship)({
          ref: "Role.assignedTo",
          access: {
            create: permissions.canAccessAllClinicalData,
            update: async ({ session, item, context }) => permissions.canAccessAllClinicalData({ session }) && !await hasGlobalClinicalRole(context, item)
          },
          ui: {
            itemView: {
              fieldMode: (args) => permissions.canManagePeople(args) ? "edit" : "read"
            }
          }
        }),
        onboardingStatus: (0, import_fields2.select)({
          type: "string",
          options: [
            { label: "Not started", value: "not_started" },
            { label: "In progress", value: "in_progress" },
            { label: "Completed", value: "completed" },
            { label: "Dismissed", value: "dismissed" }
          ],
          defaultValue: "not_started",
          validation: { isRequired: true }
        }),
        facilities: (0, import_fields2.relationship)({
          ref: "Facility.staff",
          many: true,
          access: {
            create: permissions.canAccessAllClinicalData,
            update: permissions.canAccessAllClinicalData
          }
        }),
        patientProfile: (0, import_fields2.relationship)({
          ref: "Patient.user",
          access: { create: permissions.canAccessAllClinicalData, update: permissions.canAccessAllClinicalData }
        }),
        providerProfile: (0, import_fields2.relationship)({
          ref: "Provider.user",
          access: { create: permissions.canAccessAllClinicalData, update: permissions.canAccessAllClinicalData }
        }),
        patientPortalAccess: (0, import_fields2.relationship)({
          ref: "PatientPortalAccess.user",
          access: { read: permissions.canAccessAllClinicalData, create: import_access.denyAll, update: import_access.denyAll }
        }),
        reviewedIntakeForms: (0, import_fields2.relationship)({
          ref: "IntakeForm.reviewedBy",
          many: true,
          access: { create: () => false, update: () => false }
        }),
        ...trackingFields
      }
    });
  }
});

// features/keystone/models/Role.ts
var import_core2, import_access3, import_fields3, Role;
var init_Role = __esm({
  "features/keystone/models/Role.ts"() {
    "use strict";
    import_core2 = require("@keystone-6/core");
    import_access3 = require("@keystone-6/core/access");
    import_fields3 = require("@keystone-6/core/fields");
    init_access();
    init_trackingFields();
    Role = (0, import_core2.list)({
      access: {
        operation: {
          ...(0, import_access3.allOperations)(permissions.canManageRoles),
          query: isSignedIn
        },
        filter: {
          query: rules.canReadRoles
        },
        item: {
          create: ({ session, inputData }) => permissions.canAccessAllClinicalData({ session }) || inputData.canAccessAllClinicalData !== true && inputData.assignedTo === void 0,
          update: ({ session, item, inputData }) => !item.canAccessAllClinicalData && (permissions.canAccessAllClinicalData({ session }) || inputData.canAccessAllClinicalData === void 0 && inputData.assignedTo === void 0),
          // The sole global authority is immutable in-band. Rotation/recovery is a
          // deployment-controlled operation, never generic Role CRUD.
          delete: ({ item }) => !item.canAccessAllClinicalData
        }
      },
      ui: {
        hideCreate: (args) => !permissions.canManageRoles(args),
        hideDelete: (args) => !permissions.canManageRoles(args),
        listView: {
          initialColumns: ["name", "assignedTo"]
        },
        itemView: {
          defaultFieldMode: (args) => permissions.canManageRoles(args) ? "edit" : "read"
        }
      },
      fields: {
        name: (0, import_fields3.text)({ validation: { isRequired: true } }),
        canManageAppointments: (0, import_fields3.checkbox)({ defaultValue: false }),
        canManageScheduling: (0, import_fields3.checkbox)({ defaultValue: false }),
        canManagePatients: (0, import_fields3.checkbox)({ defaultValue: false }),
        canManageProviders: (0, import_fields3.checkbox)({ defaultValue: false }),
        canManageIntake: (0, import_fields3.checkbox)({ defaultValue: false }),
        canManageCommunications: (0, import_fields3.checkbox)({ defaultValue: false }),
        canManageBilling: (0, import_fields3.checkbox)({ defaultValue: false }),
        canManageInventory: (0, import_fields3.checkbox)({ defaultValue: false }),
        canManageIntegrations: (0, import_fields3.checkbox)({ defaultValue: false }),
        canManageDataPortability: (0, import_fields3.checkbox)({ defaultValue: false }),
        canManageRetention: (0, import_fields3.checkbox)({ defaultValue: false }),
        canViewReports: (0, import_fields3.checkbox)({ defaultValue: false }),
        canManageOnboarding: (0, import_fields3.checkbox)({ defaultValue: false }),
        canSeeOtherPeople: (0, import_fields3.checkbox)({ defaultValue: false }),
        canEditOtherPeople: (0, import_fields3.checkbox)({ defaultValue: false }),
        canManagePeople: (0, import_fields3.checkbox)({ defaultValue: false }),
        canManageRoles: (0, import_fields3.checkbox)({ defaultValue: false }),
        canAccessDashboard: (0, import_fields3.checkbox)({ defaultValue: false }),
        canAccessAllClinicalData: (0, import_fields3.checkbox)({
          defaultValue: false,
          access: {
            create: permissions.canAccessAllClinicalData,
            update: permissions.canAccessAllClinicalData
          },
          ui: { description: "Explicit global clinical-data bypass. Keep disabled for facility, provider, and patient-scoped roles." }
        }),
        assignedTo: (0, import_fields3.relationship)({
          ref: "User.role",
          many: true,
          access: {
            create: permissions.canAccessAllClinicalData,
            update: permissions.canAccessAllClinicalData
          },
          ui: {
            itemView: { fieldMode: "read" }
          }
        }),
        ...trackingFields
      }
    });
  }
});

// features/lib/publicPhone.ts
function publicPhoneHref(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 40) return "";
  const match = /^(\+?[0-9() .-]+?)(?:\s*(?:ext\.?|x)\s*([0-9]{1,6}))?$/i.exec(value.trim());
  if (!match) return "";
  const number = match[1].replace(/[() .-]/g, "");
  if (!/^\+?[0-9]{7,15}$/.test(number)) return "";
  return `tel:${number}${match[2] ? `;ext=${match[2]}` : ""}`;
}
var init_publicPhone = __esm({
  "features/lib/publicPhone.ts"() {
    "use strict";
  }
});

// features/lib/hospitalBrandTheme.ts
function isHospitalBrandTheme(value) {
  return typeof value === "string" && HOSPITAL_BRAND_THEMES.includes(value);
}
function normalizeHospitalBrandTheme(value) {
  return isHospitalBrandTheme(value) ? value : DEFAULT_HOSPITAL_BRAND_THEME;
}
var HOSPITAL_BRAND_THEMES, DEFAULT_HOSPITAL_BRAND_THEME, HOSPITAL_BRAND_THEME_OPTIONS;
var init_hospitalBrandTheme = __esm({
  "features/lib/hospitalBrandTheme.ts"() {
    "use strict";
    HOSPITAL_BRAND_THEMES = ["evergreen", "navy", "plum"];
    DEFAULT_HOSPITAL_BRAND_THEME = "evergreen";
    HOSPITAL_BRAND_THEME_OPTIONS = [
      { label: "Evergreen", value: "evergreen", swatch: "#155c4d" },
      { label: "Navy", value: "navy", swatch: "#24527a" },
      { label: "Plum", value: "plum", swatch: "#6d3f65" }
    ];
  }
});

// features/keystone/utils/storeLogo.ts
function sanitizeStoreLogoSvg(svg) {
  const source = svg.trim();
  if (!source.startsWith("<svg") || !source.endsWith("</svg>") || source.length > 1e5) {
    return "";
  }
  if (/<!|<\?|\b(?:javascript|data|vbscript):|\bon[a-z]+\s*=|\b(?:href|src|style)\s*=/i.test(source)) {
    return "";
  }
  const stack = [];
  let tagCount = 0;
  let match;
  TAG_PATTERN.lastIndex = 0;
  while (match = TAG_PATTERN.exec(source)) {
    tagCount += 1;
    const element = match[1].toLowerCase();
    if (!ALLOWED_ELEMENTS.has(element)) return "";
    if (match[0].startsWith("</")) {
      if (match[2].trim() || stack.pop() !== match[1]) return "";
      continue;
    }
    if (element === "svg" && stack.length) return "";
    if (!match[0].endsWith("/>")) stack.push(match[1]);
    const attributes = match[2];
    let consumed = "";
    const names = /* @__PURE__ */ new Set();
    ATTRIBUTE_PATTERN.lastIndex = 0;
    let attributeMatch;
    while (attributeMatch = ATTRIBUTE_PATTERN.exec(attributes)) {
      consumed += attributeMatch[0];
      const attribute = attributeMatch[1].toLowerCase();
      const value = attributeMatch[2].slice(1, -1);
      if (!ALLOWED_ATTRIBUTES.has(attribute) || names.has(attribute)) return "";
      names.add(attribute);
      if (attribute === "id" && !/^[A-Za-z_][\w:.-]*$/.test(value)) return "";
      if (/url\(/i.test(value) && !/^url\(#[A-Za-z_][\w:.-]*\)$/.test(value)) return "";
    }
    const remainder = attributes.replace(consumed, "").replace(/\//g, "").trim();
    if (remainder) return "";
  }
  TAG_PATTERN.lastIndex = 0;
  if (stack.length || tagCount === 0 || source.replace(TAG_PATTERN, "").trim()) return "";
  return source;
}
var ALLOWED_ELEMENTS, ALLOWED_ATTRIBUTES, ATTRIBUTE_PATTERN, TAG_PATTERN;
var init_storeLogo = __esm({
  "features/keystone/utils/storeLogo.ts"() {
    "use strict";
    ALLOWED_ELEMENTS = /* @__PURE__ */ new Set([
      "svg",
      "g",
      "path",
      "defs",
      "lineargradient",
      "radialgradient",
      "stop",
      "clippath",
      "rect",
      "circle",
      "ellipse",
      "line",
      "polyline",
      "polygon",
      "title",
      "desc"
    ]);
    ALLOWED_ATTRIBUTES = /* @__PURE__ */ new Set([
      "xmlns",
      "fill",
      "fill-rule",
      "clip-rule",
      "height",
      "width",
      "viewbox",
      "d",
      "clip-path",
      "id",
      "x1",
      "x2",
      "y1",
      "y2",
      "gradientunits",
      "gradienttransform",
      "offset",
      "stop-color",
      "stop-opacity",
      "opacity",
      "cx",
      "cy",
      "r",
      "rx",
      "ry",
      "x",
      "y",
      "transform",
      "stroke",
      "stroke-width",
      "stroke-linecap",
      "stroke-linejoin",
      "points",
      "role",
      "aria-hidden",
      "aria-label",
      "preserveaspectratio"
    ]);
    ATTRIBUTE_PATTERN = /\s+([A-Za-z_:][\w:.-]*)\s*=\s*("[^"]*"|'[^']*')/g;
    TAG_PATTERN = /<\/?\s*([A-Za-z][\w:-]*)([^<>]*)>/g;
  }
});

// features/platform/store-settings/lib/store-logo.ts
function normalizeStoreLogoColor(value) {
  const numeric = Number.parseFloat(String(value ?? DEFAULT_STORE_LOGO_COLOR));
  if (!Number.isFinite(numeric)) return DEFAULT_STORE_LOGO_COLOR;
  return String((numeric % 360 + 360) % 360);
}
var DEFAULT_STORE_LOGO_ICON, DEFAULT_STORE_LOGO_COLOR;
var init_store_logo = __esm({
  "features/platform/store-settings/lib/store-logo.ts"() {
    "use strict";
    DEFAULT_STORE_LOGO_ICON = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" height="100%" width="100%" viewBox="0 0 42 48"><path fill="#155eef" fill-rule="evenodd" d="m22.102 20.86 9.9-9.9L29.88 8.84l-7.339 7.339V3h-3v13.178l-7.339-7.34-2.121 2.122 9.9 9.9 1.06 1.06zm2.12 2.121 9.9-9.9 2.121 2.122-7.339 7.339H42v3H28.904l7.34 7.339L34.121 35l-9.9-9.899-1.06-1.06zM7.96 35.001l9.9-9.899 1.06-1.06-1.06-1.061-9.9-9.9-2.121 2.122 7.339 7.339H.002v3h13.176l-7.34 7.339zm12.02-7.777-9.9 9.9 2.122 2.12 7.339-7.338V45h3V31.906l7.339 7.338L32 37.124l-9.9-9.9-1.06-1.061z" clip-rule="evenodd"/></svg>';
    DEFAULT_STORE_LOGO_COLOR = "0";
  }
});

// features/keystone/models/HospitalProfile.ts
var import_core3, import_fields4, HospitalProfile;
var init_HospitalProfile = __esm({
  "features/keystone/models/HospitalProfile.ts"() {
    "use strict";
    init_publicPhone();
    import_core3 = require("@keystone-6/core");
    import_fields4 = require("@keystone-6/core/fields");
    init_access();
    init_hospitalBrandTheme();
    init_storeLogo();
    init_store_logo();
    init_trackingFields();
    HospitalProfile = (0, import_core3.list)({
      access: {
        operation: {
          query: isSignedIn,
          create: permissions.canManageOnboarding,
          update: permissions.canManageOnboarding,
          delete: denyAccess
        }
      },
      ui: {
        hideDelete: true,
        listView: { initialColumns: ["name", "shortName", "status", "profileKey"] }
      },
      fields: {
        profileKey: (0, import_fields4.text)({ isIndexed: "unique", validation: { isRequired: true }, defaultValue: "primary" }),
        status: (0, import_fields4.select)({
          type: "string",
          options: [
            { label: "Active", value: "active" },
            { label: "Inactive", value: "inactive" }
          ],
          defaultValue: "active",
          validation: { isRequired: true }
        }),
        name: (0, import_fields4.text)({ validation: { isRequired: true } }),
        shortName: (0, import_fields4.text)({ validation: { isRequired: true } }),
        logoIcon: (0, import_fields4.text)({
          db: { isNullable: true },
          defaultValue: DEFAULT_STORE_LOGO_ICON,
          hooks: {
            resolveInput: ({ resolvedData, fieldKey }) => {
              const value = resolvedData[fieldKey];
              return value == null || value === "" ? value : typeof value === "string" ? sanitizeStoreLogoSvg(value) : "";
            },
            validate: ({ inputData, resolvedData, fieldKey, addValidationError }) => {
              const submitted = inputData?.[fieldKey];
              if (submitted != null && submitted !== "" && (typeof submitted !== "string" || !resolvedData?.[fieldKey])) addValidationError("Logo must be a valid, safe SVG document");
            }
          }
        }),
        logoColor: (0, import_fields4.text)({
          db: { isNullable: true },
          defaultValue: DEFAULT_STORE_LOGO_COLOR,
          hooks: { resolveInput: ({ resolvedData, fieldKey }) => resolvedData[fieldKey] === void 0 ? void 0 : normalizeStoreLogoColor(resolvedData[fieldKey]) }
        }),
        brandTheme: (0, import_fields4.select)({
          type: "string",
          options: HOSPITAL_BRAND_THEME_OPTIONS.map(({ label, value }) => ({ label, value })),
          defaultValue: DEFAULT_HOSPITAL_BRAND_THEME,
          validation: { isRequired: true },
          ui: { description: "Approved storefront chrome palette. Clinical warning, error, and success colors remain fixed." }
        }),
        market: (0, import_fields4.text)(),
        description: (0, import_fields4.text)({ ui: { displayMode: "textarea" } }),
        locationName: (0, import_fields4.text)(),
        serviceArea: (0, import_fields4.text)(),
        addressLine1: (0, import_fields4.text)(),
        city: (0, import_fields4.text)(),
        region: (0, import_fields4.text)(),
        postalCode: (0, import_fields4.text)(),
        supportPhone: (0, import_fields4.text)({ hooks: { validate: ({ resolvedData, fieldKey, addValidationError }) => {
          const value = resolvedData?.[fieldKey];
          if (value && !publicPhoneHref(value)) addValidationError("Scheduling phone must be a dialable number with an optional extension");
        } } }),
        supportEmail: (0, import_fields4.text)(),
        media: (0, import_fields4.json)({
          ui: { description: "Canonical public /images/ paths only. Never store credentials, patient data, or remote URLs." }
        }),
        ...trackingFields
      }
    });
  }
});

// features/keystone/models/PhiReadAudit.ts
var import_core4, import_fields5, PhiReadAudit;
var init_PhiReadAudit = __esm({
  "features/keystone/models/PhiReadAudit.ts"() {
    "use strict";
    import_core4 = require("@keystone-6/core");
    import_fields5 = require("@keystone-6/core/fields");
    init_access();
    PhiReadAudit = (0, import_core4.list)({
      access: {
        operation: {
          query: permissions.canAccessAllClinicalData,
          create: denyAccess,
          update: denyAccess,
          delete: denyAccess
        }
      },
      graphql: { omit: { create: true, update: true, delete: true } },
      ui: {
        hideCreate: true,
        hideDelete: true,
        listView: { initialColumns: ["occurredAt", "actorReference", "operationName", "success", "resultCount"] }
      },
      fields: {
        eventType: (0, import_fields5.text)({ defaultValue: "phi.read", validation: { isRequired: true } }),
        occurredAt: (0, import_fields5.timestamp)({ defaultValue: { kind: "now" }, validation: { isRequired: true } }),
        actorReference: (0, import_fields5.text)({ validation: { isRequired: true } }),
        operationType: (0, import_fields5.text)(),
        operationName: (0, import_fields5.text)({ validation: { isRequired: true } }),
        rootFields: (0, import_fields5.json)(),
        selectedFields: (0, import_fields5.json)(),
        selectionDigest: (0, import_fields5.text)({ isIndexed: true, validation: { isRequired: true } }),
        resultReferenceDigest: (0, import_fields5.text)(),
        resourceReferences: (0, import_fields5.json)(),
        scopeReferences: (0, import_fields5.json)(),
        authority: (0, import_fields5.json)(),
        purpose: (0, import_fields5.text)(),
        correlationReference: (0, import_fields5.text)(),
        resultCount: (0, import_fields5.integer)({ defaultValue: 0, validation: { isRequired: true, min: 0 } }),
        success: (0, import_fields5.checkbox)({ defaultValue: true })
      }
    });
  }
});

// features/keystone/models/Patient.ts
var import_core5, import_fields6, Patient;
var init_Patient = __esm({
  "features/keystone/models/Patient.ts"() {
    "use strict";
    import_core5 = require("@keystone-6/core");
    import_fields6 = require("@keystone-6/core/fields");
    init_access();
    init_trackingFields();
    Patient = (0, import_core5.list)({
      access: {
        operation: {
          query: isSignedIn,
          create: permissions.canAccessAllClinicalData,
          update: permissions.canManagePatients,
          delete: denyAccess
        },
        filter: {
          query: rules.canReadPatients,
          update: rules.canReadPatients,
          delete: rules.canReadPatients
        }
      },
      graphql: { omit: { create: true, update: true, delete: true } },
      ui: {
        listView: {
          initialColumns: ["displayName", "status", "dateOfBirth", "phone", "email"]
        }
      },
      fields: {
        firstName: (0, import_fields6.text)({ access: { read: permissions.canReadPatientPhi, update: denyAccess }, validation: { isRequired: true } }),
        lastName: (0, import_fields6.text)({ access: { read: permissions.canReadPatientPhi, update: denyAccess }, validation: { isRequired: true } }),
        displayName: (0, import_fields6.virtual)({
          access: { read: permissions.canReadPatientPhi },
          field: import_core5.graphql.field({
            type: import_core5.graphql.String,
            resolve(item) {
              return `${item.firstName || ""} ${item.lastName || ""}`.trim();
            }
          })
        }),
        status: (0, import_fields6.select)({
          type: "string",
          options: [
            { label: "Active", value: "active" },
            { label: "Inactive", value: "inactive" },
            { label: "Archived", value: "archived" }
          ],
          defaultValue: "active",
          validation: { isRequired: true }
        }),
        dateOfBirth: (0, import_fields6.timestamp)({ label: "Date of birth", access: { read: permissions.canReadPatientPhi, update: denyAccess } }),
        phone: (0, import_fields6.text)({ access: { read: permissions.canReadPatientPhi, update: denyAccess } }),
        email: (0, import_fields6.text)({ access: { read: permissions.canReadPatientPhi, update: denyAccess } }),
        preferredContactMethod: (0, import_fields6.select)({
          access: { read: permissions.canReadPatientPhi },
          type: "string",
          options: [
            { label: "Phone", value: "phone" },
            { label: "SMS", value: "sms" },
            { label: "Email", value: "email" },
            { label: "Legacy portal (read only)", value: "portal" }
          ],
          defaultValue: "phone"
        }),
        emergencyContactName: (0, import_fields6.text)({ access: { read: permissions.canReadPatientPhi } }),
        emergencyContactPhone: (0, import_fields6.text)({ access: { read: permissions.canReadPatientPhi } }),
        insuranceSummary: (0, import_fields6.json)({
          access: { read: permissions.canReadPatientPhi },
          ui: { description: "Lightweight payer, member ID, and coverage notes. Avoid storing full clinical records here." }
        }),
        notes: (0, import_fields6.text)({ access: { read: permissions.canReadPatientPhi }, ui: { displayMode: "textarea" } }),
        facilities: (0, import_fields6.relationship)({
          ref: "Facility.patients",
          many: true,
          access: { create: permissions.canAccessAllClinicalData, update: permissions.canAccessAllClinicalData }
        }),
        appointments: (0, import_fields6.relationship)({
          ref: "Appointment.patient",
          many: true,
          access: { create: () => false, update: () => false }
        }),
        intakeForms: (0, import_fields6.relationship)({
          ref: "IntakeForm.patient",
          many: true,
          access: { create: () => false, update: () => false }
        }),
        messages: (0, import_fields6.relationship)({
          ref: "PatientMessage.patient",
          many: true,
          access: { create: () => false, update: () => false }
        }),
        identifiers: (0, import_fields6.relationship)({ ref: "PatientIdentifier.patient", many: true, access: { create: () => false, update: () => false } }),
        registrations: (0, import_fields6.relationship)({ ref: "PatientRegistration.patient", many: true, access: { create: () => false, update: () => false } }),
        consents: (0, import_fields6.relationship)({ ref: "PatientConsent.patient", many: true, access: { create: () => false, update: () => false } }),
        clinicalAuditLogs: (0, import_fields6.relationship)({ ref: "ClinicalAuditLog.patient", many: true, access: { create: () => false, update: () => false } }),
        portalAccess: (0, import_fields6.relationship)({
          ref: "PatientPortalAccess.patient",
          many: true,
          access: { read: permissions.canAccessAllClinicalData, create: denyAccess, update: denyAccess }
        }),
        user: (0, import_fields6.relationship)({
          ref: "User.patientProfile",
          access: { create: permissions.canAccessAllClinicalData, update: permissions.canAccessAllClinicalData }
        }),
        ...trackingFields
      }
    });
  }
});

// features/keystone/models/PatientIdentifier.ts
var import_core6, import_fields7, PatientIdentifier;
var init_PatientIdentifier = __esm({
  "features/keystone/models/PatientIdentifier.ts"() {
    "use strict";
    import_core6 = require("@keystone-6/core");
    import_fields7 = require("@keystone-6/core/fields");
    init_access();
    PatientIdentifier = (0, import_core6.list)({
      db: {
        extendPrismaSchema(schema) {
          return schema.replace(/facility\s+Facility\?/, "facility Facility").replace(/facilityId\s+String\?/, "facilityId String").replace(/patient\s+Patient\?/, "patient Patient").replace(/patientId\s+String\?/, "patientId String").replace(/createdBy\s+User\?/, "createdBy User").replace(/createdById\s+String\?/, "createdById String").replace(
            /\n}\s*$/,
            '\n\n  @@unique([facilityId, normalizedValue], map: "PatientIdentifier_facility_value_key")\n}'
          );
        }
      },
      access: {
        operation: { query: isSignedIn, create: denyAccess, update: denyAccess, delete: denyAccess },
        filter: { query: rules.canReadPatientIdentifiers }
      },
      graphql: { omit: { create: true, update: true, delete: true } },
      ui: {
        hideCreate: true,
        hideDelete: true,
        isHidden: ({ session }) => !session?.data.role?.canManagePatients,
        listView: { initialColumns: ["identifierType", "maskedValue", "facility", "patient", "status", "createdAt"] }
      },
      fields: {
        identifierType: (0, import_fields7.select)({
          type: "string",
          options: [{ label: "Medical record number", value: "mrn" }],
          defaultValue: "mrn",
          validation: { isRequired: true }
        }),
        normalizedValue: (0, import_fields7.text)({
          access: { read: permissions.canReadPatientPhi },
          validation: { isRequired: true },
          ui: { description: "Facility-scoped normalized identifier. Writes are available only through registration workflows." }
        }),
        maskedValue: (0, import_fields7.text)({ validation: { isRequired: true } }),
        status: (0, import_fields7.select)({
          type: "string",
          options: [
            { label: "Active", value: "active" },
            { label: "Superseded", value: "superseded" }
          ],
          defaultValue: "active",
          validation: { isRequired: true }
        }),
        facility: (0, import_fields7.relationship)({ ref: "Facility.patientIdentifiers" }),
        patient: (0, import_fields7.relationship)({ ref: "Patient.identifiers" }),
        createdBy: (0, import_fields7.relationship)({ ref: "User" }),
        createdAt: (0, import_fields7.timestamp)({ validation: { isRequired: true }, defaultValue: { kind: "now" } })
      }
    });
  }
});

// features/keystone/models/PatientRegistration.ts
var import_core7, import_fields8, PatientRegistration;
var init_PatientRegistration = __esm({
  "features/keystone/models/PatientRegistration.ts"() {
    "use strict";
    import_core7 = require("@keystone-6/core");
    import_fields8 = require("@keystone-6/core/fields");
    init_access();
    PatientRegistration = (0, import_core7.list)({
      db: {
        extendPrismaSchema(schema) {
          return schema.replace(/facility\s+Facility\?/, "facility Facility").replace(/facilityId\s+String\?/, "facilityId String").replace(/patient\s+Patient\?/, "patient Patient").replace(/patientId\s+String\?/, "patientId String").replace(/identifier\s+PatientIdentifier\?/, "identifier PatientIdentifier").replace(/identifierId\s+String\?/, "identifierId String").replace(/consent\s+PatientConsent\?/, "consent PatientConsent").replace(/consentId\s+String\?/, "consentId String").replace(/auditLog\s+ClinicalAuditLog\?/, "auditLog ClinicalAuditLog").replace(/auditLogId\s+String\?/, "auditLogId String").replace(/createdBy\s+User\?/, "createdBy User").replace(/createdById\s+String\?/, "createdById String").replace(/identifierId\s+String(\s+@map)/, "identifierId String @unique$1").replace(/consentId\s+String(\s+@map)/, "consentId String @unique$1").replace(/auditLogId\s+String(\s+@map)/, "auditLogId String @unique$1").replace(
            /\n}\s*$/,
            '\n\n  @@unique([facilityId, idempotencyKeyHash], map: "PatientRegistration_facility_idempotency_key")\n}'
          );
        }
      },
      access: {
        operation: { query: isSignedIn, create: denyAccess, update: denyAccess, delete: denyAccess },
        filter: { query: rules.canReadPatientRegistrations }
      },
      graphql: { omit: { create: true, update: true, delete: true } },
      ui: {
        hideCreate: true,
        hideDelete: true,
        isHidden: ({ session }) => !session?.data.role?.canManagePatients,
        listView: { initialColumns: ["status", "facility", "patient", "identifier", "duplicateResolution", "createdAt"] }
      },
      fields: {
        status: (0, import_fields8.select)({
          type: "string",
          options: [{ label: "Completed", value: "completed" }],
          defaultValue: "completed",
          validation: { isRequired: true }
        }),
        facility: (0, import_fields8.relationship)({ ref: "Facility.patientRegistrations" }),
        patient: (0, import_fields8.relationship)({ ref: "Patient.registrations" }),
        identifier: (0, import_fields8.relationship)({ ref: "PatientIdentifier" }),
        consent: (0, import_fields8.relationship)({ ref: "PatientConsent" }),
        auditLog: (0, import_fields8.relationship)({ ref: "ClinicalAuditLog" }),
        createdBy: (0, import_fields8.relationship)({ ref: "User" }),
        idempotencyKeyHash: (0, import_fields8.text)({
          access: { read: permissions.canAccessAllClinicalData },
          validation: { isRequired: true },
          ui: { description: "SHA-256 digest only. The submitted idempotency key is never stored." }
        }),
        requestHash: (0, import_fields8.text)({
          access: { read: permissions.canAccessAllClinicalData },
          validation: { isRequired: true }
        }),
        duplicateResolution: (0, import_fields8.select)({
          type: "string",
          options: [
            { label: "No candidate", value: "no_candidate" },
            { label: "Create distinct patient", value: "create_new" },
            { label: "Link existing patient", value: "link_existing" }
          ],
          validation: { isRequired: true }
        }),
        provenance: (0, import_fields8.json)({
          access: { read: permissions.canReadAuditMetadata },
          ui: { description: "Bounded workflow provenance only; never store MRNs, contact values, or free-text PHI." }
        }),
        createdAt: (0, import_fields8.timestamp)({ validation: { isRequired: true }, defaultValue: { kind: "now" } })
      }
    });
  }
});

// features/keystone/models/Provider.ts
var import_core8, import_fields9, Provider;
var init_Provider = __esm({
  "features/keystone/models/Provider.ts"() {
    "use strict";
    import_core8 = require("@keystone-6/core");
    import_fields9 = require("@keystone-6/core/fields");
    init_access();
    init_trackingFields();
    Provider = (0, import_core8.list)({
      access: {
        operation: {
          query: isSignedIn,
          create: permissions.canAccessAllClinicalData,
          update: permissions.canAccessAllClinicalData,
          delete: permissions.canAccessAllClinicalData
        },
        filter: {
          query: rules.canReadProviders,
          update: rules.canReadProviders,
          delete: rules.canReadProviders
        }
      },
      ui: {
        listView: {
          initialColumns: ["displayName", "status", "specialty", "locationName"]
        }
      },
      fields: {
        onboardingKey: (0, import_fields9.text)({
          db: { isNullable: true },
          isIndexed: "unique",
          access: { read: permissions.canAccessAllClinicalData, create: () => false, update: () => false },
          ui: { description: "Stable setup key. It is never used as a clinical credential or public identifier." }
        }),
        firstName: (0, import_fields9.text)({ validation: { isRequired: true } }),
        lastName: (0, import_fields9.text)({ validation: { isRequired: true } }),
        displayName: (0, import_fields9.virtual)({
          field: import_core8.graphql.field({
            type: import_core8.graphql.String,
            resolve(item) {
              const credentials = item.credentials ? `, ${item.credentials}` : "";
              return `${item.firstName || ""} ${item.lastName || ""}${credentials}`.trim();
            }
          })
        }),
        credentials: (0, import_fields9.text)({ ui: { description: "Examples: MD, DO, NP, PA, LCSW" } }),
        specialty: (0, import_fields9.text)(),
        status: (0, import_fields9.select)({
          type: "string",
          options: [
            { label: "Active", value: "active" },
            { label: "Unavailable", value: "unavailable" },
            { label: "Inactive", value: "inactive" }
          ],
          defaultValue: "active",
          validation: { isRequired: true }
        }),
        bio: (0, import_fields9.text)({ ui: { displayMode: "textarea" } }),
        locationName: (0, import_fields9.text)({ label: "Primary location" }),
        facilities: (0, import_fields9.relationship)({
          ref: "Facility.providers",
          many: true,
          access: { create: permissions.canAccessAllClinicalData, update: permissions.canAccessAllClinicalData }
        }),
        appointmentTypes: (0, import_fields9.relationship)({ ref: "AppointmentType.providers", many: true }),
        scheduleBlocks: (0, import_fields9.relationship)({
          ref: "ProviderScheduleBlock.provider",
          many: true,
          access: { create: () => false, update: () => false }
        }),
        appointments: (0, import_fields9.relationship)({
          ref: "Appointment.provider",
          many: true,
          access: { create: () => false, update: () => false }
        }),
        clinicians: (0, import_fields9.relationship)({
          ref: "Clinician.provider",
          many: true,
          access: { create: () => false, update: () => false }
        }),
        user: (0, import_fields9.relationship)({
          ref: "User.providerProfile",
          access: { create: permissions.canAccessAllClinicalData, update: permissions.canAccessAllClinicalData }
        }),
        metadata: (0, import_fields9.json)({ access: { read: permissions.canReadProviderSensitive } }),
        ...trackingFields
      }
    });
  }
});

// features/keystone/models/AppointmentType.ts
var import_core9, import_fields10, AppointmentType;
var init_AppointmentType = __esm({
  "features/keystone/models/AppointmentType.ts"() {
    "use strict";
    import_core9 = require("@keystone-6/core");
    import_fields10 = require("@keystone-6/core/fields");
    init_access();
    init_trackingFields();
    AppointmentType = (0, import_core9.list)({
      access: {
        operation: {
          query: isSignedIn,
          create: permissions.canAccessAllClinicalData,
          update: permissions.canAccessAllClinicalData,
          delete: permissions.canAccessAllClinicalData
        }
      },
      ui: {
        listView: {
          initialColumns: ["name", "status", "durationMinutes", "priceCents"]
        }
      },
      fields: {
        name: (0, import_fields10.text)({ validation: { isRequired: true } }),
        slug: (0, import_fields10.text)({ isIndexed: "unique", validation: { isRequired: true } }),
        description: (0, import_fields10.text)({ ui: { displayMode: "textarea" } }),
        status: (0, import_fields10.select)({
          type: "string",
          options: [
            { label: "Bookable", value: "bookable" },
            { label: "Internal only", value: "internal" },
            { label: "Paused", value: "paused" }
          ],
          defaultValue: "bookable",
          validation: { isRequired: true }
        }),
        durationMinutes: (0, import_fields10.integer)({ validation: { isRequired: true, min: 5, max: 480 }, defaultValue: 30 }),
        bufferBeforeMinutes: (0, import_fields10.integer)({ defaultValue: 0, validation: { min: 0, max: 240 } }),
        bufferAfterMinutes: (0, import_fields10.integer)({ defaultValue: 0, validation: { min: 0, max: 240 } }),
        priceCents: (0, import_fields10.integer)({ defaultValue: 0, validation: { min: 0 }, ui: { description: "Optional self-pay estimate in cents." } }),
        formattedPrice: (0, import_fields10.virtual)({
          field: import_core9.graphql.field({
            type: import_core9.graphql.String,
            resolve(item) {
              const cents = Number(item.priceCents || 0);
              return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
            }
          })
        }),
        intakeRequirements: (0, import_fields10.json)({ ui: { description: "Checklist of intake forms or documents required before visit." } }),
        providers: (0, import_fields10.relationship)({
          ref: "Provider.appointmentTypes",
          many: true,
          access: { create: permissions.canAccessAllClinicalData, update: permissions.canAccessAllClinicalData }
        }),
        appointments: (0, import_fields10.relationship)({ ref: "Appointment.appointmentType", many: true, access: { create: () => false, update: () => false } }),
        ...trackingFields
      }
    });
  }
});

// features/keystone/models/ProviderScheduleBlock.ts
var import_core10, import_fields11, ProviderScheduleBlock;
var init_ProviderScheduleBlock = __esm({
  "features/keystone/models/ProviderScheduleBlock.ts"() {
    "use strict";
    import_core10 = require("@keystone-6/core");
    import_fields11 = require("@keystone-6/core/fields");
    init_access();
    init_trackingFields();
    ProviderScheduleBlock = (0, import_core10.list)({
      db: {
        extendPrismaSchema(schema) {
          return schema.replace(/facility\s+Facility\?/, "facility Facility").replace(/facilityId\s+String\?/, "facilityId String").replace(
            /\n}\s*$/,
            '\n\n  @@index([providerId, startsAt, endsAt], map: "ProviderScheduleBlock_provider_window_idx")\n}'
          );
        }
      },
      access: {
        operation: {
          query: isSignedIn,
          create: permissions.canManageScheduling,
          update: permissions.canManageScheduling,
          delete: permissions.canManageScheduling
        },
        filter: {
          query: rules.canReadProviderScheduleBlocks,
          update: rules.canReadProviderScheduleBlocks,
          delete: rules.canReadProviderScheduleBlocks
        }
      },
      hooks: {
        validate: async ({ operation, inputData, resolvedData, item, context, addValidationError }) => {
          if (operation === "create") {
            const providerId = inputData.provider?.connect?.id;
            const facilityId = inputData.facility?.connect?.id;
            if (!providerId || !facilityId) {
              addValidationError("Provider and facility are required for a schedule block");
            } else {
              const [provider, facility] = await Promise.all([
                context.query.Provider.findOne({ where: { id: providerId }, query: "id facilities { id }" }),
                context.query.Facility.findOne({ where: { id: facilityId }, query: "id status" })
              ]);
              if (!provider || !facility || facility.status !== "active" || !provider.facilities?.some((item2) => item2.id === facilityId)) {
                addValidationError("Provider and facility are not an accessible active scheduling pair");
              }
            }
          }
          const startsAt = resolvedData?.startsAt ?? item?.startsAt;
          const endsAt = resolvedData?.endsAt ?? item?.endsAt;
          if (!startsAt || !endsAt || new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
            addValidationError("Schedule block must end after it starts");
          }
          const maxAppointments = resolvedData?.maxAppointments ?? item?.maxAppointments ?? 1;
          if (maxAppointments !== 1) {
            addValidationError("Provider schedule blocks currently support exactly one appointment at a time");
          }
        }
      },
      ui: {
        listView: {
          initialColumns: ["scheduleLabel", "provider", "blockType", "startsAt", "endsAt"]
        }
      },
      fields: {
        provider: (0, import_fields11.relationship)({
          ref: "Provider.scheduleBlocks",
          access: { create: permissions.canManageScheduling, update: denyAccess }
        }),
        facility: (0, import_fields11.relationship)({ ref: "Facility", access: { create: permissions.canManageScheduling, update: denyAccess } }),
        onboardingKey: (0, import_fields11.text)({ db: { isNullable: true }, isIndexed: "unique", ui: { description: "Stable onboarding identifier used to make seeded schedule blocks rerunnable." } }),
        blockType: (0, import_fields11.select)({
          type: "string",
          options: [
            { label: "Available", value: "available" },
            { label: "Unavailable", value: "unavailable" },
            { label: "On call", value: "on_call" },
            { label: "Admin time", value: "admin_time" }
          ],
          defaultValue: "available",
          validation: { isRequired: true }
        }),
        startsAt: (0, import_fields11.timestamp)({ validation: { isRequired: true } }),
        endsAt: (0, import_fields11.timestamp)({ validation: { isRequired: true } }),
        recurrenceRule: (0, import_fields11.text)({ ui: { description: "Optional RRULE-style recurrence for future slot generation." } }),
        maxAppointments: (0, import_fields11.integer)({ defaultValue: 1, validation: { isRequired: true, min: 1, max: 1 } }),
        locationName: (0, import_fields11.text)(),
        notes: (0, import_fields11.text)({ access: { read: permissions.canReadProviderSensitive }, ui: { displayMode: "textarea" } }),
        scheduleLabel: (0, import_fields11.virtual)({
          field: import_core10.graphql.field({
            type: import_core10.graphql.String,
            resolve(item) {
              return `${item.blockType || "schedule"} \u2022 ${item.startsAt || ""}`;
            }
          })
        }),
        ...trackingFields
      }
    });
  }
});

// features/keystone/models/Appointment.ts
var import_core11, import_fields12, Appointment;
var init_Appointment = __esm({
  "features/keystone/models/Appointment.ts"() {
    "use strict";
    import_core11 = require("@keystone-6/core");
    import_fields12 = require("@keystone-6/core/fields");
    init_access();
    init_trackingFields();
    Appointment = (0, import_core11.list)({
      db: {
        extendPrismaSchema(schema) {
          return schema.replace(/facility\s+Facility\?/, "facility Facility").replace(/facilityId\s+String\?/, "facilityId String").replace(/patient\s+Patient\?/, "patient Patient").replace(/patientId\s+String\?/, "patientId String").replace(/provider\s+Provider\?/, "provider Provider").replace(/providerId\s+String\?/, "providerId String").replace(/appointmentType\s+AppointmentType\?/, "appointmentType AppointmentType").replace(/appointmentTypeId\s+String\?/, "appointmentTypeId String");
        }
      },
      access: {
        operation: {
          query: isSignedIn,
          create: permissions.canAccessAllClinicalData,
          update: permissions.canManageAppointments,
          delete: denyAccess
        },
        filter: {
          query: rules.canReadAppointments,
          update: rules.canReadAppointments
        }
      },
      graphql: {
        omit: { create: true, update: true, delete: true }
      },
      ui: {
        listView: {
          initialColumns: ["appointmentNumber", "status", "patient", "provider", "startsAt"]
        }
      },
      fields: {
        appointmentNumber: (0, import_fields12.text)({
          isIndexed: "unique",
          access: { create: permissions.canAccessAllClinicalData, update: denyAccess },
          validation: { isRequired: true }
        }),
        bookingLockKey: (0, import_fields12.text)({
          isIndexed: "unique",
          access: { read: denyAccess, create: permissions.canManageOnboarding, update: denyAccess },
          ui: { description: "Provider + start-time lock used to prevent duplicate active bookings for the same slot. Cleared when cancelled." }
        }),
        transitionVersion: (0, import_fields12.integer)({
          defaultValue: 1,
          validation: { isRequired: true, min: 1 },
          access: { create: permissions.canAccessAllClinicalData, update: denyAccess }
        }),
        status: (0, import_fields12.select)({
          type: "string",
          access: { create: permissions.canManageOnboarding, update: denyAccess },
          options: [
            { label: "Requested", value: "requested" },
            { label: "Confirmed", value: "confirmed" },
            { label: "Checked in", value: "checked_in" },
            { label: "In visit", value: "in_visit" },
            { label: "Completed", value: "completed" },
            { label: "Cancelled", value: "cancelled" },
            { label: "No show", value: "no_show" }
          ],
          defaultValue: "requested",
          validation: { isRequired: true }
        }),
        patient: (0, import_fields12.relationship)({
          ref: "Patient.appointments",
          access: { create: permissions.canAccessAllClinicalData, update: denyAccess }
        }),
        provider: (0, import_fields12.relationship)({
          ref: "Provider.appointments",
          access: { create: permissions.canAccessAllClinicalData, update: denyAccess }
        }),
        facility: (0, import_fields12.relationship)({
          ref: "Facility.appointments",
          access: { create: permissions.canAccessAllClinicalData, update: denyAccess }
        }),
        appointmentType: (0, import_fields12.relationship)({
          ref: "AppointmentType.appointments",
          access: { create: permissions.canAccessAllClinicalData, update: denyAccess }
        }),
        startsAt: (0, import_fields12.timestamp)({
          access: { create: permissions.canAccessAllClinicalData, update: denyAccess },
          validation: { isRequired: true }
        }),
        endsAt: (0, import_fields12.timestamp)({
          access: { create: permissions.canAccessAllClinicalData, update: denyAccess },
          validation: { isRequired: true }
        }),
        locationName: (0, import_fields12.text)({ access: { create: permissions.canAccessAllClinicalData, update: denyAccess } }),
        reasonForVisit: (0, import_fields12.text)({ access: { read: permissions.canReadAppointmentPhi }, ui: { displayMode: "textarea" } }),
        source: (0, import_fields12.select)({
          type: "string",
          access: { create: permissions.canAccessAllClinicalData, update: denyAccess },
          options: [
            { label: "Legacy patient portal (read only)", value: "patient_portal" },
            { label: "Front desk", value: "front_desk" },
            { label: "Phone", value: "phone" },
            { label: "Referral", value: "referral" }
          ],
          defaultValue: "front_desk"
        }),
        estimatedFeeCents: (0, import_fields12.integer)({ access: { read: permissions.canReadAppointmentPhi }, defaultValue: 0, validation: { min: 0 } }),
        checkInAt: (0, import_fields12.timestamp)({ access: { create: permissions.canManageOnboarding, update: denyAccess } }),
        completedAt: (0, import_fields12.timestamp)({ access: { create: permissions.canManageOnboarding, update: denyAccess } }),
        cancellationReason: (0, import_fields12.text)({
          access: { read: permissions.canReadAppointmentPhi, create: permissions.canManageOnboarding, update: denyAccess },
          ui: { displayMode: "textarea" }
        }),
        intakeForms: (0, import_fields12.relationship)({
          ref: "IntakeForm.appointment",
          many: true,
          access: { create: permissions.canAccessAllClinicalData, update: permissions.canAccessAllClinicalData }
        }),
        messages: (0, import_fields12.relationship)({
          ref: "PatientMessage.appointment",
          many: true,
          access: { create: permissions.canAccessAllClinicalData, update: permissions.canAccessAllClinicalData }
        }),
        careQueueTickets: (0, import_fields12.relationship)({
          ref: "CareQueueTicket.appointment",
          many: true,
          access: { read: ({ session }) => Boolean(session?.data.role?.canManageAppointments || session?.data.role?.canManagePatients || session?.data.role?.canAccessAllClinicalData) }
        }),
        consents: (0, import_fields12.relationship)({ ref: "PatientConsent.appointment", many: true, access: { create: () => false, update: () => false } }),
        clinicalAuditLogs: (0, import_fields12.relationship)({ ref: "ClinicalAuditLog.appointment", many: true, access: { create: () => false, update: () => false } }),
        operationalNotes: (0, import_fields12.text)({
          access: { read: permissions.canReadAppointmentPhi, create: permissions.canAccessAllClinicalData, update: denyAccess },
          ui: { displayMode: "textarea" }
        }),
        metadata: (0, import_fields12.json)({ access: { read: permissions.canReadAppointmentPhi } }),
        appointmentSummary: (0, import_fields12.virtual)({
          field: import_core11.graphql.field({
            type: import_core11.graphql.String,
            resolve(item) {
              return `${item.appointmentNumber || "Appointment"} \u2022 ${item.status || "requested"}`;
            }
          })
        }),
        ...trackingFields
      }
    });
  }
});

// features/keystone/models/IntakeForm.ts
var import_core12, import_fields13, IntakeForm;
var init_IntakeForm = __esm({
  "features/keystone/models/IntakeForm.ts"() {
    "use strict";
    import_core12 = require("@keystone-6/core");
    import_fields13 = require("@keystone-6/core/fields");
    init_access();
    init_trackingFields();
    IntakeForm = (0, import_core12.list)({
      db: {
        extendPrismaSchema(schema) {
          return schema.replace(/facility\s+Facility\?/, "facility Facility").replace(/facilityId\s+String\?/, "facilityId String");
        }
      },
      access: {
        operation: {
          query: isSignedIn,
          create: permissions.canAccessAllClinicalData,
          update: permissions.canManageIntake,
          delete: denyAccess
        },
        filter: {
          query: rules.canReadIntakeForms,
          update: rules.canReadIntakeForms
        }
      },
      graphql: {
        omit: { create: true, update: true, delete: true }
      },
      ui: {
        listView: {
          initialColumns: ["intakeLabel", "status", "patient", "appointment", "submittedAt"]
        }
      },
      fields: {
        operationKeyHash: (0, import_fields13.text)({ isIndexed: "unique", access: { read: denyAccess }, validation: { isRequired: true } }),
        requestHash: (0, import_fields13.text)({ access: { read: denyAccess }, validation: { isRequired: true } }),
        title: (0, import_fields13.text)({ validation: { isRequired: true }, defaultValue: "Patient intake" }),
        transitionVersion: (0, import_fields13.integer)({
          defaultValue: 1,
          validation: { isRequired: true, min: 1 },
          access: { create: permissions.canAccessAllClinicalData, update: denyAccess }
        }),
        status: (0, import_fields13.select)({
          type: "string",
          access: { create: permissions.canManageOnboarding, update: denyAccess },
          options: [
            { label: "Access active; delivery not evidenced", value: "not_sent" },
            { label: "Legacy sent (read only)", value: "sent" },
            { label: "Legacy in progress (read only)", value: "in_progress" },
            { label: "Submitted", value: "submitted" },
            { label: "Needs review", value: "needs_review" },
            { label: "Reviewed", value: "reviewed" }
          ],
          defaultValue: "not_sent",
          validation: { isRequired: true }
        }),
        facility: (0, import_fields13.relationship)({
          ref: "Facility",
          access: { create: permissions.canAccessAllClinicalData, update: denyAccess }
        }),
        patient: (0, import_fields13.relationship)({
          ref: "Patient.intakeForms",
          access: { create: permissions.canAccessAllClinicalData, update: denyAccess }
        }),
        appointment: (0, import_fields13.relationship)({
          ref: "Appointment.intakeForms",
          access: { create: permissions.canAccessAllClinicalData, update: denyAccess }
        }),
        templateKey: (0, import_fields13.text)({ defaultValue: "new_patient" }),
        accessCodeHash: (0, import_fields13.text)({
          isIndexed: "unique",
          isFilterable: false,
          isOrderable: false,
          db: { isNullable: true },
          access: { read: denyAccess, create: permissions.canManageOnboarding, update: denyAccess },
          ui: { itemView: { fieldMode: "hidden" }, listView: { fieldMode: "hidden" } }
        }),
        accessExpiresAt: (0, import_fields13.timestamp)({
          validation: { isRequired: true },
          access: { read: permissions.canReadIntakePhi, create: permissions.canManageOnboarding, update: denyAccess }
        }),
        accessUsedAt: (0, import_fields13.timestamp)({
          access: { read: permissions.canReadIntakePhi, create: permissions.canManageOnboarding, update: denyAccess }
        }),
        accessRevokedAt: (0, import_fields13.timestamp)({
          access: { read: permissions.canReadIntakePhi, create: permissions.canManageOnboarding, update: denyAccess }
        }),
        formSchema: (0, import_fields13.json)({ ui: { description: "Versioned fields shown to the patient." } }),
        responses: (0, import_fields13.json)({
          access: { read: permissions.canReadIntakePhi, create: permissions.canManageOnboarding, update: denyAccess },
          ui: { description: "Patient-submitted answers. Keep scope to intake/admin context, not full EMR charting." }
        }),
        sentAt: (0, import_fields13.timestamp)({ access: { create: permissions.canManageOnboarding, update: denyAccess } }),
        submittedAt: (0, import_fields13.timestamp)({ access: { create: permissions.canManageOnboarding, update: denyAccess } }),
        reviewedAt: (0, import_fields13.timestamp)({ access: { create: permissions.canManageOnboarding, update: denyAccess } }),
        reviewedBy: (0, import_fields13.relationship)({ ref: "User.reviewedIntakeForms", access: { create: permissions.canManageOnboarding, update: denyAccess } }),
        reviewNotes: (0, import_fields13.text)({
          access: { read: permissions.canReadIntakePhi, create: permissions.canManageOnboarding, update: denyAccess },
          ui: { displayMode: "textarea" }
        }),
        consents: (0, import_fields13.relationship)({ ref: "PatientConsent.intakeForm", many: true, access: { create: () => false, update: () => false } }),
        clinicalAuditLogs: (0, import_fields13.relationship)({ ref: "ClinicalAuditLog.intakeForm", many: true, access: { create: () => false, update: () => false } }),
        intakeLabel: (0, import_fields13.virtual)({
          field: import_core12.graphql.field({
            type: import_core12.graphql.String,
            resolve(item) {
              return `${item.title || "Intake"} \u2022 ${item.status || "not_sent"}`;
            }
          })
        }),
        ...trackingFields
      }
    });
  }
});

// features/keystone/models/PatientMessage.ts
var import_core13, import_fields14, denyMutation, PatientMessage;
var init_PatientMessage = __esm({
  "features/keystone/models/PatientMessage.ts"() {
    "use strict";
    import_core13 = require("@keystone-6/core");
    import_fields14 = require("@keystone-6/core/fields");
    init_access();
    init_trackingFields();
    denyMutation = () => false;
    PatientMessage = (0, import_core13.list)({
      db: {
        extendPrismaSchema(schema) {
          return schema.replace(/facility\s+Facility\?/, "facility Facility").replace(/facilityId\s+String\?/, "facilityId String");
        }
      },
      access: {
        operation: {
          query: isSignedIn,
          create: denyMutation,
          update: denyMutation,
          delete: denyMutation
        },
        filter: {
          query: rules.canReadPatientMessages,
          update: rules.canReadPatientMessages
        }
      },
      graphql: {
        omit: { create: true, update: true, delete: true }
      },
      ui: {
        hideCreate: true,
        hideDelete: true,
        listView: {
          initialColumns: ["messageLabel", "channel", "status", "patient", "appointment"]
        }
      },
      fields: {
        operationKeyHash: (0, import_fields14.text)({ isIndexed: "unique", access: { read: denyAccess }, validation: { isRequired: true } }),
        requestHash: (0, import_fields14.text)({ access: { read: denyAccess }, validation: { isRequired: true } }),
        transitionVersion: (0, import_fields14.integer)({ defaultValue: 1, validation: { isRequired: true, min: 1 }, access: { update: denyAccess } }),
        purpose: (0, import_fields14.select)({ type: "string", access: { update: denyAccess }, options: [
          { label: "Care operations", value: "care_operations" },
          { label: "Billing", value: "billing" },
          { label: "General", value: "general" }
        ], defaultValue: "care_operations", validation: { isRequired: true } }),
        facility: (0, import_fields14.relationship)({ ref: "Facility", access: { create: denyAccess, update: denyAccess } }),
        installation: (0, import_fields14.relationship)({ ref: "IntegrationInstallation", access: { create: denyAccess, update: denyAccess } }),
        template: (0, import_fields14.relationship)({ ref: "CommunicationTemplate", access: { create: denyAccess, update: denyAccess } }),
        patient: (0, import_fields14.relationship)({ ref: "Patient.messages", access: { update: denyMutation } }),
        appointment: (0, import_fields14.relationship)({ ref: "Appointment.messages", access: { update: denyMutation } }),
        direction: (0, import_fields14.select)({
          type: "string",
          access: { update: denyMutation },
          options: [
            { label: "Outbound", value: "outbound" },
            { label: "Inbound", value: "inbound" }
          ],
          defaultValue: "outbound",
          validation: { isRequired: true }
        }),
        channel: (0, import_fields14.select)({
          type: "string",
          access: { update: denyMutation },
          options: [
            { label: "SMS", value: "sms" },
            { label: "Email", value: "email" },
            { label: "Phone", value: "phone" },
            { label: "Legacy portal (read only)", value: "portal" }
          ],
          defaultValue: "sms",
          validation: { isRequired: true }
        }),
        subject: (0, import_fields14.text)({ access: { read: permissions.canReadMessageContent, update: denyMutation } }),
        body: (0, import_fields14.text)({
          access: { read: permissions.canReadMessageContent, update: denyMutation },
          validation: { isRequired: true },
          ui: { displayMode: "textarea" }
        }),
        status: (0, import_fields14.select)({
          type: "string",
          access: { update: denyMutation },
          options: [
            { label: "Draft", value: "draft" },
            { label: "Manual follow-up required", value: "manual_required" },
            { label: "Manual follow-up completed", value: "completed" },
            { label: "Queued", value: "queued" },
            { label: "Sent", value: "sent" },
            { label: "Delivered", value: "delivered" },
            { label: "Failed", value: "failed" },
            { label: "Received", value: "received" }
          ],
          defaultValue: "draft",
          validation: { isRequired: true }
        }),
        sentAt: (0, import_fields14.timestamp)({ access: { update: denyMutation } }),
        deliveredAt: (0, import_fields14.timestamp)({ access: { update: denyMutation } }),
        externalId: (0, import_fields14.text)({
          isIndexed: true,
          access: { read: permissions.canReadMessageContent, update: denyMutation }
        }),
        metadata: (0, import_fields14.json)({ access: { read: permissions.canReadMessageContent, update: denyMutation } }),
        messageLabel: (0, import_fields14.virtual)({
          field: import_core13.graphql.field({
            type: import_core13.graphql.String,
            resolve(item) {
              return `${item.channel || "message"} \u2022 ${item.status || "draft"}`;
            }
          })
        }),
        ...trackingFields
      }
    });
  }
});

// features/keystone/models/PatientPortalAccess.ts
var import_core14, import_fields15, PatientPortalAccess;
var init_PatientPortalAccess = __esm({
  "features/keystone/models/PatientPortalAccess.ts"() {
    "use strict";
    import_core14 = require("@keystone-6/core");
    import_fields15 = require("@keystone-6/core/fields");
    init_access();
    init_trackingFields();
    PatientPortalAccess = (0, import_core14.list)({
      db: {
        extendPrismaSchema(schema) {
          return schema.replace(/facility\s+Facility\?/, "facility Facility").replace(/facilityId\s+String\?/, "facilityId String").replace(/patient\s+Patient\?/, "patient Patient").replace(/patientId\s+String\?/, "patientId String").replace(/\n}\s*$/, '\n\n  @@unique([facilityId, patientId], map: "PatientPortalAccess_facility_patient_key")\n}');
        }
      },
      access: {
        operation: {
          query: permissions.canAccessAllClinicalData,
          create: denyAccess,
          update: denyAccess,
          delete: denyAccess
        }
      },
      graphql: { omit: { create: true, update: true, delete: true } },
      ui: {
        isHidden: true,
        listView: {
          initialColumns: ["patient", "status", "inviteEmail", "lastLoginAt"]
        }
      },
      fields: {
        operationKeyHash: (0, import_fields15.text)({ isIndexed: "unique", access: { read: denyAccess }, validation: { isRequired: true } }),
        requestHash: (0, import_fields15.text)({ access: { read: denyAccess }, validation: { isRequired: true } }),
        facility: (0, import_fields15.relationship)({
          ref: "Facility",
          access: { create: permissions.canAccessAllClinicalData, update: denyAccess }
        }),
        patient: (0, import_fields15.relationship)({
          ref: "Patient.portalAccess",
          access: { create: permissions.canAccessAllClinicalData, update: denyAccess }
        }),
        user: (0, import_fields15.relationship)({
          ref: "User.patientPortalAccess",
          access: { create: permissions.canAccessAllClinicalData, update: denyAccess }
        }),
        status: (0, import_fields15.select)({
          type: "string",
          access: { create: permissions.canManageOnboarding, update: denyAccess },
          options: [
            { label: "Invited", value: "invited" },
            { label: "Active", value: "active" },
            { label: "Suspended", value: "suspended" },
            { label: "Closed", value: "closed" }
          ],
          defaultValue: "invited",
          validation: { isRequired: true }
        }),
        inviteEmail: (0, import_fields15.text)({ access: { read: permissions.canReadPortalSensitive } }),
        inviteTokenDigest: (0, import_fields15.text)({
          isFilterable: false,
          isOrderable: false,
          access: { read: denyAccess, create: permissions.canManageOnboarding, update: denyAccess }
        }),
        invitedAt: (0, import_fields15.timestamp)({ access: { create: permissions.canManageOnboarding, update: denyAccess } }),
        inviteExpiresAt: (0, import_fields15.timestamp)({ access: { read: permissions.canReadPortalSensitive, create: permissions.canManageOnboarding, update: denyAccess } }),
        inviteUsedAt: (0, import_fields15.timestamp)({ access: { read: permissions.canReadPortalSensitive, create: permissions.canManageOnboarding, update: denyAccess } }),
        inviteRevokedAt: (0, import_fields15.timestamp)({ access: { read: permissions.canReadPortalSensitive, create: permissions.canManageOnboarding, update: denyAccess } }),
        acceptedAt: (0, import_fields15.timestamp)({ access: { create: permissions.canManageOnboarding, update: denyAccess } }),
        lastLoginAt: (0, import_fields15.timestamp)({ access: { create: permissions.canManageOnboarding, update: denyAccess } }),
        ...trackingFields
      }
    });
  }
});

// features/keystone/models/PatientConsent.ts
var import_core15, import_fields16, denyMutation2, PatientConsent;
var init_PatientConsent = __esm({
  "features/keystone/models/PatientConsent.ts"() {
    "use strict";
    import_core15 = require("@keystone-6/core");
    import_fields16 = require("@keystone-6/core/fields");
    init_access();
    denyMutation2 = () => false;
    PatientConsent = (0, import_core15.list)({
      db: {
        extendPrismaSchema(schema) {
          return schema.replace(/facility\s+Facility\?/, "facility Facility").replace(/facilityId\s+String\?/, "facilityId String");
        }
      },
      access: {
        operation: {
          query: (args) => permissions.canManageIntake(args) || permissions.canManagePatients(args) || permissions.canAccessAllClinicalData(args),
          create: denyMutation2,
          update: denyMutation2,
          delete: denyMutation2
        },
        filter: {
          query: rules.canReadPatientConsents
        }
      },
      graphql: {
        omit: { create: true, update: true, delete: true }
      },
      ui: {
        hideCreate: true,
        hideDelete: true,
        isHidden: ({ session }) => !session?.data.role?.canManageIntake && !session?.data.role?.canManagePatients && !session?.data.role?.canAccessAllClinicalData,
        listView: { initialColumns: ["consentType", "decision", "effectiveAt", "patient", "appointment", "intakeForm"] }
      },
      fields: {
        operationKeyHash: (0, import_fields16.text)({ db: { isNullable: true }, isIndexed: "unique", access: { read: permissions.canAccessAllClinicalData } }),
        requestHash: (0, import_fields16.text)({ db: { isNullable: true }, access: { read: permissions.canAccessAllClinicalData } }),
        consentType: (0, import_fields16.text)({ validation: { isRequired: true } }),
        decision: (0, import_fields16.select)({
          type: "string",
          options: [
            { label: "Granted", value: "granted" },
            { label: "Declined", value: "declined" },
            { label: "Withdrawn", value: "withdrawn" }
          ],
          defaultValue: "granted",
          validation: { isRequired: true }
        }),
        effectiveAt: (0, import_fields16.timestamp)({ validation: { isRequired: true }, defaultValue: { kind: "now" } }),
        reasonCode: (0, import_fields16.text)(),
        supersedes: (0, import_fields16.relationship)({ ref: "PatientConsent.supersedingDecision" }),
        supersedingDecision: (0, import_fields16.relationship)({ ref: "PatientConsent.supersedes" }),
        policyVersion: (0, import_fields16.text)({ validation: { isRequired: true } }),
        statementKey: (0, import_fields16.text)({ validation: { isRequired: true } }),
        grantedAt: (0, import_fields16.timestamp)({ ui: { description: "Set only when the decision is granted; declined and withdrawn decisions remain empty." } }),
        captureMethod: (0, import_fields16.text)({ validation: { isRequired: true }, defaultValue: "public_web" }),
        facility: (0, import_fields16.relationship)({ ref: "Facility" }),
        patient: (0, import_fields16.relationship)({ ref: "Patient.consents" }),
        appointment: (0, import_fields16.relationship)({ ref: "Appointment.consents" }),
        intakeForm: (0, import_fields16.relationship)({ ref: "IntakeForm.consents" }),
        auditLogs: (0, import_fields16.relationship)({ ref: "ClinicalAuditLog.consent", many: true }),
        evidence: (0, import_fields16.json)({
          access: { read: permissions.canReadIntakePhi },
          ui: { description: "Bounded consent evidence only; never store form responses, access codes, or contact details." }
        }),
        createdAt: (0, import_fields16.timestamp)({ validation: { isRequired: true }, defaultValue: { kind: "now" }, access: { create: denyMutation2, update: denyMutation2 } })
      }
    });
  }
});

// features/keystone/models/ClinicalAuditLog.ts
var import_core16, import_fields17, denyMutation3, ClinicalAuditLog;
var init_ClinicalAuditLog = __esm({
  "features/keystone/models/ClinicalAuditLog.ts"() {
    "use strict";
    import_core16 = require("@keystone-6/core");
    import_fields17 = require("@keystone-6/core/fields");
    init_access();
    denyMutation3 = () => false;
    ClinicalAuditLog = (0, import_core16.list)({
      db: {
        extendPrismaSchema(schema) {
          return schema.replace(/facility\s+Facility\?/, "facility Facility").replace(/facilityId\s+String\?/, "facilityId String");
        }
      },
      access: {
        operation: {
          query: permissions.canViewReports,
          create: denyMutation3,
          update: denyMutation3,
          delete: denyMutation3
        },
        filter: {
          query: rules.canReadClinicalAuditLogs
        }
      },
      graphql: {
        omit: { create: true, update: true, delete: true }
      },
      ui: {
        hideCreate: true,
        hideDelete: true,
        isHidden: ({ session }) => !session?.data.role?.canViewReports,
        listView: { initialColumns: ["eventType", "occurredAt", "patient", "appointment", "encounter", "intakeForm"] }
      },
      fields: {
        eventType: (0, import_fields17.text)({ validation: { isRequired: true } }),
        occurredAt: (0, import_fields17.timestamp)({ validation: { isRequired: true }, defaultValue: { kind: "now" } }),
        actorType: (0, import_fields17.text)({ validation: { isRequired: true }, defaultValue: "patient" }),
        actorReference: (0, import_fields17.text)({
          access: { read: permissions.canReadAuditMetadata },
          ui: { description: "Authenticated staff user ID or empty for patient self-service; never store contact details, access codes, or response bodies." }
        }),
        facility: (0, import_fields17.relationship)({ ref: "Facility" }),
        patient: (0, import_fields17.relationship)({ ref: "Patient.clinicalAuditLogs" }),
        appointment: (0, import_fields17.relationship)({ ref: "Appointment.clinicalAuditLogs" }),
        encounter: (0, import_fields17.relationship)({ ref: "Encounter.clinicalAuditLogs" }),
        intakeForm: (0, import_fields17.relationship)({ ref: "IntakeForm.clinicalAuditLogs" }),
        consent: (0, import_fields17.relationship)({ ref: "PatientConsent.auditLogs" }),
        metadata: (0, import_fields17.json)({
          access: { read: permissions.canReadAuditMetadata },
          ui: { description: "Bounded non-PHI event metadata such as source, channel, and status." }
        }),
        createdAt: (0, import_fields17.timestamp)({ validation: { isRequired: true }, defaultValue: { kind: "now" }, access: { create: denyMutation3, update: denyMutation3 } })
      }
    });
  }
});

// features/keystone/models/ClinicalOutboxEvent.ts
var import_core17, import_fields18, ClinicalOutboxEvent;
var init_ClinicalOutboxEvent = __esm({
  "features/keystone/models/ClinicalOutboxEvent.ts"() {
    "use strict";
    import_core17 = require("@keystone-6/core");
    import_fields18 = require("@keystone-6/core/fields");
    init_access();
    ClinicalOutboxEvent = (0, import_core17.list)({
      db: { extendPrismaSchema(schema) {
        return schema.replace(/facility\s+Facility\?/, "facility Facility").replace(/facilityId\s+String\?/, "facilityId String");
      } },
      access: { operation: { query: permissions.canViewReports, create: denyAccess, update: denyAccess, delete: denyAccess }, filter: { query: rules.canReadClinicalOutboxEvents } },
      graphql: { omit: { create: true, update: true, delete: true } },
      ui: { hideCreate: true, hideDelete: true, isHidden: ({ session }) => !session?.data.role?.canViewReports, listView: { initialColumns: ["eventType", "status", "facility", "attempts", "nextAttemptAt"] } },
      fields: {
        eventKey: (0, import_fields18.text)({ isIndexed: "unique", validation: { isRequired: true } }),
        eventType: (0, import_fields18.text)({ isIndexed: true, validation: { isRequired: true } }),
        aggregateType: (0, import_fields18.text)({ validation: { isRequired: true } }),
        aggregateId: (0, import_fields18.text)({ isIndexed: true, validation: { isRequired: true } }),
        contractVersion: (0, import_fields18.text)({ defaultValue: "hospital.event.v1", validation: { isRequired: true } }),
        deliveryMode: (0, import_fields18.select)({ type: "string", options: [{ label: "Internal", value: "internal" }, { label: "External", value: "external" }], defaultValue: "internal", validation: { isRequired: true }, isIndexed: true }),
        installation: (0, import_fields18.relationship)({ ref: "IntegrationInstallation" }),
        installationVersion: (0, import_fields18.integer)({ validation: { min: 1 }, access: { read: permissions.canReadAuditMetadata } }),
        status: (0, import_fields18.select)({ type: "string", options: [{ label: "Recorded", value: "recorded" }, { label: "Pending", value: "pending" }, { label: "Processing", value: "processing" }, { label: "Retry", value: "retry" }, { label: "Delivered", value: "delivered" }, { label: "Dead letter", value: "dead_letter" }], defaultValue: "recorded", validation: { isRequired: true }, isIndexed: true }),
        attempts: (0, import_fields18.integer)({ defaultValue: 0, validation: { isRequired: true, min: 0 } }),
        nextAttemptAt: (0, import_fields18.timestamp)({ isIndexed: true }),
        deliveredAt: (0, import_fields18.timestamp)(),
        lastError: (0, import_fields18.text)(),
        facility: (0, import_fields18.relationship)({ ref: "Facility" }),
        patient: (0, import_fields18.relationship)({ ref: "Patient" }),
        appointment: (0, import_fields18.relationship)({ ref: "Appointment" }),
        encounter: (0, import_fields18.relationship)({ ref: "Encounter" }),
        payload: (0, import_fields18.json)({ access: { read: permissions.canReadAuditMetadata } }),
        createdAt: (0, import_fields18.timestamp)({ defaultValue: { kind: "now" }, validation: { isRequired: true } })
      }
    });
  }
});

// features/keystone/security/labReceiptAccess.ts
function bodyPermission(args, aggregateType) {
  if (aggregateType === "appointment" || aggregateType === "care_queue_ticket") return permissions.canReadAppointmentPhi(args);
  if (typeof aggregateType === "string" && clinicalReceipts.includes(aggregateType)) return permissions.canReadClinicalPhi(args);
  return false;
}
function canReadWorkflowTransitionRows(args) {
  const scope2 = rules.canReadWorkflowTransitions(args);
  if (!scope2) return false;
  const permitted = [
    ...permissions.canReadClinicalPhi(args) ? clinicalReceipts : [],
    ...permissions.canReadAppointmentPhi(args) ? ["appointment", "care_queue_ticket"] : []
  ];
  return { AND: [...scope2 === true ? [] : [scope2], { aggregateType: { in: permitted } }] };
}
function canReadWorkflowTransitionResult(args, aggregateType) {
  return bodyPermission(args, aggregateType);
}
var clinicalReceipts;
var init_labReceiptAccess = __esm({
  "features/keystone/security/labReceiptAccess.ts"() {
    "use strict";
    init_access();
    clinicalReceipts = ["lab_result_creation", "encounter", "lab_result", "medical_order", "prescription", "procedure", "care_plan", "clinical_document", "specimen", "admission", "vital_sign"];
  }
});

// features/keystone/models/WorkflowTransition.ts
var import_core18, import_fields19, WorkflowTransition;
var init_WorkflowTransition = __esm({
  "features/keystone/models/WorkflowTransition.ts"() {
    "use strict";
    import_core18 = require("@keystone-6/core");
    import_fields19 = require("@keystone-6/core/fields");
    init_access();
    init_labReceiptAccess();
    WorkflowTransition = (0, import_core18.list)({
      db: {
        extendPrismaSchema(schema) {
          return schema.replace(/facility\s+Facility\?/, "facility Facility").replace(/facilityId\s+String\?/, "facilityId String");
        }
      },
      access: {
        operation: {
          query: permissions.canViewReports,
          create: denyAccess,
          update: denyAccess,
          delete: denyAccess
        },
        filter: { query: canReadWorkflowTransitionRows }
      },
      graphql: { omit: { create: true, update: true, delete: true } },
      ui: {
        hideCreate: true,
        hideDelete: true,
        isHidden: ({ session }) => !session?.data.role?.canViewReports,
        listView: {
          initialColumns: ["aggregateType", "aggregateId", "fromStatus", "toStatus", "toVersion", "occurredAt"]
        }
      },
      fields: {
        operationKeyHash: (0, import_fields19.text)({
          isFilterable: false,
          isOrderable: false,
          isIndexed: "unique",
          access: { read: permissions.canAccessAllClinicalData },
          validation: { isRequired: true }
        }),
        requestHash: (0, import_fields19.text)({
          isFilterable: false,
          isOrderable: false,
          access: { read: permissions.canAccessAllClinicalData },
          validation: { isRequired: true }
        }),
        aggregateType: (0, import_fields19.text)({ validation: { isRequired: true } }),
        aggregateId: (0, import_fields19.text)({ validation: { isRequired: true }, isIndexed: true }),
        fromStatus: (0, import_fields19.text)({ validation: { isRequired: true } }),
        toStatus: (0, import_fields19.text)({ validation: { isRequired: true } }),
        fromVersion: (0, import_fields19.integer)({ validation: { isRequired: true, min: 0 } }),
        toVersion: (0, import_fields19.integer)({ validation: { isRequired: true, min: 1 } }),
        actorReference: (0, import_fields19.text)({ access: { read: permissions.canReadAuditMetadata }, validation: { isRequired: true } }),
        facility: (0, import_fields19.relationship)({ ref: "Facility" }),
        patient: (0, import_fields19.relationship)({ ref: "Patient" }),
        auditLog: (0, import_fields19.relationship)({ ref: "ClinicalAuditLog" }),
        outboxEvent: (0, import_fields19.relationship)({ ref: "ClinicalOutboxEvent" }),
        // Original lab creation/correction receipts contain private clinical bodies,
        // not audit metadata. Reports-only authority must not disclose them through
        // generated, nested or inverse GraphQL traversal.
        result: (0, import_fields19.json)({ access: { read: (args) => canReadWorkflowTransitionResult(args, args.item.aggregateType) } }),
        occurredAt: (0, import_fields19.timestamp)({ validation: { isRequired: true }, defaultValue: { kind: "now" } })
      }
    });
  }
});

// features/keystone/lib/careQueueHooks.ts
function normalizeQueueReason(value) {
  const normalized = String(value ?? "scheduled_visit").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_");
  if (!normalized || normalized.length > 80) throw new Error("Queue reason code is invalid");
  return normalized;
}
async function resolveCareQueueInput({ operation, resolvedData, item, context }) {
  const status = operation === "create" ? "waiting" : resolvedData.status;
  const statusChanged = operation === "update" && status && status !== item?.status;
  const now = /* @__PURE__ */ new Date();
  return {
    ...resolvedData,
    ...resolvedData.reasonCode !== void 0 ? { reasonCode: normalizeQueueReason(resolvedData.reasonCode) } : {},
    ...operation === "create" ? { status: "waiting", transitionVersion: 1, arrivedAt: resolvedData.arrivedAt ?? now, actorReference: context.session?.itemId ?? "" } : {},
    ...statusChanged ? {
      transitionVersion: Number(item?.transitionVersion || 0) + 1,
      actorReference: context.session?.itemId ?? "",
      ...status === "called" ? { calledAt: now } : {},
      ...["completed", "cancelled"].includes(status) ? { completedAt: now } : {}
    } : {}
  };
}
async function validateCareQueueInput({ operation, resolvedData, item, addValidationError }) {
  if (operation === "create") {
    for (const key2 of ["facility", "patient", "appointment"]) {
      if (!resolvedData[key2]?.connect?.id) addValidationError(`Queue ticket ${key2} is required`);
    }
    if (resolvedData.status !== "waiting") addValidationError("Queue tickets must begin waiting");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(resolvedData.queueDate ?? ""))) addValidationError("Queue date is required");
    if (!Number.isInteger(resolvedData.queuePosition) || resolvedData.queuePosition < 1) addValidationError("Queue position must be a positive integer");
  }
  if (operation === "update" && resolvedData.status && resolvedData.status !== item?.status) {
    if (!TRANSITIONS[item?.status]?.includes(resolvedData.status)) {
      addValidationError(`Invalid queue transition from ${item?.status} to ${resolvedData.status}`);
    }
  }
}
async function beforeCareQueueOperation({ operation, resolvedData, context }) {
  if (!context.session?.itemId) throw new Error("Authenticated actor is required for queue operations");
  if (operation === "delete") throw new Error("Queue history is immutable and cannot be deleted");
  if (operation === "create") {
    const appointmentId = resolvedData.appointment?.connect?.id;
    const appointment = appointmentId ? await context.sudo().prisma.appointment.findUnique({ where: { id: appointmentId }, select: { status: true } }) : null;
    if (!appointment || appointment.status !== "checked_in") {
      throw new Error("Appointment must be checked in before queue creation");
    }
  }
}
async function afterCareQueueOperation({ operation, item, originalItem, context }) {
  if (operation === "delete" || !item) return;
  if (operation === "update" && item.status === originalItem?.status) return;
  const record2 = await context.sudo().prisma.careQueueTicket.findUnique({ where: { id: item.id } });
  if (!record2) throw new Error("Persisted queue ticket was not found for hook propagation");
  const eventType = operation === "create" ? "queue.arrived" : `queue.${record2.status}`;
  const eventKey = operation === "create" ? `queue:${record2.facilityId}:arrival:${record2.idempotencyKeyHash}` : `queue:${record2.id}:v${record2.transitionVersion}:${eventType}`;
  const now = /* @__PURE__ */ new Date();
  const metadata = { source: "care_queue_hook", queueTicketId: record2.id, status: record2.status, transitionVersion: record2.transitionVersion };
  await context.sudo().prisma.clinicalAuditLog.create({ data: { eventType, occurredAt: now, actorType: "staff_user", actorReference: context.session?.itemId ?? "", facilityId: record2.facilityId, patientId: record2.patientId, appointmentId: record2.appointmentId, encounterId: record2.encounterId, metadata, createdAt: now } });
  await context.sudo().prisma.clinicalOutboxEvent.create({ data: { eventKey, eventType, aggregateType: "care_queue", aggregateId: record2.id, status: "recorded", attempts: 0, nextAttemptAt: null, facilityId: record2.facilityId, patientId: record2.patientId, appointmentId: record2.appointmentId, encounterId: record2.encounterId, payload: metadata, createdAt: now } });
}
var TRANSITIONS;
var init_careQueueHooks = __esm({
  "features/keystone/lib/careQueueHooks.ts"() {
    "use strict";
    TRANSITIONS = {
      waiting: ["called", "cancelled"],
      called: ["in_care", "waiting", "cancelled"],
      in_care: ["completed", "cancelled"],
      completed: [],
      cancelled: []
    };
  }
});

// features/keystone/models/CareQueueTicket.ts
var import_core19, import_fields20, CareQueueTicket;
var init_CareQueueTicket = __esm({
  "features/keystone/models/CareQueueTicket.ts"() {
    "use strict";
    import_core19 = require("@keystone-6/core");
    import_fields20 = require("@keystone-6/core/fields");
    init_access();
    init_careQueueHooks();
    init_trackingFields();
    CareQueueTicket = (0, import_core19.list)({
      db: { extendPrismaSchema(schema) {
        return schema.replace(/facility\s+Facility\?/, "facility Facility").replace(/facilityId\s+String\?/, "facilityId String").replace(/patient\s+Patient\?/, "patient Patient").replace(/patientId\s+String\?/, "patientId String").replace(/appointment\s+Appointment\?/, "appointment Appointment").replace(/appointmentId\s+String\?/, "appointmentId String @unique").replace(/\n}\s*$/, '\n\n  @@unique([facilityId, queueDate, queuePosition], map: "CareQueueTicket_facility_queue_position_key")\n}');
      } },
      access: { operation: { query: isSignedIn, create: denyAccess, update: denyAccess, delete: denyAccess }, filter: { query: rules.canReadCareQueueTickets } },
      graphql: { omit: { create: true, update: true, delete: true } },
      hooks: { resolveInput: resolveCareQueueInput, validateInput: validateCareQueueInput, beforeOperation: beforeCareQueueOperation, afterOperation: afterCareQueueOperation },
      ui: { hideCreate: true, hideDelete: true, listView: { initialColumns: ["ticketNumber", "status", "priority", "patient", "facility", "arrivedAt"] } },
      fields: {
        ticketNumber: (0, import_fields20.text)({ isIndexed: "unique", validation: { isRequired: true } }),
        status: (0, import_fields20.select)({ type: "string", options: [{ label: "Waiting", value: "waiting" }, { label: "Called", value: "called" }, { label: "In care", value: "in_care" }, { label: "Completed", value: "completed" }, { label: "Cancelled", value: "cancelled" }], defaultValue: "waiting", validation: { isRequired: true } }),
        priority: (0, import_fields20.select)({ type: "string", options: [{ label: "Routine", value: "routine" }, { label: "Time sensitive", value: "time_sensitive" }], defaultValue: "routine", validation: { isRequired: true } }),
        reasonCode: (0, import_fields20.text)({ defaultValue: "scheduled_visit", validation: { isRequired: true } }),
        queueDate: (0, import_fields20.text)({ validation: { isRequired: true } }),
        queuePosition: (0, import_fields20.integer)({ validation: { isRequired: true, min: 1 } }),
        transitionVersion: (0, import_fields20.integer)({ defaultValue: 1, validation: { isRequired: true, min: 1 } }),
        actorReference: (0, import_fields20.text)({ validation: { isRequired: true } }),
        idempotencyKeyHash: (0, import_fields20.text)({ validation: { isRequired: true } }),
        requestHash: (0, import_fields20.text)({ validation: { isRequired: true } }),
        arrivedAt: (0, import_fields20.timestamp)({ validation: { isRequired: true } }),
        calledAt: (0, import_fields20.timestamp)(),
        completedAt: (0, import_fields20.timestamp)(),
        facility: (0, import_fields20.relationship)({ ref: "Facility" }),
        patient: (0, import_fields20.relationship)({ ref: "Patient" }),
        appointment: (0, import_fields20.relationship)({ ref: "Appointment.careQueueTickets" }),
        encounter: (0, import_fields20.relationship)({ ref: "Encounter" }),
        ...trackingFields
      }
    });
  }
});

// features/keystone/models/Encounter.ts
var import_core20, import_fields21, Encounter;
var init_Encounter = __esm({
  "features/keystone/models/Encounter.ts"() {
    "use strict";
    import_core20 = require("@keystone-6/core");
    import_fields21 = require("@keystone-6/core/fields");
    init_access();
    init_trackingFields();
    Encounter = (0, import_core20.list)({
      db: {
        extendPrismaSchema(schema) {
          return schema.replace(/patient\s+Patient\?/, "patient Patient").replace(/patientId\s+String\?/, "patientId String").replace(/provider\s+Provider\?/, "provider Provider").replace(/providerId\s+String\?/, "providerId String").replace(/facility\s+Facility\?/, "facility Facility").replace(/facilityId\s+String\?/, "facilityId String").replace(/appointmentId\s+String\?(\s+@map)/, "appointmentId String? @unique$1");
        }
      },
      access: {
        operation: {
          query: isSignedIn,
          create: permissions.canAccessAllClinicalData,
          update: denyAccess,
          delete: denyAccess
        },
        filter: { query: rules.canReadEncounters }
      },
      graphql: { omit: { create: true, update: true, delete: true } },
      ui: {
        hideDelete: true,
        listView: { initialColumns: ["encounterNumber", "status", "patient", "provider", "facility"] }
      },
      fields: {
        encounterNumber: (0, import_fields21.text)({
          isIndexed: "unique",
          access: { create: permissions.canAccessAllClinicalData, update: denyAccess },
          validation: { isRequired: true }
        }),
        status: (0, import_fields21.select)({
          type: "string",
          access: { create: permissions.canAccessAllClinicalData, update: denyAccess },
          options: [
            { label: "Open", value: "open" },
            { label: "In progress", value: "in_progress" },
            { label: "Closed", value: "closed" },
            { label: "Cancelled", value: "cancelled" }
          ],
          defaultValue: "open",
          validation: { isRequired: true }
        }),
        transitionVersion: (0, import_fields21.integer)({ defaultValue: 1, validation: { isRequired: true, min: 1 } }),
        operationKeyHash: (0, import_fields21.text)({
          isIndexed: "unique",
          access: { read: permissions.canAccessAllClinicalData },
          validation: { isRequired: true }
        }),
        requestHash: (0, import_fields21.text)({
          access: { read: permissions.canAccessAllClinicalData },
          validation: { isRequired: true }
        }),
        actorReference: (0, import_fields21.text)({
          access: { read: permissions.canReadAuditMetadata },
          validation: { isRequired: true }
        }),
        patient: (0, import_fields21.relationship)({ ref: "Patient", access: { create: permissions.canAccessAllClinicalData, update: denyAccess } }),
        provider: (0, import_fields21.relationship)({ ref: "Provider", access: { create: permissions.canAccessAllClinicalData, update: denyAccess } }),
        appointment: (0, import_fields21.relationship)({ ref: "Appointment", access: { create: permissions.canAccessAllClinicalData, update: denyAccess } }),
        facility: (0, import_fields21.relationship)({ ref: "Facility.encounters", access: { create: permissions.canAccessAllClinicalData, update: denyAccess } }),
        department: (0, import_fields21.relationship)({ ref: "Department", access: { create: permissions.canAccessAllClinicalData, update: denyAccess } }),
        chiefComplaint: (0, import_fields21.text)({
          access: { read: permissions.canReadClinicalPhi, create: permissions.canAccessAllClinicalData, update: denyAccess },
          ui: { displayMode: "textarea" }
        }),
        diagnosisSummary: (0, import_fields21.text)({
          access: { read: permissions.canReadClinicalPhi, create: permissions.canAccessAllClinicalData, update: denyAccess },
          ui: { displayMode: "textarea" }
        }),
        clinicalAuditLogs: (0, import_fields21.relationship)({
          ref: "ClinicalAuditLog.encounter",
          many: true,
          access: { create: () => false, update: () => false }
        }),
        startedAt: (0, import_fields21.timestamp)({ access: { create: permissions.canAccessAllClinicalData, update: denyAccess } }),
        endedAt: (0, import_fields21.timestamp)({ access: { create: permissions.canAccessAllClinicalData, update: denyAccess } }),
        metadata: (0, import_fields21.json)({ access: { read: permissions.canReadClinicalPhi, update: denyAccess } }),
        ...trackingFields
      }
    });
  }
});

// features/keystone/models/EpisodeClosurePolicy.ts
var import_core21, import_fields22, EpisodeClosurePolicy;
var init_EpisodeClosurePolicy = __esm({
  "features/keystone/models/EpisodeClosurePolicy.ts"() {
    "use strict";
    import_core21 = require("@keystone-6/core");
    import_fields22 = require("@keystone-6/core/fields");
    init_access();
    init_trackingFields();
    EpisodeClosurePolicy = (0, import_core21.list)({
      db: { extendPrismaSchema: (schema) => schema.replace(/facility\s+Facility\?/, "facility Facility").replace(/facilityId\s+String\?/, "facilityId String") },
      access: {
        operation: { query: permissions.canReadPatientPhi, create: denyAccess, update: denyAccess, delete: denyAccess },
        filter: { query: (args) => {
          const scope2 = rules.canReadFacilities(args);
          return typeof scope2 === "boolean" ? scope2 : { facility: scope2 };
        } }
      },
      graphql: { omit: { create: true, update: true, delete: true } },
      ui: { hideCreate: true, hideDelete: true, listView: { initialColumns: ["facility", "revision", "effectiveAt", "reviewReference"] } },
      hooks: { validateInput: ({ operation, addValidationError }) => {
        if (operation === "update") addValidationError("Reviewed policy revisions are immutable; create a superseding revision");
      }, validateDelete: ({ addValidationError }) => addValidationError("Reviewed policy history cannot be deleted") },
      fields: {
        facility: (0, import_fields22.relationship)({ ref: "Facility" }),
        revision: (0, import_fields22.integer)({ validation: { isRequired: true, min: 1 } }),
        revisionKey: (0, import_fields22.text)({ isIndexed: "unique", validation: { isRequired: true } }),
        definition: (0, import_fields22.json)(),
        reviewReference: (0, import_fields22.text)({ validation: { isRequired: true } }),
        reviewedByReference: (0, import_fields22.text)({ validation: { isRequired: true } }),
        reviewedRoleReference: (0, import_fields22.text)({ validation: { isRequired: true } }),
        operationKeyHash: (0, import_fields22.text)({ isIndexed: "unique", access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
        requestHash: (0, import_fields22.text)({ access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
        originalCommand: (0, import_fields22.json)({ access: { read: permissions.canAccessAllClinicalData } }),
        effectiveAt: (0, import_fields22.timestamp)({ validation: { isRequired: true } }),
        ...trackingFields
      }
    });
  }
});

// features/keystone/lib/controlledClinicalHooks.ts
function boundedCode(value, fallback = "") {
  const normalized = String(value ?? fallback).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_");
  if (!normalized || normalized.length > 80) throw new Error("Workflow code is invalid");
  return normalized;
}
function controlledClinicalHooks(config2) {
  return {
    resolveInput: async ({ operation, resolvedData, item, context }) => {
      const status = operation === "create" ? config2.initialStatus : resolvedData.status;
      const changed = operation === "update" && status && (status !== item?.status || config2.versionOnUnchangedStatus === true);
      const now = /* @__PURE__ */ new Date();
      return {
        ...resolvedData,
        ...resolvedData.reasonCode ? { reasonCode: boundedCode(resolvedData.reasonCode) } : {},
        ...operation === "create" ? {
          status: config2.initialStatus,
          transitionVersion: 1,
          actorReference: context.session?.itemId ?? ""
        } : {},
        ...changed ? {
          transitionVersion: Number(item?.transitionVersion || 0) + 1,
          actorReference: context.session?.itemId ?? "",
          ...config2.timestamps?.[status] ? { [config2.timestamps[status]]: now } : {}
        } : {}
      };
    },
    validateInput: async ({ operation, resolvedData, item, addValidationError }) => {
      if (operation === "create") {
        for (const relation of config2.requiredRelations) {
          if (!resolvedData[relation]?.connect?.id) addValidationError(`${relation} is required for ${config2.eventPrefix}`);
        }
        if (!resolvedData.operationKeyHash || !resolvedData.requestHash) addValidationError("Idempotency evidence is required");
      }
      if (operation === "update" && resolvedData.status && resolvedData.status !== item?.status) {
        if (!config2.transitions[item?.status]?.includes(resolvedData.status)) {
          addValidationError(`Invalid ${config2.eventPrefix} transition from ${item?.status} to ${resolvedData.status}`);
        }
      }
    },
    beforeOperation: async ({ operation, context }) => {
      if (!context.session?.itemId) throw new Error(`Authenticated actor is required for ${config2.eventPrefix}`);
      if (operation === "delete") throw new Error(`${config2.eventPrefix} history is immutable`);
    },
    afterOperation: async ({ operation, item, originalItem, context }) => {
      if (operation === "delete" || !item || operation === "update" && item.status === originalItem?.status && item.transitionVersion === originalItem?.transitionVersion) return;
      const prisma = context.sudo().prisma;
      const record2 = await prisma[config2.delegate].findUnique({ where: { id: item.id } });
      if (!record2?.facilityId || !record2?.patientId) throw new Error(`${config2.eventPrefix} tenancy was not persisted`);
      const eventType = operation === "create" ? `${config2.eventPrefix}.created` : `${config2.eventPrefix}.${record2.status}`;
      const eventKey = operation === "create" ? `${config2.eventPrefix}:${record2.facilityId}:create:${record2.operationKeyHash}` : `${config2.eventPrefix}:${record2.id}:v${record2.transitionVersion}:${record2.status}`;
      const now = /* @__PURE__ */ new Date();
      const metadata = { source: "controlled_clinical_hook", aggregateType: config2.eventPrefix, aggregateId: record2.id, status: record2.status, transitionVersion: record2.transitionVersion };
      await prisma.clinicalAuditLog.create({ data: { eventType, occurredAt: now, actorType: "staff_user", actorReference: context.session?.itemId ?? "", facilityId: record2.facilityId, patientId: record2.patientId, encounterId: record2.encounterId ?? null, metadata, createdAt: now } });
      await prisma.clinicalOutboxEvent.create({ data: { eventKey, eventType, aggregateType: config2.eventPrefix, aggregateId: record2.id, status: "recorded", attempts: 0, nextAttemptAt: null, facilityId: record2.facilityId, patientId: record2.patientId, encounterId: record2.encounterId ?? null, payload: metadata, createdAt: now } });
    }
  };
}
var clinicalWorkflowDefinitions;
var init_controlledClinicalHooks = __esm({
  "features/keystone/lib/controlledClinicalHooks.ts"() {
    "use strict";
    clinicalWorkflowDefinitions = {
      admission: { delegate: "admission", eventPrefix: "admission", initialStatus: "admitted", requiredRelations: ["facility", "patient", "bed"], transitions: { admitted: ["transferred", "discharged"], transferred: ["transferred", "discharged"], discharged: [] }, timestamps: { discharged: "dischargedAt" }, versionOnUnchangedStatus: true },
      medicalOrder: { delegate: "medicalOrder", eventPrefix: "medical_order", initialStatus: "draft", requiredRelations: ["facility", "patient", "encounter", "orderingProvider"], transitions: { draft: ["ordered", "cancelled"], ordered: ["in_progress", "cancelled"], in_progress: ["completed", "cancelled"], completed: [], cancelled: [] }, timestamps: { ordered: "orderedAt", completed: "completedAt" } },
      labResult: { delegate: "labResult", eventPrefix: "lab_result", initialStatus: "preliminary", requiredRelations: ["facility", "patient", "encounter", "medicalOrder", "labTest"], transitions: { pending: ["preliminary", "final", "cancelled"], preliminary: ["final", "corrected", "cancelled"], final: ["acknowledged"], acknowledged: [], corrected: ["acknowledged"], cancelled: [] }, timestamps: { final: "resultedAt", acknowledged: "acknowledgedAt" } },
      prescription: { delegate: "prescription", eventPrefix: "prescription", initialStatus: "recorded_manual", requiredRelations: ["facility", "patient", "encounter", "provider"], transitions: { recorded_manual: ["cancelled"], draft: ["cancelled"], active: ["cancelled"], held: ["cancelled"], completed: [], cancelled: [] }, timestamps: { cancelled: "endsAt" } },
      procedure: { delegate: "procedure", eventPrefix: "procedure", initialStatus: "scheduled", requiredRelations: ["facility", "patient", "encounter", "provider"], transitions: { scheduled: ["in_progress", "cancelled"], in_progress: ["completed", "cancelled"], completed: [], cancelled: [] }, timestamps: { completed: "completedAt" } },
      carePlan: { delegate: "carePlan", eventPrefix: "care_plan", initialStatus: "draft", requiredRelations: ["facility", "patient", "provider"], transitions: { draft: ["active", "cancelled"], active: ["completed", "cancelled"], completed: [], cancelled: [] }, timestamps: { active: "startsAt", completed: "endsAt", cancelled: "endsAt" } },
      insuranceClaim: { delegate: "insuranceClaim", eventPrefix: "insurance_claim", initialStatus: "draft", requiredRelations: ["facility", "patient", "encounter"], transitions: { draft: ["prepared", "cancelled"], prepared: ["submitted", "corrected", "cancelled"], submitted: ["external_acknowledged", "external_rejected", "corrected"], external_acknowledged: [], external_rejected: ["corrected"], accepted: [], denied: ["corrected"], corrected: ["prepared"], cancelled: [] }, timestamps: { submitted: "submittedAt" } }
    };
  }
});

// features/keystone/models/Admission.ts
var import_core22, import_fields23, Admission;
var init_Admission = __esm({
  "features/keystone/models/Admission.ts"() {
    "use strict";
    import_core22 = require("@keystone-6/core");
    import_fields23 = require("@keystone-6/core/fields");
    init_access();
    init_controlledClinicalHooks();
    init_trackingFields();
    Admission = (0, import_core22.list)({
      db: { extendPrismaSchema(schema) {
        return schema.replace(/facility\s+Facility\?/, "facility Facility").replace(/facilityId\s+String\?/, "facilityId String").replace(/patient\s+Patient\?/, "patient Patient").replace(/patientId\s+String\?/, "patientId String").replace(/attendingProvider\s+Provider\?/, "attendingProvider Provider").replace(/attendingProviderId\s+String\?/, "attendingProviderId String").replace(/room\s+Room\?/, "room Room").replace(/roomId\s+String\?/, "roomId String").replace(/bed\s+Bed\?/, "bed Bed").replace(/bedId\s+String\?/, "bedId String");
      } },
      access: { operation: { query: isSignedIn, create: denyAccess, update: denyAccess, delete: denyAccess }, filter: { query: rules.canReadAdmissions } },
      graphql: { omit: { create: true, update: true, delete: true } },
      hooks: controlledClinicalHooks(clinicalWorkflowDefinitions.admission),
      ui: { hideCreate: true, hideDelete: true, listView: { initialColumns: ["admissionNumber", "status", "patient", "facility", "bed"] } },
      fields: { admissionNumber: (0, import_fields23.text)({ isIndexed: "unique", validation: { isRequired: true } }), status: (0, import_fields23.select)({ type: "string", options: [{ label: "Admitted", value: "admitted" }, { label: "Transferred", value: "transferred" }, { label: "Discharged", value: "discharged" }], defaultValue: "admitted", validation: { isRequired: true } }), transitionVersion: (0, import_fields23.integer)({ defaultValue: 1, validation: { isRequired: true, min: 1 } }), operationKeyHash: (0, import_fields23.text)({ isIndexed: "unique", access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }), requestHash: (0, import_fields23.text)({ access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }), actorReference: (0, import_fields23.text)({ access: { read: permissions.canReadAuditMetadata }, validation: { isRequired: true } }), facility: (0, import_fields23.relationship)({ ref: "Facility" }), patient: (0, import_fields23.relationship)({ ref: "Patient" }), encounter: (0, import_fields23.relationship)({ ref: "Encounter" }), attendingProvider: (0, import_fields23.relationship)({ ref: "Provider" }), room: (0, import_fields23.relationship)({ ref: "Room" }), bed: (0, import_fields23.relationship)({ ref: "Bed" }), admittedAt: (0, import_fields23.timestamp)(), dischargedAt: (0, import_fields23.timestamp)(), dischargeDisposition: (0, import_fields23.text)({ access: { read: permissions.canReadClinicalPhi } }), notes: (0, import_fields23.text)({ access: { read: permissions.canReadClinicalPhi }, ui: { displayMode: "textarea" } }), metadata: (0, import_fields23.json)({ access: { read: permissions.canReadClinicalPhi } }), ...trackingFields }
    });
  }
});

// features/lib/departmentStatus.ts
function parseDepartmentStatus(value) {
  if (value === void 0) return "active";
  if (value === "active" || value === "closed") return value;
  throw new Error("Department status must be active or closed");
}
var departmentStatusOptions;
var init_departmentStatus = __esm({
  "features/lib/departmentStatus.ts"() {
    "use strict";
    departmentStatusOptions = [
      { label: "Active", value: "active" },
      { label: "Closed", value: "closed" }
    ];
  }
});

// features/keystone/models/Department.ts
var import_core23, import_fields24, Department;
var init_Department = __esm({
  "features/keystone/models/Department.ts"() {
    "use strict";
    init_departmentStatus();
    import_core23 = require("@keystone-6/core");
    import_fields24 = require("@keystone-6/core/fields");
    init_access();
    init_trackingFields();
    Department = (0, import_core23.list)({
      access: {
        operation: { query: isSignedIn, create: permissions.canAccessAllClinicalData, update: permissions.canAccessAllClinicalData, delete: permissions.canAccessAllClinicalData },
        filter: { query: rules.canReadDepartments, update: rules.canReadDepartments, delete: rules.canReadDepartments }
      },
      ui: { listView: { initialColumns: ["name", "code", "status"] } },
      fields: {
        name: (0, import_fields24.text)({ validation: { isRequired: true } }),
        code: (0, import_fields24.text)({ isIndexed: "unique" }),
        status: (0, import_fields24.select)({ type: "string", options: departmentStatusOptions, defaultValue: "active" }),
        description: (0, import_fields24.text)({ ui: { displayMode: "textarea" } }),
        phone: (0, import_fields24.text)(),
        email: (0, import_fields24.text)(),
        facilities: (0, import_fields24.relationship)({
          ref: "Facility.departments",
          many: true,
          access: { create: permissions.canAccessAllClinicalData, update: permissions.canAccessAllClinicalData }
        }),
        images: (0, import_fields24.relationship)({
          ref: "DepartmentImage.department",
          many: true,
          ui: {
            displayMode: "cards",
            cardFields: ["image", "imagePath", "altText", "order"],
            inlineCreate: { fields: ["image", "imagePath", "altText", "order"] },
            inlineEdit: { fields: ["image", "imagePath", "altText", "order"] },
            inlineConnect: true,
            removeMode: "disconnect"
          }
        }),
        metadata: (0, import_fields24.json)({ access: { read: permissions.canReadFacilitySensitive } }),
        ...trackingFields
      }
    });
  }
});

// features/keystone/models/DepartmentImage.ts
var import_core24, import_fields25, DepartmentImage;
var init_DepartmentImage = __esm({
  "features/keystone/models/DepartmentImage.ts"() {
    "use strict";
    import_core24 = require("@keystone-6/core");
    import_fields25 = require("@keystone-6/core/fields");
    init_access();
    init_trackingFields();
    DepartmentImage = (0, import_core24.list)({
      access: {
        operation: {
          query: isSignedIn,
          create: permissions.canAccessAllClinicalData,
          update: permissions.canAccessAllClinicalData,
          delete: permissions.canAccessAllClinicalData
        },
        filter: {
          query: rules.canReadDepartmentImages,
          update: rules.canReadDepartmentImages,
          delete: rules.canReadDepartmentImages
        }
      },
      ui: { listView: { initialColumns: ["imagePath", "altText", "department", "order"] } },
      fields: {
        image: (0, import_fields25.image)({ storage: "my_images" }),
        imagePath: (0, import_fields25.text)(),
        altText: (0, import_fields25.text)(),
        order: (0, import_fields25.integer)({ defaultValue: 0 }),
        department: (0, import_fields25.relationship)({ ref: "Department.images", access: { create: permissions.canAccessAllClinicalData, update: () => false } }),
        metadata: (0, import_fields25.json)(),
        ...trackingFields
      }
    });
  }
});

// features/keystone/mutations/scheduling/facilityTime.ts
function dateParts(date) {
  const match = DATE_PATTERN.exec(date);
  if (!match) throw new Error("date must use YYYY-MM-DD format");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    throw new Error("date must be a real calendar date");
  }
  return { year, month, day };
}
function zonedParts(instant, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(instant);
  const value = (type) => Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second")
  };
}
function assertIanaTimeZone(value) {
  const timeZone = String(value || "").trim();
  if (!timeZone || timeZone.length > 100 || !/^[A-Za-z_+-]+(?:\/[A-Za-z0-9_+.-]+)+$|^UTC$/.test(timeZone)) {
    throw new Error("Facility time zone must be a valid IANA identifier");
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(/* @__PURE__ */ new Date(0));
  } catch {
    throw new Error("Facility time zone must be a valid IANA identifier");
  }
  return timeZone;
}
function localDateTimeToUtc(date, hour, minute, timeZoneValue) {
  const timeZone = assertIanaTimeZone(timeZoneValue);
  const { year, month, day } = dateParts(date);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) {
    throw new Error("Local facility time is invalid");
  }
  const target = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let candidate = target;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const observed = zonedParts(new Date(candidate), timeZone);
    const represented = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
      observed.second
    );
    candidate += target - represented;
  }
  const finalParts = zonedParts(new Date(candidate), timeZone);
  const matchesTarget = (parts) => parts.year === year && parts.month === month && parts.day === day && parts.hour === hour && parts.minute === minute;
  if (!matchesTarget(finalParts)) {
    throw new Error("Local facility time does not exist because of a time-zone transition");
  }
  for (let offsetMinutes = -180; offsetMinutes <= 180; offsetMinutes += 15) {
    if (offsetMinutes === 0) continue;
    if (matchesTarget(zonedParts(new Date(candidate + offsetMinutes * 6e4), timeZone))) {
      throw new Error("Local facility time is ambiguous because of a time-zone transition");
    }
  }
  return new Date(candidate);
}
function calendarDateInTimeZone(instant, timeZoneValue) {
  const timeZone = assertIanaTimeZone(timeZoneValue);
  const parts = zonedParts(instant, timeZone);
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}
function addCalendarDays(date, days) {
  const { year, month, day } = dateParts(date);
  if (!Number.isInteger(days) || Math.abs(days) > 3660) throw new Error("Calendar-day offset is invalid");
  const result8 = new Date(Date.UTC(year, month - 1, day + days));
  return result8.toISOString().slice(0, 10);
}
function facilityCalendarWindow(date, timeZoneValue) {
  const timeZone = assertIanaTimeZone(timeZoneValue);
  return {
    timeZone,
    start: localDateTimeToUtc(date, 0, 0, timeZone),
    end: localDateTimeToUtc(addCalendarDays(date, 1), 0, 0, timeZone)
  };
}
var DATE_PATTERN;
var init_facilityTime = __esm({
  "features/keystone/mutations/scheduling/facilityTime.ts"() {
    "use strict";
    DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
  }
});

// features/keystone/models/Facility.ts
var import_core25, import_fields26, Facility;
var init_Facility = __esm({
  "features/keystone/models/Facility.ts"() {
    "use strict";
    import_core25 = require("@keystone-6/core");
    import_fields26 = require("@keystone-6/core/fields");
    init_access();
    init_facilityTime();
    init_trackingFields();
    Facility = (0, import_core25.list)({
      access: {
        operation: {
          query: isSignedIn,
          // Facilities define tenant boundaries. Scoped managers use reviewed
          // workflows inside an existing facility; only the global administrator
          // may create, mutate, or remove the boundary itself.
          create: permissions.canAccessAllClinicalData,
          update: permissions.canAccessAllClinicalData,
          delete: permissions.canAccessAllClinicalData
        },
        filter: {
          query: rules.canReadFacilities,
          update: rules.canReadFacilities,
          delete: rules.canReadFacilities
        }
      },
      hooks: {
        resolveInput: async ({ resolvedData }) => ({
          ...resolvedData,
          ...resolvedData.timeZone !== void 0 ? { timeZone: assertIanaTimeZone(resolvedData.timeZone) } : {}
        })
      },
      ui: { listView: { initialColumns: ["name", "facilityType", "status", "timeZone", "city"] } },
      fields: {
        name: (0, import_fields26.text)({ validation: { isRequired: true } }),
        slug: (0, import_fields26.text)({ isIndexed: "unique", validation: { isRequired: true } }),
        facilityType: (0, import_fields26.select)({
          type: "string",
          options: [
            { label: "Clinic", value: "clinic" },
            { label: "Hospital", value: "hospital" },
            { label: "Telehealth", value: "telehealth" }
          ],
          defaultValue: "clinic",
          validation: { isRequired: true }
        }),
        status: (0, import_fields26.select)({
          type: "string",
          options: [
            { label: "Active", value: "active" },
            { label: "Inactive", value: "inactive" }
          ],
          defaultValue: "active",
          validation: { isRequired: true }
        }),
        addressLine1: (0, import_fields26.text)(),
        addressLine2: (0, import_fields26.text)(),
        city: (0, import_fields26.text)(),
        region: (0, import_fields26.text)(),
        postalCode: (0, import_fields26.text)(),
        phone: (0, import_fields26.text)(),
        timeZone: (0, import_fields26.text)({
          defaultValue: "UTC",
          validation: { isRequired: true },
          ui: { description: "IANA time zone used for local scheduling dates and displayed appointment times." }
        }),
        staff: (0, import_fields26.relationship)({
          ref: "User.facilities",
          many: true,
          access: { create: permissions.canAccessAllClinicalData, update: permissions.canAccessAllClinicalData }
        }),
        providers: (0, import_fields26.relationship)({
          ref: "Provider.facilities",
          many: true,
          access: { create: permissions.canAccessAllClinicalData, update: permissions.canAccessAllClinicalData }
        }),
        patients: (0, import_fields26.relationship)({
          ref: "Patient.facilities",
          many: true,
          access: { create: permissions.canAccessAllClinicalData, update: permissions.canAccessAllClinicalData }
        }),
        patientIdentifiers: (0, import_fields26.relationship)({
          ref: "PatientIdentifier.facility",
          many: true,
          access: { create: () => false, update: () => false }
        }),
        patientRegistrations: (0, import_fields26.relationship)({
          ref: "PatientRegistration.facility",
          many: true,
          access: { create: () => false, update: () => false }
        }),
        appointments: (0, import_fields26.relationship)({
          ref: "Appointment.facility",
          many: true,
          access: { create: () => false, update: () => false }
        }),
        encounters: (0, import_fields26.relationship)({
          ref: "Encounter.facility",
          many: true,
          access: { create: permissions.canAccessAllClinicalData, update: permissions.canAccessAllClinicalData }
        }),
        departments: (0, import_fields26.relationship)({
          ref: "Department.facilities",
          many: true,
          access: { create: permissions.canAccessAllClinicalData, update: permissions.canAccessAllClinicalData }
        }),
        images: (0, import_fields26.relationship)({
          ref: "FacilityImage.facility",
          many: true,
          ui: {
            displayMode: "cards",
            cardFields: ["image", "imagePath", "altText", "order"],
            inlineCreate: { fields: ["image", "imagePath", "altText", "order"] },
            inlineEdit: { fields: ["image", "imagePath", "altText", "order"] },
            inlineConnect: true,
            removeMode: "disconnect"
          }
        }),
        metadata: (0, import_fields26.json)({ access: { read: permissions.canReadFacilitySensitive } }),
        ...trackingFields
      }
    });
  }
});

// features/keystone/models/FacilityImage.ts
var import_core26, import_fields27, FacilityImage;
var init_FacilityImage = __esm({
  "features/keystone/models/FacilityImage.ts"() {
    "use strict";
    import_core26 = require("@keystone-6/core");
    import_fields27 = require("@keystone-6/core/fields");
    init_access();
    init_trackingFields();
    FacilityImage = (0, import_core26.list)({
      access: {
        operation: {
          query: isSignedIn,
          create: permissions.canAccessAllClinicalData,
          update: permissions.canAccessAllClinicalData,
          delete: permissions.canAccessAllClinicalData
        },
        filter: {
          query: rules.canReadFacilityImages,
          update: rules.canReadFacilityImages,
          delete: rules.canReadFacilityImages
        }
      },
      ui: { listView: { initialColumns: ["imagePath", "altText", "facility", "order"] } },
      fields: {
        image: (0, import_fields27.image)({ storage: "my_images" }),
        imagePath: (0, import_fields27.text)(),
        altText: (0, import_fields27.text)(),
        order: (0, import_fields27.integer)({ defaultValue: 0 }),
        facility: (0, import_fields27.relationship)({ ref: "Facility.images", access: { create: permissions.canAccessAllClinicalData, update: () => false } }),
        metadata: (0, import_fields27.json)(),
        ...trackingFields
      }
    });
  }
});

// features/keystone/models/Ward.ts
var import_core27, import_fields28, Ward;
var init_Ward = __esm({
  "features/keystone/models/Ward.ts"() {
    "use strict";
    import_core27 = require("@keystone-6/core");
    import_fields28 = require("@keystone-6/core/fields");
    init_access();
    init_trackingFields();
    Ward = (0, import_core27.list)({
      access: {
        operation: { query: isSignedIn, create: permissions.canAccessAllClinicalData, update: permissions.canAccessAllClinicalData, delete: permissions.canAccessAllClinicalData },
        filter: { query: rules.canReadWards, update: rules.canReadWards, delete: rules.canReadWards }
      },
      ui: { listView: { initialColumns: ["name", "department", "floor", "status"] } },
      fields: {
        name: (0, import_fields28.text)({ validation: { isRequired: true } }),
        department: (0, import_fields28.relationship)({ ref: "Department", access: { create: permissions.canAccessAllClinicalData, update: () => false } }),
        floor: (0, import_fields28.text)(),
        status: (0, import_fields28.select)({ type: "string", options: [{ label: "Open", value: "open" }, { label: "Closed", value: "closed" }], defaultValue: "open" }),
        capacity: (0, import_fields28.integer)({ defaultValue: 0, validation: { min: 0 } }),
        metadata: (0, import_fields28.json)(),
        ...trackingFields
      }
    });
  }
});

// features/keystone/models/Room.ts
var import_core28, import_fields29, Room;
var init_Room = __esm({
  "features/keystone/models/Room.ts"() {
    "use strict";
    import_core28 = require("@keystone-6/core");
    import_fields29 = require("@keystone-6/core/fields");
    init_access();
    init_trackingFields();
    Room = (0, import_core28.list)({
      access: {
        operation: { query: isSignedIn, create: permissions.canAccessAllClinicalData, update: permissions.canAccessAllClinicalData, delete: permissions.canAccessAllClinicalData },
        filter: { query: rules.canReadRooms, update: rules.canReadRooms, delete: rules.canReadRooms }
      },
      ui: { listView: { initialColumns: ["roomNumber", "ward", "roomType", "status"] } },
      fields: {
        roomNumber: (0, import_fields29.text)({ isIndexed: "unique", validation: { isRequired: true } }),
        ward: (0, import_fields29.relationship)({ ref: "Ward", access: { create: permissions.canAccessAllClinicalData, update: () => false } }),
        roomType: (0, import_fields29.select)({ type: "string", options: [{ label: "Private", value: "private" }, { label: "Semi Private", value: "semi_private" }, { label: "ICU", value: "icu" }, { label: "Procedure", value: "procedure" }], defaultValue: "private" }),
        status: (0, import_fields29.select)({ type: "string", options: [{ label: "Available", value: "available" }, { label: "Occupied", value: "occupied" }, { label: "Cleaning", value: "cleaning" }, { label: "Maintenance", value: "maintenance" }], defaultValue: "available" }),
        metadata: (0, import_fields29.json)(),
        ...trackingFields
      }
    });
  }
});

// features/keystone/models/Bed.ts
var import_core29, import_fields30, Bed;
var init_Bed = __esm({
  "features/keystone/models/Bed.ts"() {
    "use strict";
    import_core29 = require("@keystone-6/core");
    import_fields30 = require("@keystone-6/core/fields");
    init_access();
    init_trackingFields();
    Bed = (0, import_core29.list)({
      db: {
        extendPrismaSchema(schema) {
          return schema.replace(/facility\s+Facility\?/, "facility Facility").replace(/facilityId\s+String\?/, "facilityId String");
        }
      },
      access: {
        operation: {
          query: isSignedIn,
          // Bed placement defines a facility/room ownership chain. Lifecycle changes
          // run through controlled bed workflows rather than generic CRUD.
          create: permissions.canAccessAllClinicalData,
          update: denyAccess,
          delete: denyAccess
        },
        filter: { query: rules.canReadBeds }
      },
      graphql: { omit: { update: true, delete: true } },
      ui: {
        hideDelete: true,
        listView: { initialColumns: ["bedNumber", "room", "status", "currentPatient"] }
      },
      hooks: {
        validateInput: async ({ operation, resolvedData, addValidationError }) => {
          if (operation === "create" && (!resolvedData.room?.connect?.id || !resolvedData.facility?.connect?.id)) {
            addValidationError("Room and facility are required for a bed");
          }
        }
      },
      fields: {
        bedNumber: (0, import_fields30.text)({ validation: { isRequired: true } }),
        transitionVersion: (0, import_fields30.integer)({ defaultValue: 1, validation: { isRequired: true, min: 1 }, access: { update: denyAccess } }),
        facility: (0, import_fields30.relationship)({
          ref: "Facility",
          access: { create: permissions.canAccessAllClinicalData, update: denyAccess }
        }),
        room: (0, import_fields30.relationship)({
          ref: "Room",
          access: { create: permissions.canAccessAllClinicalData, update: denyAccess }
        }),
        status: (0, import_fields30.select)({
          type: "string",
          access: { create: permissions.canAccessAllClinicalData, update: denyAccess },
          options: [
            { label: "Available", value: "available" },
            { label: "Occupied", value: "occupied" },
            { label: "Reserved", value: "reserved" },
            { label: "Cleaning", value: "cleaning" },
            { label: "Out of service", value: "out_of_service" }
          ],
          defaultValue: "available",
          validation: { isRequired: true }
        }),
        currentPatient: (0, import_fields30.relationship)({ ref: "Patient", access: { create: denyAccess, update: denyAccess } }),
        metadata: (0, import_fields30.json)(),
        ...trackingFields
      }
    });
  }
});

// features/keystone/models/BedOccupancyEvent.ts
var import_core30, import_fields31, BedOccupancyEvent;
var init_BedOccupancyEvent = __esm({
  "features/keystone/models/BedOccupancyEvent.ts"() {
    "use strict";
    import_core30 = require("@keystone-6/core");
    import_fields31 = require("@keystone-6/core/fields");
    init_access();
    BedOccupancyEvent = (0, import_core30.list)({ db: { extendPrismaSchema(schema) {
      return schema.replace(/facility\s+Facility\?/, "facility Facility").replace(/facilityId\s+String\?/, "facilityId String").replace(/bed\s+Bed\?/, "bed Bed").replace(/bedId\s+String\?/, "bedId String");
    } }, access: { operation: { query: isSignedIn, create: denyAccess, update: denyAccess, delete: denyAccess }, filter: { query: rules.canReadBedOccupancyEvents } }, graphql: { omit: { create: true, update: true, delete: true } }, ui: { hideCreate: true, hideDelete: true, listView: { initialColumns: ["eventType", "admission", "bed", "previousBed", "occurredAt"] } }, fields: { eventKey: (0, import_fields31.text)({ isIndexed: "unique", validation: { isRequired: true } }), eventType: (0, import_fields31.select)({ type: "string", options: [{ label: "Assigned", value: "assigned" }, { label: "Transferred", value: "transferred" }, { label: "Released", value: "released" }, { label: "Cleaning started", value: "cleaning_started" }, { label: "Available", value: "available" }], validation: { isRequired: true } }), facility: (0, import_fields31.relationship)({ ref: "Facility" }), patient: (0, import_fields31.relationship)({ ref: "Patient" }), admission: (0, import_fields31.relationship)({ ref: "Admission" }), bed: (0, import_fields31.relationship)({ ref: "Bed" }), previousBed: (0, import_fields31.relationship)({ ref: "Bed" }), actorReference: (0, import_fields31.text)({ access: { read: permissions.canReadAuditMetadata }, validation: { isRequired: true } }), reasonCode: (0, import_fields31.text)(), occurredAt: (0, import_fields31.timestamp)({ defaultValue: { kind: "now" }, validation: { isRequired: true } }) } });
  }
});

// features/keystone/models/Clinician.ts
var import_core31, import_fields32, Clinician;
var init_Clinician = __esm({
  "features/keystone/models/Clinician.ts"() {
    "use strict";
    import_core31 = require("@keystone-6/core");
    import_fields32 = require("@keystone-6/core/fields");
    init_access();
    init_trackingFields();
    Clinician = (0, import_core31.list)({
      access: {
        operation: { query: isSignedIn, create: permissions.canAccessAllClinicalData, update: permissions.canAccessAllClinicalData, delete: permissions.canAccessAllClinicalData },
        filter: { query: rules.canReadClinicians, update: rules.canReadClinicians, delete: rules.canReadClinicians }
      },
      ui: { listView: { initialColumns: ["displayName", "clinicianType", "department"] } },
      fields: {
        onboardingKey: (0, import_fields32.text)({
          db: { isNullable: true },
          isIndexed: "unique",
          access: { read: permissions.canAccessAllClinicalData, create: () => false, update: () => false },
          ui: { description: "Stable setup key; not a license or provider identifier." }
        }),
        displayName: (0, import_fields32.text)({ validation: { isRequired: true } }),
        clinicianType: (0, import_fields32.select)({ type: "string", options: [{ label: "Physician", value: "physician" }, { label: "Nurse", value: "nurse" }, { label: "Therapist", value: "therapist" }, { label: "Technician", value: "technician" }], defaultValue: "physician" }),
        provider: (0, import_fields32.relationship)({ ref: "Provider.clinicians", access: { create: permissions.canAccessAllClinicalData, update: () => false } }),
        department: (0, import_fields32.relationship)({ ref: "Department", access: { create: permissions.canAccessAllClinicalData, update: () => false } }),
        licenseNumber: (0, import_fields32.text)({ access: { read: permissions.canReadProviderSensitive } }),
        phone: (0, import_fields32.text)({ access: { read: permissions.canReadProviderSensitive } }),
        email: (0, import_fields32.text)({ access: { read: permissions.canReadProviderSensitive } }),
        active: (0, import_fields32.checkbox)({ defaultValue: true }),
        images: (0, import_fields32.relationship)({
          ref: "ClinicianImage.clinician",
          many: true,
          ui: {
            displayMode: "cards",
            cardFields: ["image", "imagePath", "altText", "order"],
            inlineCreate: { fields: ["image", "imagePath", "altText", "order"] },
            inlineEdit: { fields: ["image", "imagePath", "altText", "order"] },
            inlineConnect: true,
            removeMode: "disconnect"
          }
        }),
        metadata: (0, import_fields32.json)({ access: { read: permissions.canReadProviderSensitive } }),
        ...trackingFields
      }
    });
  }
});

// features/keystone/models/ClinicianImage.ts
var import_core32, import_fields33, ClinicianImage;
var init_ClinicianImage = __esm({
  "features/keystone/models/ClinicianImage.ts"() {
    "use strict";
    import_core32 = require("@keystone-6/core");
    import_fields33 = require("@keystone-6/core/fields");
    init_access();
    init_trackingFields();
    ClinicianImage = (0, import_core32.list)({
      access: {
        operation: {
          query: isSignedIn,
          create: permissions.canAccessAllClinicalData,
          update: permissions.canAccessAllClinicalData,
          delete: permissions.canAccessAllClinicalData
        },
        filter: {
          query: rules.canReadClinicianImages,
          update: rules.canReadClinicianImages,
          delete: rules.canReadClinicianImages
        }
      },
      ui: { listView: { initialColumns: ["imagePath", "altText", "clinician", "order"] } },
      fields: {
        image: (0, import_fields33.image)({ storage: "my_images" }),
        imagePath: (0, import_fields33.text)(),
        altText: (0, import_fields33.text)(),
        order: (0, import_fields33.integer)({ defaultValue: 0 }),
        clinician: (0, import_fields33.relationship)({ ref: "Clinician.images", access: { create: permissions.canAccessAllClinicalData, update: () => false } }),
        metadata: (0, import_fields33.json)(),
        ...trackingFields
      }
    });
  }
});

// features/keystone/models/VitalSign.ts
var import_core33, import_fields34, VitalSign;
var init_VitalSign = __esm({
  "features/keystone/models/VitalSign.ts"() {
    "use strict";
    import_core33 = require("@keystone-6/core");
    import_fields34 = require("@keystone-6/core/fields");
    init_access();
    init_trackingFields();
    VitalSign = (0, import_core33.list)({
      db: {
        extendPrismaSchema(schema) {
          return schema.replace(/facility\s+Facility\?/, "facility Facility").replace(/facilityId\s+String\?/, "facilityId String").replace(/patient\s+Patient\?/, "patient Patient").replace(/patientId\s+String\?/, "patientId String").replace(/encounter\s+Encounter\?/, "encounter Encounter").replace(/encounterId\s+String\?/, "encounterId String").replace(/recordedBy\s+Clinician\?/, "recordedBy Clinician").replace(/recordedById\s+String\?/, "recordedById String");
        }
      },
      access: {
        operation: { query: isSignedIn, create: denyAccess, update: denyAccess, delete: denyAccess },
        filter: { query: rules.canReadVitalSigns }
      },
      graphql: { omit: { create: true, update: true, delete: true } },
      ui: { hideCreate: true, hideDelete: true, listView: { initialColumns: ["patient", "encounter", "recordedAt", "recordedBy"] } },
      fields: {
        operationKeyHash: (0, import_fields34.text)({ isIndexed: "unique", access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
        requestHash: (0, import_fields34.text)({ access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
        facility: (0, import_fields34.relationship)({ ref: "Facility" }),
        patient: (0, import_fields34.relationship)({ ref: "Patient" }),
        encounter: (0, import_fields34.relationship)({ ref: "Encounter" }),
        recordedBy: (0, import_fields34.relationship)({ ref: "Clinician" }),
        actorReference: (0, import_fields34.text)({ access: { read: permissions.canReadAuditMetadata }, validation: { isRequired: true } }),
        recordedAt: (0, import_fields34.timestamp)({ defaultValue: { kind: "now" }, validation: { isRequired: true } }),
        // New writes use integer tenths so ordinary decimal temperatures are not
        // rounded. temperatureC is retained read-only for migrated legacy rows.
        temperatureC: (0, import_fields34.integer)({ access: { read: permissions.canReadClinicalPhi } }),
        temperatureTenthsC: (0, import_fields34.integer)({ access: { read: permissions.canReadClinicalPhi } }),
        systolicBp: (0, import_fields34.integer)({ access: { read: permissions.canReadClinicalPhi } }),
        diastolicBp: (0, import_fields34.integer)({ access: { read: permissions.canReadClinicalPhi } }),
        heartRate: (0, import_fields34.integer)({ access: { read: permissions.canReadClinicalPhi } }),
        respiratoryRate: (0, import_fields34.integer)({ access: { read: permissions.canReadClinicalPhi } }),
        oxygenSaturation: (0, import_fields34.integer)({ access: { read: permissions.canReadClinicalPhi } }),
        notes: (0, import_fields34.text)({ access: { read: permissions.canReadClinicalPhi }, ui: { displayMode: "textarea" } }),
        ...trackingFields
      }
    });
  }
});

// features/keystone/models/MedicalOrder.ts
var import_core34, import_fields35, MedicalOrder;
var init_MedicalOrder = __esm({
  "features/keystone/models/MedicalOrder.ts"() {
    "use strict";
    import_core34 = require("@keystone-6/core");
    import_fields35 = require("@keystone-6/core/fields");
    init_access();
    init_controlledClinicalHooks();
    init_trackingFields();
    MedicalOrder = (0, import_core34.list)({ db: { extendPrismaSchema(schema) {
      return schema.replace(/facility\s+Facility\?/, "facility Facility").replace(/facilityId\s+String\?/, "facilityId String").replace(/patient\s+Patient\?/, "patient Patient").replace(/patientId\s+String\?/, "patientId String").replace(/encounter\s+Encounter\?/, "encounter Encounter").replace(/encounterId\s+String\?/, "encounterId String").replace(/orderingProvider\s+Provider\?/, "orderingProvider Provider").replace(/orderingProviderId\s+String\?/, "orderingProviderId String");
    } }, access: { operation: { query: isSignedIn, create: denyAccess, update: denyAccess, delete: denyAccess }, filter: { query: rules.canReadMedicalOrders } }, graphql: { omit: { create: true, update: true, delete: true } }, hooks: controlledClinicalHooks(clinicalWorkflowDefinitions.medicalOrder), ui: { hideCreate: true, hideDelete: true, listView: { initialColumns: ["orderNumber", "orderType", "status", "patient", "facility"] } }, fields: { orderNumber: (0, import_fields35.text)({ isIndexed: "unique", validation: { isRequired: true } }), orderType: (0, import_fields35.select)({ type: "string", options: [{ label: "Medication", value: "medication" }, { label: "Lab", value: "lab" }, { label: "Imaging", value: "imaging" }, { label: "Procedure", value: "procedure" }, { label: "Consult", value: "consult" }], defaultValue: "lab", validation: { isRequired: true } }), status: (0, import_fields35.select)({ type: "string", options: [{ label: "Draft", value: "draft" }, { label: "Ordered", value: "ordered" }, { label: "In progress", value: "in_progress" }, { label: "Completed", value: "completed" }, { label: "Cancelled", value: "cancelled" }], defaultValue: "draft", validation: { isRequired: true } }), transitionVersion: (0, import_fields35.integer)({ defaultValue: 1, validation: { isRequired: true, min: 1 } }), operationKeyHash: (0, import_fields35.text)({ isIndexed: "unique", access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }), requestHash: (0, import_fields35.text)({ access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }), actorReference: (0, import_fields35.text)({ access: { read: permissions.canReadAuditMetadata }, validation: { isRequired: true } }), facility: (0, import_fields35.relationship)({ ref: "Facility" }), patient: (0, import_fields35.relationship)({ ref: "Patient" }), encounter: (0, import_fields35.relationship)({ ref: "Encounter" }), orderingProvider: (0, import_fields35.relationship)({ ref: "Provider" }), summary: (0, import_fields35.text)({ access: { read: permissions.canReadClinicalPhi }, ui: { displayMode: "textarea" } }), orderedAt: (0, import_fields35.timestamp)(), completedAt: (0, import_fields35.timestamp)(), metadata: (0, import_fields35.json)({ access: { read: permissions.canReadClinicalPhi } }), ...trackingFields } });
  }
});

// features/keystone/models/Prescription.ts
var import_core35, import_fields36, Prescription;
var init_Prescription = __esm({
  "features/keystone/models/Prescription.ts"() {
    "use strict";
    import_core35 = require("@keystone-6/core");
    import_fields36 = require("@keystone-6/core/fields");
    init_access();
    init_controlledClinicalHooks();
    init_trackingFields();
    Prescription = (0, import_core35.list)({ db: { extendPrismaSchema(schema) {
      return schema.replace(/facility\s+Facility\?/, "facility Facility").replace(/facilityId\s+String\?/, "facilityId String").replace(/patient\s+Patient\?/, "patient Patient").replace(/patientId\s+String\?/, "patientId String").replace(/encounter\s+Encounter\?/, "encounter Encounter").replace(/encounterId\s+String\?/, "encounterId String").replace(/provider\s+Provider\?/, "provider Provider").replace(/providerId\s+String\?/, "providerId String");
    } }, access: { operation: { query: isSignedIn, create: denyAccess, update: denyAccess, delete: denyAccess }, filter: { query: rules.canReadPrescriptions } }, graphql: { omit: { create: true, update: true, delete: true } }, hooks: controlledClinicalHooks(clinicalWorkflowDefinitions.prescription), ui: { hideCreate: true, hideDelete: true, listView: { initialColumns: ["prescriptionNumber", "status", "patient", "medicationName", "facility"] } }, fields: { prescriptionNumber: (0, import_fields36.text)({ isIndexed: "unique", validation: { isRequired: true } }), status: (0, import_fields36.select)({ type: "string", options: [{ label: "Recorded manual/external", value: "recorded_manual" }, { label: "Legacy draft", value: "draft" }, { label: "Legacy active", value: "active" }, { label: "Legacy held", value: "held" }, { label: "Legacy completed", value: "completed" }, { label: "Cancelled", value: "cancelled" }], defaultValue: "recorded_manual", validation: { isRequired: true } }), transitionVersion: (0, import_fields36.integer)({ defaultValue: 1, validation: { isRequired: true, min: 1 } }), operationKeyHash: (0, import_fields36.text)({ isIndexed: "unique", access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }), requestHash: (0, import_fields36.text)({ access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }), actorReference: (0, import_fields36.text)({ access: { read: permissions.canReadAuditMetadata }, validation: { isRequired: true } }), recordingBasis: (0, import_fields36.select)({ type: "string", options: [{ label: "Reported from an external record", value: "external_record" }, { label: "Manual medication reconciliation", value: "manual_reconciliation" }, { label: "Legacy basis unspecified (read only)", value: "legacy_unspecified" }], validation: { isRequired: true } }), facility: (0, import_fields36.relationship)({ ref: "Facility" }), patient: (0, import_fields36.relationship)({ ref: "Patient" }), provider: (0, import_fields36.relationship)({ ref: "Provider" }), encounter: (0, import_fields36.relationship)({ ref: "Encounter" }), medicalOrder: (0, import_fields36.relationship)({ ref: "MedicalOrder" }), medicationName: (0, import_fields36.text)({ access: { read: permissions.canReadClinicalPhi }, validation: { isRequired: true } }), dosage: (0, import_fields36.text)({ access: { read: permissions.canReadClinicalPhi } }), frequency: (0, import_fields36.text)({ access: { read: permissions.canReadClinicalPhi } }), startsAt: (0, import_fields36.timestamp)(), endsAt: (0, import_fields36.timestamp)(), notes: (0, import_fields36.text)({ access: { read: permissions.canReadClinicalPhi }, ui: { displayMode: "textarea" } }), ...trackingFields } });
  }
});

// features/keystone/models/LabTest.ts
var import_core36, import_fields37, LabTest;
var init_LabTest = __esm({
  "features/keystone/models/LabTest.ts"() {
    "use strict";
    import_core36 = require("@keystone-6/core");
    import_fields37 = require("@keystone-6/core/fields");
    init_access();
    init_trackingFields();
    LabTest = (0, import_core36.list)({
      access: { operation: { query: isSignedIn, create: permissions.canAccessAllClinicalData, update: permissions.canAccessAllClinicalData, delete: permissions.canAccessAllClinicalData } },
      ui: { listView: { initialColumns: ["name", "code", "category"] } },
      fields: {
        name: (0, import_fields37.text)({ validation: { isRequired: true } }),
        code: (0, import_fields37.text)({ isIndexed: "unique" }),
        category: (0, import_fields37.text)(),
        specimenType: (0, import_fields37.text)(),
        turnaroundHours: (0, import_fields37.integer)({ validation: { min: 0 } }),
        active: (0, import_fields37.checkbox)({ defaultValue: true }),
        metadata: (0, import_fields37.json)(),
        ...trackingFields
      }
    });
  }
});

// features/keystone/models/LabResult.ts
var import_core37, import_fields38, LabResult;
var init_LabResult = __esm({
  "features/keystone/models/LabResult.ts"() {
    "use strict";
    import_core37 = require("@keystone-6/core");
    import_fields38 = require("@keystone-6/core/fields");
    init_access();
    init_controlledClinicalHooks();
    init_trackingFields();
    LabResult = (0, import_core37.list)({ db: { extendPrismaSchema(schema) {
      return schema.replace(/facility\s+Facility\?/, "facility Facility").replace(/facilityId\s+String\?/, "facilityId String").replace(/patient\s+Patient\?/, "patient Patient").replace(/patientId\s+String\?/, "patientId String").replace(/encounter\s+Encounter\?/, "encounter Encounter").replace(/encounterId\s+String\?/, "encounterId String").replace(/medicalOrder\s+MedicalOrder\?/, "medicalOrder MedicalOrder").replace(/medicalOrderId\s+String\?/, "medicalOrderId String").replace(/labTest\s+LabTest\?/, "labTest LabTest").replace(/labTestId\s+String\?/, "labTestId String");
    } }, access: { operation: { query: isSignedIn, create: denyAccess, update: denyAccess, delete: denyAccess }, filter: { query: rules.canReadLabResults } }, graphql: { omit: { create: true, update: true, delete: true } }, hooks: controlledClinicalHooks(clinicalWorkflowDefinitions.labResult), ui: { hideCreate: true, hideDelete: true, listView: { initialColumns: ["resultNumber", "status", "patient", "labTest", "facility"] } }, fields: { resultNumber: (0, import_fields38.text)({ isIndexed: "unique", validation: { isRequired: true } }), status: (0, import_fields38.select)({ type: "string", options: [{ label: "Legacy pending", value: "pending" }, { label: "Preliminary", value: "preliminary" }, { label: "Final", value: "final" }, { label: "Corrected", value: "corrected" }, { label: "Acknowledged", value: "acknowledged" }, { label: "Cancelled", value: "cancelled" }], defaultValue: "preliminary", validation: { isRequired: true } }), version: (0, import_fields38.integer)({ defaultValue: 1, validation: { isRequired: true, min: 1 } }), transitionVersion: (0, import_fields38.integer)({ defaultValue: 1, validation: { isRequired: true, min: 1 } }), operationKeyHash: (0, import_fields38.text)({ isIndexed: "unique", access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }), requestHash: (0, import_fields38.text)({ access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }), actorReference: (0, import_fields38.text)({ access: { read: permissions.canReadAuditMetadata }, validation: { isRequired: true } }), facility: (0, import_fields38.relationship)({ ref: "Facility" }), patient: (0, import_fields38.relationship)({ ref: "Patient" }), encounter: (0, import_fields38.relationship)({ ref: "Encounter" }), medicalOrder: (0, import_fields38.relationship)({ ref: "MedicalOrder" }), labTest: (0, import_fields38.relationship)({ ref: "LabTest" }), supersedesResult: (0, import_fields38.relationship)({ ref: "LabResult.supersedingResult" }), supersedingResult: (0, import_fields38.relationship)({ ref: "LabResult.supersedesResult" }), resultValue: (0, import_fields38.text)({ access: { read: permissions.canReadClinicalPhi } }), referenceRange: (0, import_fields38.text)({ access: { read: permissions.canReadClinicalPhi } }), abnormalFlag: (0, import_fields38.select)({ type: "string", access: { read: permissions.canReadClinicalPhi }, options: [{ label: "Normal", value: "normal" }, { label: "Low", value: "low" }, { label: "High", value: "high" }, { label: "Critical", value: "critical" }], defaultValue: "normal" }), resultedAt: (0, import_fields38.timestamp)(), acknowledgedAt: (0, import_fields38.timestamp)(), acknowledgedBy: (0, import_fields38.relationship)({ ref: "User" }), metadata: (0, import_fields38.json)({ access: { read: permissions.canReadClinicalPhi } }), ...trackingFields } });
  }
});

// features/keystone/models/Procedure.ts
var import_core38, import_fields39, Procedure;
var init_Procedure = __esm({
  "features/keystone/models/Procedure.ts"() {
    "use strict";
    import_core38 = require("@keystone-6/core");
    import_fields39 = require("@keystone-6/core/fields");
    init_access();
    init_controlledClinicalHooks();
    init_trackingFields();
    Procedure = (0, import_core38.list)({ db: { extendPrismaSchema(schema) {
      return schema.replace(/facility\s+Facility\?/, "facility Facility").replace(/facilityId\s+String\?/, "facilityId String").replace(/patient\s+Patient\?/, "patient Patient").replace(/patientId\s+String\?/, "patientId String").replace(/encounter\s+Encounter\?/, "encounter Encounter").replace(/encounterId\s+String\?/, "encounterId String").replace(/provider\s+Provider\?/, "provider Provider").replace(/providerId\s+String\?/, "providerId String");
    } }, access: { operation: { query: isSignedIn, create: denyAccess, update: denyAccess, delete: denyAccess }, filter: { query: rules.canReadProcedures } }, graphql: { omit: { create: true, update: true, delete: true } }, hooks: controlledClinicalHooks(clinicalWorkflowDefinitions.procedure), ui: { hideCreate: true, hideDelete: true, listView: { initialColumns: ["procedureNumber", "status", "patient", "procedureName", "facility"] } }, fields: { procedureNumber: (0, import_fields39.text)({ isIndexed: "unique", validation: { isRequired: true } }), status: (0, import_fields39.select)({ type: "string", options: [{ label: "Scheduled", value: "scheduled" }, { label: "In progress", value: "in_progress" }, { label: "Completed", value: "completed" }, { label: "Cancelled", value: "cancelled" }], defaultValue: "scheduled", validation: { isRequired: true } }), transitionVersion: (0, import_fields39.integer)({ defaultValue: 1, validation: { isRequired: true, min: 1 } }), operationKeyHash: (0, import_fields39.text)({ isIndexed: "unique", access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }), requestHash: (0, import_fields39.text)({ access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }), actorReference: (0, import_fields39.text)({ access: { read: permissions.canReadAuditMetadata }, validation: { isRequired: true } }), facility: (0, import_fields39.relationship)({ ref: "Facility" }), patient: (0, import_fields39.relationship)({ ref: "Patient" }), encounter: (0, import_fields39.relationship)({ ref: "Encounter" }), provider: (0, import_fields39.relationship)({ ref: "Provider" }), medicalOrder: (0, import_fields39.relationship)({ ref: "MedicalOrder" }), procedureName: (0, import_fields39.text)({ access: { read: permissions.canReadClinicalPhi }, validation: { isRequired: true } }), scheduledAt: (0, import_fields39.timestamp)(), completedAt: (0, import_fields39.timestamp)(), notes: (0, import_fields39.text)({ access: { read: permissions.canReadClinicalPhi }, ui: { displayMode: "textarea" } }), metadata: (0, import_fields39.json)({ access: { read: permissions.canReadClinicalPhi } }), ...trackingFields } });
  }
});

// features/keystone/models/InsuranceClaim.ts
var import_core39, import_fields40, InsuranceClaim;
var init_InsuranceClaim = __esm({
  "features/keystone/models/InsuranceClaim.ts"() {
    "use strict";
    import_core39 = require("@keystone-6/core");
    import_fields40 = require("@keystone-6/core/fields");
    init_access();
    init_controlledClinicalHooks();
    init_trackingFields();
    InsuranceClaim = (0, import_core39.list)({ db: { extendPrismaSchema(schema) {
      return schema.replace(/facility\s+Facility\?/, "facility Facility").replace(/facilityId\s+String\?/, "facilityId String").replace(/patient\s+Patient\?/, "patient Patient").replace(/patientId\s+String\?/, "patientId String").replace(/encounter\s+Encounter\?/, "encounter Encounter").replace(/encounterId\s+String\?/, "encounterId String");
    } }, access: { operation: { query: isSignedIn, create: denyAccess, update: denyAccess, delete: denyAccess }, filter: { query: rules.canReadInsuranceClaims } }, graphql: { omit: { create: true, update: true, delete: true } }, hooks: controlledClinicalHooks(clinicalWorkflowDefinitions.insuranceClaim), ui: { hideCreate: true, hideDelete: true, listView: { initialColumns: ["claimNumber", "status", "patient", "payerName", "facility"] } }, fields: { claimNumber: (0, import_fields40.text)({ isIndexed: "unique", validation: { isRequired: true } }), status: (0, import_fields40.select)({ type: "string", options: [{ label: "Draft", value: "draft" }, { label: "Prepared", value: "prepared" }, { label: "Manual submission recorded", value: "submitted" }, { label: "External acknowledgement recorded", value: "external_acknowledged" }, { label: "External rejection recorded", value: "external_rejected" }, { label: "Legacy accepted", value: "accepted" }, { label: "Legacy denied", value: "denied" }, { label: "Corrected", value: "corrected" }, { label: "Cancelled", value: "cancelled" }, { label: "Legacy paid", value: "paid" }], defaultValue: "draft", validation: { isRequired: true } }), transitionVersion: (0, import_fields40.integer)({ defaultValue: 1, validation: { isRequired: true, min: 1 } }), operationKeyHash: (0, import_fields40.text)({ isIndexed: "unique", access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }), requestHash: (0, import_fields40.text)({ access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }), actorReference: (0, import_fields40.text)({ access: { read: permissions.canReadAuditMetadata }, validation: { isRequired: true } }), reasonCode: (0, import_fields40.text)(), facility: (0, import_fields40.relationship)({ ref: "Facility" }), patient: (0, import_fields40.relationship)({ ref: "Patient" }), encounter: (0, import_fields40.relationship)({ ref: "Encounter" }), coverage: (0, import_fields40.relationship)({ ref: "PatientCoverage" }), versions: (0, import_fields40.relationship)({ ref: "ClaimVersion.claim", many: true }), payerName: (0, import_fields40.text)({ access: { read: permissions.canManageBilling } }), billedAmountCents: (0, import_fields40.integer)({ access: { read: permissions.canManageBilling }, defaultValue: 0, validation: { min: 0 } }), paidAmountCents: (0, import_fields40.integer)({ access: { read: permissions.canManageBilling }, defaultValue: 0, validation: { min: 0 } }), submittedAt: (0, import_fields40.timestamp)(), paidAt: (0, import_fields40.timestamp)(), denialReason: (0, import_fields40.text)({ access: { read: permissions.canManageBilling }, ui: { displayMode: "textarea" } }), metadata: (0, import_fields40.json)({ access: { read: permissions.canManageBilling } }), ...trackingFields } });
  }
});

// features/keystone/models/CarePlan.ts
var import_core40, import_fields41, CarePlan;
var init_CarePlan = __esm({
  "features/keystone/models/CarePlan.ts"() {
    "use strict";
    import_core40 = require("@keystone-6/core");
    import_fields41 = require("@keystone-6/core/fields");
    init_access();
    init_controlledClinicalHooks();
    init_trackingFields();
    CarePlan = (0, import_core40.list)({ db: { extendPrismaSchema(schema) {
      return schema.replace(/facility\s+Facility\?/, "facility Facility").replace(/facilityId\s+String\?/, "facilityId String").replace(/patient\s+Patient\?/, "patient Patient").replace(/patientId\s+String\?/, "patientId String").replace(/provider\s+Provider\?/, "provider Provider").replace(/providerId\s+String\?/, "providerId String");
    } }, access: { operation: { query: isSignedIn, create: denyAccess, update: denyAccess, delete: denyAccess }, filter: { query: rules.canReadCarePlans } }, graphql: { omit: { create: true, update: true, delete: true } }, hooks: controlledClinicalHooks(clinicalWorkflowDefinitions.carePlan), ui: { hideCreate: true, hideDelete: true, listView: { initialColumns: ["title", "status", "patient", "provider", "facility"] } }, fields: { title: (0, import_fields41.text)({ validation: { isRequired: true } }), status: (0, import_fields41.select)({ type: "string", options: [{ label: "Draft", value: "draft" }, { label: "Active", value: "active" }, { label: "Completed", value: "completed" }, { label: "Cancelled", value: "cancelled" }], defaultValue: "draft", validation: { isRequired: true } }), transitionVersion: (0, import_fields41.integer)({ defaultValue: 1, validation: { isRequired: true, min: 1 } }), operationKeyHash: (0, import_fields41.text)({ isIndexed: "unique", access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }), requestHash: (0, import_fields41.text)({ access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }), actorReference: (0, import_fields41.text)({ access: { read: permissions.canReadAuditMetadata }, validation: { isRequired: true } }), facility: (0, import_fields41.relationship)({ ref: "Facility" }), patient: (0, import_fields41.relationship)({ ref: "Patient" }), provider: (0, import_fields41.relationship)({ ref: "Provider" }), encounter: (0, import_fields41.relationship)({ ref: "Encounter" }), goals: (0, import_fields41.text)({ access: { read: permissions.canReadClinicalPhi }, ui: { displayMode: "textarea" } }), interventions: (0, import_fields41.text)({ access: { read: permissions.canReadClinicalPhi }, ui: { displayMode: "textarea" } }), startsAt: (0, import_fields41.timestamp)(), endsAt: (0, import_fields41.timestamp)(), metadata: (0, import_fields41.json)({ access: { read: permissions.canReadClinicalPhi } }), ...trackingFields } });
  }
});

// features/keystone/models/PatientCoverage.ts
var import_core41, import_fields42, PatientCoverage;
var init_PatientCoverage = __esm({
  "features/keystone/models/PatientCoverage.ts"() {
    "use strict";
    import_core41 = require("@keystone-6/core");
    import_fields42 = require("@keystone-6/core/fields");
    init_access();
    init_trackingFields();
    PatientCoverage = (0, import_core41.list)({
      db: { extendPrismaSchema(schema) {
        return schema.replace(/facility\s+Facility\?/, "facility Facility").replace(/facilityId\s+String\?/, "facilityId String").replace(/patient\s+Patient\?/, "patient Patient").replace(/patientId\s+String\?/, "patientId String");
      } },
      access: { operation: { query: isSignedIn, create: denyAccess, update: denyAccess, delete: denyAccess }, filter: { query: rules.canReadCoverages } },
      graphql: { omit: { create: true, update: true, delete: true } },
      ui: { hideCreate: true, hideDelete: true, listView: { initialColumns: ["coverageNumber", "status", "payerName", "patient", "facility"] } },
      fields: {
        coverageNumber: (0, import_fields42.text)({ isIndexed: "unique", validation: { isRequired: true } }),
        status: (0, import_fields42.select)({ type: "string", options: [
          { label: "Unverified", value: "unverified" },
          { label: "Staff-verified record (not payer eligibility)", value: "active" },
          { label: "Inactive record", value: "inactive" },
          { label: "Staff-rejected record", value: "rejected" }
        ], defaultValue: "unverified", validation: { isRequired: true } }),
        transitionVersion: (0, import_fields42.integer)({ defaultValue: 1, validation: { isRequired: true, min: 1 } }),
        operationKeyHash: (0, import_fields42.text)({ isIndexed: "unique", access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
        requestHash: (0, import_fields42.text)({ access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
        actorReference: (0, import_fields42.text)({ access: { read: permissions.canReadAuditMetadata }, validation: { isRequired: true } }),
        facility: (0, import_fields42.relationship)({ ref: "Facility" }),
        patient: (0, import_fields42.relationship)({ ref: "Patient" }),
        payerName: (0, import_fields42.text)({ access: { read: permissions.canManageBilling }, validation: { isRequired: true } }),
        memberId: (0, import_fields42.text)({ access: { read: permissions.canManageBilling }, validation: { isRequired: true } }),
        groupNumber: (0, import_fields42.text)({ access: { read: permissions.canManageBilling } }),
        effectiveAt: (0, import_fields42.timestamp)(),
        terminatesAt: (0, import_fields42.timestamp)(),
        verifiedAt: (0, import_fields42.timestamp)(),
        verifiedBy: (0, import_fields42.relationship)({ ref: "User" }),
        ...trackingFields
      }
    });
  }
});

// features/keystone/models/ClaimVersion.ts
var import_core42, import_fields43, ClaimVersion;
var init_ClaimVersion = __esm({
  "features/keystone/models/ClaimVersion.ts"() {
    "use strict";
    import_core42 = require("@keystone-6/core");
    import_fields43 = require("@keystone-6/core/fields");
    init_access();
    ClaimVersion = (0, import_core42.list)({
      db: { extendPrismaSchema(schema) {
        return schema.replace(/facility\s+Facility\?/, "facility Facility").replace(/facilityId\s+String\?/, "facilityId String").replace(/patient\s+Patient\?/, "patient Patient").replace(/patientId\s+String\?/, "patientId String").replace(/claim\s+InsuranceClaim\?/, "claim InsuranceClaim").replace(/claimId\s+String\?/, "claimId String").replace(/\n}\s*$/, '\n\n  @@unique([claimId, version], map: "ClaimVersion_claim_version_key")\n}');
      } },
      access: { operation: { query: isSignedIn, create: denyAccess, update: denyAccess, delete: denyAccess }, filter: { query: rules.canReadBillingRecords } },
      graphql: { omit: { create: true, update: true, delete: true } },
      ui: { hideCreate: true, hideDelete: true, listView: { initialColumns: ["claim", "version", "status", "reasonCode", "createdAt"] } },
      fields: {
        versionKey: (0, import_fields43.text)({ isIndexed: "unique", validation: { isRequired: true } }),
        version: (0, import_fields43.integer)({ validation: { isRequired: true, min: 1 } }),
        status: (0, import_fields43.text)({ validation: { isRequired: true } }),
        operationKeyHash: (0, import_fields43.text)({ isIndexed: "unique", access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
        requestHash: (0, import_fields43.text)({ access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
        facility: (0, import_fields43.relationship)({ ref: "Facility" }),
        patient: (0, import_fields43.relationship)({ ref: "Patient" }),
        claim: (0, import_fields43.relationship)({ ref: "InsuranceClaim.versions" }),
        coverage: (0, import_fields43.relationship)({ ref: "PatientCoverage" }),
        reasonCode: (0, import_fields43.text)(),
        snapshot: (0, import_fields43.json)({ access: { read: permissions.canManageBilling } }),
        actorReference: (0, import_fields43.text)({ access: { read: permissions.canReadAuditMetadata }, validation: { isRequired: true } }),
        createdAt: (0, import_fields43.timestamp)({ defaultValue: { kind: "now" }, validation: { isRequired: true } })
      }
    });
  }
});

// features/keystone/models/PatientPayment.ts
var import_core43, import_fields44, PatientPayment;
var init_PatientPayment = __esm({
  "features/keystone/models/PatientPayment.ts"() {
    "use strict";
    import_core43 = require("@keystone-6/core");
    import_fields44 = require("@keystone-6/core/fields");
    init_access();
    init_trackingFields();
    PatientPayment = (0, import_core43.list)({
      db: { extendPrismaSchema(schema) {
        return schema.replace(/facility\s+Facility\?/, "facility Facility").replace(/facilityId\s+String\?/, "facilityId String").replace(/patient\s+Patient\?/, "patient Patient").replace(/patientId\s+String\?/, "patientId String");
      } },
      access: { operation: { query: isSignedIn, create: denyAccess, update: denyAccess, delete: denyAccess }, filter: { query: rules.canReadBillingRecords } },
      graphql: { omit: { create: true, update: true, delete: true } },
      ui: { hideCreate: true, hideDelete: true, listView: { initialColumns: ["paymentNumber", "status", "amountCents", "method", "patient", "facility"] } },
      fields: {
        paymentNumber: (0, import_fields44.text)({ isIndexed: "unique", validation: { isRequired: true } }),
        status: (0, import_fields44.select)({ type: "string", options: [
          { label: "Pending", value: "pending" },
          { label: "Succeeded", value: "succeeded" },
          { label: "Failed", value: "failed" },
          { label: "Cancelled", value: "cancelled" }
        ], defaultValue: "pending", validation: { isRequired: true } }),
        transitionVersion: (0, import_fields44.integer)({ defaultValue: 1, validation: { isRequired: true, min: 1 } }),
        operationKeyHash: (0, import_fields44.text)({ isIndexed: "unique", access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
        requestHash: (0, import_fields44.text)({ access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
        actorReference: (0, import_fields44.text)({ access: { read: permissions.canReadAuditMetadata }, validation: { isRequired: true } }),
        facility: (0, import_fields44.relationship)({ ref: "Facility" }),
        patient: (0, import_fields44.relationship)({ ref: "Patient" }),
        claim: (0, import_fields44.relationship)({ ref: "InsuranceClaim" }),
        installation: (0, import_fields44.relationship)({ ref: "IntegrationInstallation" }),
        amountCents: (0, import_fields44.integer)({ validation: { isRequired: true, min: 1 }, access: { read: permissions.canManageBilling } }),
        refundedAmountCents: (0, import_fields44.integer)({ defaultValue: 0, validation: { isRequired: true, min: 0 }, access: { read: permissions.canManageBilling } }),
        currency: (0, import_fields44.text)({ defaultValue: "USD", validation: { isRequired: true } }),
        method: (0, import_fields44.select)({ type: "string", options: [
          { label: "Cash", value: "cash" },
          { label: "Check", value: "check" },
          { label: "External card", value: "card_external" },
          { label: "External bank", value: "bank_external" }
        ], validation: { isRequired: true } }),
        externalReference: (0, import_fields44.text)({ isIndexed: true, access: { read: permissions.canManageBilling } }),
        receivedAt: (0, import_fields44.timestamp)(),
        failedAt: (0, import_fields44.timestamp)(),
        ...trackingFields
      }
    });
  }
});

// features/keystone/models/PatientRefund.ts
var import_core44, import_fields45, PatientRefund;
var init_PatientRefund = __esm({
  "features/keystone/models/PatientRefund.ts"() {
    "use strict";
    import_core44 = require("@keystone-6/core");
    import_fields45 = require("@keystone-6/core/fields");
    init_access();
    init_trackingFields();
    PatientRefund = (0, import_core44.list)({
      db: { extendPrismaSchema(schema) {
        return schema.replace(/facility\s+Facility\?/, "facility Facility").replace(/facilityId\s+String\?/, "facilityId String").replace(/patient\s+Patient\?/, "patient Patient").replace(/patientId\s+String\?/, "patientId String").replace(/payment\s+PatientPayment\?/, "payment PatientPayment").replace(/paymentId\s+String\?/, "paymentId String");
      } },
      access: { operation: { query: isSignedIn, create: denyAccess, update: denyAccess, delete: denyAccess }, filter: { query: rules.canReadBillingRecords } },
      graphql: { omit: { create: true, update: true, delete: true } },
      ui: { hideCreate: true, hideDelete: true, listView: { initialColumns: ["refundNumber", "status", "amountCents", "payment", "patient"] } },
      fields: {
        refundNumber: (0, import_fields45.text)({ isIndexed: "unique", validation: { isRequired: true } }),
        status: (0, import_fields45.select)({ type: "string", options: [
          { label: "Pending", value: "pending" },
          { label: "Succeeded", value: "succeeded" },
          { label: "Failed", value: "failed" },
          { label: "Cancelled", value: "cancelled" }
        ], defaultValue: "pending", validation: { isRequired: true } }),
        transitionVersion: (0, import_fields45.integer)({ defaultValue: 1, validation: { isRequired: true, min: 1 } }),
        operationKeyHash: (0, import_fields45.text)({ isIndexed: "unique", access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
        requestHash: (0, import_fields45.text)({ access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
        actorReference: (0, import_fields45.text)({ access: { read: permissions.canReadAuditMetadata }, validation: { isRequired: true } }),
        facility: (0, import_fields45.relationship)({ ref: "Facility" }),
        patient: (0, import_fields45.relationship)({ ref: "Patient" }),
        payment: (0, import_fields45.relationship)({ ref: "PatientPayment" }),
        installation: (0, import_fields45.relationship)({ ref: "IntegrationInstallation" }),
        amountCents: (0, import_fields45.integer)({ validation: { isRequired: true, min: 1 }, access: { read: permissions.canManageBilling } }),
        reasonCode: (0, import_fields45.text)({ validation: { isRequired: true } }),
        externalReference: (0, import_fields45.text)({ access: { read: permissions.canManageBilling } }),
        completedAt: (0, import_fields45.timestamp)(),
        failedAt: (0, import_fields45.timestamp)(),
        ...trackingFields
      }
    });
  }
});

// features/keystone/models/InventoryItem.ts
var import_core45, import_fields46, InventoryItem;
var init_InventoryItem = __esm({
  "features/keystone/models/InventoryItem.ts"() {
    "use strict";
    import_core45 = require("@keystone-6/core");
    import_fields46 = require("@keystone-6/core/fields");
    init_access();
    init_trackingFields();
    InventoryItem = (0, import_core45.list)({
      db: { extendPrismaSchema(schema) {
        return schema.replace(/facility\s+Facility\?/, "facility Facility").replace(/facilityId\s+String\?/, "facilityId String").replace(/\n}\s*$/, '\n\n  @@unique([facilityId, sku], map: "InventoryItem_facility_sku_key")\n}');
      } },
      access: { operation: { query: isSignedIn, create: denyAccess, update: denyAccess, delete: denyAccess }, filter: { query: rules.canReadInventory } },
      graphql: { omit: { create: true, update: true, delete: true } },
      ui: { hideCreate: true, hideDelete: true, listView: { initialColumns: ["sku", "name", "status", "quantityOnHand", "quantityReserved", "facility"] } },
      fields: {
        sku: (0, import_fields46.text)({ validation: { isRequired: true } }),
        name: (0, import_fields46.text)({ validation: { isRequired: true } }),
        unit: (0, import_fields46.text)({ validation: { isRequired: true } }),
        status: (0, import_fields46.select)({ type: "string", options: [{ label: "Active", value: "active" }, { label: "Inactive", value: "inactive" }], defaultValue: "active", validation: { isRequired: true } }),
        transitionVersion: (0, import_fields46.integer)({ defaultValue: 1, validation: { isRequired: true, min: 1 } }),
        quantityOnHand: (0, import_fields46.integer)({ defaultValue: 0, validation: { isRequired: true, min: 0 } }),
        quantityReserved: (0, import_fields46.integer)({ defaultValue: 0, validation: { isRequired: true, min: 0 } }),
        reorderPoint: (0, import_fields46.integer)({ defaultValue: 0, validation: { isRequired: true, min: 0 } }),
        operationKeyHash: (0, import_fields46.text)({ isIndexed: "unique", access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
        requestHash: (0, import_fields46.text)({ access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
        actorReference: (0, import_fields46.text)({ access: { read: permissions.canReadAuditMetadata }, validation: { isRequired: true } }),
        facility: (0, import_fields46.relationship)({ ref: "Facility" }),
        ...trackingFields
      }
    });
  }
});

// features/keystone/models/InventoryMovement.ts
var import_core46, import_fields47, InventoryMovement;
var init_InventoryMovement = __esm({
  "features/keystone/models/InventoryMovement.ts"() {
    "use strict";
    import_core46 = require("@keystone-6/core");
    import_fields47 = require("@keystone-6/core/fields");
    init_access();
    InventoryMovement = (0, import_core46.list)({
      db: { extendPrismaSchema(schema) {
        return schema.replace(/facility\s+Facility\?/, "facility Facility").replace(/facilityId\s+String\?/, "facilityId String").replace(/item\s+InventoryItem\?/, "item InventoryItem").replace(/itemId\s+String\?/, "itemId String");
      } },
      access: { operation: { query: isSignedIn, create: denyAccess, update: denyAccess, delete: denyAccess }, filter: { query: rules.canReadInventory } },
      graphql: { omit: { create: true, update: true, delete: true } },
      ui: { hideCreate: true, hideDelete: true, listView: { initialColumns: ["item", "movementType", "quantityDelta", "resultingOnHand", "occurredAt"] } },
      fields: {
        movementNumber: (0, import_fields47.text)({ isIndexed: "unique", validation: { isRequired: true } }),
        operationKeyHash: (0, import_fields47.text)({ isIndexed: "unique", access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
        requestHash: (0, import_fields47.text)({ access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
        movementType: (0, import_fields47.select)({ type: "string", options: [
          { label: "Receive", value: "receive" },
          { label: "Consume", value: "consume" },
          { label: "Adjust", value: "adjust" },
          { label: "Reserve", value: "reserve" },
          { label: "Release", value: "release" }
        ], validation: { isRequired: true } }),
        quantityDelta: (0, import_fields47.integer)({ validation: { isRequired: true } }),
        resultingOnHand: (0, import_fields47.integer)({ validation: { isRequired: true, min: 0 } }),
        reservedDelta: (0, import_fields47.integer)({ defaultValue: 0, validation: { isRequired: true } }),
        resultingReserved: (0, import_fields47.integer)({ validation: { isRequired: true, min: 0 } }),
        reasonCode: (0, import_fields47.text)({ validation: { isRequired: true } }),
        facility: (0, import_fields47.relationship)({ ref: "Facility" }),
        item: (0, import_fields47.relationship)({ ref: "InventoryItem" }),
        prescription: (0, import_fields47.relationship)({ ref: "Prescription" }),
        procedure: (0, import_fields47.relationship)({ ref: "Procedure" }),
        actorReference: (0, import_fields47.text)({ access: { read: permissions.canReadAuditMetadata }, validation: { isRequired: true } }),
        occurredAt: (0, import_fields47.timestamp)({ defaultValue: { kind: "now" }, validation: { isRequired: true } })
      }
    });
  }
});

// features/keystone/models/CommunicationPreference.ts
var import_core47, import_fields48, CommunicationPreference;
var init_CommunicationPreference = __esm({
  "features/keystone/models/CommunicationPreference.ts"() {
    "use strict";
    import_core47 = require("@keystone-6/core");
    import_fields48 = require("@keystone-6/core/fields");
    init_access();
    init_trackingFields();
    CommunicationPreference = (0, import_core47.list)({
      db: { extendPrismaSchema(schema) {
        return schema.replace(/facility\s+Facility\?/, "facility Facility").replace(/facilityId\s+String\?/, "facilityId String").replace(/patient\s+Patient\?/, "patient Patient").replace(/patientId\s+String\?/, "patientId String").replace(/\n}\s*$/, '\n\n  @@unique([facilityId, patientId, channel, purpose], map: "CommunicationPreference_scope_key")\n}');
      } },
      access: { operation: { query: isSignedIn, create: denyAccess, update: denyAccess, delete: denyAccess }, filter: { query: rules.canReadCommunicationPreferences } },
      graphql: { omit: { create: true, update: true, delete: true } },
      ui: { hideCreate: true, hideDelete: true, listView: { initialColumns: ["patient", "channel", "purpose", "status", "facility"] } },
      fields: {
        channel: (0, import_fields48.select)({ type: "string", options: [{ label: "SMS", value: "sms" }, { label: "Email", value: "email" }, { label: "Phone", value: "phone" }, { label: "Legacy portal (read only)", value: "portal" }], validation: { isRequired: true } }),
        purpose: (0, import_fields48.select)({ type: "string", options: [{ label: "Care operations", value: "care_operations" }, { label: "Billing", value: "billing" }, { label: "General", value: "general" }], validation: { isRequired: true } }),
        status: (0, import_fields48.select)({ type: "string", options: [{ label: "Allowed", value: "allowed" }, { label: "Opted out", value: "opted_out" }], defaultValue: "allowed", validation: { isRequired: true } }),
        transitionVersion: (0, import_fields48.integer)({ defaultValue: 1, validation: { isRequired: true, min: 1 } }),
        operationKeyHash: (0, import_fields48.text)({ isIndexed: "unique", access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
        requestHash: (0, import_fields48.text)({ access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
        facility: (0, import_fields48.relationship)({ ref: "Facility" }),
        patient: (0, import_fields48.relationship)({ ref: "Patient" }),
        actorReference: (0, import_fields48.text)({ access: { read: permissions.canReadAuditMetadata }, validation: { isRequired: true } }),
        reasonCode: (0, import_fields48.text)(),
        changedAt: (0, import_fields48.timestamp)(),
        ...trackingFields
      }
    });
  }
});

// features/keystone/models/CommunicationTemplate.ts
var import_core48, import_fields49, CommunicationTemplate;
var init_CommunicationTemplate = __esm({
  "features/keystone/models/CommunicationTemplate.ts"() {
    "use strict";
    import_core48 = require("@keystone-6/core");
    import_fields49 = require("@keystone-6/core/fields");
    init_access();
    init_trackingFields();
    CommunicationTemplate = (0, import_core48.list)({
      db: { extendPrismaSchema(schema) {
        return schema.replace(/facility\s+Facility\?/, "facility Facility").replace(/facilityId\s+String\?/, "facilityId String").replace(/\n}\s*$/, '\n\n  @@unique([facilityId, templateKey], map: "CommunicationTemplate_facility_key")\n}');
      } },
      access: { operation: { query: isSignedIn, create: denyAccess, update: denyAccess, delete: denyAccess }, filter: { query: rules.canReadCommunicationTemplates } },
      graphql: { omit: { create: true, update: true, delete: true } },
      ui: { hideCreate: true, hideDelete: true, listView: { initialColumns: ["templateKey", "name", "channel", "status", "facility"] } },
      fields: {
        templateKey: (0, import_fields49.text)({ validation: { isRequired: true } }),
        name: (0, import_fields49.text)({ validation: { isRequired: true } }),
        channel: (0, import_fields49.select)({ type: "string", options: [{ label: "SMS", value: "sms" }, { label: "Email", value: "email" }, { label: "Legacy portal (read only)", value: "portal" }], validation: { isRequired: true } }),
        status: (0, import_fields49.select)({ type: "string", options: [{ label: "Active", value: "active" }, { label: "Inactive", value: "inactive" }], defaultValue: "active", validation: { isRequired: true } }),
        version: (0, import_fields49.integer)({ defaultValue: 1, validation: { isRequired: true, min: 1 } }),
        transitionVersion: (0, import_fields49.integer)({ defaultValue: 1, validation: { isRequired: true, min: 1 } }),
        operationKeyHash: (0, import_fields49.text)({ isIndexed: "unique", access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
        requestHash: (0, import_fields49.text)({ access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
        actorReference: (0, import_fields49.text)({ access: { read: permissions.canReadAuditMetadata }, validation: { isRequired: true } }),
        facility: (0, import_fields49.relationship)({ ref: "Facility" }),
        subjectTemplate: (0, import_fields49.text)(),
        bodyTemplate: (0, import_fields49.text)({ validation: { isRequired: true }, ui: { displayMode: "textarea" } }),
        ...trackingFields
      }
    });
  }
});

// features/keystone/models/BedReservation.ts
var import_core49, import_fields50, BedReservation;
var init_BedReservation = __esm({
  "features/keystone/models/BedReservation.ts"() {
    "use strict";
    import_core49 = require("@keystone-6/core");
    import_fields50 = require("@keystone-6/core/fields");
    init_access();
    init_trackingFields();
    BedReservation = (0, import_core49.list)({
      db: { extendPrismaSchema(schema) {
        return schema.replace(/facility\s+Facility\?/, "facility Facility").replace(/facilityId\s+String\?/, "facilityId String").replace(/patient\s+Patient\?/, "patient Patient").replace(/patientId\s+String\?/, "patientId String").replace(/bed\s+Bed\?/, "bed Bed").replace(/bedId\s+String\?/, "bedId String");
      } },
      access: { operation: { query: isSignedIn, create: denyAccess, update: denyAccess, delete: denyAccess }, filter: { query: rules.canReadBedReservations } },
      graphql: { omit: { create: true, update: true, delete: true } },
      ui: { hideCreate: true, hideDelete: true, listView: { initialColumns: ["reservationNumber", "status", "bed", "patient", "expiresAt"] } },
      fields: {
        reservationNumber: (0, import_fields50.text)({ isIndexed: "unique", validation: { isRequired: true } }),
        status: (0, import_fields50.select)({ type: "string", options: [{ label: "Active", value: "active" }, { label: "Consumed", value: "consumed" }, { label: "Released", value: "released" }, { label: "Expired", value: "expired" }], defaultValue: "active", validation: { isRequired: true } }),
        transitionVersion: (0, import_fields50.integer)({ defaultValue: 1, validation: { isRequired: true, min: 1 } }),
        operationKeyHash: (0, import_fields50.text)({ isIndexed: "unique", access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
        requestHash: (0, import_fields50.text)({ access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
        facility: (0, import_fields50.relationship)({ ref: "Facility" }),
        patient: (0, import_fields50.relationship)({ ref: "Patient" }),
        bed: (0, import_fields50.relationship)({ ref: "Bed" }),
        admission: (0, import_fields50.relationship)({ ref: "Admission" }),
        actorReference: (0, import_fields50.text)({ access: { read: permissions.canReadAuditMetadata }, validation: { isRequired: true } }),
        reasonCode: (0, import_fields50.text)(),
        expiresAt: (0, import_fields50.timestamp)({ validation: { isRequired: true } }),
        releasedAt: (0, import_fields50.timestamp)(),
        consumedAt: (0, import_fields50.timestamp)(),
        ...trackingFields
      }
    });
  }
});

// features/keystone/models/IntegrationInstallation.ts
var import_core50, import_fields51, IntegrationInstallation;
var init_IntegrationInstallation = __esm({
  "features/keystone/models/IntegrationInstallation.ts"() {
    "use strict";
    import_core50 = require("@keystone-6/core");
    import_fields51 = require("@keystone-6/core/fields");
    init_access();
    init_trackingFields();
    IntegrationInstallation = (0, import_core50.list)({
      db: { extendPrismaSchema(schema) {
        return schema.replace(/facility\s+Facility\?/, "facility Facility").replace(/facilityId\s+String\?/, "facilityId String").replace(/\n}\s*$/, '\n\n  @@unique([facilityId, installationKey], map: "IntegrationInstallation_facility_key")\n}');
      } },
      access: { operation: { query: isSignedIn, create: denyAccess, update: denyAccess, delete: denyAccess }, filter: { query: rules.canReadIntegrations } },
      graphql: { omit: { create: true, update: true, delete: true } },
      ui: { hideCreate: true, hideDelete: true, listView: { initialColumns: ["name", "kind", "status", "facility", "lastSuccessAt"] } },
      fields: {
        installationKey: (0, import_fields51.text)({ isIndexed: "unique", validation: { isRequired: true } }),
        name: (0, import_fields51.text)({ validation: { isRequired: true } }),
        kind: (0, import_fields51.select)({ type: "string", options: [
          { label: "Communications", value: "communications" },
          { label: "Payment", value: "payment" },
          { label: "Laboratory", value: "laboratory" },
          { label: "Pharmacy", value: "pharmacy" },
          { label: "General webhook", value: "webhook" }
        ], validation: { isRequired: true } }),
        status: (0, import_fields51.select)({ type: "string", options: [{ label: "Active", value: "active" }, { label: "Paused", value: "paused" }, { label: "Revoked", value: "revoked" }], defaultValue: "active", validation: { isRequired: true } }),
        transitionVersion: (0, import_fields51.integer)({ defaultValue: 1, validation: { isRequired: true, min: 1 } }),
        operationKeyHash: (0, import_fields51.text)({ isIndexed: "unique", access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
        requestHash: (0, import_fields51.text)({ access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
        facility: (0, import_fields51.relationship)({ ref: "Facility" }),
        endpointUrl: (0, import_fields51.text)({ access: { read: permissions.canManageIntegrations }, validation: { isRequired: true } }),
        allowedEventTypes: (0, import_fields51.json)(),
        signingSecretCiphertext: (0, import_fields51.text)({ access: { read: denyAccess } }),
        signingSecretIv: (0, import_fields51.text)({ access: { read: denyAccess } }),
        signingSecretTag: (0, import_fields51.text)({ access: { read: denyAccess } }),
        keyVersion: (0, import_fields51.integer)({ defaultValue: 1, validation: { isRequired: true, min: 1 } }),
        actorReference: (0, import_fields51.text)({ access: { read: permissions.canReadAuditMetadata }, validation: { isRequired: true } }),
        lastSuccessAt: (0, import_fields51.timestamp)(),
        lastErrorAt: (0, import_fields51.timestamp)(),
        lastErrorCode: (0, import_fields51.text)(),
        ...trackingFields
      }
    });
  }
});

// features/keystone/models/MachineCredential.ts
var import_core51, import_fields52, MachineCredential;
var init_MachineCredential = __esm({
  "features/keystone/models/MachineCredential.ts"() {
    "use strict";
    import_core51 = require("@keystone-6/core");
    import_fields52 = require("@keystone-6/core/fields");
    init_access();
    MachineCredential = (0, import_core51.list)({
      db: { extendPrismaSchema(schema) {
        return schema.replace(/facility\s+Facility\?/, "facility Facility").replace(/facilityId\s+String\?/, "facilityId String").replace(/installation\s+IntegrationInstallation\?/, "installation IntegrationInstallation").replace(/installationId\s+String\?/, "installationId String").replace(/createdBy\s+User\?/, "createdBy User").replace(/createdById\s+String\?/, "createdById String");
      } },
      access: { operation: { query: isSignedIn, create: denyAccess, update: denyAccess, delete: denyAccess }, filter: { query: rules.canReadIntegrations } },
      graphql: { omit: { create: true, update: true, delete: true } },
      ui: { hideCreate: true, hideDelete: true, listView: { initialColumns: ["name", "keyPrefix", "status", "installation", "expiresAt"] } },
      fields: {
        name: (0, import_fields52.text)({ validation: { isRequired: true } }),
        keyPrefix: (0, import_fields52.text)({ isIndexed: "unique", validation: { isRequired: true } }),
        transitionVersion: (0, import_fields52.integer)({ defaultValue: 1, validation: { isRequired: true, min: 1 } }),
        operationKeyHash: (0, import_fields52.text)({ isIndexed: "unique", access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
        requestHash: (0, import_fields52.text)({ access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
        actorReference: (0, import_fields52.text)({ access: { read: permissions.canReadAuditMetadata }, validation: { isRequired: true } }),
        secretDigest: (0, import_fields52.text)({ isIndexed: "unique", access: { read: denyAccess }, validation: { isRequired: true } }),
        scopes: (0, import_fields52.json)(),
        status: (0, import_fields52.select)({ type: "string", options: [{ label: "Active", value: "active" }, { label: "Revoked", value: "revoked" }, { label: "Expired", value: "expired" }], defaultValue: "active", validation: { isRequired: true } }),
        facility: (0, import_fields52.relationship)({ ref: "Facility" }),
        installation: (0, import_fields52.relationship)({ ref: "IntegrationInstallation" }),
        createdBy: (0, import_fields52.relationship)({ ref: "User" }),
        createdAt: (0, import_fields52.timestamp)({ defaultValue: { kind: "now" }, validation: { isRequired: true } }),
        expiresAt: (0, import_fields52.timestamp)({ validation: { isRequired: true } }),
        revokedAt: (0, import_fields52.timestamp)(),
        lastUsedAt: (0, import_fields52.timestamp)(),
        lastUsedFingerprint: (0, import_fields52.text)({ access: { read: permissions.canManageIntegrations } })
      }
    });
  }
});

// features/keystone/models/IntegrationDeliveryAttempt.ts
var import_core52, import_fields53, IntegrationDeliveryAttempt;
var init_IntegrationDeliveryAttempt = __esm({
  "features/keystone/models/IntegrationDeliveryAttempt.ts"() {
    "use strict";
    import_core52 = require("@keystone-6/core");
    import_fields53 = require("@keystone-6/core/fields");
    init_access();
    IntegrationDeliveryAttempt = (0, import_core52.list)({
      db: { extendPrismaSchema(schema) {
        return schema.replace(/facility\s+Facility\?/, "facility Facility").replace(/facilityId\s+String\?/, "facilityId String").replace(/installation\s+IntegrationInstallation\?/, "installation IntegrationInstallation").replace(/installationId\s+String\?/, "installationId String").replace(/outboxEvent\s+ClinicalOutboxEvent\?/, "outboxEvent ClinicalOutboxEvent").replace(/outboxEventId\s+String\?/, "outboxEventId String").replace(/\n}\s*$/, '\n\n  @@unique([outboxEventId, installationId, attemptNumber], map: "IntegrationDeliveryAttempt_event_attempt_key")\n}');
      } },
      access: { operation: { query: isSignedIn, create: denyAccess, update: denyAccess, delete: denyAccess }, filter: { query: rules.canReadIntegrations } },
      graphql: { omit: { create: true, update: true, delete: true } },
      ui: { hideCreate: true, hideDelete: true, listView: { initialColumns: ["installation", "outboxEvent", "attemptNumber", "status", "startedAt"] } },
      fields: {
        attemptKey: (0, import_fields53.text)({ isIndexed: "unique", validation: { isRequired: true } }),
        facility: (0, import_fields53.relationship)({ ref: "Facility" }),
        installation: (0, import_fields53.relationship)({ ref: "IntegrationInstallation" }),
        outboxEvent: (0, import_fields53.relationship)({ ref: "ClinicalOutboxEvent" }),
        attemptNumber: (0, import_fields53.integer)({ validation: { isRequired: true, min: 1 } }),
        status: (0, import_fields53.select)({ type: "string", options: [{ label: "Succeeded", value: "succeeded" }, { label: "Retry", value: "retry" }, { label: "Failed", value: "failed" }], validation: { isRequired: true } }),
        responseStatus: (0, import_fields53.integer)(),
        errorCode: (0, import_fields53.text)(),
        responseDigest: (0, import_fields53.text)(),
        startedAt: (0, import_fields53.timestamp)({ validation: { isRequired: true } }),
        completedAt: (0, import_fields53.timestamp)({ validation: { isRequired: true } })
      }
    });
  }
});

// features/keystone/models/IntegrationWebhookReceipt.ts
var import_core53, import_fields54, IntegrationWebhookReceipt;
var init_IntegrationWebhookReceipt = __esm({
  "features/keystone/models/IntegrationWebhookReceipt.ts"() {
    "use strict";
    import_core53 = require("@keystone-6/core");
    import_fields54 = require("@keystone-6/core/fields");
    init_access();
    IntegrationWebhookReceipt = (0, import_core53.list)({
      db: { extendPrismaSchema(schema) {
        return schema.replace(/facility\s+Facility\?/, "facility Facility").replace(/facilityId\s+String\?/, "facilityId String").replace(/installation\s+IntegrationInstallation\?/, "installation IntegrationInstallation").replace(/installationId\s+String\?/, "installationId String");
      } },
      access: { operation: { query: isSignedIn, create: denyAccess, update: denyAccess, delete: denyAccess }, filter: { query: rules.canReadIntegrations } },
      graphql: { omit: { create: true, update: true, delete: true } },
      ui: { hideCreate: true, hideDelete: true, listView: { initialColumns: ["eventId", "eventType", "status", "installation", "receivedAt"] } },
      fields: {
        receiptKey: (0, import_fields54.text)({ isIndexed: "unique", validation: { isRequired: true } }),
        eventId: (0, import_fields54.text)({ validation: { isRequired: true } }),
        eventType: (0, import_fields54.text)({ validation: { isRequired: true } }),
        requestDigest: (0, import_fields54.text)({ access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
        status: (0, import_fields54.select)({ type: "string", options: [{ label: "Accepted", value: "accepted" }, { label: "Rejected", value: "rejected" }, { label: "Processed", value: "processed" }], validation: { isRequired: true } }),
        facility: (0, import_fields54.relationship)({ ref: "Facility" }),
        installation: (0, import_fields54.relationship)({ ref: "IntegrationInstallation" }),
        receivedAt: (0, import_fields54.timestamp)({ defaultValue: { kind: "now" }, validation: { isRequired: true } }),
        processedAt: (0, import_fields54.timestamp)(),
        errorCode: (0, import_fields54.text)()
      }
    });
  }
});

// features/keystone/models/ClinicalDocument.ts
var import_core54, import_fields55, ClinicalDocument;
var init_ClinicalDocument = __esm({
  "features/keystone/models/ClinicalDocument.ts"() {
    "use strict";
    import_core54 = require("@keystone-6/core");
    import_fields55 = require("@keystone-6/core/fields");
    init_access();
    init_trackingFields();
    ClinicalDocument = (0, import_core54.list)({
      db: { extendPrismaSchema(schema) {
        return schema.replace(/facility\s+Facility\?/, "facility Facility").replace(/facilityId\s+String\?/, "facilityId String").replace(/patient\s+Patient\?/, "patient Patient").replace(/patientId\s+String\?/, "patientId String").replace(/encounter\s+Encounter\?/, "encounter Encounter").replace(/encounterId\s+String\?/, "encounterId String").replace(/author\s+Provider\?/, "author Provider").replace(/authorId\s+String\?/, "authorId String");
      } },
      access: { operation: { query: isSignedIn, create: denyAccess, update: denyAccess, delete: denyAccess }, filter: { query: rules.canReadClinicalDocuments } },
      graphql: { omit: { create: true, update: true, delete: true } },
      ui: { hideCreate: true, hideDelete: true, listView: { initialColumns: ["documentNumber", "version", "status", "documentType", "patient", "encounter"] } },
      fields: {
        documentNumber: (0, import_fields55.text)({ isIndexed: "unique", validation: { isRequired: true } }),
        version: (0, import_fields55.integer)({ defaultValue: 1, validation: { isRequired: true, min: 1 } }),
        status: (0, import_fields55.select)({ type: "string", options: [{ label: "Draft", value: "draft" }, { label: "Signed", value: "signed" }, { label: "Amended", value: "amended" }, { label: "Entered in error", value: "entered_in_error" }], defaultValue: "draft", validation: { isRequired: true } }),
        transitionVersion: (0, import_fields55.integer)({ defaultValue: 1, validation: { isRequired: true, min: 1 } }),
        operationKeyHash: (0, import_fields55.text)({ isIndexed: "unique", access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
        requestHash: (0, import_fields55.text)({ access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
        facility: (0, import_fields55.relationship)({ ref: "Facility" }),
        patient: (0, import_fields55.relationship)({ ref: "Patient" }),
        encounter: (0, import_fields55.relationship)({ ref: "Encounter" }),
        author: (0, import_fields55.relationship)({ ref: "Provider" }),
        supersedes: (0, import_fields55.relationship)({ ref: "ClinicalDocument.supersedingDocument" }),
        supersedingDocument: (0, import_fields55.relationship)({ ref: "ClinicalDocument.supersedes" }),
        documentType: (0, import_fields55.text)({ validation: { isRequired: true } }),
        title: (0, import_fields55.text)({ validation: { isRequired: true } }),
        content: (0, import_fields55.text)({ access: { read: permissions.canReadClinicalPhi }, ui: { displayMode: "textarea" } }),
        contentHash: (0, import_fields55.text)({ access: { read: permissions.canReadClinicalPhi }, validation: { isRequired: true } }),
        actorReference: (0, import_fields55.text)({ access: { read: permissions.canReadAuditMetadata }, validation: { isRequired: true } }),
        signedAt: (0, import_fields55.timestamp)(),
        signedBy: (0, import_fields55.relationship)({ ref: "User" }),
        ...trackingFields
      }
    });
  }
});

// features/keystone/models/Specimen.ts
var import_core55, import_fields56, Specimen;
var init_Specimen = __esm({
  "features/keystone/models/Specimen.ts"() {
    "use strict";
    import_core55 = require("@keystone-6/core");
    import_fields56 = require("@keystone-6/core/fields");
    init_access();
    init_trackingFields();
    Specimen = (0, import_core55.list)({
      db: { extendPrismaSchema(schema) {
        return schema.replace(/facility\s+Facility\?/, "facility Facility").replace(/facilityId\s+String\?/, "facilityId String").replace(/patient\s+Patient\?/, "patient Patient").replace(/patientId\s+String\?/, "patientId String").replace(/encounter\s+Encounter\?/, "encounter Encounter").replace(/encounterId\s+String\?/, "encounterId String").replace(/medicalOrder\s+MedicalOrder\?/, "medicalOrder MedicalOrder").replace(/medicalOrderId\s+String\?/, "medicalOrderId String");
      } },
      access: { operation: { query: isSignedIn, create: denyAccess, update: denyAccess, delete: denyAccess }, filter: { query: rules.canReadSpecimens } },
      graphql: { plural: "Specimens", omit: { create: true, update: true, delete: true } },
      ui: { hideCreate: true, hideDelete: true, listView: { initialColumns: ["specimenNumber", "status", "specimenType", "patient", "medicalOrder"] } },
      fields: {
        specimenNumber: (0, import_fields56.text)({ isIndexed: "unique", validation: { isRequired: true } }),
        status: (0, import_fields56.select)({ type: "string", options: [
          { label: "Collected", value: "collected" },
          { label: "Received", value: "received" },
          { label: "Processing", value: "processing" },
          { label: "Disposed", value: "disposed" },
          { label: "Rejected", value: "rejected" }
        ], defaultValue: "collected", validation: { isRequired: true } }),
        transitionVersion: (0, import_fields56.integer)({ defaultValue: 1, validation: { isRequired: true, min: 1 } }),
        operationKeyHash: (0, import_fields56.text)({ isIndexed: "unique", access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
        requestHash: (0, import_fields56.text)({ access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
        facility: (0, import_fields56.relationship)({ ref: "Facility" }),
        patient: (0, import_fields56.relationship)({ ref: "Patient" }),
        encounter: (0, import_fields56.relationship)({ ref: "Encounter" }),
        medicalOrder: (0, import_fields56.relationship)({ ref: "MedicalOrder" }),
        specimenType: (0, import_fields56.text)({ validation: { isRequired: true } }),
        actorReference: (0, import_fields56.text)({ access: { read: permissions.canReadAuditMetadata }, validation: { isRequired: true } }),
        collectedAt: (0, import_fields56.timestamp)({ validation: { isRequired: true } }),
        receivedAt: (0, import_fields56.timestamp)(),
        disposedAt: (0, import_fields56.timestamp)(),
        rejectionReason: (0, import_fields56.text)({ access: { read: permissions.canReadClinicalPhi } }),
        ...trackingFields
      }
    });
  }
});

// features/keystone/models/RetentionPolicy.ts
var import_core56, import_fields57, RetentionPolicy;
var init_RetentionPolicy = __esm({
  "features/keystone/models/RetentionPolicy.ts"() {
    "use strict";
    import_core56 = require("@keystone-6/core");
    import_fields57 = require("@keystone-6/core/fields");
    init_access();
    init_trackingFields();
    RetentionPolicy = (0, import_core56.list)({
      db: { extendPrismaSchema(schema) {
        return schema.replace(/facility\s+Facility\?/, "facility Facility").replace(/facilityId\s+String\?/, "facilityId String").replace(/\n}\s*$/, '\n\n  @@unique([facilityId, recordType], map: "RetentionPolicy_facility_record_key")\n}');
      } },
      access: { operation: { query: isSignedIn, create: denyAccess, update: denyAccess, delete: denyAccess }, filter: { query: rules.canReadRetentionRecords } },
      graphql: { omit: { create: true, update: true, delete: true } },
      ui: { hideCreate: true, hideDelete: true, listView: { initialColumns: ["recordType", "retentionDays", "status", "facility"] } },
      fields: {
        recordType: (0, import_fields57.text)({ validation: { isRequired: true } }),
        retentionDays: (0, import_fields57.integer)({ validation: { isRequired: true, min: 1 } }),
        status: (0, import_fields57.select)({ type: "string", options: [{ label: "Active", value: "active" }, { label: "Inactive", value: "inactive" }], defaultValue: "active", validation: { isRequired: true } }),
        transitionVersion: (0, import_fields57.integer)({ defaultValue: 1, validation: { isRequired: true, min: 1 } }),
        operationKeyHash: (0, import_fields57.text)({ isIndexed: "unique", access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
        requestHash: (0, import_fields57.text)({ access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
        actorReference: (0, import_fields57.text)({ access: { read: permissions.canReadAuditMetadata }, validation: { isRequired: true } }),
        facility: (0, import_fields57.relationship)({ ref: "Facility" }),
        ...trackingFields
      }
    });
  }
});

// features/keystone/models/RetentionDisposition.ts
var import_core57, import_fields58, RetentionDisposition;
var init_RetentionDisposition = __esm({
  "features/keystone/models/RetentionDisposition.ts"() {
    "use strict";
    import_core57 = require("@keystone-6/core");
    import_fields58 = require("@keystone-6/core/fields");
    init_access();
    RetentionDisposition = (0, import_core57.list)({
      db: {
        extendPrismaSchema(schema) {
          return schema.replace(/facility\s+Facility\?/, "facility Facility").replace(/facilityId\s+String\?/, "facilityId String").replace(/policy\s+RetentionPolicy\?/, "policy RetentionPolicy").replace(/policyId\s+String\?/, "policyId String");
        }
      },
      access: {
        operation: { query: isSignedIn, create: denyAccess, update: denyAccess, delete: denyAccess },
        filter: { query: rules.canReadRetentionRecords }
      },
      graphql: { omit: { create: true, update: true, delete: true } },
      ui: { hideCreate: true, hideDelete: true, listView: { initialColumns: ["recordType", "aggregateId", "decision", "facility", "reviewedAt"] } },
      fields: {
        dispositionNumber: (0, import_fields58.text)({ isIndexed: "unique", validation: { isRequired: true } }),
        operationKeyHash: (0, import_fields58.text)({ isIndexed: "unique", access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
        requestHash: (0, import_fields58.text)({ access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
        facility: (0, import_fields58.relationship)({ ref: "Facility" }),
        patient: (0, import_fields58.relationship)({ ref: "Patient" }),
        policy: (0, import_fields58.relationship)({ ref: "RetentionPolicy" }),
        recordType: (0, import_fields58.text)({ validation: { isRequired: true } }),
        aggregateType: (0, import_fields58.text)({ validation: { isRequired: true } }),
        aggregateId: (0, import_fields58.text)({ validation: { isRequired: true }, isIndexed: true }),
        decision: (0, import_fields58.select)({
          type: "string",
          options: [
            { label: "Retained", value: "retained" },
            { label: "Blocked by hold", value: "blocked_by_hold" },
            { label: "Eligible for review", value: "eligible_for_review" }
          ],
          validation: { isRequired: true }
        }),
        reasonCode: (0, import_fields58.text)({ validation: { isRequired: true } }),
        actorReference: (0, import_fields58.text)({ access: { read: permissions.canReadAuditMetadata }, validation: { isRequired: true } }),
        cutoffAt: (0, import_fields58.timestamp)({ validation: { isRequired: true } }),
        reviewedAt: (0, import_fields58.timestamp)({ defaultValue: { kind: "now" }, validation: { isRequired: true } })
      }
    });
  }
});

// features/keystone/models/RecordHold.ts
var import_core58, import_fields59, RecordHold;
var init_RecordHold = __esm({
  "features/keystone/models/RecordHold.ts"() {
    "use strict";
    import_core58 = require("@keystone-6/core");
    import_fields59 = require("@keystone-6/core/fields");
    init_access();
    init_trackingFields();
    RecordHold = (0, import_core58.list)({
      db: { extendPrismaSchema(schema) {
        return schema.replace(/facility\s+Facility\?/, "facility Facility").replace(/facilityId\s+String\?/, "facilityId String");
      } },
      access: { operation: { query: isSignedIn, create: denyAccess, update: denyAccess, delete: denyAccess }, filter: { query: rules.canReadRetentionRecords } },
      graphql: { omit: { create: true, update: true, delete: true } },
      ui: { hideCreate: true, hideDelete: true, listView: { initialColumns: ["aggregateType", "aggregateId", "status", "reasonCode", "facility"] } },
      fields: {
        holdNumber: (0, import_fields59.text)({ isIndexed: "unique", validation: { isRequired: true } }),
        aggregateType: (0, import_fields59.text)({ validation: { isRequired: true } }),
        aggregateId: (0, import_fields59.text)({ validation: { isRequired: true }, isIndexed: true }),
        status: (0, import_fields59.select)({ type: "string", options: [{ label: "Active", value: "active" }, { label: "Released", value: "released" }], defaultValue: "active", validation: { isRequired: true } }),
        transitionVersion: (0, import_fields59.integer)({ defaultValue: 1, validation: { isRequired: true, min: 1 } }),
        operationKeyHash: (0, import_fields59.text)({ isIndexed: "unique", access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
        requestHash: (0, import_fields59.text)({ access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
        facility: (0, import_fields59.relationship)({ ref: "Facility" }),
        patient: (0, import_fields59.relationship)({ ref: "Patient" }),
        reasonCode: (0, import_fields59.text)({ validation: { isRequired: true } }),
        notes: (0, import_fields59.text)({ access: { read: permissions.canManageRetention } }),
        actorReference: (0, import_fields59.text)({ access: { read: permissions.canReadAuditMetadata }, validation: { isRequired: true } }),
        placedAt: (0, import_fields59.timestamp)({ defaultValue: { kind: "now" }, validation: { isRequired: true } }),
        releasedAt: (0, import_fields59.timestamp)(),
        ...trackingFields
      }
    });
  }
});

// features/keystone/models/ImportBatch.ts
var import_core59, import_fields60, ImportBatch;
var init_ImportBatch = __esm({
  "features/keystone/models/ImportBatch.ts"() {
    "use strict";
    import_core59 = require("@keystone-6/core");
    import_fields60 = require("@keystone-6/core/fields");
    init_access();
    init_trackingFields();
    ImportBatch = (0, import_core59.list)({
      db: { extendPrismaSchema(schema) {
        return schema.replace(/facility\s+Facility\?/, "facility Facility").replace(/facilityId\s+String\?/, "facilityId String");
      } },
      access: { operation: { query: isSignedIn, create: denyAccess, update: denyAccess, delete: denyAccess }, filter: { query: rules.canReadPortabilityRecords } },
      graphql: { omit: { create: true, update: true, delete: true } },
      ui: { hideCreate: true, hideDelete: true, listView: { initialColumns: ["batchNumber", "importType", "status", "rowCount", "errorCount", "facility"] } },
      fields: {
        batchNumber: (0, import_fields60.text)({ isIndexed: "unique", validation: { isRequired: true } }),
        importType: (0, import_fields60.select)({ type: "string", options: [{ label: "Patients", value: "patients" }, { label: "Inventory", value: "inventory" }], validation: { isRequired: true } }),
        status: (0, import_fields60.select)({ type: "string", options: [{ label: "Previewed", value: "previewed" }, { label: "Applied", value: "applied" }, { label: "Rolled back", value: "rolled_back" }, { label: "Failed", value: "failed" }], defaultValue: "previewed", validation: { isRequired: true } }),
        transitionVersion: (0, import_fields60.integer)({ defaultValue: 1, validation: { isRequired: true, min: 1 } }),
        operationKeyHash: (0, import_fields60.text)({ isIndexed: "unique", access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
        requestHash: (0, import_fields60.text)({ access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
        sourceHash: (0, import_fields60.text)({ validation: { isRequired: true } }),
        facility: (0, import_fields60.relationship)({ ref: "Facility" }),
        rowCount: (0, import_fields60.integer)({ defaultValue: 0, validation: { isRequired: true, min: 0 } }),
        errorCount: (0, import_fields60.integer)({ defaultValue: 0, validation: { isRequired: true, min: 0 } }),
        preview: (0, import_fields60.json)({ access: { read: permissions.canManageDataPortability } }),
        appliedIds: (0, import_fields60.json)({ access: { read: permissions.canManageDataPortability } }),
        actorReference: (0, import_fields60.text)({ access: { read: permissions.canReadAuditMetadata }, validation: { isRequired: true } }),
        appliedAt: (0, import_fields60.timestamp)(),
        rolledBackAt: (0, import_fields60.timestamp)(),
        ...trackingFields
      }
    });
  }
});

// features/keystone/models/ExportJob.ts
var import_core60, import_fields61, ExportJob;
var init_ExportJob = __esm({
  "features/keystone/models/ExportJob.ts"() {
    "use strict";
    import_core60 = require("@keystone-6/core");
    import_fields61 = require("@keystone-6/core/fields");
    init_access();
    init_trackingFields();
    ExportJob = (0, import_core60.list)({
      db: { extendPrismaSchema(schema) {
        return schema.replace(/facility\s+Facility\?/, "facility Facility").replace(/facilityId\s+String\?/, "facilityId String").replace(/requestedBy\s+User\?/, "requestedBy User").replace(/requestedById\s+String\?/, "requestedById String");
      } },
      access: { operation: { query: isSignedIn, create: denyAccess, update: denyAccess, delete: denyAccess }, filter: { query: rules.canReadPortabilityRecords } },
      graphql: { omit: { create: true, update: true, delete: true } },
      ui: { hideCreate: true, hideDelete: true, listView: { initialColumns: ["jobNumber", "exportType", "status", "format", "facility", "expiresAt"] } },
      fields: {
        jobNumber: (0, import_fields61.text)({ isIndexed: "unique", validation: { isRequired: true } }),
        exportType: (0, import_fields61.select)({ type: "string", options: [{ label: "Patients", value: "patients" }, { label: "Appointments", value: "appointments" }, { label: "Audit", value: "audit" }, { label: "Inventory", value: "inventory" }], validation: { isRequired: true } }),
        status: (0, import_fields61.select)({ type: "string", options: [{ label: "Queued", value: "queued" }, { label: "Processing", value: "processing" }, { label: "Ready", value: "ready" }, { label: "Expired", value: "expired" }, { label: "Failed", value: "failed" }], defaultValue: "queued", validation: { isRequired: true } }),
        transitionVersion: (0, import_fields61.integer)({ defaultValue: 1, validation: { isRequired: true, min: 1 } }),
        operationKeyHash: (0, import_fields61.text)({ isIndexed: "unique", access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
        requestHash: (0, import_fields61.text)({ access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
        facility: (0, import_fields61.relationship)({ ref: "Facility" }),
        requestedBy: (0, import_fields61.relationship)({ ref: "User" }),
        format: (0, import_fields61.select)({ type: "string", options: [{ label: "CSV", value: "csv" }, { label: "JSON", value: "json" }], validation: { isRequired: true } }),
        filters: (0, import_fields61.json)({ access: { read: permissions.canManageDataPortability } }),
        objectKey: (0, import_fields61.text)({ access: { read: denyAccess } }),
        resultDigest: (0, import_fields61.text)({ access: { read: permissions.canManageDataPortability } }),
        accessTokenDigest: (0, import_fields61.text)({ access: { read: denyAccess } }),
        resultCiphertext: (0, import_fields61.text)({ access: { read: denyAccess } }),
        resultIv: (0, import_fields61.text)({ access: { read: denyAccess } }),
        resultTag: (0, import_fields61.text)({ access: { read: denyAccess } }),
        actorReference: (0, import_fields61.text)({ access: { read: permissions.canReadAuditMetadata }, validation: { isRequired: true } }),
        expiresAt: (0, import_fields61.timestamp)({ validation: { isRequired: true } }),
        readyAt: (0, import_fields61.timestamp)(),
        consumedAt: (0, import_fields61.timestamp)(),
        errorCode: (0, import_fields61.text)(),
        ...trackingFields
      }
    });
  }
});

// features/keystone/models/ExternalIdentityLink.ts
var import_core61, import_fields62, ExternalIdentityLink;
var init_ExternalIdentityLink = __esm({
  "features/keystone/models/ExternalIdentityLink.ts"() {
    "use strict";
    import_core61 = require("@keystone-6/core");
    import_fields62 = require("@keystone-6/core/fields");
    init_access();
    ExternalIdentityLink = (0, import_core61.list)({
      db: { extendPrismaSchema(schema) {
        return schema.replace(/facility\s+Facility\?/, "facility Facility").replace(/facilityId\s+String\?/, "facilityId String").replace(/\n}\s*$/, '\n\n  @@unique([facilityId, system, resourceType, externalId], map: "ExternalIdentityLink_external_key")\n}');
      } },
      access: { operation: { query: isSignedIn, create: denyAccess, update: denyAccess, delete: denyAccess }, filter: { query: rules.canReadExternalIdentityLinks } },
      graphql: { omit: { create: true, update: true, delete: true } },
      ui: { hideCreate: true, hideDelete: true, listView: { initialColumns: ["system", "resourceType", "externalId", "localType", "status"] } },
      fields: {
        linkNumber: (0, import_fields62.text)({ isIndexed: "unique", validation: { isRequired: true } }),
        facility: (0, import_fields62.relationship)({ ref: "Facility" }),
        system: (0, import_fields62.text)({ validation: { isRequired: true } }),
        resourceType: (0, import_fields62.text)({ validation: { isRequired: true } }),
        externalId: (0, import_fields62.text)({ access: { read: permissions.canManageIntegrations }, validation: { isRequired: true } }),
        localType: (0, import_fields62.text)({ validation: { isRequired: true } }),
        localId: (0, import_fields62.text)({ validation: { isRequired: true }, isIndexed: true }),
        status: (0, import_fields62.select)({ type: "string", options: [{ label: "Active", value: "active" }, { label: "Superseded", value: "superseded" }], defaultValue: "active", validation: { isRequired: true } }),
        operationKeyHash: (0, import_fields62.text)({ isIndexed: "unique", access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
        requestHash: (0, import_fields62.text)({ access: { read: permissions.canAccessAllClinicalData }, validation: { isRequired: true } }),
        actorReference: (0, import_fields62.text)({ access: { read: permissions.canReadAuditMetadata }, validation: { isRequired: true } }),
        createdAt: (0, import_fields62.timestamp)({ defaultValue: { kind: "now" }, validation: { isRequired: true } })
      }
    });
  }
});

// features/keystone/models/RequestRateLimitBucket.ts
var import_core62, import_fields63, RequestRateLimitBucket;
var init_RequestRateLimitBucket = __esm({
  "features/keystone/models/RequestRateLimitBucket.ts"() {
    "use strict";
    import_core62 = require("@keystone-6/core");
    import_fields63 = require("@keystone-6/core/fields");
    init_access();
    RequestRateLimitBucket = (0, import_core62.list)({
      access: {
        operation: { query: denyAccess, create: denyAccess, update: denyAccess, delete: denyAccess }
      },
      graphql: { omit: true },
      ui: { isHidden: true },
      fields: {
        startedAt: (0, import_fields63.timestamp)({ validation: { isRequired: true } }),
        count: (0, import_fields63.integer)({ validation: { isRequired: true, min: 1 } }),
        updatedAt: (0, import_fields63.timestamp)({ validation: { isRequired: true }, isIndexed: true })
      }
    });
  }
});

// features/keystone/models/PasswordResetRequest.ts
var import_core63, import_fields64, PasswordResetRequest;
var init_PasswordResetRequest = __esm({
  "features/keystone/models/PasswordResetRequest.ts"() {
    "use strict";
    import_core63 = require("@keystone-6/core");
    import_fields64 = require("@keystone-6/core/fields");
    init_access();
    PasswordResetRequest = (0, import_core63.list)({
      db: {
        extendPrismaSchema(schema) {
          return schema.replace(/user\s+User\?/, "user User").replace(/userId\s+String\?/, "userId String").replace(/\n}\s*$/, '\n\n  @@index([userId, status, expiresAt], map: "PasswordResetRequest_user_status_expiry_idx")\n}');
        }
      },
      access: {
        operation: { query: denyAccess, create: denyAccess, update: denyAccess, delete: denyAccess }
      },
      graphql: { omit: true },
      ui: { isHidden: true },
      fields: {
        tokenDigest: (0, import_fields64.text)({ isIndexed: "unique", validation: { isRequired: true } }),
        accountDigest: (0, import_fields64.text)({ isIndexed: true, validation: { isRequired: true } }),
        status: (0, import_fields64.select)({
          type: "string",
          options: [
            { label: "Pending", value: "pending" },
            { label: "Redeemed", value: "redeemed" },
            { label: "Superseded", value: "superseded" },
            { label: "Expired", value: "expired" },
            { label: "Delivery failed", value: "delivery_failed" }
          ],
          defaultValue: "pending",
          validation: { isRequired: true },
          isIndexed: true
        }),
        user: (0, import_fields64.relationship)({ ref: "User", access: { read: denyAccess, create: denyAccess, update: denyAccess } }),
        expiresAt: (0, import_fields64.timestamp)({ validation: { isRequired: true }, isIndexed: true }),
        mailSentAt: (0, import_fields64.timestamp)(),
        redeemedAt: (0, import_fields64.timestamp)(),
        supersededAt: (0, import_fields64.timestamp)(),
        deliveryFailedAt: (0, import_fields64.timestamp)(),
        createdAt: (0, import_fields64.timestamp)({ defaultValue: { kind: "now" }, validation: { isRequired: true } })
      }
    });
  }
});

// features/keystone/models/index.ts
var rawModels, models;
var init_models = __esm({
  "features/keystone/models/index.ts"() {
    "use strict";
    init_User();
    init_Role();
    init_HospitalProfile();
    init_PhiReadAudit();
    init_Patient();
    init_PatientIdentifier();
    init_PatientRegistration();
    init_Provider();
    init_AppointmentType();
    init_ProviderScheduleBlock();
    init_Appointment();
    init_IntakeForm();
    init_PatientMessage();
    init_PatientPortalAccess();
    init_PatientConsent();
    init_ClinicalAuditLog();
    init_ClinicalOutboxEvent();
    init_WorkflowTransition();
    init_CareQueueTicket();
    init_Encounter();
    init_EpisodeClosurePolicy();
    init_Admission();
    init_Department();
    init_DepartmentImage();
    init_Facility();
    init_FacilityImage();
    init_Ward();
    init_Room();
    init_Bed();
    init_BedOccupancyEvent();
    init_Clinician();
    init_ClinicianImage();
    init_VitalSign();
    init_MedicalOrder();
    init_Prescription();
    init_LabTest();
    init_LabResult();
    init_Procedure();
    init_InsuranceClaim();
    init_CarePlan();
    init_PatientCoverage();
    init_ClaimVersion();
    init_PatientPayment();
    init_PatientRefund();
    init_InventoryItem();
    init_InventoryMovement();
    init_CommunicationPreference();
    init_CommunicationTemplate();
    init_BedReservation();
    init_IntegrationInstallation();
    init_MachineCredential();
    init_IntegrationDeliveryAttempt();
    init_IntegrationWebhookReceipt();
    init_ClinicalDocument();
    init_Specimen();
    init_RetentionPolicy();
    init_RetentionDisposition();
    init_RecordHold();
    init_ImportBatch();
    init_ExportJob();
    init_ExternalIdentityLink();
    init_RequestRateLimitBucket();
    init_PasswordResetRequest();
    rawModels = {
      User,
      Role,
      HospitalProfile,
      PhiReadAudit,
      Patient,
      PatientIdentifier,
      PatientRegistration,
      Provider,
      AppointmentType,
      ProviderScheduleBlock,
      Appointment,
      IntakeForm,
      PatientMessage,
      PatientPortalAccess,
      PatientConsent,
      ClinicalAuditLog,
      ClinicalOutboxEvent,
      WorkflowTransition,
      CareQueueTicket,
      CarePlan,
      InsuranceClaim,
      Procedure,
      LabResult,
      LabTest,
      Prescription,
      MedicalOrder,
      VitalSign,
      ClinicianImage,
      Clinician,
      Bed,
      BedOccupancyEvent,
      Room,
      Ward,
      FacilityImage,
      Facility,
      DepartmentImage,
      Department,
      Admission,
      Encounter,
      EpisodeClosurePolicy,
      PatientCoverage,
      ClaimVersion,
      PatientPayment,
      PatientRefund,
      InventoryItem,
      InventoryMovement,
      CommunicationPreference,
      CommunicationTemplate,
      BedReservation,
      IntegrationInstallation,
      MachineCredential,
      IntegrationDeliveryAttempt,
      IntegrationWebhookReceipt,
      ClinicalDocument,
      Specimen,
      RetentionPolicy,
      RetentionDisposition,
      RecordHold,
      ImportBatch,
      ExportJob,
      ExternalIdentityLink,
      RequestRateLimitBucket,
      PasswordResetRequest
    };
    models = Object.fromEntries(
      Object.entries(rawModels).map(([key2, model]) => [
        key2,
        { ...model, graphql: { ...model.graphql, maxTake: 100 } }
      ])
    );
  }
});

// features/keystone/mutations/redirectToInit.ts
async function redirectToInit(_root, _args, context) {
  const users = await context.sudo().prisma.user.count();
  return users === 0;
}
var init_redirectToInit = __esm({
  "features/keystone/mutations/redirectToInit.ts"() {
    "use strict";
  }
});

// features/keystone/mutations/booking/publicEstimate.ts
function publicEstimateText(_legacyPriceCents) {
  return "Estimate provided by clinic";
}
var init_publicEstimate = __esm({
  "features/keystone/mutations/booking/publicEstimate.ts"() {
    "use strict";
  }
});

// features/keystone/mutations/booking/getBookableAppointmentTypes.ts
function providerDisplayName(provider) {
  const credentials = provider.credentials ? `, ${provider.credentials}` : "";
  return `${provider.firstName || ""} ${provider.lastName || ""}${credentials}`.trim();
}
async function loadBookableAppointmentTypes(context) {
  const sudo = context.sudo();
  const prisma = sudo.prisma;
  const appointmentTypes = await prisma.appointmentType.findMany({
    where: { status: "bookable" },
    orderBy: { name: "asc" },
    take: MAX_PUBLIC_APPOINTMENT_TYPES + 1,
    include: {
      providers: {
        where: { status: "active", facilities: { some: { status: "active" } } },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        take: MAX_PUBLIC_PROVIDERS_PER_TYPE + 1,
        include: {
          facilities: {
            where: { status: "active" },
            orderBy: { name: "asc" },
            take: MAX_PUBLIC_FACILITIES_PER_PROVIDER + 1
          }
        }
      }
    }
  });
  if (appointmentTypes.length > MAX_PUBLIC_APPOINTMENT_TYPES || appointmentTypes.some(
    (appointmentType) => appointmentType.providers.length > MAX_PUBLIC_PROVIDERS_PER_TYPE || appointmentType.providers.some((provider) => provider.facilities.length > MAX_PUBLIC_FACILITIES_PER_PROVIDER)
  )) throw new Error("Public appointment catalog exceeds its configured capacity");
  return appointmentTypes.filter((appointmentType) => appointmentType.providers.length > 0).map((appointmentType) => ({
    id: appointmentType.id,
    name: appointmentType.name,
    slug: appointmentType.slug,
    description: appointmentType.description,
    durationMinutes: appointmentType.durationMinutes,
    priceCents: appointmentType.priceCents,
    formattedPrice: publicEstimateText(appointmentType.priceCents),
    providers: appointmentType.providers.map((provider) => ({
      id: provider.id,
      displayName: providerDisplayName(provider),
      specialty: provider.specialty,
      bio: provider.bio,
      locationName: provider.locationName,
      facilities: provider.facilities.map((facility) => ({
        id: facility.id,
        name: facility.name,
        timeZone: facility.timeZone
      }))
    }))
  }));
}
function getBookableAppointmentTypes(_root, _args, context) {
  const key2 = context;
  const existing = catalogCache.get(key2);
  if (existing) return existing;
  const pending = loadBookableAppointmentTypes(context);
  catalogCache.set(key2, pending);
  void pending.catch(() => catalogCache.delete(key2));
  return pending;
}
var MAX_PUBLIC_APPOINTMENT_TYPES, MAX_PUBLIC_PROVIDERS_PER_TYPE, MAX_PUBLIC_FACILITIES_PER_PROVIDER, catalogCache;
var init_getBookableAppointmentTypes = __esm({
  "features/keystone/mutations/booking/getBookableAppointmentTypes.ts"() {
    "use strict";
    init_publicEstimate();
    MAX_PUBLIC_APPOINTMENT_TYPES = 25;
    MAX_PUBLIC_PROVIDERS_PER_TYPE = 25;
    MAX_PUBLIC_FACILITIES_PER_PROVIDER = 10;
    catalogCache = /* @__PURE__ */ new WeakMap();
  }
});

// features/lib/narrativeText.ts
function narrativeText(value, label, maximumBytes, required = false) {
  if (value !== void 0 && value !== null && typeof value !== "string") throw new Error(`${label} is invalid`);
  const text63 = String(value ?? "").replace(/\r\n?/g, "\n").trim();
  if (required && !text63 || new TextEncoder().encode(text63).length > maximumBytes || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text63)) throw new Error(`${label} is invalid`);
  return text63;
}
var init_narrativeText = __esm({
  "features/lib/narrativeText.ts"() {
    "use strict";
  }
});

// features/keystone/mutations/booking/getHospitalBranding.ts
function bounded(value, maximum) {
  const text63 = String(value || "").trim();
  return text63 && text63.length <= maximum && !/[\u0000-\u001f\u007f]/.test(text63) ? text63 : "";
}
function publicMedia(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, path]) => typeof path === "string" && path.startsWith("/images/") && !path.includes("..")).slice(0, 20));
}
async function getHospitalBranding(_root, _args, context) {
  const prisma = context.sudo().prisma;
  const profile = await prisma.hospitalProfile.findFirst({
    where: { profileKey: "primary", status: "active" },
    select: {
      name: true,
      shortName: true,
      brandTheme: true,
      logoIcon: true,
      logoColor: true,
      market: true,
      description: true,
      locationName: true,
      serviceArea: true,
      addressLine1: true,
      city: true,
      region: true,
      postalCode: true,
      supportPhone: true,
      supportEmail: true,
      media: true
    }
  });
  if (!profile) return null;
  return {
    name: bounded(profile.name, 200),
    shortName: bounded(profile.shortName, 80),
    brandTheme: normalizeHospitalBrandTheme(profile.brandTheme),
    logoIcon: sanitizeStoreLogoSvg(profile.logoIcon || "") || DEFAULT_STORE_LOGO_ICON,
    logoColor: profile.logoColor == null ? { evergreen: "275", navy: "335", plum: "75" }[normalizeHospitalBrandTheme(profile.brandTheme)] : normalizeStoreLogoColor(profile.logoColor),
    market: bounded(profile.market, 300),
    description: (() => {
      try {
        return narrativeText(profile.description, "Public summary", 8e3);
      } catch {
        return "";
      }
    })(),
    locationName: bounded(profile.locationName, 300),
    serviceArea: bounded(profile.serviceArea, 500),
    addressLine1: bounded(profile.addressLine1, 300),
    city: bounded(profile.city, 150),
    region: bounded(profile.region, 150),
    postalCode: bounded(profile.postalCode, 40),
    supportPhone: bounded(profile.supportPhone, 40),
    supportEmail: bounded(profile.supportEmail, 254),
    media: publicMedia(profile.media)
  };
}
var init_getHospitalBranding = __esm({
  "features/keystone/mutations/booking/getHospitalBranding.ts"() {
    "use strict";
    init_storeLogo();
    init_store_logo();
    init_narrativeText();
    init_hospitalBrandTheme();
  }
});

// features/keystone/mutations/booking/getBookableProviders.ts
function providerDisplayName2(provider) {
  const credentials = provider.credentials ? `, ${provider.credentials}` : "";
  return `${provider.firstName || ""} ${provider.lastName || ""}${credentials}`.trim();
}
function canonicalImagePath(imagePath) {
  if (!imagePath?.startsWith("/images/") || imagePath.includes("..")) return null;
  return imagePath;
}
async function loadBookableProviders(context) {
  const sudo = context.sudo();
  const prisma = sudo.prisma;
  const providers = await prisma.provider.findMany({
    where: {
      status: "active",
      facilities: { some: { status: "active" } },
      appointmentTypes: { some: { status: "bookable" } }
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: MAX_PUBLIC_PROVIDERS + 1,
    include: {
      appointmentTypes: {
        where: { status: "bookable" },
        orderBy: { name: "asc" },
        take: MAX_PUBLIC_VISIT_TYPES_PER_PROVIDER + 1
      },
      clinicians: {
        where: { active: true },
        orderBy: { createdAt: "asc" },
        take: 1,
        include: {
          images: {
            orderBy: { order: "asc" },
            take: 1
          }
        }
      }
    }
  });
  if (providers.length > MAX_PUBLIC_PROVIDERS || providers.some((provider) => provider.appointmentTypes.length > MAX_PUBLIC_VISIT_TYPES_PER_PROVIDER)) throw new Error("Public provider catalog exceeds its configured capacity");
  return providers.map((provider) => ({
    id: provider.id,
    displayName: providerDisplayName2(provider),
    firstName: provider.firstName,
    lastName: provider.lastName,
    credentials: provider.credentials,
    specialty: provider.specialty,
    bio: provider.bio,
    locationName: provider.locationName,
    imagePath: canonicalImagePath(provider.clinicians[0]?.images[0]?.imagePath),
    imageAltText: provider.clinicians[0]?.images[0]?.altText || null,
    appointmentTypes: provider.appointmentTypes.map((appointmentType) => ({
      id: appointmentType.id,
      name: appointmentType.name,
      slug: appointmentType.slug,
      durationMinutes: appointmentType.durationMinutes,
      formattedPrice: publicEstimateText(appointmentType.priceCents)
    }))
  }));
}
function getBookableProviders(_root, _args, context) {
  const key2 = context;
  const existing = providerCatalogCache.get(key2);
  if (existing) return existing;
  const pending = loadBookableProviders(context);
  providerCatalogCache.set(key2, pending);
  void pending.catch(() => providerCatalogCache.delete(key2));
  return pending;
}
var MAX_PUBLIC_PROVIDERS, MAX_PUBLIC_VISIT_TYPES_PER_PROVIDER, providerCatalogCache;
var init_getBookableProviders = __esm({
  "features/keystone/mutations/booking/getBookableProviders.ts"() {
    "use strict";
    init_publicEstimate();
    MAX_PUBLIC_PROVIDERS = 50;
    MAX_PUBLIC_VISIT_TYPES_PER_PROVIDER = 25;
    providerCatalogCache = /* @__PURE__ */ new WeakMap();
  }
});

// features/keystone/mutations/scheduling/schedulePolicy.ts
function parseScheduleWindow(startsAt, endsAt) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error("Schedule window must use valid ISO dates");
  }
  if (end <= start) throw new Error("Schedule window must end after it starts");
  if (end.getTime() - start.getTime() > 24 * 60 * 6e4) {
    throw new Error("Schedule window cannot exceed 24 hours");
  }
  return { start, end };
}
function parsePublicDateWindow(date, timeZoneOrNow = "UTC", requestedNow = /* @__PURE__ */ new Date()) {
  const timeZone = timeZoneOrNow instanceof Date ? "UTC" : assertIanaTimeZone(timeZoneOrNow);
  const now = timeZoneOrNow instanceof Date ? timeZoneOrNow : requestedNow;
  const window = facilityCalendarWindow(date, timeZone);
  const today = calendarDateInTimeZone(now, timeZone);
  const latest = addCalendarDays(today, MAX_PUBLIC_BOOKING_DAYS);
  if (date < today) throw new Error("date cannot be in the past");
  if (date > latest) throw new Error(`date cannot be more than ${MAX_PUBLIC_BOOKING_DAYS} days ahead`);
  return window;
}
function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}
function normalizeAppointmentTypePolicy(appointmentType) {
  const durationMinutes = Number(appointmentType.durationMinutes);
  const bufferBeforeMinutes = Number(appointmentType.bufferBeforeMinutes || 0);
  const bufferAfterMinutes = Number(appointmentType.bufferAfterMinutes || 0);
  if (durationMinutes < 5 || durationMinutes > MAX_APPOINTMENT_DURATION_MINUTES) {
    throw new Error("Appointment duration is outside the supported range");
  }
  if (bufferBeforeMinutes < 0 || bufferBeforeMinutes > MAX_APPOINTMENT_BUFFER_MINUTES || bufferAfterMinutes < 0 || bufferAfterMinutes > MAX_APPOINTMENT_BUFFER_MINUTES) {
    throw new Error("Appointment buffer is outside the supported range");
  }
  return {
    id: appointmentType.id,
    name: appointmentType.name,
    durationMinutes,
    bufferBeforeMinutes,
    bufferAfterMinutes
  };
}
function occupiedWindow(startsAt, endsAt, bufferBeforeMinutes = 0, bufferAfterMinutes = 0) {
  const { start, end } = parseScheduleWindow(startsAt, endsAt);
  return {
    start: new Date(start.getTime() - bufferBeforeMinutes * 6e4),
    end: new Date(end.getTime() + bufferAfterMinutes * 6e4)
  };
}
async function lockProviderSchedule(db, providerId) {
  if (!providerId) throw new Error("Provider is required");
  await db.$queryRaw(
    import_client.Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`hospital-provider-schedule:${providerId}`}, 0))::text AS "lock"`
  );
}
async function getBookableProviderPolicy(db, appointmentTypeId, providerId, facilityId) {
  const [appointmentTypeRecord, provider] = await Promise.all([
    db.appointmentType.findFirst({
      where: { id: appointmentTypeId, status: "bookable" },
      select: {
        id: true,
        name: true,
        durationMinutes: true,
        bufferBeforeMinutes: true,
        bufferAfterMinutes: true
      }
    }),
    db.provider.findFirst({
      where: {
        id: providerId,
        status: "active",
        appointmentTypes: { some: { id: appointmentTypeId, status: "bookable" } }
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        credentials: true,
        locationName: true,
        facilities: {
          where: { status: "active", id: facilityId },
          orderBy: { name: "asc" },
          select: { id: true, name: true }
        }
      }
    })
  ]);
  if (!appointmentTypeRecord || !provider) return null;
  const appointmentType = normalizeAppointmentTypePolicy(appointmentTypeRecord);
  const facility = provider.facilities.find((item) => item.id === facilityId);
  if (!facility) return null;
  return { appointmentType, provider, facility };
}
async function inspectProviderWindow(db, args) {
  const { start, end } = parseScheduleWindow(args.startsAt, args.endsAt);
  const candidate = occupiedWindow(
    start,
    end,
    args.bufferBeforeMinutes || 0,
    args.bufferAfterMinutes || 0
  );
  const [provider, coveringAvailability, blockingScheduleBlocks, appointmentCandidates] = await Promise.all([
    db.provider.findUnique({ where: { id: args.providerId }, select: { id: true, status: true } }),
    db.providerScheduleBlock.findFirst({
      where: {
        providerId: args.providerId,
        facilityId: args.facilityId,
        blockType: "available",
        startsAt: { lte: candidate.start },
        endsAt: { gte: candidate.end }
      },
      select: { id: true }
    }),
    db.providerScheduleBlock.findMany({
      where: {
        providerId: args.providerId,
        facilityId: args.facilityId,
        blockType: { in: [...BLOCKING_SCHEDULE_TYPES] },
        startsAt: { lt: candidate.end },
        endsAt: { gt: candidate.start }
      },
      orderBy: { startsAt: "asc" },
      take: 1001,
      select: { id: true, blockType: true, startsAt: true, endsAt: true }
    }),
    db.appointment.findMany({
      where: {
        providerId: args.providerId,
        id: args.excludeAppointmentId ? { not: args.excludeAppointmentId } : void 0,
        status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
        startsAt: { lt: new Date(candidate.end.getTime() + MAX_APPOINTMENT_BUFFER_MINUTES * 6e4) },
        endsAt: { gt: new Date(candidate.start.getTime() - MAX_APPOINTMENT_BUFFER_MINUTES * 6e4) }
      },
      orderBy: { startsAt: "asc" },
      take: 501,
      select: {
        id: true,
        appointmentNumber: true,
        status: true,
        startsAt: true,
        endsAt: true,
        appointmentType: {
          select: { bufferBeforeMinutes: true, bufferAfterMinutes: true }
        }
      }
    })
  ]);
  if (!provider || provider.status !== "active") throw new Error("Provider is not active");
  if (blockingScheduleBlocks.length > 1e3 || appointmentCandidates.length > 500) {
    throw new Error("Provider schedule window exceeds its configured capacity");
  }
  const appointments = appointmentCandidates.filter((appointment) => {
    const occupied = occupiedWindow(
      appointment.startsAt,
      appointment.endsAt,
      Number(appointment.appointmentType?.bufferBeforeMinutes || 0),
      Number(appointment.appointmentType?.bufferAfterMinutes || 0)
    );
    return rangesOverlap(candidate.start, candidate.end, occupied.start, occupied.end);
  });
  return {
    withinAvailability: Boolean(coveringAvailability),
    hasConflict: !coveringAvailability || blockingScheduleBlocks.length > 0 || appointments.length > 0,
    appointments,
    blockingScheduleBlocks
  };
}
async function inspectBookableSlot(db, args) {
  const start = new Date(args.startsAt);
  if (Number.isNaN(start.getTime())) throw new Error("startsAt must be a valid ISO date");
  const coveringBlock = await db.providerScheduleBlock.findFirst({
    where: { providerId: args.providerId, facilityId: args.facilityId, blockType: "available", startsAt: { lte: start }, endsAt: { gt: start } },
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    select: { facilityId: true }
  });
  const policy = await getBookableProviderPolicy(db, args.appointmentTypeId, args.providerId, args.facilityId);
  if (!coveringBlock || !policy) throw new Error("Appointment type, provider, and facility are not bookable together");
  const end = new Date(start.getTime() + policy.appointmentType.durationMinutes * 6e4);
  const availability = await inspectProviderWindow(db, {
    providerId: args.providerId,
    facilityId: policy.facility.id,
    startsAt: start,
    endsAt: end,
    bufferBeforeMinutes: policy.appointmentType.bufferBeforeMinutes,
    bufferAfterMinutes: policy.appointmentType.bufferAfterMinutes,
    excludeAppointmentId: args.excludeAppointmentId
  });
  return { ...policy, startsAt: start, endsAt: end, availability };
}
function isScheduleRaceError(error) {
  const value = error;
  return value?.code === "P2002" || value?.code === "P2004" || value?.code === "P2034" || value?.message?.includes("Appointment_active_provider_no_overlap") === true;
}
var import_client, ACTIVE_APPOINTMENT_STATUSES, BLOCKING_SCHEDULE_TYPES, MAX_APPOINTMENT_DURATION_MINUTES, MAX_APPOINTMENT_BUFFER_MINUTES, MAX_PUBLIC_BOOKING_DAYS;
var init_schedulePolicy = __esm({
  "features/keystone/mutations/scheduling/schedulePolicy.ts"() {
    "use strict";
    import_client = require("@prisma/client");
    init_facilityTime();
    ACTIVE_APPOINTMENT_STATUSES = ["confirmed", "checked_in", "in_visit"];
    BLOCKING_SCHEDULE_TYPES = ["unavailable", "admin_time"];
    MAX_APPOINTMENT_DURATION_MINUTES = 480;
    MAX_APPOINTMENT_BUFFER_MINUTES = 240;
    MAX_PUBLIC_BOOKING_DAYS = 180;
  }
});

// features/keystone/mutations/booking/getAvailableAppointmentSlots.ts
function providerDisplayName3(provider) {
  const credentials = provider.credentials ? `, ${provider.credentials}` : "";
  return `${provider.firstName || ""} ${provider.lastName || ""}${credentials}`.trim() || "Provider";
}
async function loadAvailableAppointmentSlots({ appointmentTypeId, providerId, facilityId, date }, context) {
  const sudo = context.sudo();
  const prisma = sudo.prisma;
  const facilityRecord = await prisma.facility.findFirst({
    where: { id: facilityId, status: "active" },
    select: { id: true, name: true, timeZone: true }
  });
  if (!facilityRecord) return [];
  const { start, end, timeZone } = parsePublicDateWindow(date, facilityRecord.timeZone);
  const appointmentTypeRecord = await prisma.appointmentType.findFirst({
    where: { id: appointmentTypeId, status: "bookable" },
    select: {
      id: true,
      name: true,
      durationMinutes: true,
      bufferBeforeMinutes: true,
      bufferAfterMinutes: true
    }
  });
  if (!appointmentTypeRecord) throw new Error("Appointment type not found or not currently bookable");
  const appointmentType = normalizeAppointmentTypePolicy(appointmentTypeRecord);
  const providers = await prisma.provider.findMany({
    where: {
      id: providerId,
      status: "active",
      appointmentTypes: { some: { id: appointmentTypeId, status: "bookable" } },
      facilities: { some: { id: facilityId, status: "active" } }
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 101,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      credentials: true
    }
  });
  if (providers.length === 0) return [];
  if (providers.length > 100) throw new Error("Too many providers match this public availability request");
  const providerIds = providers.map((provider) => provider.id);
  const [scheduleBlocks, appointmentCandidates, communicationInstallations] = await Promise.all([
    prisma.providerScheduleBlock.findMany({
      where: {
        providerId: { in: providerIds },
        facilityId,
        startsAt: { lt: end },
        endsAt: { gt: start }
      },
      orderBy: [{ providerId: "asc" }, { startsAt: "asc" }],
      take: 2001,
      select: {
        id: true,
        providerId: true,
        facilityId: true,
        facility: { select: { id: true, name: true } },
        blockType: true,
        startsAt: true,
        endsAt: true
      }
    }),
    prisma.appointment.findMany({
      where: {
        providerId: { in: providerIds },
        status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
        startsAt: { lt: new Date(end.getTime() + MAX_APPOINTMENT_BUFFER_MINUTES * 6e4) },
        endsAt: { gt: new Date(start.getTime() - MAX_APPOINTMENT_BUFFER_MINUTES * 6e4) }
      },
      take: 2001,
      select: {
        id: true,
        providerId: true,
        startsAt: true,
        endsAt: true,
        appointmentType: {
          select: { bufferBeforeMinutes: true, bufferAfterMinutes: true }
        }
      }
    }),
    prisma.integrationInstallation.findMany({
      where: { kind: "communications", status: "active", facilityId },
      take: 1001,
      select: { facilityId: true, allowedEventTypes: true }
    })
  ]);
  if (scheduleBlocks.length > 2e3 || appointmentCandidates.length > 2e3 || communicationInstallations.length > 1e3) {
    throw new Error("Public availability window is too broad");
  }
  const eligibleFollowUpInstallations = communicationInstallations.filter(
    (item) => Array.isArray(item.allowedEventTypes) && item.allowedEventTypes.includes("message.queued")
  );
  if (eligibleFollowUpInstallations.length > 1) {
    throw new Error("Public follow-up configuration is ambiguous for this facility");
  }
  const followUpMode = eligibleFollowUpInstallations.length === 1 ? "integration" : "manual";
  const now = /* @__PURE__ */ new Date();
  const slots = [];
  const seen = /* @__PURE__ */ new Set();
  for (const provider of providers) {
    const providerBlocks = scheduleBlocks.filter((block) => block.providerId === provider.id);
    const availableBlocks = providerBlocks.filter(
      (block) => block.blockType === "available" && block.facilityId === facilityId
    );
    const blockingBlocks = providerBlocks.filter(
      (block) => BLOCKING_SCHEDULE_TYPES.includes(block.blockType)
    );
    const providerAppointments = appointmentCandidates.filter((appointment) => appointment.providerId === provider.id);
    for (const block of availableBlocks) {
      const blockStart = new Date(Math.max(block.startsAt.getTime(), start.getTime()));
      const blockEnd = new Date(Math.min(block.endsAt.getTime(), end.getTime()));
      const firstSlotStart = new Date(Math.ceil(blockStart.getTime() / (15 * 6e4)) * 15 * 6e4);
      for (let cursor = firstSlotStart; cursor.getTime() + appointmentType.durationMinutes * 6e4 <= blockEnd.getTime(); cursor = new Date(cursor.getTime() + 15 * 6e4)) {
        const slotStart = new Date(cursor);
        if (slotStart <= now) continue;
        const slotEnd = new Date(slotStart.getTime() + appointmentType.durationMinutes * 6e4);
        const occupied = occupiedWindow(
          slotStart,
          slotEnd,
          appointmentType.bufferBeforeMinutes,
          appointmentType.bufferAfterMinutes
        );
        if (occupied.start < block.startsAt || occupied.end > block.endsAt) continue;
        const blockedBySchedule = blockingBlocks.some(
          (blocking) => rangesOverlap(occupied.start, occupied.end, blocking.startsAt, blocking.endsAt)
        );
        if (blockedBySchedule) continue;
        const blockedByAppointment = providerAppointments.some((appointment) => {
          const existing = occupiedWindow(
            appointment.startsAt,
            appointment.endsAt,
            Number(appointment.appointmentType?.bufferBeforeMinutes || 0),
            Number(appointment.appointmentType?.bufferAfterMinutes || 0)
          );
          return rangesOverlap(occupied.start, occupied.end, existing.start, existing.end);
        });
        if (blockedByAppointment) continue;
        const key2 = `${provider.id}:${block.facilityId}:${slotStart.toISOString()}`;
        if (seen.has(key2)) continue;
        seen.add(key2);
        slots.push({
          providerId: provider.id,
          providerName: providerDisplayName3(provider),
          facilityId: block.facility.id,
          facilityName: block.facility.name,
          facilityTimeZone: timeZone,
          followUpMode,
          appointmentTypeId: appointmentType.id,
          appointmentTypeName: appointmentType.name,
          startsAt: slotStart.toISOString(),
          endsAt: slotEnd.toISOString(),
          durationMinutes: appointmentType.durationMinutes,
          remainingCapacity: 1
        });
      }
    }
  }
  return slots.sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt)));
}
function getAvailableAppointmentSlots(_root, args, context) {
  const contextKey = context;
  let requestCache = availabilityCache.get(contextKey);
  if (!requestCache) {
    requestCache = /* @__PURE__ */ new Map();
    availabilityCache.set(contextKey, requestCache);
  }
  const key2 = `${args.appointmentTypeId}\0${args.providerId}\0${args.facilityId}\0${args.date}`;
  const existing = requestCache.get(key2);
  if (existing) return existing;
  const pending = loadAvailableAppointmentSlots(args, context);
  requestCache.set(key2, pending);
  void pending.catch(() => requestCache?.delete(key2));
  return pending;
}
var availabilityCache;
var init_getAvailableAppointmentSlots = __esm({
  "features/keystone/mutations/booking/getAvailableAppointmentSlots.ts"() {
    "use strict";
    init_schedulePolicy();
    availabilityCache = /* @__PURE__ */ new WeakMap();
  }
});

// features/keystone/security/intakeAccess.ts
function hashIntakeAccessToken(token) {
  return (0, import_node_crypto.createHash)("sha256").update(token, "utf8").digest("hex");
}
function intakeDeliverySecret(candidate = String(process.env.INTAKE_DELIVERY_SIGNING_KEY || process.env.SESSION_SECRET || "")) {
  if (candidate.length < 32) throw new Error("Intake delivery signing secret is not configured");
  return candidate;
}
function deliverableIntakeAccessToken(intakeFormId, expiresAt, secret) {
  if (!/^[A-Za-z0-9_-]{8,200}$/.test(intakeFormId) || Number.isNaN(expiresAt.getTime())) {
    throw new Error("Invalid intake delivery metadata");
  }
  const payload = Buffer.from(`${intakeFormId}:${Math.floor(expiresAt.getTime() / 1e3)}`, "utf8").toString("base64url");
  const signature = (0, import_node_crypto.createHmac)("sha256", intakeDeliverySecret(secret)).update(`intake-delivery-v1:${payload}`).digest("base64url");
  const token = `intake_v1_${payload}.${signature}`;
  return { token, tokenHash: hashIntakeAccessToken(token), expiresAt };
}
function createDeliverableIntakeAccessToken(intakeFormId, now = /* @__PURE__ */ new Date(), secret) {
  return deliverableIntakeAccessToken(intakeFormId, new Date(now.getTime() + ACCESS_TTL_MS), secret);
}
function verifyIntakeAccessToken(token, expectedDigest) {
  const actual = Buffer.from(hashIntakeAccessToken(token), "hex");
  const digestIsValid = Boolean(expectedDigest && SHA256_HEX_PATTERN.test(expectedDigest));
  const expected = Buffer.from(digestIsValid ? expectedDigest : DUMMY_DIGEST, "hex");
  const matches = (0, import_node_crypto.timingSafeEqual)(actual, expected);
  return digestIsValid && matches;
}
function isActiveIntakeAccess(token, access, now = /* @__PURE__ */ new Date()) {
  const matches = verifyIntakeAccessToken(token, access?.accessCodeHash);
  if (!access || !matches || access.accessUsedAt || access.accessRevokedAt || !access.accessExpiresAt) return false;
  const expiresAt = new Date(access.accessExpiresAt);
  return !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() > now.getTime();
}
var import_node_crypto, ACCESS_TTL_MS, SHA256_HEX_PATTERN, DUMMY_DIGEST;
var init_intakeAccess = __esm({
  "features/keystone/security/intakeAccess.ts"() {
    "use strict";
    import_node_crypto = require("node:crypto");
    ACCESS_TTL_MS = 7 * 24 * 60 * 60 * 1e3;
    SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/;
    DUMMY_DIGEST = (0, import_node_crypto.createHash)("sha256").update("invalid-intake-access").digest("hex");
  }
});

// features/keystone/security/graphqlSecurity.ts
async function consumeSharedRateLimit(prisma, namespace, identity, maximum = MAX_REQUESTS, now = /* @__PURE__ */ new Date(), windowSeconds = 60) {
  if (!Number.isInteger(maximum) || maximum < 1) throw new Error("Invalid rate-limit maximum");
  if (!Number.isInteger(windowSeconds) || windowSeconds < 1 || windowSeconds > 86400) throw new Error("Invalid rate-limit window");
  const id = (0, import_node_crypto2.createHash)("sha256").update(`${namespace}\0${identity}`).digest("hex");
  const staleBefore = new Date(now.getTime() - 24 * 60 * 6e4);
  const rows2 = await prisma.$queryRaw(import_client2.Prisma.sql`
    WITH pruned AS (
      DELETE FROM "RequestRateLimitBucket"
      WHERE "updatedAt" < ${staleBefore} AND left("id", 2) = left(${id}, 2)
    )
    INSERT INTO "RequestRateLimitBucket" ("id", "startedAt", "count", "updatedAt")
    VALUES (${id}, ${now}, 1, ${now})
    ON CONFLICT ("id") DO UPDATE SET
      "startedAt" = CASE
        WHEN "RequestRateLimitBucket"."startedAt" <= EXCLUDED."startedAt" - (${windowSeconds} * INTERVAL '1 second')
          THEN EXCLUDED."startedAt"
        ELSE "RequestRateLimitBucket"."startedAt"
      END,
      "count" = CASE
        WHEN "RequestRateLimitBucket"."startedAt" <= EXCLUDED."startedAt" - (${windowSeconds} * INTERVAL '1 second')
          THEN 1
        ELSE "RequestRateLimitBucket"."count" + 1
      END,
      "updatedAt" = EXCLUDED."updatedAt"
    RETURNING "count"
  `);
  return Number(rows2[0]?.count || maximum + 1) <= maximum;
}
function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && (0, import_node_crypto2.timingSafeEqual)(leftBuffer, rightBuffer);
}
function verifiedInternalIdentity(headers, socketAddress, secret, now) {
  const loopback = /^(?:127\.|::1$|::ffff:127\.)/.test(String(socketAddress || ""));
  if (!loopback || secret.length < 32) return null;
  const identity = String(headers["x-openfront-client-identity"] || "");
  const timestamp53 = String(headers["x-openfront-client-timestamp"] || "");
  const signature = String(headers["x-openfront-client-signature"] || "");
  if (!/^[a-f0-9]{64}$/.test(identity) || !/^\d{10}$/.test(timestamp53) || !/^[a-f0-9]{64}$/.test(signature)) return null;
  const age = Math.abs(now - Number(timestamp53) * 1e3);
  if (!Number.isFinite(age) || age > INTERNAL_IDENTITY_MAX_AGE_MS) return null;
  const expected = (0, import_node_crypto2.createHmac)("sha256", secret).update(`${timestamp53}:${identity}`).digest("hex");
  return safeEqual(signature, expected) ? `forwarded:${identity}` : null;
}
function requestIdentity(headers, socketAddress, secret = String(process.env.SESSION_SECRET || ""), now = Date.now()) {
  const internal = verifiedInternalIdentity(headers, socketAddress, secret, now);
  if (internal) return internal;
  if (process.env.RAILWAY_ENVIRONMENT) {
    const realIp = String(headers["x-real-ip"] || "").split(",")[0]?.trim();
    if (realIp) return realIp;
  } else if (process.env.TRUST_PROXY === "1") {
    const chain = String(headers["x-forwarded-for"] || "").split(",").map((value) => value.trim()).filter(Boolean);
    const configuredHops = Number(process.env.TRUST_PROXY_HOPS || 1);
    const hops = Number.isInteger(configuredHops) && configuredHops > 0 ? configuredHops : 1;
    const vouched = chain[chain.length - hops];
    if (vouched) return vouched;
    const realIp = String(headers["x-real-ip"] || "").split(",")[0]?.trim();
    if (realIp) return realIp;
  }
  return socketAddress || "unknown-local-client";
}
var import_node_crypto2, import_client2, import_graphql, MAX_REQUESTS, INTERNAL_IDENTITY_MAX_AGE_MS;
var init_graphqlSecurity = __esm({
  "features/keystone/security/graphqlSecurity.ts"() {
    "use strict";
    import_node_crypto2 = require("node:crypto");
    import_client2 = require("@prisma/client");
    import_graphql = require("graphql");
    MAX_REQUESTS = 120;
    INTERNAL_IDENTITY_MAX_AGE_MS = 9e4;
  }
});

// features/keystone/security/publicIntakeRateLimit.ts
async function enforcePublicIntakeRateLimit(context, accessCode, operation) {
  const production = process.env.NODE_ENV === "production";
  const request = context.req;
  const networkIdentity = requestIdentity(request?.headers || {}, request?.socket?.remoteAddress);
  const capabilityIdentity = (0, import_node_crypto3.createHash)("sha256").update(String(accessCode || "")).digest("hex");
  const now = /* @__PURE__ */ new Date();
  const prisma = context.sudo().prisma;
  const globalAllowed = await consumeSharedRateLimit(
    prisma,
    `public-intake-${operation}-global`,
    "all-capabilities",
    production ? operation === "submit" ? 200 : 600 : 2e3,
    now,
    60
  );
  if (!globalAllowed) throw new Error("Intake access is invalid or no longer active");
  const networkAllowed = await consumeSharedRateLimit(
    prisma,
    `public-intake-${operation}-network`,
    networkIdentity,
    production ? operation === "submit" ? 20 : 60 : 500,
    now,
    60
  );
  if (!networkAllowed) throw new Error("Intake access is invalid or no longer active");
  const capabilityAllowed = await consumeSharedRateLimit(
    prisma,
    `public-intake-${operation}-capability`,
    capabilityIdentity,
    production ? operation === "submit" ? 5 : 15 : 100,
    now,
    15 * 60
  );
  if (!capabilityAllowed) throw new Error("Intake access is invalid or no longer active");
}
var import_node_crypto3;
var init_publicIntakeRateLimit = __esm({
  "features/keystone/security/publicIntakeRateLimit.ts"() {
    "use strict";
    import_node_crypto3 = require("node:crypto");
    init_graphqlSecurity();
  }
});

// features/keystone/mutations/intake/getIntakeFormByAccessCode.ts
function patientDisplayName(patient) {
  if (!patient) return null;
  return `${patient.firstName || ""} ${patient.lastName || ""}`.trim();
}
function providerDisplayName4(provider) {
  if (!provider) return null;
  const credentials = provider.credentials ? `, ${provider.credentials}` : "";
  return `${provider.firstName || ""} ${provider.lastName || ""}${credentials}`.trim();
}
function serializePatientIntakeForm(form, accessCode = null) {
  if (!form) return null;
  return {
    id: form.id,
    title: form.title,
    status: form.status,
    templateKey: form.templateKey,
    formSchema: form.formSchema,
    submittedAt: form.submittedAt,
    accessCode,
    patient: form.patient ? {
      id: form.patient.id,
      displayName: patientDisplayName(form.patient),
      email: form.patient.email,
      phone: form.patient.phone,
      dateOfBirth: form.patient.dateOfBirth,
      preferredContactMethod: form.patient.preferredContactMethod,
      insuranceSummary: form.patient.insuranceSummary
    } : null,
    appointment: form.appointment ? {
      id: form.appointment.id,
      appointmentNumber: form.appointment.appointmentNumber,
      status: form.appointment.status,
      startsAt: form.appointment.startsAt,
      endsAt: form.appointment.endsAt,
      reasonForVisit: form.appointment.reasonForVisit,
      facilityName: form.appointment.facility?.name || null,
      facilityTimeZone: form.appointment.facility?.timeZone || "UTC",
      provider: form.appointment.provider ? {
        id: form.appointment.provider.id,
        displayName: providerDisplayName4(form.appointment.provider),
        specialty: form.appointment.provider.specialty
      } : null,
      appointmentType: form.appointment.appointmentType ? {
        id: form.appointment.appointmentType.id,
        name: form.appointment.appointmentType.name,
        durationMinutes: form.appointment.appointmentType.durationMinutes
      } : null
    } : null
  };
}
async function getIntakeFormByAccessCode(root, { accessCode }, context) {
  if (!accessCode || accessCode.length < 16 || accessCode.length > 128) return null;
  await enforcePublicIntakeRateLimit(context, accessCode, "lookup");
  const prisma = context.sudo().prisma;
  const form = await prisma.intakeForm.findUnique({
    where: { accessCodeHash: hashIntakeAccessToken(accessCode) },
    include: {
      patient: true,
      appointment: {
        include: {
          provider: true,
          appointmentType: true,
          facility: { select: { name: true, timeZone: true } }
        }
      }
    }
  });
  if (!isActiveIntakeAccess(accessCode, form)) return null;
  await prisma.clinicalAuditLog.create({
    data: {
      eventType: "intake.viewed",
      occurredAt: /* @__PURE__ */ new Date(),
      actorType: "patient_self_service",
      actorReference: "",
      facilityId: form.facilityId,
      patientId: form.patientId,
      appointmentId: form.appointmentId,
      intakeFormId: form.id,
      metadata: { source: "one_time_intake_access", accessState: "active" },
      createdAt: /* @__PURE__ */ new Date()
    }
  });
  return serializePatientIntakeForm(form, accessCode);
}
var init_getIntakeFormByAccessCode = __esm({
  "features/keystone/mutations/intake/getIntakeFormByAccessCode.ts"() {
    "use strict";
    init_intakeAccess();
    init_publicIntakeRateLimit();
  }
});

// features/keystone/mutations/workflowEvidence.ts
function requireConsent(consent, expected) {
  if (!consent?.accepted) throw new Error("Consent acknowledgement is required");
  if (consent.policyVersion !== expected.policyVersion || consent.statementKey !== expected.statementKey) {
    throw new Error("Consent acknowledgement does not match the current policy");
  }
}
var BOOKING_CONSENT, INTAKE_CONSENT;
var init_workflowEvidence = __esm({
  "features/keystone/mutations/workflowEvidence.ts"() {
    "use strict";
    BOOKING_CONSENT = {
      consentType: "appointment_request",
      policyVersion: "2026-07-10",
      statementKey: "hospital_appointment_request_acknowledgement_v1"
    };
    INTAKE_CONSENT = {
      consentType: "intake_submission",
      policyVersion: "2026-07-10",
      statementKey: "hospital_intake_accuracy_and_contact_consent_v1"
    };
  }
});

// features/keystone/mutations/operational/evidence.ts
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key2, nested]) => `${JSON.stringify(key2)}:${canonical(nested)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
function hash(value) {
  return (0, import_node_crypto4.createHash)("sha256").update(value).digest("hex");
}
function operationEvidence(input) {
  const operationKey = String(input.operationKey ?? "").trim();
  if (!KEY_PATTERN.test(operationKey)) throw new Error("Operation key is invalid");
  const { operationKey: _operationKey, ...payload } = input;
  return { operationKeyHash: hash(operationKey), requestHash: hash(canonical(payload)) };
}
function bounded2(value, label, max, required = false) {
  const text63 = String(value ?? "").trim();
  if (required && !text63 || text63.length > max || /[\u0000-\u001f\u007f]/.test(text63)) {
    throw new Error(`${label} is invalid`);
  }
  return text63;
}
function requireSafeCents(value, label, allowZero = false) {
  if (!Number.isSafeInteger(value) || Number(value) < (allowZero ? 0 : 1)) {
    throw new Error(`${label} must be ${allowZero ? "non-negative" : "positive"} integer cents`);
  }
  return Number(value);
}
async function lockOperation(tx, namespace, operationKeyHash) {
  await tx.$queryRaw(
    import_client3.Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${namespace}:${operationKeyHash}`}, 0))::text AS "lock"`
  );
}
async function scopedFacilityPatient(context, facilityId, patientId) {
  const [facility, patient] = await Promise.all([
    context.query.Facility.findOne({ where: { id: facilityId }, query: "id status" }),
    context.query.Patient.findOne({ where: { id: patientId }, query: "id status facilities { id }" })
  ]);
  if (!facility || facility.status !== "active" || patient?.status !== "active" || !patient?.facilities?.some((item) => item.id === facilityId)) {
    throw new Error("Facility or patient not found or not accessible");
  }
  return { facility, patient };
}
async function appendAuditAndOutbox(tx, input) {
  const occurredAt = input.occurredAt || /* @__PURE__ */ new Date();
  if (JSON.stringify(input.metadata).length > 8e3) throw new Error("Event metadata is too large");
  const audit = await tx.clinicalAuditLog.create({
    data: {
      eventType: input.eventType,
      occurredAt,
      actorType: "staff_user",
      actorReference: input.actorReference,
      facilityId: input.facilityId,
      patientId: input.patientId || null,
      metadata: input.metadata,
      createdAt: occurredAt
    }
  });
  const deliveryMode = input.deliveryMode || "internal";
  if (deliveryMode === "external" && (!input.installationId || !Number.isInteger(input.installationVersion) || Number(input.installationVersion) < 1)) {
    throw new Error("External delivery requires a current integration generation");
  }
  const outbox = await tx.clinicalOutboxEvent.create({
    data: {
      eventKey: input.eventKey,
      eventType: input.eventType,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      contractVersion: input.contractVersion || "hospital.event.v1",
      deliveryMode,
      installationId: input.installationId || null,
      installationVersion: input.installationVersion || null,
      status: deliveryMode === "external" ? "pending" : "recorded",
      attempts: 0,
      nextAttemptAt: deliveryMode === "external" ? occurredAt : null,
      facilityId: input.facilityId,
      patientId: input.patientId || null,
      payload: input.metadata,
      createdAt: occurredAt
    }
  });
  return { audit, outbox };
}
var import_node_crypto4, import_client3, KEY_PATTERN;
var init_evidence = __esm({
  "features/keystone/mutations/operational/evidence.ts"() {
    "use strict";
    import_node_crypto4 = require("node:crypto");
    import_client3 = require("@prisma/client");
    KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,199}$/;
  }
});

// features/keystone/mutations/booking/requestAppointment.ts
function makeAppointmentNumber() {
  const datePart = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10).replace(/-/g, "");
  const randomPart = (0, import_node_crypto5.randomUUID)().replaceAll("-", "").slice(0, 7).toUpperCase();
  return `APT-${datePart}-${randomPart}`;
}
function dateOnlyFromIso(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error("dateOfBirth must be a valid date");
  if (parsed.getTime() > Date.now()) throw new Error("dateOfBirth cannot be in the future");
  return parsed.toISOString();
}
function cleanOptional(value, maxLength = 500) {
  const cleaned = value?.trim();
  if (!cleaned) return null;
  if (cleaned.length > maxLength) throw new Error(`Input exceeds the ${maxLength} character limit`);
  return cleaned;
}
function validatePatientInput(patient) {
  const firstName = cleanOptional(patient.firstName, 100);
  const lastName = cleanOptional(patient.lastName, 100);
  if (!firstName || !lastName) throw new Error("Patient first and last name are required");
  const email = cleanOptional(patient.email, 254)?.toLowerCase() || null;
  const phone = cleanOptional(patient.phone, 40);
  if (!email && !phone) throw new Error("Email or phone is required for appointment follow-up");
  if (email && !/^\S+@\S+\.\S+$/.test(email)) throw new Error("Email must be valid");
  if (phone) {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 7 || digits.length > 15) throw new Error("Phone must contain 7 to 15 digits");
  }
  return { firstName, lastName, email, phone };
}
function bookingContactIdentities(patient) {
  const secret = String(process.env.AUTH_RATE_LIMIT_PEPPER || (process.env.NODE_ENV !== "production" ? process.env.SESSION_SECRET : "") || "");
  if (secret.length < 48) throw new Error("Public booking rate-limit pepper is not configured");
  const identities = [];
  if (patient.email) {
    identities.push((0, import_node_crypto5.createHmac)("sha256", secret).update(`public-booking-email:${patient.email}`).digest("hex"));
  }
  if (patient.phone) {
    identities.push((0, import_node_crypto5.createHmac)("sha256", secret).update(`public-booking-phone:${patient.phone.replace(/\D/g, "")}`).digest("hex"));
  }
  return identities;
}
function serializeAppointmentRequestResult(appointment) {
  if (!appointment) return null;
  return {
    id: appointment.id,
    appointmentNumber: appointment.appointmentNumber,
    status: appointment.status,
    startsAt: appointment.startsAt,
    endsAt: appointment.endsAt,
    patient: appointment.patient ? {
      id: appointment.patient.id,
      displayName: patientDisplayName(appointment.patient)
    } : null,
    provider: appointment.provider ? {
      id: appointment.provider.id,
      displayName: providerDisplayName4(appointment.provider),
      specialty: appointment.provider.specialty
    } : null,
    appointmentType: appointment.appointmentType ? {
      id: appointment.appointmentType.id,
      name: appointment.appointmentType.name,
      durationMinutes: appointment.appointmentType.durationMinutes
    } : null,
    intakeForms: appointment.intakeForms || []
  };
}
async function requestAppointment(_root, args, context) {
  const request = context.req;
  const identity = requestIdentity(request?.headers || {}, request?.socket?.remoteAddress);
  requireConsent(args.consent, BOOKING_CONSENT);
  const patientInput = validatePatientInput(args.patient);
  const reasonForVisit = cleanOptional(args.reasonForVisit, 2e3);
  const preferredContactMethod = args.preferredContactMethod === "email" ? "email" : args.preferredContactMethod === "phone" ? "phone" : "sms";
  if (preferredContactMethod === "email" && !patientInput.email) throw new Error("Email is required for email follow-up");
  if (preferredContactMethod !== "email" && !patientInput.phone) throw new Error("Phone is required for phone or SMS follow-up");
  const slotDate = new Date(args.startsAt);
  if (Number.isNaN(slotDate.getTime())) throw new Error("startsAt must be a valid ISO date");
  if (slotDate.getTime() <= Date.now()) throw new Error("Appointment requests must use a future slot");
  const prisma = context.sudo().prisma;
  const facilityConfiguration = await prisma.facility.findFirst({
    where: { id: args.facilityId, status: "active" },
    select: { id: true, timeZone: true }
  });
  if (!facilityConfiguration) throw new Error("The selected facility is not available");
  const facilityDate = calendarDateInTimeZone(slotDate, facilityConfiguration.timeZone);
  parsePublicDateWindow(facilityDate, facilityConfiguration.timeZone);
  if (slotDate.getUTCMinutes() % 15 !== 0 || slotDate.getUTCSeconds() !== 0 || slotDate.getUTCMilliseconds() !== 0) {
    throw new Error("That appointment slot is no longer available");
  }
  const production = process.env.NODE_ENV === "production";
  const now = /* @__PURE__ */ new Date();
  const contactIdentities = bookingContactIdentities(patientInput);
  const slotIdentity = `${args.facilityId}:${args.providerId}:${args.appointmentTypeId}:${slotDate.toISOString()}`;
  const rejectRate = () => {
    throw new Error("Too many appointment requests; please try again later");
  };
  if (!await consumeSharedRateLimit(prisma, "public-booking-global", "all-requests", production ? 100 : 2e3, now, 60)) rejectRate();
  if (!await consumeSharedRateLimit(prisma, "public-booking-network", identity, production ? 5 : 100, now, 60)) rejectRate();
  if (!await consumeSharedRateLimit(prisma, "public-booking-facility", args.facilityId, production ? 30 : 500, now, 60)) rejectRate();
  if (!await consumeSharedRateLimit(prisma, "public-booking-slot", slotIdentity, production ? 10 : 200, now, 15 * 60)) rejectRate();
  for (const contactIdentity of contactIdentities) {
    if (!await consumeSharedRateLimit(prisma, "public-booking-contact", contactIdentity, production ? 2 : 100, now, 60 * 60)) rejectRate();
  }
  const listedSlots = await getAvailableAppointmentSlots(
    _root,
    {
      appointmentTypeId: args.appointmentTypeId,
      providerId: args.providerId,
      facilityId: args.facilityId,
      date: facilityDate
    },
    context
  );
  if (!listedSlots.some(
    (slot) => slot.providerId === args.providerId && slot.facilityId === args.facilityId && slot.startsAt === slotDate.toISOString()
  )) {
    throw new Error("That appointment slot is no longer available");
  }
  const sudo = context.sudo();
  const bookingLockKey = `request:${(0, import_node_crypto5.randomUUID)()}`;
  const intakeFormId = (0, import_node_crypto5.randomUUID)();
  const intakeAccess = createDeliverableIntakeAccessToken(intakeFormId);
  try {
    const appointmentId = await sudo.prisma.$transaction(async (tx) => {
      await lockProviderSchedule(tx, args.providerId);
      const requestedSlot = await inspectBookableSlot(tx, {
        appointmentTypeId: args.appointmentTypeId,
        providerId: args.providerId,
        facilityId: args.facilityId,
        startsAt: slotDate
      });
      if (requestedSlot.availability.hasConflict) {
        throw new Error("That appointment slot was just taken. Please choose another time.");
      }
      const facility = requestedSlot.facility;
      const communicationInstallations = await tx.integrationInstallation.findMany({
        where: { facilityId: facility.id, kind: "communications", status: "active" },
        orderBy: { createdAt: "asc" },
        take: 101,
        select: { id: true, transitionVersion: true, allowedEventTypes: true }
      });
      const eligibleCommunicationInstallations = communicationInstallations.filter(
        (item) => Array.isArray(item.allowedEventTypes) && item.allowedEventTypes.includes("message.queued")
      );
      if (communicationInstallations.length > 100 || eligibleCommunicationInstallations.length > 1) {
        throw new Error("Online appointment follow-up configuration is ambiguous");
      }
      const communicationInstallation = eligibleCommunicationInstallations[0] || null;
      const followUpMode = communicationInstallation ? "integration" : "manual";
      const outstandingRequests = await tx.appointment.count({
        where: { facilityId: facility.id, source: "patient_portal", status: "requested" }
      });
      if (outstandingRequests >= 500) throw new Error("Online appointment requests are temporarily unavailable");
      const patient = await tx.patient.create({
        data: {
          firstName: patientInput.firstName,
          lastName: patientInput.lastName,
          email: patientInput.email || "",
          phone: patientInput.phone || "",
          dateOfBirth: dateOnlyFromIso(args.patient.dateOfBirth),
          preferredContactMethod,
          status: "active",
          facilities: { connect: { id: facility.id } }
        }
      });
      const appointment2 = await tx.appointment.create({
        data: {
          appointmentNumber: makeAppointmentNumber(),
          status: "requested",
          source: "patient_portal",
          bookingLockKey,
          startsAt: requestedSlot.startsAt,
          endsAt: requestedSlot.endsAt,
          locationName: facility.name,
          reasonForVisit: reasonForVisit || "",
          patientId: patient.id,
          providerId: args.providerId,
          facilityId: facility.id,
          appointmentTypeId: args.appointmentTypeId
        }
      });
      const intakeForm = await tx.intakeForm.create({
        data: {
          id: intakeFormId,
          operationKeyHash: hash(`booking-intake:${appointment2.id}`),
          requestHash: hash(`booking-intake-payload:${appointment2.id}:pre_visit`),
          title: "Pre-visit intake",
          status: "not_sent",
          templateKey: "pre_visit",
          accessCodeHash: intakeAccess.tokenHash,
          accessExpiresAt: intakeAccess.expiresAt,
          facilityId: facility.id,
          patientId: patient.id,
          appointmentId: appointment2.id,
          formSchema: {
            sections: [
              { key: "contact", label: "Contact and demographics" },
              { key: "visit_reason", label: "Reason for visit" },
              { key: "insurance", label: "Insurance and payment" }
            ]
          }
        }
      });
      const message = await tx.patientMessage.create({
        data: {
          operationKeyHash: hash(`booking-message:${appointment2.id}`),
          requestHash: hash(`booking-message-payload:${appointment2.id}:${preferredContactMethod}`),
          transitionVersion: 1,
          purpose: "care_operations",
          facilityId: facility.id,
          patientId: patient.id,
          appointmentId: appointment2.id,
          installationId: communicationInstallation?.id || null,
          direction: "outbound",
          channel: preferredContactMethod === "email" ? "email" : preferredContactMethod === "phone" ? "phone" : "sms",
          status: communicationInstallation ? "queued" : "manual_required",
          subject: "Appointment request follow-up",
          body: `Appointment request ${appointment2.appointmentNumber} needs confirmation and intake follow-up for ${new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: facilityConfiguration.timeZone }).format(appointment2.startsAt)}. ${communicationInstallation ? "Complete intake: {{intake_link}}" : "Contact the patient through the selected channel; no external message was sent."}`,
          metadata: { source: "public_booking", intakeFormId: intakeForm.id, followUpMode }
        }
      });
      const consent = await tx.patientConsent.create({
        data: {
          ...BOOKING_CONSENT,
          decision: "granted",
          effectiveAt: /* @__PURE__ */ new Date(),
          grantedAt: /* @__PURE__ */ new Date(),
          captureMethod: "public_web",
          facilityId: facility.id,
          patientId: patient.id,
          appointmentId: appointment2.id,
          intakeFormId: intakeForm.id,
          evidence: { accepted: true, source: "appointment_request_form" }
        }
      });
      await tx.clinicalAuditLog.create({
        data: {
          eventType: "appointment.requested",
          occurredAt: /* @__PURE__ */ new Date(),
          actorType: "patient_self_service",
          facilityId: facility.id,
          patientId: patient.id,
          appointmentId: appointment2.id,
          intakeFormId: intakeForm.id,
          consentId: consent.id,
          metadata: {
            source: "public_booking",
            appointmentStatus: "requested",
            intakeStatus: "not_sent",
            contactChannel: preferredContactMethod,
            followUpMode
          }
        }
      });
      await tx.clinicalOutboxEvent.create({
        data: {
          eventKey: `patient_message:${message.id}:v1:${message.status}`,
          eventType: communicationInstallation ? "message.queued" : "message.manual_required",
          aggregateType: "patient_message",
          aggregateId: message.id,
          contractVersion: communicationInstallation ? "hospital.webhook.v1" : "hospital.event.v1",
          deliveryMode: communicationInstallation ? "external" : "internal",
          installationId: communicationInstallation?.id || null,
          installationVersion: communicationInstallation?.transitionVersion || null,
          status: communicationInstallation ? "pending" : "recorded",
          attempts: 0,
          nextAttemptAt: communicationInstallation ? /* @__PURE__ */ new Date() : null,
          facilityId: facility.id,
          patientId: patient.id,
          appointmentId: appointment2.id,
          payload: {
            source: "public_booking",
            aggregateId: message.id,
            channel: message.channel,
            purpose: message.purpose,
            status: message.status,
            followUpMode,
            transitionVersion: 1,
            intakeFormId: intakeForm.id
          },
          createdAt: /* @__PURE__ */ new Date()
        }
      });
      return appointment2.id;
    }, { isolationLevel: "ReadCommitted" });
    const appointment = await sudo.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        patient: true,
        provider: true,
        appointmentType: true,
        intakeForms: { select: { id: true, status: true } }
      }
    });
    const appointmentWithAccess = appointment ? {
      ...appointment,
      intakeForms: appointment.intakeForms.map((form, index) => ({
        ...form,
        accessCode: index === 0 ? intakeAccess.token : null
      }))
    } : null;
    return serializeAppointmentRequestResult(appointmentWithAccess);
  } catch (error) {
    if (isScheduleRaceError(error)) throw new Error("That appointment slot was just taken. Please choose another time.");
    throw error;
  }
}
var import_node_crypto5;
var init_requestAppointment = __esm({
  "features/keystone/mutations/booking/requestAppointment.ts"() {
    "use strict";
    import_node_crypto5 = require("node:crypto");
    init_intakeAccess();
    init_getIntakeFormByAccessCode();
    init_workflowEvidence();
    init_schedulePolicy();
    init_getAvailableAppointmentSlots();
    init_evidence();
    init_graphqlSecurity();
    init_facilityTime();
  }
});

// features/keystone/mutations/updateActiveUser.ts
async function updateActiveUser(root, { data }, context) {
  if (!context.session?.itemId) {
    throw new Error("You must be signed in to update your profile");
  }
  const updateData = {};
  if (typeof data.email === "string" && data.email.trim()) updateData.email = data.email.trim();
  if (typeof data.name === "string" && data.name.trim()) updateData.name = data.name.trim();
  if (typeof data.password === "string" && data.password) updateData.password = data.password;
  if (typeof data.onboardingStatus === "string") {
    if (!context.session.data.role?.canManageOnboarding) {
      throw new Error("Not authorized to update onboarding status");
    }
    if (!["not_started", "in_progress", "completed", "dismissed"].includes(data.onboardingStatus)) {
      throw new Error("Invalid onboarding status");
    }
    updateData.onboardingStatus = data.onboardingStatus;
  }
  return context.db.User.updateOne({
    where: { id: context.session.itemId },
    data: updateData
  });
}
var init_updateActiveUser = __esm({
  "features/keystone/mutations/updateActiveUser.ts"() {
    "use strict";
  }
});

// features/keystone/mutations/intake/submitIntakeForm.ts
function validateResponses(responses) {
  if (!responses || typeof responses !== "object" || Array.isArray(responses)) {
    throw new Error("Intake responses must be an object");
  }
  if (JSON.stringify(responses).length > 5e4) throw new Error("Intake responses exceed the size limit");
}
function cleanOptional2(value, maxLength = 500) {
  const cleaned = value?.trim();
  if (!cleaned) return null;
  if (cleaned.length > maxLength) throw new Error(`Input exceeds the ${maxLength} character limit`);
  return cleaned;
}
async function submitIntakeForm(root, { accessCode, responses, patientUpdates, consent: consentInput }, context) {
  if (!accessCode || accessCode.length < 16 || accessCode.length > 128) throw new Error("Invalid intake access code");
  await enforcePublicIntakeRateLimit(context, accessCode, "submit");
  requireConsent(consentInput, INTAKE_CONSENT);
  validateResponses(responses);
  const email = cleanOptional2(patientUpdates?.email, 254)?.toLowerCase() || null;
  if (email && !/^\S+@\S+\.\S+$/.test(email)) throw new Error("Email must be valid");
  const phone = cleanOptional2(patientUpdates?.phone, 40);
  const preferredContactMethod = patientUpdates?.preferredContactMethod;
  if (preferredContactMethod && !["sms", "email", "phone"].includes(preferredContactMethod)) {
    throw new Error("Preferred contact method is invalid");
  }
  const insuranceSummary = patientUpdates?.insuranceSummary;
  if (insuranceSummary != null && (typeof insuranceSummary !== "object" || Array.isArray(insuranceSummary) || JSON.stringify(insuranceSummary).length > 2e4)) {
    throw new Error("Insurance summary must be a bounded object");
  }
  const sudo = context.sudo();
  const accessCodeHash = hashIntakeAccessToken(accessCode);
  const existing = await sudo.prisma.intakeForm.findUnique({
    where: { accessCodeHash },
    include: { patient: true, appointment: true }
  });
  const accessIsActive = isActiveIntakeAccess(accessCode, existing);
  if (!existing || !accessIsActive) throw new Error("Intake access is invalid or no longer active");
  if (existing.status === "reviewed" || existing.status === "submitted") {
    throw new Error("Intake access is invalid or no longer active");
  }
  if (!existing.patient?.id || !existing.appointment?.id) throw new Error("Intake form is missing its patient or appointment");
  const patientId = existing.patient.id;
  const appointmentId = existing.appointment.id;
  const intakeFormId = existing.id;
  const facilityId = existing.appointment.facilityId;
  if (!facilityId || existing.facilityId !== facilityId) throw new Error("Intake form facility scope is invalid");
  const submittedAt = /* @__PURE__ */ new Date();
  await sudo.prisma.$transaction(async (tx) => {
    const claimedAccess = await tx.intakeForm.updateMany({
      where: {
        id: intakeFormId,
        accessCodeHash,
        accessExpiresAt: { gt: submittedAt },
        accessUsedAt: null,
        accessRevokedAt: null,
        status: { notIn: ["submitted", "reviewed"] }
      },
      data: {
        status: "submitted",
        responses,
        submittedAt,
        accessUsedAt: submittedAt
      }
    });
    if (claimedAccess.count !== 1) throw new Error("Intake access is invalid or no longer active");
    const patientData = {};
    if (email) patientData.email = email;
    if (phone) patientData.phone = phone;
    if (preferredContactMethod) patientData.preferredContactMethod = preferredContactMethod;
    if (insuranceSummary != null) patientData.insuranceSummary = insuranceSummary;
    if (Object.keys(patientData).length) {
      await tx.patient.update({ where: { id: patientId }, data: patientData });
    }
    const consent = await tx.patientConsent.create({
      data: {
        ...INTAKE_CONSENT,
        decision: "granted",
        effectiveAt: /* @__PURE__ */ new Date(),
        grantedAt: /* @__PURE__ */ new Date(),
        captureMethod: "access_code_web",
        facilityId,
        patientId,
        appointmentId,
        intakeFormId,
        evidence: { accepted: true, source: "intake_submission_form" }
      }
    });
    await tx.clinicalAuditLog.create({
      data: {
        eventType: "intake.submitted",
        occurredAt: /* @__PURE__ */ new Date(),
        actorType: "patient_access_code",
        facilityId,
        patientId,
        appointmentId,
        intakeFormId,
        consentId: consent.id,
        metadata: {
          source: "public_intake",
          intakeStatus: "submitted",
          contactUpdated: Boolean(Object.keys(patientData).length)
        }
      }
    });
  }, { isolationLevel: "Serializable" });
  const submitted = await sudo.prisma.intakeForm.findUnique({
    where: { id: intakeFormId },
    include: {
      patient: true,
      appointment: { include: { provider: true, appointmentType: true } }
    }
  });
  return serializePatientIntakeForm(submitted);
}
var init_submitIntakeForm = __esm({
  "features/keystone/mutations/intake/submitIntakeForm.ts"() {
    "use strict";
    init_intakeAccess();
    init_publicIntakeRateLimit();
    init_workflowEvidence();
    init_getIntakeFormByAccessCode();
  }
});

// features/keystone/mutations/scheduling/appointmentScheduleConflicts.ts
function canInspectSchedule(context) {
  const role = context.session?.data.role;
  return Boolean(role?.canManageScheduling || role?.canManageAppointments);
}
function requireSchedulePermission(context) {
  if (!canInspectSchedule(context)) throw new Error("Not authorized to inspect schedule conflicts");
}
async function findScheduleConflicts(args, context) {
  const { start, end } = parseScheduleWindow(args.startsAt, args.endsAt);
  const scopedProvider = await context.query.Provider.findOne({
    where: { id: args.providerId },
    query: "id facilities { id }"
  });
  if (!scopedProvider?.facilities?.some((facility) => facility.id === args.facilityId)) {
    throw new Error("Provider and facility not found or not accessible");
  }
  const [availability, accessibleAppointments] = await Promise.all([
    inspectProviderWindow(context.sudo().prisma, {
      providerId: args.providerId,
      facilityId: args.facilityId,
      startsAt: start,
      endsAt: end,
      excludeAppointmentId: args.excludeAppointmentId
    }),
    context.query.Appointment.findMany({
      where: {
        provider: { id: { equals: args.providerId } },
        facility: { id: { equals: args.facilityId } },
        id: args.excludeAppointmentId ? { not: { equals: args.excludeAppointmentId } } : void 0,
        startsAt: { lt: new Date(end.getTime() + MAX_APPOINTMENT_BUFFER_MINUTES * 6e4).toISOString() },
        endsAt: { gt: new Date(start.getTime() - MAX_APPOINTMENT_BUFFER_MINUTES * 6e4).toISOString() }
      },
      query: "id"
    })
  ]);
  const accessibleIds = new Set(accessibleAppointments.map((appointment) => appointment.id));
  return {
    withinAvailability: availability.withinAvailability,
    hasConflict: availability.hasConflict,
    conflicts: [
      ...availability.appointments.map((appointment, index) => {
        const accessible = accessibleIds.has(appointment.id);
        return {
          source: "appointment",
          id: accessible ? appointment.id : `private-appointment-${index + 1}`,
          reference: accessible ? appointment.appointmentNumber : "busy",
          status: accessible ? appointment.status : "busy",
          startsAt: appointment.startsAt,
          endsAt: appointment.endsAt
        };
      }),
      ...availability.blockingScheduleBlocks.map((block) => ({
        source: "schedule_block",
        id: block.id,
        reference: block.blockType,
        status: block.blockType,
        startsAt: block.startsAt,
        endsAt: block.endsAt
      }))
    ]
  };
}
function appointmentScheduleConflicts(_root, args, context) {
  requireSchedulePermission(context);
  const contextKey = context;
  let requestCache = conflictCache.get(contextKey);
  if (!requestCache) {
    requestCache = /* @__PURE__ */ new Map();
    conflictCache.set(contextKey, requestCache);
  }
  const key2 = `${args.facilityId}\0${args.providerId}\0${args.startsAt}\0${args.endsAt}\0${args.excludeAppointmentId || ""}`;
  const existing = requestCache.get(key2);
  if (existing) return existing;
  const pending = findScheduleConflicts(args, context);
  requestCache.set(key2, pending);
  void pending.catch(() => requestCache?.delete(key2));
  return pending;
}
var conflictCache;
var init_appointmentScheduleConflicts = __esm({
  "features/keystone/mutations/scheduling/appointmentScheduleConflicts.ts"() {
    "use strict";
    init_schedulePolicy();
    conflictCache = /* @__PURE__ */ new WeakMap();
  }
});

// features/keystone/mutations/clinical/episodePolicy.ts
function validateEpisodePolicy(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Explicit episode policy options are required");
  const definition = value;
  if (Object.keys(definition).length !== Object.keys(episodePolicyOptions).length) throw new Error("Episode policy must contain exactly the reviewed options");
  for (const [key2, options] of Object.entries(episodePolicyOptions)) {
    if (!options.includes(definition[key2])) throw new Error(`Explicit ${key2} policy is required`);
  }
  return { ...definition };
}
function episodeEligibility(input) {
  const closed = ["closed", "cancelled"].includes(input.status) || input.discharged === true;
  if (!closed) return { allowed: true, code: "active_episode_existing_authority_required" };
  if (input.action === "retention_evidence") return { allowed: false, code: "separate_retention_hold_authority_required" };
  if (input.action === "new_care") return { allowed: false, code: "new_encounter_required" };
  if (!input.policy) return { allowed: false, code: "policy_unavailable" };
  if (!input.receiptPresent && input.policy.legacyEpisodes !== "reviewed_late_only") return { allowed: false, code: "legacy_episode_review_required" };
  if (input.action === "cancel_evidence") return { allowed: true, code: "record_only_no_cascade_or_physical_disposition" };
  if (input.action === "late_result") return { allowed: input.policy.lateResults === "allow_existing_order", code: "late_result_existing_order_policy" };
  if (input.action === "correction") return {
    allowed: input.policy.resultCorrections === "allow_recorded_human_review" && input.humanReviewed === true,
    code: "correction_requires_recorded_human_review"
  };
  return { allowed: input.policy.claims === "allow_reconciliation", code: "claim_reconciliation_policy" };
}
function episodeDigest(value) {
  const canonical5 = (item) => Array.isArray(item) ? `[${item.map(canonical5).join(",")}]` : item && typeof item === "object" ? `{${Object.keys(item).sort().map((key2) => `${JSON.stringify(key2)}:${canonical5(item[key2])}`).join(",")}}` : JSON.stringify(item);
  return (0, import_node_crypto6.createHash)("sha256").update(canonical5(value)).digest("hex");
}
function episodeTuple(row) {
  return {
    encounterId: row.id,
    facilityId: row.facility?.id,
    patientId: row.patient?.id,
    providerId: row.provider?.id,
    appointmentId: row.appointment?.id || null
  };
}
function assertEpisodeTuple(expected, current) {
  if (episodeDigest(expected) !== episodeDigest(current)) throw new Error("Episode scope changed; original command cannot be applied or recovered");
}
function requireHumanEpisodeReview(attested, reference) {
  if (attested !== true || typeof reference !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{2,199}$/.test(reference)) {
    throw new Error("Explicit human review and a non-PHI approval reference are required");
  }
  return reference;
}
var import_node_crypto6, episodePolicyOptions;
var init_episodePolicy = __esm({
  "features/keystone/mutations/clinical/episodePolicy.ts"() {
    "use strict";
    import_node_crypto6 = require("node:crypto");
    episodePolicyOptions = {
      operationalClosure: ["enabled", "blocked_pending_review"],
      legacyEpisodes: ["reviewed_late_only", "block_pending_review"],
      newCare: ["new_encounter_required"],
      lateResults: ["allow_existing_order", "block_pending_review"],
      resultCorrections: ["allow_recorded_human_review", "block_pending_review"],
      claims: ["allow_reconciliation", "block_pending_review"],
      retention: ["unchanged_separate_retention_policy"],
      admission: ["separate_admission_discharge_workflow"]
    };
  }
});

// features/keystone/mutations/clinical/episodeFence.ts
async function currentEpisodeActor(context, permission = "clinical") {
  const session = context.session;
  if (session?.listKey !== "User" || !session.itemId) throw new Error(EPISODE_DENIED);
  const rows2 = await context.prisma.$queryRaw(import_client4.Prisma.sql`
    SELECT u."id" FROM "User" u JOIN "Role" r ON r."id" = u."role"
    WHERE u."id" = ${session.itemId} FOR SHARE OF u, r`);
  if (!rows2.length) throw new Error(EPISODE_DENIED);
  const user = await context.prisma.user.findUnique({ where: { id: session.itemId }, select: { id: true, name: true, securityVersion: true, role: true } });
  if (!user?.role || Number(session.data?.securityVersion || 1) !== Number(user.securityVersion || 1)) throw new Error(EPISODE_DENIED);
  const role = user.role;
  const allowed = permission === "configure" ? role.canManageRoles === true && role.canManagePatients === true : role.canAccessAllClinicalData === true || (permission === "billing" ? role.canManageBilling === true : permission === "appointments" ? role.canManageAppointments === true : permission === "queue" ? role.canManageAppointments === true || role.canManagePatients === true : role.canManagePatients === true);
  if (!allowed) throw new Error(EPISODE_DENIED);
  return context.withSession({ itemId: user.id, listKey: "User", data: { name: user.name, securityVersion: user.securityVersion, role } });
}
async function lockEpisodeFacility(context, facilityId, providerId) {
  const prisma = context.prisma;
  await prisma.$queryRaw(import_client4.Prisma.sql`SELECT "id" FROM "Facility" WHERE "id" = ${facilityId} FOR UPDATE`);
  const facility = await context.query.Facility.findOne({ where: { id: facilityId }, query: "id status" });
  if (!facility || facility.status !== "active") throw new Error(EPISODE_DENIED);
  const staff = await prisma.$queryRaw(import_client4.Prisma.sql`SELECT "A" FROM "_Facility_staff" WHERE "A" = ${facilityId} AND "B" = ${context.session.itemId} FOR SHARE`);
  if (!context.session.data.role.canAccessAllClinicalData && !staff.length) {
    if (!providerId) throw new Error(EPISODE_DENIED);
    await prisma.$queryRaw(import_client4.Prisma.sql`SELECT "id" FROM "Provider" WHERE "id" = ${providerId} FOR SHARE`);
    const provider = await prisma.provider.findUnique({ where: { id: providerId }, select: { userId: true } });
    if (provider?.userId !== context.session.itemId) throw new Error(EPISODE_DENIED);
  }
}
async function lockEpisodePatientProvider(context, facilityId, patientId, providerId) {
  await context.prisma.$queryRaw(import_client4.Prisma.sql`SELECT "id" FROM "Patient" WHERE "id" = ${patientId} FOR SHARE`);
  const patientLinks = await context.prisma.$queryRaw(import_client4.Prisma.sql`SELECT "A" FROM "_Facility_patients" WHERE "A" = ${facilityId} AND "B" = ${patientId} FOR SHARE`);
  const patient = await context.query.Patient.findOne({ where: { id: patientId }, query: "id status" });
  if (!patientLinks.length || patient?.status !== "active") throw new Error(EPISODE_DENIED);
  if (providerId) {
    await context.prisma.$queryRaw(import_client4.Prisma.sql`SELECT "id" FROM "Provider" WHERE "id" = ${providerId} FOR SHARE`);
    const providerLinks = await context.prisma.$queryRaw(import_client4.Prisma.sql`SELECT "A" FROM "_Facility_providers" WHERE "A" = ${facilityId} AND "B" = ${providerId} FOR SHARE`);
    const provider = await context.query.Provider.findOne({ where: { id: providerId }, query: "id status" });
    if (!providerLinks.length || provider?.status !== "active") throw new Error(EPISODE_DENIED);
  }
}
async function lockCurrentEncounter(context, encounterId) {
  let encounter = await context.query.Encounter.findOne({ where: { id: encounterId }, query: encounterSelection });
  if (!encounter?.facility?.id || !encounter.patient?.id || !encounter.provider?.id) throw new Error(EPISODE_DENIED);
  await lockEpisodeFacility(context, encounter.facility.id, encounter.provider.id);
  await context.prisma.$queryRaw(import_client4.Prisma.sql`SELECT "id" FROM "Encounter" WHERE "id" = ${encounterId} FOR UPDATE`);
  encounter = await context.query.Encounter.findOne({ where: { id: encounterId }, query: encounterSelection });
  if (!encounter?.facility?.id || !encounter.patient?.id || !encounter.provider?.id) throw new Error(EPISODE_DENIED);
  await lockEpisodeFacility(context, encounter.facility.id, encounter.provider.id);
  await lockEpisodePatientProvider(context, encounter.facility.id, encounter.patient.id, encounter.provider.id);
  let appointment = null;
  if (encounter.appointment?.id) {
    await context.prisma.$queryRaw(import_client4.Prisma.sql`SELECT "id" FROM "Appointment" WHERE "id" = ${encounter.appointment.id} FOR UPDATE`);
    appointment = await context.query.Appointment.findOne({ where: { id: encounter.appointment.id }, query: "id status transitionVersion patient { id } provider { id } facility { id }" });
    if (!appointment || appointment.patient?.id !== encounter.patient.id || appointment.provider?.id !== encounter.provider.id || appointment.facility?.id !== encounter.facility.id) throw new Error(EPISODE_DENIED);
  }
  return { encounter, appointment, tuple: episodeTuple(encounter) };
}
async function effectiveEpisodePolicy(prisma, facilityId) {
  if (!prisma.episodeClosurePolicy) throw new Error(EPISODE_UNAVAILABLE);
  try {
    const row = await prisma.episodeClosurePolicy.findFirst({ where: { facilityId, effectiveAt: { lte: /* @__PURE__ */ new Date() } }, orderBy: { revision: "desc" } });
    if (row) validateEpisodePolicy(row.definition);
    return row;
  } catch (error) {
    if (["P2021", "P2022"].includes(error?.code)) throw new Error(EPISODE_UNAVAILABLE);
    throw error;
  }
}
async function guardEpisodeChild(context, input, action, humanReviewed = false, replayOnly = false, permissionOverride) {
  const permission = permissionOverride || (action === "claim" ? "billing" : "clinical");
  const current = await currentEpisodeActor(context, permission);
  let providerId = input.providerId || input.orderingProviderId || input.attendingProviderId;
  if (!providerId && input.encounterId) {
    const parent = await current.query.Encounter.findOne({ where: { id: input.encounterId }, query: "id provider { id }" });
    providerId = parent?.provider?.id;
  }
  await lockEpisodeFacility(current, input.facilityId, providerId);
  await lockEpisodePatientProvider(current, input.facilityId, input.patientId, providerId);
  let encounter = null;
  if (input.encounterId) {
    if (permission === "billing") {
      await current.prisma.$queryRaw(import_client4.Prisma.sql`SELECT "id" FROM "Encounter" WHERE "id" = ${input.encounterId} FOR UPDATE`);
      const row = await current.prisma.encounter.findUnique({ where: { id: input.encounterId }, select: { id: true, facilityId: true, patientId: true, status: true } });
      if (!row || row.facilityId !== input.facilityId || row.patientId !== input.patientId) throw new Error(EPISODE_DENIED);
      encounter = row;
    } else {
      const scoped2 = await lockCurrentEncounter(current, input.encounterId);
      if (scoped2.tuple.facilityId !== input.facilityId || scoped2.tuple.patientId !== input.patientId) throw new Error(EPISODE_DENIED);
      encounter = scoped2.encounter;
    }
  }
  const discharged = Boolean(await current.prisma.admission.findFirst({ where: {
    facilityId: input.facilityId,
    patientId: input.patientId,
    status: "discharged",
    ...input.encounterId ? { encounterId: input.encounterId } : {}
  }, select: { id: true } }));
  const policy = await effectiveEpisodePolicy(current.prisma, input.facilityId);
  const receipt = input.encounterId ? await current.prisma.workflowTransition.findFirst({ where: {
    aggregateType: "encounter",
    aggregateId: input.encounterId,
    facilityId: input.facilityId,
    patientId: input.patientId,
    toStatus: { in: ["closed", "cancelled"] }
  }, orderBy: { toVersion: "desc" }, select: { result: true } }) : null;
  if (!replayOnly && action === "new_care" && !input.encounterId && !input.attendingProviderId) throw new Error("Episode action denied: unbound_legacy_new_care_requires_encounter");
  const eligibility = episodeEligibility({ status: encounter?.status || "unbound_legacy", discharged, receiptPresent: Boolean(receipt?.result?.episodeReceipt), policy: policy?.definition || null, action, humanReviewed });
  const applied = receipt?.result?.episodeReceipt?.policy?.definition;
  const originalEligibility = applied ? episodeEligibility({
    status: encounter?.status || "unbound_legacy",
    discharged,
    receiptPresent: true,
    policy: validateEpisodePolicy(applied),
    action,
    humanReviewed
  }) : eligibility;
  if (!replayOnly && (!eligibility.allowed || !originalEligibility.allowed)) throw new Error(`Episode action denied: ${!originalEligibility.allowed ? originalEligibility.code : eligibility.code}`);
  return { context: current, policy, eligibility };
}
async function currentEpisodeChild(context, model, id) {
  if (!Object.hasOwn(episodeChildModels, model)) throw new Error(EPISODE_DENIED);
  const providerField = model === "Admission" ? "attendingProvider" : model === "MedicalOrder" ? "orderingProvider" : model === "ClinicalDocument" ? "author" : ["Prescription", "Procedure", "CarePlan"].includes(model) ? "provider" : null;
  const first = await context.query[model].findOne({ where: { id }, query: `id facility { id } patient { id } encounter { id }${providerField ? ` ${providerField} { id }` : ""}` });
  if (!first?.facility?.id || !first.patient?.id) throw new Error(EPISODE_DENIED);
  let scopeProviderId = providerField ? first[providerField]?.id : null;
  if (!scopeProviderId && first.encounter?.id) {
    const parent = await context.query.Encounter.findOne({ where: { id: first.encounter.id }, query: "id provider { id }" });
    scopeProviderId = parent?.provider?.id;
  }
  await lockEpisodeFacility(context, first.facility.id, scopeProviderId);
  await context.prisma.$queryRaw(import_client4.Prisma.sql`SELECT "id" FROM ${import_client4.Prisma.raw(`"${episodeChildModels[model]}"`)} WHERE "id" = ${id} FOR UPDATE`);
  const related = ["LabResult", "Prescription", "Procedure", "Specimen"].includes(model) ? " medicalOrder { id }" : "";
  const row = await context.query[model].findOne({ where: { id }, query: `id status transitionVersion facility { id } patient { id } encounter { id }${providerField ? ` ${providerField} { id }` : ""}${related}${model === "LabResult" ? " labTest { id }" : ""}` });
  if (!row?.facility?.id || !row.patient?.id || providerField && !row[providerField]?.id || row.facility.id !== first.facility.id || row.patient.id !== first.patient.id || (row.encounter?.id || null) !== (first.encounter?.id || null) || providerField && row[providerField].id !== first[providerField]?.id) throw new Error(EPISODE_DENIED);
  return { row, input: {
    facilityId: row.facility.id,
    patientId: row.patient.id,
    encounterId: row.encounter?.id,
    ...providerField ? { providerId: row[providerField].id } : {},
    medicalOrderId: row.medicalOrder?.id,
    labTestId: row.labTest?.id
  } };
}
var import_client4, EPISODE_DENIED, EPISODE_UNAVAILABLE, encounterSelection, episodeChildModels;
var init_episodeFence = __esm({
  "features/keystone/mutations/clinical/episodeFence.ts"() {
    "use strict";
    import_client4 = require("@prisma/client");
    init_episodePolicy();
    EPISODE_DENIED = "Current episode authority or scope could not be verified";
    EPISODE_UNAVAILABLE = "Episode policy storage is unavailable; additive schema/generation/migration gate is required";
    encounterSelection = "id status transitionVersion facility { id } patient { id } provider { id } appointment { id }";
    episodeChildModels = {
      Admission: "Admission",
      MedicalOrder: "MedicalOrder",
      LabResult: "LabResult",
      Prescription: "Prescription",
      Procedure: "Procedure",
      CarePlan: "CarePlan",
      InsuranceClaim: "InsuranceClaim",
      ClinicalDocument: "ClinicalDocument",
      Specimen: "Specimen"
    };
  }
});

// features/keystone/mutations/transitionEvidence.ts
function canonical2(value) {
  if (Array.isArray(value)) return `[${value.map(canonical2).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key2, nested]) => `${JSON.stringify(key2)}:${canonical2(nested)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
function digest(value) {
  return (0, import_node_crypto7.createHash)("sha256").update(value).digest("hex");
}
function transitionEvidence(operationKey, payload) {
  const key2 = String(operationKey ?? "").trim();
  if (!OPERATION_KEY_PATTERN.test(key2)) throw new Error("Transition operation key is invalid");
  return {
    operationKeyHash: digest(key2),
    requestHash: digest(canonical2(payload))
  };
}
async function lockTransitionOperation(tx, operationKeyHash) {
  await tx.$queryRaw(
    import_client5.Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`workflow-transition:${operationKeyHash}`}, 0))::text AS "lock"`
  );
}
async function replayTransition(tx, evidence, aggregateType, aggregateId) {
  const existing = await tx.workflowTransition.findUnique({
    where: { operationKeyHash: evidence.operationKeyHash }
  });
  if (!existing) return null;
  if (existing.requestHash !== evidence.requestHash || existing.aggregateType !== aggregateType || existing.aggregateId !== aggregateId) {
    throw new Error("Transition operation key was reused with a different request");
  }
  const result8 = existing.result;
  if (!result8 || typeof result8 !== "object") throw new Error("Transition replay evidence is incomplete");
  return { ...result8, replayed: true };
}
async function recordTransition(tx, input) {
  const serialized = JSON.stringify(input.result);
  const limit = input.aggregateType === "lab_result_creation" ? 32e3 : 8e3;
  if (serialized.length > limit) throw new Error("Transition result projection is too large");
  await tx.workflowTransition.create({
    data: {
      operationKeyHash: input.evidence.operationKeyHash,
      requestHash: input.evidence.requestHash,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      fromVersion: input.fromVersion,
      toVersion: input.toVersion,
      actorReference: input.actorReference,
      facilityId: input.facilityId,
      patientId: input.patientId || null,
      auditLogId: input.auditLogId || null,
      outboxEventId: input.outboxEventId || null,
      result: input.result,
      occurredAt: input.occurredAt
    }
  });
}
var import_node_crypto7, import_client5, OPERATION_KEY_PATTERN;
var init_transitionEvidence = __esm({
  "features/keystone/mutations/transitionEvidence.ts"() {
    "use strict";
    import_node_crypto7 = require("node:crypto");
    import_client5 = require("@prisma/client");
    OPERATION_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,199}$/;
  }
});

// features/keystone/mutations/appointments/transitionAppointment.ts
function cleanOptional3(value, maxLength = 2e3) {
  const cleaned = value?.trim();
  if (!cleaned) return null;
  if (cleaned.length > maxLength) throw new Error(`Input exceeds the ${maxLength} character limit`);
  return cleaned;
}
function requirePermission(context) {
  if (!context.session?.data.role?.canManageAppointments && !context.session?.data.role?.canAccessAllClinicalData) {
    throw new Error("Not authorized to transition appointments");
  }
}
async function transitionAppointment(_root, args, context) {
  requirePermission(context);
  if (args.toStatus === "checked_in") {
    throw new Error("Appointment check-in must use the atomic care-queue arrival workflow");
  }
  if (!Number.isInteger(args.expectedVersion) || args.expectedVersion < 1) {
    throw new Error("Expected appointment version is invalid");
  }
  const reason = cleanOptional3(args.reason, 1e3);
  const operationalNotes = cleanOptional3(args.operationalNotes, 2e3);
  const evidence = transitionEvidence(args.operationKey, {
    appointmentId: args.appointmentId,
    toStatus: args.toStatus,
    expectedVersion: args.expectedVersion,
    reason,
    operationalNotes
  });
  const scopedAppointment = await context.query.Appointment.findOne({
    where: { id: args.appointmentId },
    query: "id provider { id }"
  });
  if (!scopedAppointment) throw new Error("Appointment not found or not accessible");
  return context.transaction(async (transactionContext) => {
    await transactionContext.prisma.$executeRaw(import_client6.Prisma.sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`);
    const current = await currentEpisodeActor(transactionContext, "appointments");
    const scoped2 = await current.query.Appointment.findOne({ where: { id: args.appointmentId }, query: "id patient { id } provider { id } facility { id }" });
    if (!scoped2?.facility?.id || !scoped2.patient?.id || !scoped2.provider?.id) throw new Error("Current appointment scope is unavailable");
    await lockEpisodeFacility(current, scoped2.facility.id, scoped2.provider.id);
    await lockEpisodePatientProvider(current, scoped2.facility.id, scoped2.patient.id, scoped2.provider.id);
    const tx = current.prisma;
    await tx.$queryRaw(import_client6.Prisma.sql`SELECT "id" FROM "Appointment" WHERE "id" = ${args.appointmentId} FOR UPDATE`);
    const visible = await current.query.Appointment.findOne({ where: { id: args.appointmentId }, query: "id patient { id } provider { id } facility { id }" });
    if (visible?.facility?.id !== scoped2.facility.id || visible?.patient?.id !== scoped2.patient.id || visible?.provider?.id !== scoped2.provider.id) throw new Error("Appointment scope changed");
    const prior = await tx.workflowTransition.findUnique({ where: { operationKeyHash: evidence.operationKeyHash }, select: { actorReference: true } });
    if (prior && prior.actorReference !== current.session.itemId) throw new Error("Original appointment operation is not owned");
    await lockTransitionOperation(tx, evidence.operationKeyHash);
    await lockProviderSchedule(tx, scoped2.provider.id);
    const replay = await replayTransition(tx, evidence, "appointment", args.appointmentId);
    if (replay) return {
      ...replay,
      startsAt: new Date(replay.startsAt),
      endsAt: new Date(replay.endsAt),
      checkInAt: replay.checkInAt ? new Date(replay.checkInAt) : null,
      completedAt: replay.completedAt ? new Date(replay.completedAt) : null
    };
    const appointment = await tx.appointment.findUnique({
      where: { id: args.appointmentId },
      include: { appointmentType: true }
    });
    if (!appointment || appointment.transitionVersion !== args.expectedVersion) {
      throw new Error("Appointment changed; refresh before retrying");
    }
    if (!TRANSITIONS2[appointment.status]?.includes(args.toStatus)) {
      throw new Error(`Invalid appointment transition from ${appointment.status} to ${args.toStatus}`);
    }
    if (args.toStatus === "cancelled" && !reason) throw new Error("Cancellation reason is required");
    if (args.toStatus === "confirmed") {
      if (!appointment.providerId) throw new Error("Appointment is missing a provider");
      if (!appointment.facilityId) throw new Error("Appointment is missing a facility");
      const durationMinutes = Number(appointment.appointmentType?.durationMinutes);
      if (!Number.isInteger(durationMinutes) || appointment.endsAt.getTime() !== appointment.startsAt.getTime() + durationMinutes * 6e4) {
        throw new Error("Appointment window must match the appointment type duration");
      }
      const schedule = await inspectProviderWindow(tx, {
        providerId: appointment.providerId,
        facilityId: appointment.facilityId,
        startsAt: appointment.startsAt,
        endsAt: appointment.endsAt,
        bufferBeforeMinutes: Number(appointment.appointmentType?.bufferBeforeMinutes || 0),
        bufferAfterMinutes: Number(appointment.appointmentType?.bufferAfterMinutes || 0),
        excludeAppointmentId: appointment.id
      });
      if (schedule.hasConflict) {
        throw new Error("Appointment cannot be confirmed because the provider schedule conflicts");
      }
    }
    const now = /* @__PURE__ */ new Date();
    const nextVersion = appointment.transitionVersion + 1;
    const updateData = {
      status: args.toStatus,
      transitionVersion: nextVersion
    };
    if (args.toStatus === "checked_in") updateData.checkInAt = now;
    if (args.toStatus === "completed") updateData.completedAt = now;
    if (args.toStatus === "cancelled") updateData.cancellationReason = reason;
    if (operationalNotes) updateData.operationalNotes = operationalNotes;
    if (TERMINAL_STATUSES.has(args.toStatus)) {
      updateData.bookingLockKey = `released:${appointment.id}:${now.getTime()}`;
    }
    const updated = await tx.appointment.update({ where: { id: appointment.id }, data: updateData });
    const metadata = {
      source: "appointment_transition",
      aggregateType: "appointment",
      aggregateId: appointment.id,
      fromStatus: appointment.status,
      status: updated.status,
      transitionVersion: nextVersion,
      reasonProvided: Boolean(reason),
      operationalNotesProvided: Boolean(operationalNotes)
    };
    const eventType = `appointment.${args.toStatus}`;
    const audit = await tx.clinicalAuditLog.create({
      data: {
        eventType,
        occurredAt: now,
        actorType: "staff_user",
        actorReference: context.session?.itemId || "",
        facilityId: appointment.facilityId,
        patientId: appointment.patientId,
        appointmentId: appointment.id,
        metadata
      }
    });
    const outbox = await tx.clinicalOutboxEvent.create({
      data: {
        eventKey: `appointment:${appointment.id}:v${nextVersion}:${updated.status}`,
        eventType,
        aggregateType: "appointment",
        aggregateId: appointment.id,
        status: "recorded",
        attempts: 0,
        nextAttemptAt: null,
        facilityId: appointment.facilityId,
        patientId: appointment.patientId,
        appointmentId: appointment.id,
        payload: metadata,
        createdAt: now
      }
    });
    const result8 = {
      id: updated.id,
      appointmentNumber: updated.appointmentNumber,
      fromStatus: appointment.status,
      status: updated.status,
      transitionVersion: updated.transitionVersion,
      startsAt: updated.startsAt,
      endsAt: updated.endsAt,
      checkInAt: updated.checkInAt || null,
      completedAt: updated.completedAt || null,
      cancellationReason: updated.cancellationReason || null,
      replayed: false
    };
    await recordTransition(tx, {
      evidence,
      aggregateType: "appointment",
      aggregateId: appointment.id,
      fromStatus: appointment.status,
      toStatus: updated.status,
      fromVersion: appointment.transitionVersion,
      toVersion: updated.transitionVersion,
      actorReference: context.session?.itemId || "",
      facilityId: appointment.facilityId,
      patientId: appointment.patientId,
      auditLogId: audit.id,
      outboxEventId: outbox.id,
      result: result8,
      occurredAt: now
    });
    return result8;
  }, { timeout: 3e4 });
}
var import_client6, TRANSITIONS2, TERMINAL_STATUSES;
var init_transitionAppointment = __esm({
  "features/keystone/mutations/appointments/transitionAppointment.ts"() {
    "use strict";
    import_client6 = require("@prisma/client");
    init_episodeFence();
    init_schedulePolicy();
    init_transitionEvidence();
    TRANSITIONS2 = {
      requested: ["confirmed", "cancelled"],
      confirmed: ["checked_in", "cancelled", "no_show"],
      checked_in: ["in_visit", "cancelled"],
      in_visit: ["completed"],
      completed: [],
      cancelled: [],
      no_show: []
    };
    TERMINAL_STATUSES = /* @__PURE__ */ new Set(["completed", "cancelled", "no_show"]);
  }
});

// features/keystone/mutations/communications/sendSecurePatientMessage.ts
function requirePermission2(context) {
  const role = context.session?.data.role;
  if (!role?.canManageCommunications) {
    throw new Error("Not authorized to send patient messages");
  }
}
async function sendSecurePatientMessage(_root, args, context) {
  requirePermission2(context);
  if (!["sms", "email", "phone"].includes(args.channel)) {
    throw new Error("Patient follow-up channel must be sms, email, or phone");
  }
  if (!["care_operations", "billing", "general"].includes(args.purpose)) {
    throw new Error("Secure message purpose is invalid");
  }
  const subject = bounded2(args.subject, "Message subject", 200);
  const body = narrativeText(args.body, "Message body", 4e3, true);
  await scopedFacilityPatient(context, args.facilityId, args.patientId);
  const [scopedAppointment, preference, installation, template] = await Promise.all([
    args.appointmentId ? context.query.Appointment.findOne({
      where: { id: args.appointmentId },
      query: "id patient { id } facility { id }"
    }) : null,
    context.query.CommunicationPreference.findMany({
      where: {
        facility: { id: { equals: args.facilityId } },
        patient: { id: { equals: args.patientId } },
        channel: { equals: args.channel },
        purpose: { equals: args.purpose }
      },
      take: 1,
      query: "id status"
    }),
    args.installationId ? context.query.IntegrationInstallation.findOne({
      where: { id: args.installationId },
      query: "id status kind transitionVersion facility { id }"
    }) : null,
    args.templateId ? context.query.CommunicationTemplate.findOne({
      where: { id: args.templateId },
      query: "id status channel facility { id }"
    }) : null
  ]);
  if (args.appointmentId && (!scopedAppointment || scopedAppointment.patient?.id !== args.patientId || scopedAppointment.facility?.id !== args.facilityId)) {
    throw new Error("Appointment does not belong to the selected patient and facility");
  }
  if (preference?.[0]?.status === "opted_out") throw new Error("Patient has opted out of this message channel and purpose");
  if (args.purpose === "general" && preference?.[0]?.status !== "allowed") {
    throw new Error("General messages require an explicit allowed communication preference");
  }
  const manualFollowUp = args.channel === "phone";
  if (manualFollowUp && installation) {
    throw new Error("Manual phone follow-up cannot use an external communications integration");
  }
  if (!manualFollowUp && (!installation || installation.status !== "active" || installation.kind !== "communications" || installation.facility?.id !== args.facilityId)) {
    throw new Error("SMS and email messages require an active facility communications integration");
  }
  if (template && (template.status !== "active" || template.channel !== args.channel || template.facility?.id !== args.facilityId)) {
    throw new Error("Communication template does not match the active facility channel");
  }
  const input = {
    operationKey: args.operationKey,
    facilityId: args.facilityId,
    patientId: args.patientId,
    appointmentId: args.appointmentId || null,
    installationId: args.installationId || null,
    templateId: args.templateId || null,
    channel: args.channel,
    purpose: args.purpose,
    subject,
    body
  };
  const evidence = operationEvidence(input);
  return context.transaction(async (transactionContext) => {
    const prisma = transactionContext.sudo().prisma;
    await lockOperation(prisma, "patient-message-create", evidence.operationKeyHash);
    const existing = await prisma.patientMessage.findUnique({ where: { operationKeyHash: evidence.operationKeyHash } });
    if (existing) {
      if (existing.requestHash !== evidence.requestHash) {
        throw new Error("Operation key was reused with a different payload");
      }
      return {
        id: existing.id,
        status: existing.status,
        channel: existing.channel,
        direction: existing.direction,
        recordedAt: existing.createdAt,
        patientId: existing.patientId,
        appointmentId: existing.appointmentId,
        replayed: true
      };
    }
    const patient = await prisma.patient.findUnique({
      where: { id: args.patientId },
      select: { id: true, status: true }
    });
    if (!patient || patient.status !== "active") throw new Error("Active patient not found");
    const now = /* @__PURE__ */ new Date();
    const message = await prisma.patientMessage.create({
      data: {
        ...evidence,
        transitionVersion: 1,
        facilityId: args.facilityId,
        patientId: patient.id,
        appointmentId: args.appointmentId || null,
        installationId: installation?.id || null,
        templateId: template?.id || null,
        direction: "outbound",
        channel: args.channel,
        purpose: args.purpose,
        subject,
        body,
        status: manualFollowUp ? "manual_required" : "queued",
        metadata: { source: "platform_secure_message", followUpMode: manualFollowUp ? "manual" : "integration" }
      }
    });
    await appendAuditAndOutbox(prisma, {
      eventKey: `patient_message:${message.id}:v1:${message.status}`,
      eventType: manualFollowUp ? "message.manual_required" : "message.queued",
      aggregateType: "patient_message",
      aggregateId: message.id,
      facilityId: args.facilityId,
      patientId: patient.id,
      actorReference: context.session?.itemId || "",
      deliveryMode: manualFollowUp ? "internal" : "external",
      installationId: installation?.id,
      installationVersion: installation?.transitionVersion,
      metadata: {
        source: "patient_message_workflow",
        aggregateId: message.id,
        channel: args.channel,
        purpose: args.purpose,
        status: message.status,
        followUpMode: manualFollowUp ? "manual" : "integration",
        transitionVersion: 1
      },
      occurredAt: now
    });
    return {
      id: message.id,
      status: message.status,
      channel: message.channel,
      direction: message.direction,
      recordedAt: message.createdAt,
      patientId: patient.id,
      appointmentId: message.appointmentId,
      replayed: false
    };
  }, { timeout: 3e4 });
}
var init_sendSecurePatientMessage = __esm({
  "features/keystone/mutations/communications/sendSecurePatientMessage.ts"() {
    "use strict";
    init_narrativeText();
    init_evidence();
  }
});

// features/keystone/mutations/communications/transitionPatientMessage.ts
async function transitionPatientMessage(_root, args, context) {
  const role = context.session?.data.role;
  if (!role?.canManageCommunications && !role?.canManageAppointments) {
    throw new Error("Not authorized to complete patient follow-up");
  }
  if (args.toStatus !== "completed") throw new Error("Only manual follow-up completion is supported here");
  if (!Number.isInteger(args.expectedVersion) || args.expectedVersion < 1) throw new Error("Expected message version is invalid");
  const reasonCode = String(args.reasonCode || "manual_follow_up_completed").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_");
  if (!reasonCode || reasonCode.length > 80) throw new Error("Follow-up reason code is invalid");
  const visible = await context.query.PatientMessage.findOne({
    where: { id: args.messageId },
    query: "id status transitionVersion"
  });
  if (!visible) throw new Error("Patient follow-up not found or not accessible");
  const evidence = transitionEvidence(args.operationKey, {
    messageId: args.messageId,
    toStatus: args.toStatus,
    expectedVersion: args.expectedVersion,
    reasonCode
  });
  return context.transaction(async (transactionContext) => {
    const prisma = transactionContext.sudo().prisma;
    await lockTransitionOperation(prisma, evidence.operationKeyHash);
    await prisma.$queryRaw(
      import_client7.Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`patient-message:${args.messageId}`}, 0))::text AS "lock"`
    );
    const replay = await replayTransition(prisma, evidence, "patient_message", args.messageId);
    if (replay) return replay;
    const current = await prisma.patientMessage.findUnique({ where: { id: args.messageId } });
    if (!current || current.transitionVersion !== args.expectedVersion) {
      throw new Error("Patient follow-up changed; refresh before retrying");
    }
    if (current.status !== "manual_required") {
      throw new Error("Only a manual follow-up task can be completed by an operator");
    }
    const now = /* @__PURE__ */ new Date();
    const updated = await prisma.patientMessage.update({
      where: { id: current.id },
      data: {
        status: "completed",
        transitionVersion: { increment: 1 },
        metadata: {
          ...current.metadata && typeof current.metadata === "object" ? current.metadata : {},
          completionReasonCode: reasonCode,
          completedBy: context.session.itemId,
          completedAt: now.toISOString()
        }
      }
    });
    const events = await appendAuditAndOutbox(prisma, {
      eventKey: `patient_message:${updated.id}:v${updated.transitionVersion}:completed`,
      eventType: "message.manual_completed",
      aggregateType: "patient_message",
      aggregateId: updated.id,
      facilityId: updated.facilityId,
      patientId: updated.patientId,
      actorReference: context.session.itemId,
      metadata: {
        source: "manual_follow_up_workflow",
        aggregateId: updated.id,
        fromStatus: current.status,
        status: updated.status,
        transitionVersion: updated.transitionVersion,
        reasonCode
      },
      occurredAt: now
    });
    const result8 = {
      id: updated.id,
      status: updated.status,
      transitionVersion: updated.transitionVersion,
      replayed: false
    };
    await recordTransition(prisma, {
      evidence,
      aggregateType: "patient_message",
      aggregateId: updated.id,
      fromStatus: current.status,
      toStatus: updated.status,
      fromVersion: current.transitionVersion,
      toVersion: updated.transitionVersion,
      actorReference: context.session.itemId,
      facilityId: updated.facilityId,
      patientId: updated.patientId,
      auditLogId: events.audit.id,
      outboxEventId: events.outbox.id,
      result: result8,
      occurredAt: now
    });
    return result8;
  }, { timeout: 3e4 });
}
var import_client7;
var init_transitionPatientMessage = __esm({
  "features/keystone/mutations/communications/transitionPatientMessage.ts"() {
    "use strict";
    import_client7 = require("@prisma/client");
    init_evidence();
    init_transitionEvidence();
  }
});

// features/keystone/mutations/clinical/episodeWorkflows.ts
function policyProjection(row) {
  return row ? {
    id: row.id,
    revision: row.revision,
    effectiveAt: row.effectiveAt,
    definition: row.definition,
    reviewReference: row.reviewReference,
    reviewedByReference: row.reviewedByReference,
    reviewedRoleReference: row.reviewedRoleReference
  } : null;
}
async function rejectEpisodeCommand(context, scope2, policy, originalCommand, evidence, reasonCode) {
  const now = /* @__PURE__ */ new Date();
  const row = await context.prisma.encounter.findUnique({ where: { id: scope2.tuple.encounterId } });
  const result8 = {
    id: row.id,
    encounterNumber: row.encounterNumber,
    fromStatus: row.status,
    status: row.status,
    transitionVersion: row.transitionVersion,
    startedAt: row.startedAt || null,
    endedAt: row.endedAt || null,
    replayed: false,
    outcome: "rejected",
    reasonCode,
    episodeReceipt: {
      tuple: scope2.tuple,
      originalCommand,
      policy: policyProjection(policy),
      actorId: context.session.itemId,
      roleId: context.session.data.role.id,
      accepted: false,
      reasonCode,
      clinicalAuthority: "not_asserted",
      descendantsClosed: false,
      admissionDischarged: false
    }
  };
  const events = await appendAuditAndOutbox(context.prisma, {
    eventKey: `encounter_command:${evidence.operationKeyHash}:rejected`,
    eventType: "encounter_command.rejected",
    aggregateType: "encounter_command",
    aggregateId: row.id,
    facilityId: scope2.tuple.facilityId,
    patientId: scope2.tuple.patientId,
    actorReference: context.session.itemId,
    metadata: { source: "episode_policy_workflow", reasonCode, policyId: policy?.id || null, transitionPerformed: false },
    occurredAt: now
  });
  await recordTransition(context.prisma, {
    evidence,
    aggregateType: "encounter_command",
    aggregateId: row.id,
    fromStatus: row.status,
    toStatus: "rejected",
    fromVersion: row.transitionVersion,
    toVersion: row.transitionVersion,
    actorReference: context.session.itemId,
    facilityId: scope2.tuple.facilityId,
    patientId: scope2.tuple.patientId,
    auditLogId: events.audit.id,
    outboxEventId: events.outbox.id,
    result: result8,
    occurredAt: now
  });
  return result8;
}
function reviewFingerprint(context, scope2, policy) {
  return episodeDigest({
    tuple: scope2.tuple,
    actorId: context.session.itemId,
    roleId: context.session.data.role.id,
    securityVersion: context.session.data.securityVersion,
    capabilities: {
      canManagePatients: context.session.data.role.canManagePatients,
      canAccessAllClinicalData: context.session.data.role.canAccessAllClinicalData,
      canManageBilling: context.session.data.role.canManageBilling,
      canManageRoles: context.session.data.role.canManageRoles
    },
    encounterVersion: scope2.encounter.transitionVersion,
    encounterStatus: scope2.encounter.status,
    appointmentVersion: scope2.appointment?.transitionVersion || null,
    appointmentStatus: scope2.appointment?.status || null,
    policyId: policy?.id || null,
    policyRevision: policy?.revision || null,
    policyEffectiveAt: policy?.effectiveAt ? new Date(policy.effectiveAt).toISOString() : null,
    policyDefinition: policy?.definition || null
  });
}
async function reviewEpisodePolicy(_root, { data }, context) {
  const definition = validateEpisodePolicy(data.definition);
  const reviewReference = requireHumanEpisodeReview(data.attested, data.reviewReference);
  if (!Number.isInteger(data.expectedRevision) || data.expectedRevision < 0) throw new Error("Expected policy revision is invalid");
  const originalCommand = { facilityId: data.facilityId, expectedRevision: data.expectedRevision, definition, reviewReference, attested: true };
  return context.transaction(async (transactionContext) => {
    const current = await currentEpisodeActor(transactionContext, "configure");
    await lockEpisodeFacility(current, data.facilityId);
    const policy = await effectiveEpisodePolicy(current.prisma, data.facilityId);
    const evidence = transitionEvidence(data.operationKey, { ...originalCommand, actorId: current.session.itemId });
    await lockTransitionOperation(current.prisma, evidence.operationKeyHash);
    const existing = await current.prisma.episodeClosurePolicy.findUnique({ where: { operationKeyHash: evidence.operationKeyHash } });
    if (existing) {
      if (existing.requestHash !== evidence.requestHash || existing.reviewedByReference !== current.session.itemId) throw new Error("Policy operation identity does not match the original command");
      return { original: policyProjection(existing), current: policyProjection(policy), replayed: true };
    }
    if ((policy?.revision || 0) !== data.expectedRevision) throw new Error("Policy changed; review the current revision before submitting");
    const now = /* @__PURE__ */ new Date();
    const row = await current.prisma.episodeClosurePolicy.create({ data: {
      id: (0, import_node_crypto8.randomUUID)(),
      facilityId: data.facilityId,
      revision: data.expectedRevision + 1,
      revisionKey: `${data.facilityId}:${data.expectedRevision + 1}`,
      definition,
      reviewReference,
      reviewedByReference: current.session.itemId,
      reviewedRoleReference: current.session.data.role.id,
      ...evidence,
      originalCommand,
      effectiveAt: now,
      createdAt: now,
      updatedAt: now
    } });
    await appendAuditAndOutbox(current.prisma, {
      eventKey: `episode_policy:${row.id}:reviewed`,
      eventType: "episode_policy.reviewed",
      aggregateType: "episode_policy",
      aggregateId: row.id,
      facilityId: data.facilityId,
      actorReference: current.session.itemId,
      metadata: { source: "episode_policy_workflow", policyId: row.id, revision: row.revision, humanReviewRecorded: true, clinicalAuthority: "not_asserted", retentionDispositionChanged: false },
      occurredAt: now
    });
    return { original: policyProjection(row), current: policyProjection(row), replayed: false };
  }, { isolationLevel: "Serializable", timeout: 3e4 });
}
async function episodePolicyWorkspace(_root, args, context) {
  const take = args.take ?? 25;
  if (!Number.isInteger(take) || take < 1 || take > 25 || args.beforeRevision != null && (!Number.isInteger(args.beforeRevision) || args.beforeRevision < 1)) throw new Error("Policy history page is invalid");
  return context.transaction(async (tx) => {
    const current = await currentEpisodeActor(tx);
    await lockEpisodeFacility(current, args.facilityId);
    const effective = await effectiveEpisodePolicy(current.prisma, args.facilityId);
    const rows2 = await current.prisma.episodeClosurePolicy.findMany({ where: {
      facilityId: args.facilityId,
      ...args.beforeRevision ? { revision: { lt: args.beforeRevision } } : {}
    }, orderBy: { revision: "desc" }, take: take + 1 });
    return {
      actorId: current.session.itemId,
      effective: policyProjection(effective),
      history: rows2.slice(0, take).map(policyProjection),
      nextRevision: rows2.length > take ? rows2[take - 1].revision : null,
      canConfigure: current.session.data.role.canManageRoles === true && current.session.data.role.canManagePatients === true,
      legacyState: effective ? "explicit_reviewed_policy" : "no_reviewed_policy_no_operational_closure"
    };
  }, { isolationLevel: "Serializable", timeout: 3e4 });
}
async function episodeClosureWorkspace(_root, args, context) {
  const take = args.take ?? 25;
  if (!Number.isInteger(take) || take < 1 || take > 25 || args.beforeVersion != null && (!Number.isInteger(args.beforeVersion) || args.beforeVersion < 1)) throw new Error("Episode history page is invalid");
  return context.transaction(async (tx) => {
    const current = await currentEpisodeActor(tx);
    const scope2 = await lockCurrentEncounter(current, args.encounterId);
    const policy = await effectiveEpisodePolicy(current.prisma, scope2.tuple.facilityId);
    const entries = await current.prisma.workflowTransition.findMany({ where: {
      aggregateType: "encounter",
      aggregateId: args.encounterId,
      facilityId: scope2.tuple.facilityId,
      patientId: scope2.tuple.patientId,
      ...args.beforeVersion ? { toVersion: { lt: args.beforeVersion } } : {}
    }, orderBy: { toVersion: "desc" }, take: take + 1, select: { id: true, actorReference: true, fromStatus: true, toStatus: true, toVersion: true, occurredAt: true, result: true } });
    const rejectedWhere = {
      aggregateType: "encounter_command",
      aggregateId: args.encounterId,
      actorReference: current.session.itemId,
      facilityId: scope2.tuple.facilityId,
      patientId: scope2.tuple.patientId
    };
    let rejectedPageWhere = rejectedWhere;
    if (args.beforeRejectedId) {
      const cursor = await current.prisma.workflowTransition.findFirst({ where: { ...rejectedWhere, id: args.beforeRejectedId }, select: { id: true, occurredAt: true } });
      if (!cursor) throw new Error("Owned rejected-receipt cursor is stale or unavailable");
      rejectedPageWhere = { ...rejectedWhere, OR: [{ occurredAt: { lt: cursor.occurredAt } }, { occurredAt: cursor.occurredAt, id: { lt: cursor.id } }] };
    }
    const rejectedEntries = await current.prisma.workflowTransition.findMany({
      where: rejectedPageWhere,
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: take + 1,
      select: { id: true, toVersion: true, occurredAt: true, result: true }
    });
    const rejectedHistory = rejectedEntries.slice(0, take).map((entry) => ({
      id: entry.id,
      observedVersion: entry.toVersion,
      occurredAt: entry.occurredAt,
      reasonCode: entry.result?.reasonCode || "legacy_rejection_unknown",
      policyRevision: entry.result?.episodeReceipt?.policy?.revision || null
    }));
    const history = entries.slice(0, take).map((entry) => ({
      id: entry.id,
      fromStatus: entry.fromStatus,
      toStatus: entry.toStatus,
      toVersion: entry.toVersion,
      occurredAt: entry.occurredAt,
      provenance: entry.result?.episodeReceipt ? "reviewed_policy_receipt" : "legacy_policy_unknown",
      policy: entry.result?.episodeReceipt?.policy || null,
      owned: entry.actorReference === current.session.itemId
    }));
    const closure = await current.prisma.workflowTransition.findFirst({ where: {
      aggregateType: "encounter",
      aggregateId: args.encounterId,
      facilityId: scope2.tuple.facilityId,
      patientId: scope2.tuple.patientId,
      toStatus: { in: ["closed", "cancelled"] }
    }, orderBy: { toVersion: "desc" }, select: { result: true } });
    const discharged = Boolean(await current.prisma.admission.findFirst({ where: { facilityId: scope2.tuple.facilityId, patientId: scope2.tuple.patientId, encounterId: args.encounterId, status: "discharged" }, select: { id: true } }));
    const applied = closure?.result?.episodeReceipt?.policy?.definition || null;
    const eligibility = ["new_care", "late_result", "correction", "claim", "cancel_evidence", "retention_evidence"].map((action) => {
      const base = { status: scope2.encounter.status, discharged, receiptPresent: Boolean(closure?.result?.episodeReceipt), action, humanReviewed: false };
      const effective = episodeEligibility({ ...base, policy: policy?.definition || null });
      const original = applied ? episodeEligibility({ ...base, policy: applied }) : effective;
      return { action, allowed: effective.allowed && original.allowed, code: !original.allowed ? original.code : effective.code };
    });
    return {
      actorId: current.session.itemId,
      tuple: scope2.tuple,
      status: scope2.encounter.status,
      transitionVersion: scope2.encounter.transitionVersion,
      appointment: scope2.appointment ? { id: scope2.appointment.id, status: scope2.appointment.status, transitionVersion: scope2.appointment.transitionVersion } : null,
      policy: policyProjection(policy),
      reviewFingerprint: reviewFingerprint(current, scope2, policy),
      history,
      nextVersion: entries.length > take ? entries[take - 1].toVersion : null,
      eligibility,
      rejectedHistory,
      nextRejectedId: rejectedEntries.length > take ? rejectedEntries[take - 1].id : null,
      legacyState: closure && !closure.result?.episodeReceipt ? "legacy_policy_unknown_no_backfill" : "current_source_receipt_or_active"
    };
  }, { isolationLevel: "Serializable", timeout: 3e4 });
}
async function recoverEpisodeClosure(_root, args, context) {
  return context.transaction(async (tx) => {
    const current = await currentEpisodeActor(tx);
    const scope2 = await lockCurrentEncounter(current, args.encounterId);
    const policy = await effectiveEpisodePolicy(current.prisma, scope2.tuple.facilityId);
    const evidence = transitionEvidence(args.operationKey, {});
    await lockTransitionOperation(current.prisma, evidence.operationKeyHash);
    const entry = await current.prisma.workflowTransition.findUnique({ where: { operationKeyHash: evidence.operationKeyHash } });
    if (!entry) return { outcome: "unknown", original: null, current: { status: scope2.encounter.status, transitionVersion: scope2.encounter.transitionVersion }, policy: policyProjection(policy) };
    if (!["encounter", "encounter_command"].includes(entry.aggregateType) || entry.aggregateId !== args.encounterId || entry.actorReference !== current.session.itemId || entry.facilityId !== scope2.tuple.facilityId || entry.patientId !== scope2.tuple.patientId) throw new Error("Original episode operation is not owned or accessible");
    if (!entry.result?.episodeReceipt) return { outcome: "legacy_unknown", original: null, current: { status: scope2.encounter.status, transitionVersion: scope2.encounter.transitionVersion }, policy: policyProjection(policy) };
    assertEpisodeTuple(entry.result.episodeReceipt.tuple, scope2.tuple);
    return { outcome: entry.result.episodeReceipt.accepted === false ? "rejected" : "accepted", original: entry.result, current: {
      status: scope2.encounter.status,
      transitionVersion: scope2.encounter.transitionVersion,
      appointment: scope2.appointment ? { id: scope2.appointment.id, status: scope2.appointment.status, transitionVersion: scope2.appointment.transitionVersion } : null
    }, policy: policyProjection(policy) };
  }, { isolationLevel: "Serializable", timeout: 3e4 });
}
var import_node_crypto8;
var init_episodeWorkflows = __esm({
  "features/keystone/mutations/clinical/episodeWorkflows.ts"() {
    "use strict";
    import_node_crypto8 = require("node:crypto");
    init_evidence();
    init_transitionEvidence();
    init_episodePolicy();
    init_episodeFence();
  }
});

// features/keystone/mutations/clinical/encounterPolicy.ts
function isEncounterTransitionAllowed(fromStatus, toStatus) {
  return ENCOUNTER_TRANSITIONS[fromStatus]?.includes(toStatus) ?? false;
}
function validateBoundedEncounterTransitionEvidence(input) {
  if (String(input.diagnosisSummary || "").trim()) {
    throw new Error("Diagnosis authorship is unavailable in this bounded patient-operations release");
  }
  if (input.toStatus === "closed" && !String(input.reason || "").trim()) {
    throw new Error("Operational closure reason is required to close an encounter");
  }
  if (input.toStatus === "cancelled" && !String(input.reason || "").trim()) {
    throw new Error("Cancellation reason is required");
  }
}
function linkedAppointmentTransition(encounterStatus, appointmentStatus) {
  if (encounterStatus === "in_progress" && appointmentStatus === "checked_in") {
    return { fromStatus: "checked_in", toStatus: "in_visit" };
  }
  if (encounterStatus === "closed" && appointmentStatus === "in_visit") {
    return { fromStatus: "in_visit", toStatus: "completed" };
  }
  return null;
}
var ENCOUNTER_TRANSITIONS;
var init_encounterPolicy = __esm({
  "features/keystone/mutations/clinical/encounterPolicy.ts"() {
    "use strict";
    ENCOUNTER_TRANSITIONS = {
      open: ["in_progress", "cancelled"],
      in_progress: ["closed", "cancelled"],
      closed: [],
      cancelled: []
    };
  }
});

// features/keystone/mutations/clinical/manageEncounter.ts
function requirePermission3(context) {
  const role = context.session?.data.role;
  if (!role?.canManagePatients && !role?.canAccessAllClinicalData) {
    throw new Error("Not authorized to manage encounters");
  }
}
function bounded3(value, label, maxLength, required = false) {
  const normalized = String(value ?? "").trim();
  if (required && !normalized || normalized.length > maxLength || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new Error(`${label} is invalid`);
  }
  return normalized;
}
function digest2(value) {
  return (0, import_node_crypto9.createHash)("sha256").update(value, "utf8").digest("hex");
}
function canonical3(value) {
  if (Array.isArray(value)) return `[${value.map(canonical3).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key2, child]) => `${JSON.stringify(key2)}:${canonical3(child)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
function projection(row, replayed = false) {
  return {
    id: row.id,
    encounterNumber: row.encounterNumber,
    status: row.status,
    transitionVersion: row.transitionVersion,
    replayed
  };
}
async function resolveOpenScope(context, input) {
  requirePermission3(context);
  const [facility, patient, provider, appointment, department] = await Promise.all([
    context.query.Facility.findOne({ where: { id: input.facilityId }, query: "id status" }),
    context.query.Patient.findOne({ where: { id: input.patientId }, query: "id facilities { id }" }),
    context.query.Provider.findOne({ where: { id: input.providerId }, query: "id status facilities { id }" }),
    input.appointmentId ? context.query.Appointment.findOne({
      where: { id: input.appointmentId },
      query: "id status patient { id } provider { id } facility { id }"
    }) : null,
    input.departmentId ? context.query.Department.findOne({ where: { id: input.departmentId }, query: "id facilities { id }" }) : null
  ]);
  if (!facility || facility.status !== "active" || !patient?.facilities?.some((item) => item.id === input.facilityId) || provider?.status !== "active" || !provider?.facilities?.some((item) => item.id === input.facilityId)) {
    throw new Error("Facility, patient, or provider not found or not accessible");
  }
  if (input.appointmentId && (!appointment || !["checked_in", "in_visit"].includes(appointment.status) || appointment.patient?.id !== input.patientId || appointment.provider?.id !== input.providerId || appointment.facility?.id !== input.facilityId)) {
    throw new Error("Appointment does not match the checked-in patient, provider, and facility");
  }
  if (input.departmentId && (!department || !department.facilities?.some((item) => item.id === input.facilityId))) {
    throw new Error("Department does not match the accessible facility");
  }
}
async function openEncounter(_root, { data }, context) {
  const operationKey = bounded3(data.operationKey, "Operation key", 200, true);
  if (!OPERATION_KEY.test(operationKey)) throw new Error("Operation key is invalid");
  const input = {
    operationKey,
    facilityId: bounded3(data.facilityId, "Facility", 128, true),
    patientId: bounded3(data.patientId, "Patient", 128, true),
    providerId: bounded3(data.providerId, "Provider", 128, true),
    appointmentId: data.appointmentId ? bounded3(data.appointmentId, "Appointment", 128, true) : null,
    departmentId: data.departmentId ? bounded3(data.departmentId, "Department", 128, true) : null,
    chiefComplaint: bounded3(data.chiefComplaint, "Reason for encounter", 4e3)
  };
  await resolveOpenScope(context, input);
  const operationKeyHash = digest2(operationKey);
  const requestHash = digest2(canonical3({ ...input, operationKey: void 0 }));
  try {
    return await context.transaction(async (transactionContext) => {
      await transactionContext.prisma.$executeRaw(import_client8.Prisma.sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`);
      const current = await currentEpisodeActor(transactionContext);
      await lockEpisodeFacility(current, input.facilityId, input.providerId);
      await lockEpisodePatientProvider(current, input.facilityId, input.patientId, input.providerId);
      if (input.appointmentId) await current.prisma.$queryRaw(import_client8.Prisma.sql`SELECT "id" FROM "Appointment" WHERE "id" = ${input.appointmentId} FOR UPDATE`);
      await resolveOpenScope(current, input);
      const tx = current.prisma;
      await tx.$queryRaw(
        import_client8.Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`encounter:open:${operationKeyHash}`}, 0))::text AS "lock"`
      );
      if (input.appointmentId) {
        await tx.$queryRaw(
          import_client8.Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`encounter:appointment:${input.appointmentId}`}, 0))::text AS "lock"`
        );
      }
      const replay = await tx.encounter.findUnique({ where: { operationKeyHash } });
      if (replay) {
        if (replay.requestHash !== requestHash || replay.actorReference !== current.session.itemId || replay.facilityId !== input.facilityId || replay.patientId !== input.patientId || replay.providerId !== input.providerId || (replay.appointmentId || null) !== input.appointmentId) throw new Error("Operation key was reused with a different payload or authority");
        return projection(replay, true);
      }
      if (input.appointmentId && await tx.encounter.findFirst({ where: { appointmentId: input.appointmentId } })) {
        throw new Error("Appointment already has an encounter");
      }
      const now = /* @__PURE__ */ new Date();
      const encounter = await tx.encounter.create({
        data: {
          encounterNumber: `ENC-${(0, import_node_crypto9.randomUUID)()}`,
          status: "open",
          transitionVersion: 1,
          operationKeyHash,
          requestHash,
          actorReference: context.session.itemId,
          facilityId: input.facilityId,
          patientId: input.patientId,
          providerId: input.providerId,
          appointmentId: input.appointmentId,
          departmentId: input.departmentId,
          chiefComplaint: input.chiefComplaint || ""
        }
      });
      const metadata = {
        source: "encounter_workflow",
        aggregateType: "encounter",
        aggregateId: encounter.id,
        status: encounter.status,
        transitionVersion: encounter.transitionVersion
      };
      await tx.clinicalAuditLog.create({
        data: {
          eventType: "encounter.opened",
          occurredAt: now,
          actorType: "staff_user",
          actorReference: context.session.itemId,
          facilityId: encounter.facilityId,
          patientId: encounter.patientId,
          appointmentId: encounter.appointmentId,
          encounterId: encounter.id,
          metadata,
          createdAt: now
        }
      });
      await tx.clinicalOutboxEvent.create({
        data: {
          eventKey: `encounter:${encounter.id}:v1:opened`,
          eventType: "encounter.opened",
          aggregateType: "encounter",
          aggregateId: encounter.id,
          status: "recorded",
          attempts: 0,
          nextAttemptAt: null,
          facilityId: encounter.facilityId,
          patientId: encounter.patientId,
          appointmentId: encounter.appointmentId,
          encounterId: encounter.id,
          payload: metadata,
          createdAt: now
        }
      });
      return projection(encounter);
    }, { timeout: 3e4 });
  } catch (error) {
    if (error instanceof import_client8.Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) {
      throw new Error("Encounter opening conflicted with another request; retry with the same operation key");
    }
    throw error;
  }
}
async function transitionEncounter(_root, args, context) {
  requirePermission3(context);
  const diagnosisSummary = bounded3(args.diagnosisSummary, "Diagnosis summary", 4e3);
  const reason = bounded3(args.reason, "Transition reason", 1e3);
  validateBoundedEncounterTransitionEvidence({ toStatus: args.toStatus, diagnosisSummary, reason });
  if (!Number.isInteger(args.expectedVersion) || args.expectedVersion < 1) throw new Error("Expected encounter version is invalid");
  return context.transaction(async (transactionContext) => {
    await transactionContext.prisma.$executeRaw(import_client8.Prisma.sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`);
    const current = await currentEpisodeActor(transactionContext);
    const scope2 = await lockCurrentEncounter(current, args.encounterId);
    if (!args.reviewedTuple) throw new Error("Original reviewed episode tuple is required; legacy command remains unverified");
    assertEpisodeTuple(args.reviewedTuple, scope2.tuple);
    const policy = await effectiveEpisodePolicy(current.prisma, scope2.tuple.facilityId);
    const tx = current.prisma;
    const originalCommand = { ...args, actorId: current.session.itemId, tuple: scope2.tuple };
    const evidence = transitionEvidence(args.operationKey, originalCommand);
    await lockTransitionOperation(tx, evidence.operationKeyHash);
    const existing = await tx.workflowTransition.findUnique({ where: { operationKeyHash: evidence.operationKeyHash } });
    if (existing) {
      if (existing.actorReference !== current.session.itemId || !existing.result?.episodeReceipt) {
        throw new Error("Original operation is not owned or is legacy-unverified; use read-only recovery");
      }
      assertEpisodeTuple(existing.result.episodeReceipt.tuple, scope2.tuple);
      const replay = await replayTransition(tx, evidence, existing.aggregateType === "encounter_command" ? "encounter_command" : "encounter", args.encounterId);
      if (replay) {
        const replayed = {
          ...replay,
          startedAt: replay.startedAt ? new Date(replay.startedAt) : null,
          endedAt: replay.endedAt ? new Date(replay.endedAt) : null
        };
        return replayed;
      }
    }
    if (["closed", "cancelled"].includes(args.toStatus)) {
      if (!policy || policy.definition.operationalClosure !== "enabled") return rejectEpisodeCommand(current, scope2, policy, originalCommand, evidence, "reviewed_operational_policy_required");
      if (!args.expectedReviewFingerprint || args.expectedReviewFingerprint !== reviewFingerprint(current, scope2, policy)) {
        return rejectEpisodeCommand(current, scope2, policy, originalCommand, evidence, "stale_episode_appointment_authority_or_policy_review");
      }
    }
    const encounter = await tx.encounter.findUnique({ where: { id: args.encounterId } });
    if (!encounter || encounter.transitionVersion !== args.expectedVersion) {
      return rejectEpisodeCommand(current, scope2, policy, originalCommand, evidence, "stale_encounter_version");
    }
    if (!isEncounterTransitionAllowed(encounter.status, args.toStatus)) {
      return rejectEpisodeCommand(current, scope2, policy, originalCommand, evidence, "invalid_encounter_transition");
    }
    const now = /* @__PURE__ */ new Date();
    let appointmentTransition = null;
    if (encounter.appointmentId) {
      const appointment = scope2.appointment;
      if (args.toStatus === "in_progress" && (!appointment || !["checked_in", "in_visit"].includes(appointment.status))) {
        throw new Error("Linked appointment must be checked in before the encounter starts");
      }
      if (appointment) {
        const linkedTransition = linkedAppointmentTransition(args.toStatus, appointment.status);
        if (linkedTransition?.toStatus === "in_visit") {
          const changed2 = await tx.appointment.updateMany({ where: { id: appointment.id, transitionVersion: appointment.transitionVersion, status: appointment.status }, data: { status: "in_visit", transitionVersion: { increment: 1 } } });
          if (changed2.count !== 1) throw new Error("Linked appointment changed; review before retrying");
          appointmentTransition = { id: appointment.id, ...linkedTransition };
        }
        if (linkedTransition?.toStatus === "completed") {
          const changed2 = await tx.appointment.updateMany({
            where: { id: appointment.id, transitionVersion: appointment.transitionVersion, status: appointment.status },
            data: {
              status: "completed",
              transitionVersion: { increment: 1 },
              completedAt: now,
              bookingLockKey: `released:${appointment.id}:${now.getTime()}`
            }
          });
          if (changed2.count !== 1) throw new Error("Linked appointment changed; review before retrying");
          appointmentTransition = { id: appointment.id, ...linkedTransition };
        }
      }
    }
    const transitionVersion = encounter.transitionVersion + 1;
    const changed = await tx.encounter.updateMany({
      where: { id: encounter.id, transitionVersion: args.expectedVersion, status: encounter.status },
      data: {
        status: args.toStatus,
        transitionVersion,
        actorReference: context.session.itemId,
        ...args.toStatus === "in_progress" && !encounter.startedAt ? { startedAt: now } : {},
        ...["closed", "cancelled"].includes(args.toStatus) ? { endedAt: now } : {}
      }
    });
    if (changed.count !== 1) throw new Error("Encounter changed; review before retrying");
    const updated = await tx.encounter.findUnique({ where: { id: encounter.id } });
    const metadata = {
      source: "encounter_workflow",
      aggregateType: "encounter",
      aggregateId: encounter.id,
      fromStatus: encounter.status,
      status: updated.status,
      transitionVersion,
      reasonProvided: Boolean(reason),
      diagnosisSummaryUpdated: false,
      clinicalAuthority: "not_asserted",
      policyId: policy?.id || null,
      policyRevision: policy?.revision || null,
      descendantsClosed: false,
      admissionDischarged: false
    };
    const eventType = `encounter.${updated.status}`;
    const audit = await tx.clinicalAuditLog.create({
      data: {
        eventType,
        occurredAt: now,
        actorType: "staff_user",
        actorReference: context.session.itemId,
        facilityId: encounter.facilityId,
        patientId: encounter.patientId,
        appointmentId: encounter.appointmentId,
        encounterId: encounter.id,
        metadata,
        createdAt: now
      }
    });
    if (appointmentTransition) {
      await tx.clinicalAuditLog.create({
        data: {
          eventType: `appointment.${appointmentTransition.toStatus}`,
          occurredAt: now,
          actorType: "staff_user",
          actorReference: context.session.itemId,
          facilityId: encounter.facilityId,
          patientId: encounter.patientId,
          appointmentId: appointmentTransition.id,
          encounterId: encounter.id,
          metadata: {
            source: "encounter_workflow",
            fromStatus: appointmentTransition.fromStatus,
            toStatus: appointmentTransition.toStatus
          },
          createdAt: now
        }
      });
    }
    const outbox = await tx.clinicalOutboxEvent.create({
      data: {
        eventKey: `encounter:${encounter.id}:v${transitionVersion}:${updated.status}`,
        eventType,
        aggregateType: "encounter",
        aggregateId: encounter.id,
        status: "recorded",
        attempts: 0,
        nextAttemptAt: null,
        facilityId: encounter.facilityId,
        patientId: encounter.patientId,
        appointmentId: encounter.appointmentId,
        encounterId: encounter.id,
        payload: metadata,
        createdAt: now
      }
    });
    const result8 = {
      id: updated.id,
      encounterNumber: updated.encounterNumber,
      fromStatus: encounter.status,
      status: updated.status,
      transitionVersion: updated.transitionVersion,
      startedAt: updated.startedAt || null,
      endedAt: updated.endedAt || null,
      outcome: "accepted",
      episodeReceipt: {
        tuple: scope2.tuple,
        originalCommand,
        policy: policyProjection(policy),
        actorId: current.session.itemId,
        accepted: true,
        roleId: current.session.data.role.id,
        securityVersion: current.session.data.securityVersion,
        appointmentAcknowledgement: appointmentTransition ? { ...appointmentTransition, version: scope2.appointment.transitionVersion + 1 } : null,
        clinicalAuthority: "not_asserted",
        descendantsClosed: false,
        admissionDischarged: false
      },
      replayed: false
    };
    await recordTransition(tx, {
      evidence,
      aggregateType: "encounter",
      aggregateId: encounter.id,
      fromStatus: encounter.status,
      toStatus: updated.status,
      fromVersion: encounter.transitionVersion,
      toVersion: updated.transitionVersion,
      actorReference: context.session.itemId,
      facilityId: encounter.facilityId,
      patientId: encounter.patientId,
      auditLogId: audit.id,
      outboxEventId: outbox.id,
      result: result8,
      occurredAt: now
    });
    return result8;
  }, { timeout: 3e4 });
}
var import_node_crypto9, import_client8, OPERATION_KEY;
var init_manageEncounter = __esm({
  "features/keystone/mutations/clinical/manageEncounter.ts"() {
    "use strict";
    import_node_crypto9 = require("node:crypto");
    import_client8 = require("@prisma/client");
    init_episodeFence();
    init_episodePolicy();
    init_episodeWorkflows();
    init_encounterPolicy();
    init_transitionEvidence();
    OPERATION_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,199}$/;
  }
});

// features/keystone/mutations/clinical/episodeChildWorkspace.ts
async function episodeChildWorkspace(_root, args, context) {
  const take = args.take ?? 25;
  if (!Object.hasOwn(episodeChildModels, args.model) || !Number.isInteger(take) || take < 1 || take > 25) throw new Error("Episode child page is invalid");
  return context.transaction(async (tx) => {
    const current = await currentEpisodeActor(tx);
    if (args.model === "InsuranceClaim" && !current.session.data.role.canManageBilling && !current.session.data.role.canAccessAllClinicalData) throw new Error("Private claim evidence requires separate billing authority");
    const scope2 = await lockCurrentEncounter(current, args.encounterId);
    const list64 = current.query[args.model];
    const where = { facility: { id: { equals: scope2.tuple.facilityId } }, patient: { id: { equals: scope2.tuple.patientId } }, encounter: { id: { equals: args.encounterId } } };
    let continuation = where;
    if (args.cursorId) {
      const cursor = (await list64.findMany({ where: { AND: [where, { id: { equals: args.cursorId } }] }, take: 1, query: "id createdAt" }))[0];
      if (!cursor) throw new Error("Episode child cursor is stale or unavailable");
      continuation = { AND: [where, { OR: [{ createdAt: { gt: cursor.createdAt } }, { createdAt: { equals: cursor.createdAt }, id: { gt: cursor.id } }] }] };
    }
    const rows2 = await list64.findMany({
      where: continuation,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: take + 1,
      query: "id status transitionVersion createdAt"
    });
    const count = await list64.count({ where });
    let ownedHistory = [];
    let nextHistoryVersion = null;
    if (args.childId) {
      if (args.beforeChildVersion != null && (!Number.isInteger(args.beforeChildVersion) || args.beforeChildVersion < 1)) throw new Error("Owned child history version is invalid");
      const child = (await list64.findMany({ where: { AND: [where, { id: { equals: args.childId } }] }, take: 1, query: "id" }))[0];
      if (!child) throw new Error("Child history is not accessible in this episode");
      const aggregateTypes = { Admission: "admission", MedicalOrder: "medical_order", LabResult: "lab_result", Prescription: "prescription", Procedure: "procedure", CarePlan: "care_plan", InsuranceClaim: "insurance_claim", ClinicalDocument: "clinical_document", Specimen: "specimen" };
      const history = await current.prisma.workflowTransition.findMany({
        where: {
          aggregateType: aggregateTypes[args.model],
          aggregateId: args.childId,
          actorReference: current.session.itemId,
          facilityId: scope2.tuple.facilityId,
          patientId: scope2.tuple.patientId,
          ...args.beforeChildVersion ? { toVersion: { lt: args.beforeChildVersion } } : {}
        },
        orderBy: { toVersion: "desc" },
        take: take + 1,
        select: { id: true, fromStatus: true, toStatus: true, fromVersion: true, toVersion: true, occurredAt: true }
      });
      ownedHistory = history.slice(0, take);
      nextHistoryVersion = history.length > take ? history[take - 1].toVersion : null;
    }
    return {
      model: args.model,
      childId: args.childId || null,
      ownedHistory,
      nextHistoryVersion,
      historyBoundary: "owned_transition_receipts_only_not_complete_clinical_or_supersession_history",
      rows: rows2.slice(0, take),
      count,
      nextCursor: rows2.length > take ? rows2[take - 1].id : null,
      encounterStatus: scope2.encounter.status,
      encounterVersion: scope2.encounter.transitionVersion,
      interpretation: "owned_scoped_child_state_not_clinical_readiness_or_cascade"
    };
  }, { isolationLevel: "Serializable", timeout: 3e4 });
}
var init_episodeChildWorkspace = __esm({
  "features/keystone/mutations/clinical/episodeChildWorkspace.ts"() {
    "use strict";
    init_episodeFence();
  }
});

// features/keystone/mutations/clinical/labResultRecovery.ts
function assertLabTuple(actual, expected) {
  if (tupleKeys.some((key2) => !actual[key2] || actual[key2] !== expected[key2])) throw denied();
}
function originalLabReceiptKey(operationKeyHash) {
  return transitionEvidence(`lab-result-original:${operationKeyHash}`, {}).operationKeyHash;
}
function normalizedLabEvidence(command) {
  const { operationKey, ...body } = command;
  return transitionEvidence(operationKey, { ...body, resultValue: command.resultValue.trim(), referenceRange: String(command.referenceRange ?? "").trim() });
}
function rawLabRequestHash(command) {
  return transitionEvidence(command.operationKey, command).requestHash;
}
function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
}
async function authorizeLabTuple(context, tuple) {
  const parent = await context.query.Encounter.findOne({ where: { id: tuple.encounterId }, query: "id facility { id } patient { id } provider { id }" });
  if (!parent?.provider?.id || parent.facility?.id !== tuple.facilityId || parent.patient?.id !== tuple.patientId) throw denied();
  await lockEpisodeFacility(context, tuple.facilityId, parent.provider.id);
  await context.prisma.$queryRaw(import_client9.Prisma.sql`SELECT "id" FROM "Encounter" WHERE "id" = ${tuple.encounterId} FOR SHARE`);
  const current = await context.query.Encounter.findOne({ where: { id: tuple.encounterId }, query: "id facility { id } patient { id } provider { id }" });
  if (!current || current.facility?.id !== tuple.facilityId || current.patient?.id !== tuple.patientId || current.provider?.id !== parent.provider.id) throw denied();
  await lockEpisodePatientProvider(context, tuple.facilityId, tuple.patientId, parent.provider.id);
  await context.prisma.$queryRaw(import_client9.Prisma.sql`SELECT "id" FROM "MedicalOrder" WHERE "id" = ${tuple.medicalOrderId} FOR SHARE`);
  const order = await context.query.MedicalOrder.findOne({ where: { id: tuple.medicalOrderId }, query: "id orderType facility { id } patient { id } encounter { id } orderingProvider { id }" });
  if (!order || order.orderType !== "lab" || order.facility?.id !== tuple.facilityId || order.patient?.id !== tuple.patientId || order.encounter?.id !== tuple.encounterId || !order.orderingProvider?.id) throw denied();
  await lockEpisodePatientProvider(context, tuple.facilityId, tuple.patientId, order.orderingProvider.id);
  await context.prisma.$queryRaw(import_client9.Prisma.sql`SELECT "id" FROM "LabTest" WHERE "id" = ${tuple.labTestId} FOR SHARE`);
  if (!await context.query.LabTest.findOne({ where: { id: tuple.labTestId }, query: "id" })) throw denied();
}
async function authorizedHeader(context, header) {
  await authorizeLabTuple(context, header);
  await context.prisma.$queryRaw(import_client9.Prisma.sql`SELECT "id" FROM "LabResult" WHERE "id" = ${header.id} FOR SHARE`);
  const visible = await context.query.LabResult.findOne({ where: { id: header.id }, query: scopeSelection });
  if (!visible || visible.facility?.id !== header.facilityId || visible.patient?.id !== header.patientId || visible.encounter?.id !== header.encounterId || visible.medicalOrder?.id !== header.medicalOrderId || visible.labTest?.id !== header.labTestId) throw denied();
  const current = await context.prisma.labResult.findUnique({ where: { id: header.id }, select: headerSelect });
  if (!current) throw denied();
  assertLabTuple(current, header);
  if (current.operationKeyHash !== header.operationKeyHash || current.requestHash !== header.requestHash || current.supersedesResultId !== header.supersedesResultId) throw denied();
  if (current.supersedesResultId) {
    await context.prisma.$queryRaw(import_client9.Prisma.sql`SELECT "id" FROM "LabResult" WHERE "id" = ${current.supersedesResultId} FOR SHARE`);
    const source = await context.query.LabResult.findOne({ where: { id: current.supersedesResultId }, query: `${scopeSelection} version` });
    if (!source || source.version + 1 !== current.version || source.facility?.id !== current.facilityId || source.patient?.id !== current.patientId || source.encounter?.id !== current.encounterId || source.medicalOrder?.id !== current.medicalOrderId || source.labTest?.id !== current.labTestId) throw denied();
  }
  return current;
}
async function receiptHeader(context, header) {
  const receipt = await context.prisma.workflowTransition.findUnique({
    where: { operationKeyHash: originalLabReceiptKey(header.operationKeyHash) },
    select: { id: true, aggregateType: true, aggregateId: true, actorReference: true, facilityId: true, patientId: true, requestHash: true, toStatus: true, toVersion: true, auditLogId: true, outboxEventId: true }
  });
  if (receipt && (receipt.aggregateType !== "lab_result_creation" || receipt.aggregateId !== header.id || receipt.facilityId !== header.facilityId || receipt.patientId !== header.patientId || receipt.requestHash !== header.requestHash)) throw denied();
  const origin = receipt ? null : await context.prisma.clinicalAuditLog.findFirst({ where: {
    eventType: "lab_result.created",
    facilityId: header.facilityId,
    patientId: header.patientId,
    encounterId: header.encounterId,
    metadata: { path: ["aggregateId"], equals: header.id }
  }, select: { actorReference: true } });
  const owner = receipt?.actorReference || origin?.actorReference || (header.transitionVersion === 1 ? header.actorReference : null);
  return { receipt, owner };
}
function projectOriginalLabReceipt(value, header, rawHash) {
  const result8 = object(value);
  const receipt = object(result8?.labAcknowledgement);
  const command = object(receipt?.originalCommand);
  if (!result8 || !receipt || !command || result8.id !== header.id || typeof result8.status !== "string" || !Number.isInteger(result8.transitionVersion) || receipt.schemaVersion !== 1 || receipt.recordVersion !== header.version || receipt.requestHash !== header.requestHash || receipt.operationKeyHash !== header.operationKeyHash) throw denied();
  if (result8.status !== (header.supersedesResultId ? "corrected" : "preliminary") || result8.transitionVersion !== (header.supersedesResultId ? 2 : 1)) throw denied();
  if (header.supersedesResultId && (!Number.isInteger(receipt.sourceRecordVersion) || Number(receipt.sourceRecordVersion) < 1 || Number(receipt.sourceRecordVersion) + 1 !== header.version)) throw denied();
  const tuple = object(receipt.tuple) || command;
  for (const key2 of tupleKeys) if (tuple[key2] !== header[key2]) throw denied();
  if (header.supersedesResultId ? command.resultId !== header.supersedesResultId : Object.hasOwn(command, "resultId")) throw denied();
  if (typeof command.operationKey !== "string" || transitionEvidence(command.operationKey, {}).operationKeyHash !== header.operationKeyHash || typeof receipt.rawRequestHash !== "string") throw denied();
  const { operationKey, ...body } = command;
  if (typeof command.resultValue !== "string" || command.referenceRange != null && typeof command.referenceRange !== "string" || transitionEvidence(operationKey, command).requestHash !== receipt.rawRequestHash || rawHash && rawHash !== receipt.rawRequestHash) throw new Error("Original lab command body does not match");
  const normalized = { ...body, resultValue: command.resultValue.trim(), referenceRange: String(command.referenceRange ?? "").trim() };
  if (transitionEvidence(operationKey, normalized).requestHash !== header.requestHash) throw denied();
  return result8;
}
async function recoverLabAcknowledgement(port, input) {
  const header = await port.lookup();
  if (!header) return null;
  if (input.tuple) assertLabTuple(header, input.tuple);
  if (header.requestHash !== input.evidence.requestHash || header.operationKeyHash !== input.evidence.operationKeyHash || header.supersedesResultId !== input.supersedesResultId) throw denied();
  const current = await port.authorize(header);
  assertLabTuple(current, header);
  if (current.id !== header.id || current.operationKeyHash !== header.operationKeyHash || current.requestHash !== header.requestHash || current.supersedesResultId !== header.supersedesResultId) throw denied();
  const { receipt, owner } = await port.origin(current);
  if (owner !== input.actorId) throw denied();
  if (!receipt) return {
    id: current.id,
    status: current.status,
    transitionVersion: current.transitionVersion,
    replayed: true,
    originalAcknowledgement: {
      state: "legacy_identity_only_original_body_status_version_unknown",
      original: null,
      current: { status: current.status, transitionVersion: current.transitionVersion }
    }
  };
  const original = projectOriginalLabReceipt(await port.readBody(current, receipt), current, input.rawHash);
  if (original.status !== receipt.toStatus || original.transitionVersion !== receipt.toVersion) throw denied();
  return {
    id: current.id,
    status: String(original.status),
    transitionVersion: Number(original.transitionVersion),
    replayed: true,
    originalAcknowledgement: { state: "accepted_original", original: { id: original.id, status: original.status, transitionVersion: original.transitionVersion } }
  };
}
function nativeAcknowledgementPort(context, evidence) {
  return {
    lookup: () => context.prisma.labResult.findUnique({ where: { operationKeyHash: evidence.operationKeyHash }, select: headerSelect }),
    authorize: (header) => authorizedHeader(context, header),
    origin: (header) => receiptHeader(context, header),
    readBody: async (header, receipt) => (await context.prisma.workflowTransition.findFirst({ where: {
      id: receipt.id,
      aggregateType: "lab_result_creation",
      aggregateId: header.id,
      actorReference: context.session.itemId,
      facilityId: header.facilityId,
      patientId: header.patientId,
      requestHash: evidence.requestHash
    }, select: { result: true } }))?.result
  };
}
async function replayAcceptedLabResult(context, tuple, evidence, rawCommand) {
  await authorizeLabTuple(context, tuple);
  return recoverLabAcknowledgement(nativeAcknowledgementPort(context, evidence), {
    actorId: context.session.itemId,
    evidence,
    rawHash: rawLabRequestHash(rawCommand),
    tuple,
    supersedesResultId: null
  });
}
async function replayAcceptedLabTransition(context, resultId, evidence, command) {
  const header = await context.prisma.labResult.findUnique({ where: { id: resultId }, select: headerSelect });
  if (!header) throw denied();
  const authorized = await authorizedHeader(context, header);
  const receipt = await context.prisma.workflowTransition.findUnique({
    where: { operationKeyHash: evidence.operationKeyHash },
    select: { id: true, aggregateType: true, aggregateId: true, actorReference: true, facilityId: true, patientId: true, requestHash: true, toStatus: true, toVersion: true }
  });
  if (!receipt) return null;
  if (receipt.aggregateType !== "lab_result" || receipt.aggregateId !== authorized.id || receipt.actorReference !== context.session?.itemId || receipt.facilityId !== authorized.facilityId || receipt.patientId !== authorized.patientId || receipt.requestHash !== evidence.requestHash) throw denied();
  const stored = await context.prisma.workflowTransition.findFirst({ where: {
    id: receipt.id,
    aggregateType: "lab_result",
    aggregateId: authorized.id,
    actorReference: context.session.itemId,
    facilityId: authorized.facilityId,
    patientId: authorized.patientId,
    requestHash: evidence.requestHash
  }, select: { result: true } });
  const result8 = object(stored?.result);
  if (!result8 || result8.id !== authorized.id || result8.status !== receipt.toStatus || result8.transitionVersion !== receipt.toVersion) throw denied();
  const originalCommand = object(result8.originalCommand);
  if (originalCommand && (originalCommand.operationKey !== command.operationKey || originalCommand.resultId !== command.resultId || originalCommand.toStatus !== command.toStatus || originalCommand.expectedVersion !== command.expectedVersion || originalCommand.actorReference !== context.session.itemId)) throw denied();
  return {
    id: authorized.id,
    status: receipt.toStatus,
    transitionVersion: receipt.toVersion,
    replayed: true,
    originalAcknowledgement: {
      state: originalCommand ? "accepted_original" : "legacy_transition_command_unknown",
      originalStatus: receipt.toStatus,
      originalTransitionVersion: receipt.toVersion
    }
  };
}
async function persistOriginalLabReceipt(prisma, row, evidence, command, actorReference, tuple, recordVersion = 1, sourceRecordVersion) {
  const result8 = { ...row, replayed: false, labAcknowledgement: {
    schemaVersion: 1,
    originalCommand: command,
    tuple: {
      facilityId: tuple.facilityId,
      patientId: tuple.patientId,
      encounterId: tuple.encounterId,
      medicalOrderId: tuple.medicalOrderId,
      labTestId: tuple.labTestId
    },
    recordVersion,
    ...sourceRecordVersion != null ? { sourceRecordVersion } : {},
    operationKeyHash: evidence.operationKeyHash,
    requestHash: evidence.requestHash,
    rawRequestHash: rawLabRequestHash(command)
  } };
  const eventKey = row.transitionVersion === 1 ? `lab_result:${tuple.facilityId}:create:${evidence.operationKeyHash}` : `lab_result:${row.id}:v${row.transitionVersion}:${row.status}`;
  const outbox = await prisma.clinicalOutboxEvent.findUnique({ where: { eventKey }, select: { id: true, aggregateType: true, aggregateId: true, facilityId: true, patientId: true, encounterId: true } });
  const audit = await prisma.clinicalAuditLog.findFirst({ where: {
    eventType: row.transitionVersion === 1 ? "lab_result.created" : `lab_result.${row.status}`,
    actorReference,
    facilityId: tuple.facilityId,
    patientId: tuple.patientId,
    encounterId: tuple.encounterId,
    AND: [{ metadata: { path: ["aggregateId"], equals: row.id } }, { metadata: { path: ["transitionVersion"], equals: row.transitionVersion } }]
  }, select: { id: true } });
  if (!audit || !outbox || outbox.aggregateType !== "lab_result" || outbox.aggregateId !== row.id || outbox.facilityId !== tuple.facilityId || outbox.patientId !== tuple.patientId || outbox.encounterId !== tuple.encounterId) throw new Error("Original lab acknowledgement lacks correlated native audit/outbox evidence");
  await recordTransition(prisma, {
    evidence: { operationKeyHash: originalLabReceiptKey(evidence.operationKeyHash), requestHash: evidence.requestHash },
    aggregateType: "lab_result_creation",
    aggregateId: row.id,
    fromStatus: "not_recorded",
    toStatus: row.status,
    fromVersion: 0,
    toVersion: row.transitionVersion,
    actorReference,
    facilityId: tuple.facilityId,
    patientId: tuple.patientId,
    auditLogId: audit.id,
    outboxEventId: outbox.id,
    occurredAt: /* @__PURE__ */ new Date(),
    result: result8
  });
}
async function replayAcceptedLabCorrection(context, evidence, command) {
  return recoverLabAcknowledgement(nativeAcknowledgementPort(context, evidence), {
    actorId: context.session.itemId,
    evidence,
    rawHash: rawLabRequestHash(command),
    supersedesResultId: command.resultId
  });
}
async function labResultReadback(_root, args, context) {
  const command = args.command || args.correctionCommand;
  if ([args.resultId, args.command, args.correctionCommand].filter(Boolean).length !== 1 || args.beforeVersion != null && (!Number.isInteger(args.beforeVersion) || args.beforeVersion < 1)) throw new Error("Lab readback request is invalid");
  return context.transaction(async (tx) => {
    await tx.prisma.$executeRaw(import_client9.Prisma.sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`);
    const current = await currentEpisodeActor(tx);
    if (args.command) await authorizeLabTuple(current, args.command);
    if (args.correctionCommand) {
      const source = await current.query.LabResult.findOne({ where: { id: args.correctionCommand.resultId }, query: "id" });
      if (!source) throw denied();
      const sourceHeader = await current.prisma.labResult.findUnique({ where: { id: source.id }, select: headerSelect });
      if (!sourceHeader) throw denied();
      await authorizedHeader(current, sourceHeader);
    }
    const header = await current.prisma.labResult.findUnique({ where: args.resultId ? { id: args.resultId } : { operationKeyHash: transitionEvidence(command.operationKey, {}).operationKeyHash }, select: headerSelect });
    if (!header) {
      if (args.resultId) throw denied();
      return { outcome: "unknown", original: null, current: null, interpretation: "not_rejection_or_rollback_keep_original_intent" };
    }
    if (args.command) {
      assertLabTuple(header, args.command);
      if (header.supersedesResultId) throw denied();
    }
    if (command && normalizedLabEvidence(command).requestHash !== header.requestHash) throw denied();
    if (args.correctionCommand && header.supersedesResultId !== args.correctionCommand.resultId) throw denied();
    const authorized = await authorizedHeader(current, header);
    const { receipt, owner } = await receiptHeader(current, authorized);
    if (command && owner !== current.session?.itemId) throw denied();
    let original = null;
    if (receipt && owner === current.session?.itemId) {
      const stored = await current.prisma.workflowTransition.findFirst({ where: {
        id: receipt.id,
        aggregateType: "lab_result_creation",
        aggregateId: authorized.id,
        facilityId: authorized.facilityId,
        patientId: authorized.patientId,
        actorReference: current.session.itemId,
        requestHash: authorized.requestHash
      }, select: { result: true } });
      original = projectOriginalLabReceipt(stored?.result, authorized, command ? rawLabRequestHash(command) : void 0);
      if (original.status !== receipt.toStatus || original.transitionVersion !== receipt.toVersion) throw denied();
    }
    let knownLegacyOriginalHeader = null;
    if (!receipt && owner && owner === current.session?.itemId) {
      const origin = await current.prisma.clinicalAuditLog.findFirst({ where: {
        eventType: "lab_result.created",
        actorReference: owner,
        facilityId: authorized.facilityId,
        patientId: authorized.patientId,
        encounterId: authorized.encounterId,
        metadata: { path: ["aggregateId"], equals: authorized.id }
      }, select: { id: true, metadata: true } });
      const metadata = object(origin?.metadata);
      if (origin && metadata?.source === "controlled_clinical_hook" && metadata.aggregateId === authorized.id && typeof metadata.status === "string" && Number.isInteger(metadata.transitionVersion)) {
        knownLegacyOriginalHeader = {
          auditId: origin.id,
          id: authorized.id,
          status: metadata.status,
          transitionVersion: metadata.transitionVersion,
          originalRawBody: "unknown_not_backfilled",
          interpretation: "immutable_creation_audit_header_only_not_full_command_acknowledgement"
        };
      }
    }
    const value = await current.query.LabResult.findOne({ where: { id: authorized.id }, query: `${scopeSelection} resultNumber status version transitionVersion resultValue referenceRange abnormalFlag resultedAt acknowledgedAt metadata supersedesResult { id } supersedingResult { id }` });
    if (!value || value.resultValue == null) throw denied();
    const history = await current.prisma.workflowTransition.findMany({
      where: {
        aggregateType: "lab_result",
        aggregateId: authorized.id,
        facilityId: authorized.facilityId,
        patientId: authorized.patientId,
        actorReference: current.session.itemId,
        ...args.beforeVersion ? { toVersion: { lt: args.beforeVersion } } : {}
      },
      orderBy: { toVersion: "desc" },
      take: 26,
      select: { id: true, fromStatus: true, toStatus: true, fromVersion: true, toVersion: true, occurredAt: true, result: true }
    });
    return {
      outcome: original ? "accepted" : owner === current.session?.itemId ? "legacy_original_body_unknown" : "current_only_original_not_owned",
      original,
      current: value,
      knownLegacyOriginalHeader,
      creationReceipt: receipt && owner === current.session?.itemId ? {
        id: receipt.id,
        auditLogId: receipt.auditLogId,
        outboxEventId: receipt.outboxEventId,
        originalStatus: receipt.toStatus,
        originalTransitionVersion: receipt.toVersion
      } : null,
      ownedHistory: history.slice(0, 25),
      nextVersion: history.length > 25 ? history[24].toVersion : null,
      interpretation: "operational_transcription_not_laboratory_truth_or_complete_clinical_history"
    };
  }, { timeout: 3e4 });
}
var import_client9, tupleKeys, headerSelect, scopeSelection, denied;
var init_labResultRecovery = __esm({
  "features/keystone/mutations/clinical/labResultRecovery.ts"() {
    "use strict";
    import_client9 = require("@prisma/client");
    init_transitionEvidence();
    init_episodeFence();
    tupleKeys = ["facilityId", "patientId", "encounterId", "medicalOrderId", "labTestId"];
    headerSelect = {
      id: true,
      status: true,
      transitionVersion: true,
      version: true,
      operationKeyHash: true,
      requestHash: true,
      actorReference: true,
      facilityId: true,
      patientId: true,
      encounterId: true,
      medicalOrderId: true,
      labTestId: true,
      supersedesResultId: true
    };
    scopeSelection = "id facility { id } patient { id } encounter { id } medicalOrder { id } labTest { id }";
    denied = () => new Error(EPISODE_DENIED);
  }
});

// features/keystone/security/currentHospitalActor.ts
async function currentHospitalActor(context, capabilities) {
  const session = context.session;
  if (session?.listKey !== "User" || !session.itemId) throw new Error("Current human authority could not be verified");
  const rows2 = await context.prisma.$queryRaw(import_client10.Prisma.sql`
    SELECT u."id" FROM "User" u JOIN "Role" r ON r."id" = u."role"
    WHERE u."id" = ${session.itemId} FOR SHARE OF u, r`);
  if (rows2.length !== 1) throw new Error("Current human authority could not be verified");
  const user = await context.prisma.user.findUnique({ where: { id: session.itemId }, select: { id: true, name: true, securityVersion: true, role: true } });
  if (!user?.role || !Number.isInteger(session.data?.securityVersion) || session.data.securityVersion !== user.securityVersion || !capabilities.some((capability) => user.role?.[capability] === true)) {
    throw new Error("Current human capability or credential version could not be verified");
  }
  return context.withSession({ itemId: user.id, listKey: "User", data: { name: user.name, securityVersion: user.securityVersion, role: user.role } });
}
async function lockCurrentHospitalFacility(context, facilityId) {
  await context.prisma.$queryRaw(import_client10.Prisma.sql`SELECT "id" FROM "Facility" WHERE "id" = ${facilityId} FOR SHARE`);
  const facility = await context.query.Facility.findOne({ where: { id: facilityId }, query: "id status" });
  if (!facility || facility.status !== "active") throw new Error("Current facility scope could not be verified");
  const staff = await context.prisma.$queryRaw(import_client10.Prisma.sql`SELECT "A" FROM "_Facility_staff" WHERE "A" = ${facilityId} AND "B" = ${context.session.itemId} FOR SHARE`);
  if (!context.session?.data.role?.canAccessAllClinicalData && staff.length !== 1) throw new Error("Current facility membership could not be verified");
}
var import_client10;
var init_currentHospitalActor = __esm({
  "features/keystone/security/currentHospitalActor.ts"() {
    "use strict";
    import_client10 = require("@prisma/client");
  }
});

// features/keystone/mutations/clinical/recordConsentDecision.ts
async function recordConsentDecision(_root, { data }, context) {
  const role = context.session?.data.role;
  if (!role?.canManagePatients && !role?.canManageIntake) {
    throw new Error("Not authorized to record consent decisions");
  }
  await scopedFacilityPatient(context, data.facilityId, data.patientId);
  const decision = bounded2(data.decision, "Consent decision", 40, true);
  if (!["granted", "declined", "withdrawn"].includes(decision)) throw new Error("Consent decision is invalid");
  const consentType = bounded2(data.consentType, "Consent type", 100, true);
  const policyVersion = bounded2(data.policyVersion, "Policy version", 100, true);
  const statementKey = bounded2(data.statementKey, "Statement key", 150, true);
  const reasonCode = bounded2(data.reasonCode, "Consent reason code", 80, decision === "withdrawn");
  const normalized = {
    operationKey: data.operationKey,
    facilityId: data.facilityId,
    patientId: data.patientId,
    consentType,
    policyVersion,
    statementKey,
    decision,
    reasonCode,
    supersedesConsentId: data.supersedesConsentId || null
  };
  const evidence = operationEvidence(normalized);
  return context.transaction(async (transactionContext) => {
    const currentContext = await currentHospitalActor(transactionContext, ["canManagePatients", "canManageIntake"]);
    await lockCurrentHospitalFacility(currentContext, data.facilityId);
    await lockEpisodePatientProvider(currentContext, data.facilityId, data.patientId);
    await scopedFacilityPatient(currentContext, data.facilityId, data.patientId);
    const prisma = currentContext.sudo().prisma;
    await lockOperation(prisma, "consent-decision", evidence.operationKeyHash);
    await prisma.$queryRaw(
      import_client11.Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`consent:${data.facilityId}:${data.patientId}:${consentType}`}, 0))::text AS "lock"`
    );
    const replay = await prisma.patientConsent.findUnique({ where: { operationKeyHash: evidence.operationKeyHash } });
    if (replay) {
      if (replay.requestHash !== evidence.requestHash) throw new Error("Operation key was reused with a different payload");
      if (replay.facilityId !== data.facilityId || replay.patientId !== data.patientId || replay.evidence?.actorReference !== currentContext.session.itemId) throw new Error("Original consent owner could not be verified; legacy evidence requires review");
      return { id: replay.id, decision: replay.decision, effectiveAt: replay.effectiveAt, replayed: true };
    }
    if (data.supersedesConsentId) await prisma.$queryRaw(import_client11.Prisma.sql`SELECT "id" FROM "PatientConsent" WHERE "id" = ${data.supersedesConsentId} FOR SHARE`);
    const previous = data.supersedesConsentId ? await currentContext.query.PatientConsent.findOne({
      where: { id: data.supersedesConsentId },
      query: "id consentType decision facility { id } patient { id } supersedingDecision { id }"
    }) : null;
    if (data.supersedesConsentId && (!previous || previous.facility?.id !== data.facilityId || previous.patient?.id !== data.patientId || previous.consentType !== consentType || previous.supersedingDecision)) throw new Error("Superseded consent is not the current accessible decision");
    if (decision === "withdrawn" && (!previous || previous.decision !== "granted")) {
      throw new Error("Withdrawal must supersede the current granted consent decision");
    }
    const currentDecisions = await prisma.patientConsent.findMany({
      where: {
        facilityId: data.facilityId,
        patientId: data.patientId,
        consentType,
        supersedingDecision: null
      },
      orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }],
      take: 2,
      select: { id: true }
    });
    if (currentDecisions.length > 1) throw new Error("Consent history is ambiguous and requires administrator review");
    if (currentDecisions[0] && currentDecisions[0].id !== previous?.id) {
      throw new Error("A current consent decision already exists; select it as the superseded decision");
    }
    if (previous) {
      const current = await prisma.patientConsent.findUnique({
        where: { id: previous.id },
        include: { supersedingDecision: { select: { id: true } } }
      });
      if (!current || current.supersedingDecision) throw new Error("Consent decision changed; refresh before retrying");
    }
    const now = /* @__PURE__ */ new Date();
    const consent = await prisma.patientConsent.create({
      data: {
        ...evidence,
        consentType,
        policyVersion,
        statementKey,
        decision,
        effectiveAt: now,
        grantedAt: decision === "granted" ? now : null,
        captureMethod: "staff_recorded",
        reasonCode,
        facilityId: data.facilityId,
        patientId: data.patientId,
        supersedesId: previous?.id || null,
        evidence: { source: "consent_decision_workflow", actorReference: currentContext.session.itemId, decision, reasonProvided: Boolean(reasonCode) },
        createdAt: now
      }
    });
    const metadata = {
      source: "consent_decision_workflow",
      aggregateId: consent.id,
      consentType,
      decision,
      supersedesConsentId: previous?.id || null,
      reasonProvided: Boolean(reasonCode)
    };
    const audit = await prisma.clinicalAuditLog.create({ data: {
      eventType: `consent.${decision}`,
      occurredAt: now,
      actorType: "staff_user",
      actorReference: context.session.itemId,
      facilityId: data.facilityId,
      patientId: data.patientId,
      consentId: consent.id,
      metadata,
      createdAt: now
    } });
    await prisma.clinicalOutboxEvent.create({ data: {
      eventKey: `patient_consent:${consent.id}:${decision}`,
      eventType: `consent.${decision}`,
      aggregateType: "patient_consent",
      aggregateId: consent.id,
      contractVersion: "hospital.event.v1",
      deliveryMode: "internal",
      status: "recorded",
      attempts: 0,
      nextAttemptAt: null,
      facilityId: data.facilityId,
      patientId: data.patientId,
      payload: { ...metadata, auditLogId: audit.id },
      createdAt: now
    } });
    return { id: consent.id, decision: consent.decision, effectiveAt: consent.effectiveAt, replayed: false };
  }, { timeout: 3e4 });
}
var import_client11;
var init_recordConsentDecision = __esm({
  "features/keystone/mutations/clinical/recordConsentDecision.ts"() {
    "use strict";
    init_currentHospitalActor();
    init_episodeFence();
    import_client11 = require("@prisma/client");
    init_evidence();
  }
});

// features/keystone/mutations/intake/transitionIntakeReview.ts
function cleanOptional4(value, maxLength = 4e3) {
  const cleaned = value?.trim();
  if (!cleaned) return null;
  if (cleaned.length > maxLength) throw new Error(`Input exceeds the ${maxLength} character limit`);
  return cleaned;
}
async function transitionIntakeReview(_root, args, context) {
  const role = context.session?.data.role;
  if (!role?.canManageIntake && !role?.canAccessAllClinicalData) {
    throw new Error("Not authorized to transition intake review");
  }
  if (!Number.isInteger(args.expectedVersion) || args.expectedVersion < 1) {
    throw new Error("Expected intake version is invalid");
  }
  const reviewNotes = cleanOptional4(args.reviewNotes);
  const evidence = transitionEvidence(args.operationKey, {
    intakeFormId: args.intakeFormId,
    toStatus: args.toStatus,
    expectedVersion: args.expectedVersion,
    reviewNotes
  });
  const scopedForm = await context.query.IntakeForm.findOne({
    where: { id: args.intakeFormId },
    query: "id"
  });
  if (!scopedForm) throw new Error("Intake form not found or not accessible");
  const sudo = context.sudo();
  return sudo.prisma.$transaction(async (tx) => {
    await lockTransitionOperation(tx, evidence.operationKeyHash);
    await tx.$queryRaw(
      import_client12.Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`intake:${args.intakeFormId}`}, 0))::text AS "lock"`
    );
    const replay = await replayTransition(tx, evidence, "intake_form", args.intakeFormId);
    if (replay) return {
      ...replay,
      reviewedAt: replay.reviewedAt ? new Date(replay.reviewedAt) : null
    };
    const form = await tx.intakeForm.findUnique({ where: { id: args.intakeFormId } });
    if (!form || form.transitionVersion !== args.expectedVersion) {
      throw new Error("Intake form changed; refresh before retrying");
    }
    if (!TRANSITIONS3[form.status]?.includes(args.toStatus)) {
      throw new Error(`Invalid intake transition from ${form.status} to ${args.toStatus}`);
    }
    if (args.toStatus === "reviewed" && !reviewNotes && !form.reviewNotes) {
      throw new Error("Review notes are required to mark intake reviewed");
    }
    const now = /* @__PURE__ */ new Date();
    const nextVersion = form.transitionVersion + 1;
    const updated = await tx.intakeForm.update({
      where: { id: form.id },
      data: {
        status: args.toStatus,
        transitionVersion: nextVersion,
        ...args.toStatus === "reviewed" ? { reviewedAt: now, reviewedById: context.session?.itemId } : {},
        ...reviewNotes ? { reviewNotes } : {}
      }
    });
    const metadata = {
      source: "intake_transition",
      aggregateType: "intake_form",
      aggregateId: form.id,
      fromStatus: form.status,
      status: updated.status,
      transitionVersion: nextVersion,
      reviewNotesProvided: Boolean(reviewNotes)
    };
    const eventType = `intake.${args.toStatus}`;
    const audit = await tx.clinicalAuditLog.create({
      data: {
        eventType,
        occurredAt: now,
        actorType: "staff_user",
        actorReference: context.session?.itemId || "",
        facilityId: form.facilityId,
        patientId: form.patientId,
        appointmentId: form.appointmentId,
        intakeFormId: form.id,
        metadata
      }
    });
    const outbox = await tx.clinicalOutboxEvent.create({
      data: {
        eventKey: `intake:${form.id}:v${nextVersion}:${updated.status}`,
        eventType,
        aggregateType: "intake_form",
        aggregateId: form.id,
        status: "recorded",
        attempts: 0,
        nextAttemptAt: null,
        facilityId: form.facilityId,
        patientId: form.patientId,
        appointmentId: form.appointmentId,
        payload: metadata,
        createdAt: now
      }
    });
    const result8 = {
      id: updated.id,
      fromStatus: form.status,
      status: updated.status,
      transitionVersion: updated.transitionVersion,
      reviewedAt: updated.reviewedAt || null,
      reviewedById: updated.reviewedById || null,
      replayed: false
    };
    await recordTransition(tx, {
      evidence,
      aggregateType: "intake_form",
      aggregateId: form.id,
      fromStatus: form.status,
      toStatus: updated.status,
      fromVersion: form.transitionVersion,
      toVersion: updated.transitionVersion,
      actorReference: context.session?.itemId || "",
      facilityId: form.facilityId,
      patientId: form.patientId,
      auditLogId: audit.id,
      outboxEventId: outbox.id,
      result: result8,
      occurredAt: now
    });
    return result8;
  }, { isolationLevel: "Serializable", timeout: 3e4 });
}
var import_client12, TRANSITIONS3;
var init_transitionIntakeReview = __esm({
  "features/keystone/mutations/intake/transitionIntakeReview.ts"() {
    "use strict";
    import_client12 = require("@prisma/client");
    init_transitionEvidence();
    TRANSITIONS3 = {
      submitted: ["needs_review", "reviewed"],
      needs_review: ["reviewed"],
      reviewed: ["needs_review"],
      // Delivery and patient completion are not staff-review transitions. Public
      // submission claims the one-time bearer and moves any active form directly
      // to submitted; retained legacy delivery states remain read-only here.
      not_sent: [],
      sent: [],
      in_progress: []
    };
  }
});

// features/keystone/mutations/registration/registrationPolicy.ts
function requiredBoundedText(value, label, maxLength) {
  const normalized = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!normalized || normalized.length > maxLength || CONTROL_CHARACTERS.test(normalized)) {
    throw new Error(`${label} is invalid for patient registration`);
  }
  return normalized;
}
function normalizeName(value, label) {
  return requiredBoundedText(value, label, 100);
}
function normalizeEmail(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.length > 254 || CONTROL_CHARACTERS.test(normalized) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error("Email is invalid for patient registration");
  }
  return normalized;
}
function normalizePhone(value) {
  const input = String(value ?? "").trim();
  if (!input) return null;
  if (CONTROL_CHARACTERS.test(input)) throw new Error("Phone is invalid for patient registration");
  const digits = input.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) {
    throw new Error("Phone is invalid for patient registration");
  }
  return input.startsWith("+") ? `+${digits}` : digits;
}
function normalizeDateOfBirth(value, now) {
  const input = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    throw new Error("Date of birth must use YYYY-MM-DD for patient registration");
  }
  const parsed = /* @__PURE__ */ new Date(`${input}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== input) {
    throw new Error("Date of birth is not a real calendar date");
  }
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (parsed > today || parsed.getUTCFullYear() < 1850) {
    throw new Error("Date of birth is outside the supported registration range");
  }
  return parsed.toISOString();
}
function normalizeRegistrationInput(input, now = /* @__PURE__ */ new Date()) {
  const facilityId = requiredBoundedText(input.facilityId, "Facility", 128);
  const idempotencyKey = String(input.idempotencyKey ?? "").trim();
  if (!IDEMPOTENCY_KEY.test(idempotencyKey)) {
    throw new Error("Registration idempotency key must be 16-200 safe characters");
  }
  const medicalRecordNumber = String(input.medicalRecordNumber ?? "").trim().toUpperCase();
  if (!MEDICAL_RECORD_NUMBER.test(medicalRecordNumber)) {
    throw new Error("Medical record number must be 3-40 letters, numbers, or hyphens");
  }
  const preferredContactMethod = String(input.preferredContactMethod ?? "phone").trim().toLowerCase();
  if (!CONTACT_METHODS.has(preferredContactMethod)) {
    throw new Error("Preferred contact method is invalid for patient registration");
  }
  if (input.consent?.accepted !== true) {
    throw new Error("Registration consent acknowledgement is required");
  }
  const consent = {
    accepted: true,
    policyVersion: requiredBoundedText(input.consent.policyVersion, "Consent policy version", 100),
    statementKey: requiredBoundedText(input.consent.statementKey, "Consent statement key", 160)
  };
  if (consent.policyVersion !== REGISTRATION_CONSENT.policyVersion || consent.statementKey !== REGISTRATION_CONSENT.statementKey && !LEGACY_REGISTRATION_STATEMENT_KEYS.has(consent.statementKey)) {
    throw new Error("Registration consent acknowledgement does not match the current policy");
  }
  const resolutionInput = String(input.duplicateResolution ?? "").trim().toLowerCase();
  const duplicateResolution = resolutionInput || null;
  if (duplicateResolution !== null && duplicateResolution !== "create_new" && duplicateResolution !== "link_existing") {
    throw new Error("Duplicate resolution is invalid for patient registration");
  }
  const duplicatePatientId = input.duplicatePatientId ? requiredBoundedText(input.duplicatePatientId, "Duplicate patient", 128) : null;
  if (duplicateResolution === "link_existing" && !duplicatePatientId) {
    throw new Error("Duplicate patient is required when linking an existing registration");
  }
  if (duplicateResolution !== "link_existing" && duplicatePatientId) {
    throw new Error("Duplicate patient is only valid when linking an existing registration");
  }
  return {
    facilityId,
    idempotencyKey,
    medicalRecordNumber,
    firstName: normalizeName(input.firstName, "First name"),
    lastName: normalizeName(input.lastName, "Last name"),
    dateOfBirth: normalizeDateOfBirth(input.dateOfBirth, now),
    email: normalizeEmail(input.email),
    phone: normalizePhone(input.phone),
    preferredContactMethod,
    consent,
    duplicateResolution,
    duplicatePatientId
  };
}
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key2, child]) => `${JSON.stringify(key2)}:${canonicalJson(child)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
function buildRegistrationRequestHash(input) {
  const { idempotencyKey: _idempotencyKey, ...payload } = input;
  return (0, import_node_crypto10.createHash)("sha256").update(canonicalJson(payload), "utf8").digest("hex");
}
function hashRegistrationIdempotencyKey(idempotencyKey) {
  return (0, import_node_crypto10.createHash)("sha256").update(idempotencyKey, "utf8").digest("hex");
}
function comparableDate(value) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}
function comparableEmail(value) {
  try {
    return normalizeEmail(value);
  } catch {
    return null;
  }
}
function comparablePhone(value) {
  try {
    return normalizePhone(value);
  } catch {
    return null;
  }
}
function findDeterministicDuplicateReasons(input, candidate) {
  if (comparableDate(candidate.dateOfBirth) !== input.dateOfBirth.slice(0, 10)) return [];
  const reasons = [];
  if (input.email && comparableEmail(candidate.email) === input.email) {
    reasons.push("date_of_birth_and_email");
  }
  if (input.phone && comparablePhone(candidate.phone) === input.phone) {
    reasons.push("date_of_birth_and_phone");
  }
  const candidateFirstName = String(candidate.firstName ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  const candidateLastName = String(candidate.lastName ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  if (candidateFirstName === input.firstName.toLowerCase() && candidateLastName === input.lastName.toLowerCase()) {
    reasons.push("date_of_birth_and_name");
  }
  return reasons;
}
function maskRegistrationContact(value, type) {
  if (!value) return null;
  if (type === "email") {
    const [local, domain] = value.split("@");
    return domain ? `${local.slice(0, 1) || "*"}***@${domain}` : "***";
  }
  const digits = value.replace(/\D/g, "");
  return digits ? `\u2022\u2022\u2022\u2022${digits.slice(-4)}` : null;
}
var import_node_crypto10, REGISTRATION_CONSENT, CONTROL_CHARACTERS, IDEMPOTENCY_KEY, MEDICAL_RECORD_NUMBER, CONTACT_METHODS, LEGACY_REGISTRATION_STATEMENT_KEYS;
var init_registrationPolicy = __esm({
  "features/keystone/mutations/registration/registrationPolicy.ts"() {
    "use strict";
    import_node_crypto10 = require("node:crypto");
    REGISTRATION_CONSENT = {
      consentType: "patient_registration",
      policyVersion: "registration-v1",
      statementKey: "hospital-registration-acknowledgement"
    };
    CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
    IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,199}$/;
    MEDICAL_RECORD_NUMBER = /^[A-Z0-9][A-Z0-9-]{2,39}$/;
    CONTACT_METHODS = /* @__PURE__ */ new Set(["phone", "sms", "email"]);
    LEGACY_REGISTRATION_STATEMENT_KEYS = /* @__PURE__ */ new Set(["northstar-registration-acknowledgement"]);
  }
});

// features/keystone/mutations/registration/registerPatient.ts
function requirePermission4(context) {
  const role = context.session?.data.role;
  if (!role?.canManagePatients && !role?.canAccessAllClinicalData) {
    throw new Error("Not authorized to register patients");
  }
}
function candidateDto(candidate, reasons) {
  return {
    patientId: candidate.id,
    displayName: `${candidate.firstName} ${candidate.lastName}`.trim(),
    dateOfBirth: candidate.dateOfBirth?.toISOString().slice(0, 10) ?? null,
    maskedEmail: maskRegistrationContact(candidate.email, "email"),
    maskedPhone: maskRegistrationContact(candidate.phone, "phone"),
    reasons
  };
}
function completedDto(result8, replayed) {
  return {
    status: "completed",
    replayed,
    registrationId: result8.id,
    patientId: result8.patientId,
    identifierId: result8.identifierId,
    medicalRecordNumber: result8.identifier.maskedValue,
    duplicateResolution: result8.duplicateResolution,
    candidates: [],
    candidateCount: 0,
    candidateLimit: 25,
    candidateCountIsLowerBound: false
  };
}
async function registerPatient(root, args, context) {
  requirePermission4(context);
  const input = normalizeRegistrationInput(args.data);
  const scopedFacility5 = await context.query.Facility.findOne({
    where: { id: input.facilityId },
    query: "id status"
  });
  if (!scopedFacility5 || scopedFacility5.status !== "active") {
    throw new Error("Facility not found, inactive, or not accessible");
  }
  const idempotencyKeyHash = hashRegistrationIdempotencyKey(input.idempotencyKey);
  const requestHash = buildRegistrationRequestHash(input);
  const actorId = context.session.itemId;
  const sudo = context.sudo();
  try {
    return await sudo.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        import_client13.Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`hospital-registration:${input.facilityId}`}, 0))::text AS "lock"`
      );
      const replay = await tx.patientRegistration.findFirst({
        where: { facilityId: input.facilityId, idempotencyKeyHash },
        include: { identifier: true }
      });
      if (replay) {
        if (replay.requestHash !== requestHash) {
          throw new Error("Registration idempotency key was already used with a different payload");
        }
        return completedDto(replay, true);
      }
      const existingIdentifier = await tx.patientIdentifier.findFirst({
        where: { facilityId: input.facilityId, normalizedValue: input.medicalRecordNumber, status: "active" }
      });
      if (existingIdentifier) {
        throw new Error("Medical record number is already assigned at this facility");
      }
      const birthDate = new Date(input.dateOfBirth);
      const possibleCandidates = await tx.patient.findMany({
        where: {
          dateOfBirth: birthDate,
          facilities: { some: { id: input.facilityId } }
        },
        orderBy: { id: "asc" },
        select: { id: true, firstName: true, lastName: true, dateOfBirth: true, email: true, phone: true },
        take: 26
      });
      if (possibleCandidates.length > 25) {
        return {
          status: "candidate_overflow",
          replayed: false,
          registrationId: null,
          patientId: null,
          identifierId: null,
          medicalRecordNumber: null,
          duplicateResolution: null,
          candidates: [],
          candidateCount: possibleCandidates.length,
          candidateLimit: 25,
          candidateCountIsLowerBound: true
        };
      }
      const candidates = possibleCandidates.map((candidate) => ({ candidate, reasons: findDeterministicDuplicateReasons(input, candidate) })).filter(({ reasons }) => reasons.length > 0);
      if (candidates.length > 0 && !input.duplicateResolution) {
        return {
          status: "duplicate_review",
          replayed: false,
          registrationId: null,
          patientId: null,
          identifierId: null,
          medicalRecordNumber: null,
          duplicateResolution: null,
          candidates: candidates.map(({ candidate, reasons }) => candidateDto(candidate, reasons)),
          candidateCount: candidates.length,
          candidateLimit: 25,
          candidateCountIsLowerBound: false
        };
      }
      if (input.duplicateResolution && candidates.length === 0) {
        throw new Error("Duplicate resolution was supplied but no deterministic candidate exists");
      }
      let patientId;
      let duplicateResolution;
      if (input.duplicateResolution === "link_existing") {
        const selected = candidates.find(({ candidate }) => candidate.id === input.duplicatePatientId);
        if (!selected) throw new Error("Selected duplicate patient is not an accessible deterministic candidate");
        patientId = selected.candidate.id;
        duplicateResolution = "link_existing";
      } else {
        const patient = await tx.patient.create({
          data: {
            firstName: input.firstName,
            lastName: input.lastName,
            dateOfBirth: birthDate,
            email: input.email ?? "",
            phone: input.phone ?? "",
            preferredContactMethod: input.preferredContactMethod,
            status: "active",
            facilities: { connect: [{ id: input.facilityId }] }
          }
        });
        patientId = patient.id;
        duplicateResolution = input.duplicateResolution === "create_new" ? "create_new" : "no_candidate";
      }
      const now = /* @__PURE__ */ new Date();
      const identifier = await tx.patientIdentifier.create({
        data: {
          identifierType: "mrn",
          normalizedValue: input.medicalRecordNumber,
          maskedValue: `\u2022\u2022\u2022\u2022${input.medicalRecordNumber.slice(-4)}`,
          status: "active",
          facilityId: input.facilityId,
          patientId,
          createdById: actorId,
          createdAt: now
        }
      });
      const consent = await tx.patientConsent.create({
        data: {
          consentType: REGISTRATION_CONSENT.consentType,
          policyVersion: input.consent.policyVersion,
          statementKey: input.consent.statementKey,
          decision: "granted",
          effectiveAt: now,
          grantedAt: now,
          captureMethod: "staff_registration",
          facilityId: input.facilityId,
          patientId,
          evidence: { source: "platform_registration", accepted: true },
          createdAt: now
        }
      });
      const auditLog = await tx.clinicalAuditLog.create({
        data: {
          eventType: "patient.registered",
          occurredAt: now,
          actorType: "staff_user",
          actorReference: actorId,
          facilityId: input.facilityId,
          patientId,
          metadata: {
            source: "platform_registration",
            status: "completed",
            duplicateResolution
          },
          createdAt: now
        }
      });
      const registration = await tx.patientRegistration.create({
        data: {
          status: "completed",
          facilityId: input.facilityId,
          patientId,
          identifierId: identifier.id,
          consentId: consent.id,
          auditLogId: auditLog.id,
          createdById: actorId,
          idempotencyKeyHash,
          requestHash,
          duplicateResolution,
          provenance: { source: "platform_registration", policyVersion: REGISTRATION_CONSENT.policyVersion },
          createdAt: now
        },
        include: { identifier: true }
      });
      return completedDto(registration, false);
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error instanceof import_client13.Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) {
      throw new Error("Registration conflicted with another request; retry with the same idempotency key");
    }
    throw error;
  }
}
var import_client13;
var init_registerPatient = __esm({
  "features/keystone/mutations/registration/registerPatient.ts"() {
    "use strict";
    import_client13 = require("@prisma/client");
    init_registrationPolicy();
  }
});

// features/keystone/mutations/clinical/manageCareQueue.ts
function requireOperator(context) {
  const role = context.session?.data.role;
  if (!role?.canManageAppointments && !role?.canManagePatients && !role?.canAccessAllClinicalData) {
    throw new Error("Not authorized to manage the care queue");
  }
}
function cleanKey(value) {
  const key2 = String(value ?? "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{15,199}$/.test(key2)) throw new Error("Queue idempotency key is invalid");
  return key2;
}
function digest3(value) {
  return (0, import_node_crypto11.createHash)("sha256").update(value).digest("hex");
}
function queueResult(row, replayed) {
  return {
    id: row.id,
    ticketNumber: row.ticketNumber,
    status: row.status,
    priority: row.priority,
    reasonCode: row.reasonCode,
    queueDate: row.queueDate,
    queuePosition: row.queuePosition,
    transitionVersion: row.transitionVersion,
    arrivedAt: row.arrivedAt instanceof Date ? row.arrivedAt : new Date(row.arrivedAt),
    calledAt: row.calledAt ? row.calledAt instanceof Date ? row.calledAt : new Date(row.calledAt) : null,
    completedAt: row.completedAt ? row.completedAt instanceof Date ? row.completedAt : new Date(row.completedAt) : null,
    replayed
  };
}
async function arriveAppointment(_root, args, context) {
  requireOperator(context);
  const operationKey = cleanKey(args.idempotencyKey);
  const evidence = transitionEvidence(operationKey, {
    appointmentId: args.appointmentId,
    toStatus: "checked_in",
    reasonCode: args.reasonCode ?? "scheduled_visit"
  });
  const keyHash = evidence.operationKeyHash;
  const requestHash = digest3(JSON.stringify({
    appointmentId: args.appointmentId,
    reasonCode: args.reasonCode ?? "scheduled_visit"
  }));
  const scoped2 = await context.query.Appointment.findOne({
    where: { id: args.appointmentId },
    query: "id status patient { id } facility { id timeZone } provider { id }"
  });
  if (!scoped2?.patient?.id || !scoped2?.facility?.id || !scoped2.facility.timeZone) {
    throw new Error("Appointment not found, unscoped, or facility time zone is unavailable");
  }
  return context.transaction(async (transactionContext) => {
    await transactionContext.prisma.$executeRaw(import_client14.Prisma.sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`);
    const currentContext = await currentEpisodeActor(transactionContext, "queue");
    await lockEpisodeFacility(currentContext, scoped2.facility.id, scoped2.provider?.id);
    await lockEpisodePatientProvider(currentContext, scoped2.facility.id, scoped2.patient.id, scoped2.provider?.id);
    await currentContext.prisma.$queryRaw(import_client14.Prisma.sql`SELECT "id" FROM "Appointment" WHERE "id" = ${args.appointmentId} FOR UPDATE`);
    const currentAppointment = await currentContext.query.Appointment.findOne({ where: { id: args.appointmentId }, query: "id patient { id } provider { id } facility { id timeZone }" });
    if (currentAppointment?.patient?.id !== scoped2.patient.id || currentAppointment?.provider?.id !== scoped2.provider?.id || currentAppointment?.facility?.id !== scoped2.facility.id || currentAppointment.facility.timeZone !== scoped2.facility.timeZone) throw new Error("Arrival scope changed; refresh before retrying");
    const sudo = currentContext.sudo();
    await lockTransitionOperation(sudo.prisma, keyHash);
    await lockProviderSchedule(sudo.prisma, scoped2.provider?.id || `appointment:${args.appointmentId}`);
    await sudo.prisma.$queryRaw(
      import_client14.Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`care-queue:${args.appointmentId}`}, 0))::text AS "lock"`
    );
    const existing = await sudo.prisma.careQueueTicket.findFirst({ where: { appointmentId: args.appointmentId } });
    if (existing) {
      if (existing.idempotencyKeyHash !== keyHash || existing.requestHash !== requestHash || existing.actorReference !== currentContext.session.itemId) {
        throw new Error("Appointment already has a queue ticket from a different arrival operation");
      }
      return queueResult(existing, true);
    }
    const priorTransition = await replayTransition(sudo.prisma, evidence, "appointment", args.appointmentId);
    const appointment = await sudo.prisma.appointment.findUnique({ where: { id: args.appointmentId } });
    if (!appointment || !["confirmed", "checked_in"].includes(appointment.status)) {
      throw new Error("Only confirmed or already checked-in appointments can enter the care queue");
    }
    const now = /* @__PURE__ */ new Date();
    const facilityTimeZone = scoped2.facility.timeZone;
    const queueDate = calendarDateInTimeZone(now, facilityTimeZone);
    await sudo.prisma.$queryRaw(
      import_client14.Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`care-queue-position:${scoped2.facility.id}:${queueDate}`}, 0))::text AS "lock"`
    );
    const lastTicket = await sudo.prisma.careQueueTicket.findFirst({
      where: { facilityId: scoped2.facility.id, queueDate },
      orderBy: { queuePosition: "desc" },
      select: { queuePosition: true }
    });
    const queuePosition = Number(lastTicket?.queuePosition || 0) + 1;
    let checkedIn = appointment;
    let appointmentAudit = null;
    let appointmentOutbox = null;
    if (!priorTransition) {
      checkedIn = await sudo.prisma.appointment.update({
        where: { id: appointment.id },
        data: {
          status: "checked_in",
          ...appointment.status === "confirmed" ? { checkInAt: now } : {},
          transitionVersion: { increment: 1 }
        }
      });
      const eventType = appointment.status === "confirmed" ? "appointment.checked_in" : "appointment.arrival_reconciled";
      const metadata = {
        source: "care_queue_arrival",
        aggregateType: "appointment",
        aggregateId: appointment.id,
        fromStatus: appointment.status,
        status: "checked_in",
        transitionVersion: checkedIn.transitionVersion,
        queueDate,
        arrivalReconciled: appointment.status === "checked_in"
      };
      appointmentAudit = await sudo.prisma.clinicalAuditLog.create({ data: {
        eventType,
        occurredAt: now,
        actorType: "staff_user",
        actorReference: context.session?.itemId || "",
        facilityId: appointment.facilityId,
        patientId: appointment.patientId,
        appointmentId: appointment.id,
        metadata,
        createdAt: now
      } });
      appointmentOutbox = await sudo.prisma.clinicalOutboxEvent.create({ data: {
        eventKey: `appointment:${appointment.id}:v${checkedIn.transitionVersion}:${eventType}`,
        eventType,
        aggregateType: "appointment",
        aggregateId: appointment.id,
        status: "recorded",
        attempts: 0,
        nextAttemptAt: null,
        facilityId: appointment.facilityId,
        patientId: appointment.patientId,
        appointmentId: appointment.id,
        payload: metadata,
        createdAt: now
      } });
    }
    const ticket = await sudo.query.CareQueueTicket.createOne({
      data: {
        ticketNumber: `QUEUE-${(0, import_node_crypto11.randomUUID)()}`,
        priority: "routine",
        reasonCode: args.reasonCode ?? "scheduled_visit",
        queueDate,
        queuePosition,
        idempotencyKeyHash: keyHash,
        requestHash,
        arrivedAt: appointment.checkInAt || now,
        facility: { connect: { id: scoped2.facility.id } },
        patient: { connect: { id: scoped2.patient.id } },
        appointment: { connect: { id: appointment.id } }
      },
      query: "id ticketNumber status priority reasonCode queueDate queuePosition transitionVersion arrivedAt calledAt completedAt"
    });
    if (!priorTransition) {
      await recordTransition(sudo.prisma, {
        evidence,
        aggregateType: "appointment",
        aggregateId: appointment.id,
        fromStatus: appointment.status,
        toStatus: "checked_in",
        fromVersion: appointment.transitionVersion,
        toVersion: checkedIn.transitionVersion,
        actorReference: context.session?.itemId || "",
        facilityId: appointment.facilityId,
        patientId: appointment.patientId,
        auditLogId: appointmentAudit.id,
        outboxEventId: appointmentOutbox.id,
        result: {
          id: checkedIn.id,
          appointmentNumber: checkedIn.appointmentNumber,
          fromStatus: appointment.status,
          status: "checked_in",
          transitionVersion: checkedIn.transitionVersion,
          startsAt: checkedIn.startsAt,
          endsAt: checkedIn.endsAt,
          checkInAt: checkedIn.checkInAt || now,
          completedAt: checkedIn.completedAt || null,
          cancellationReason: checkedIn.cancellationReason || null,
          replayed: false
        },
        occurredAt: now
      });
    } else if (appointment.status === "checked_in") {
      const metadata = { source: "care_queue_arrival_reconciliation", aggregateId: appointment.id, ticketId: ticket.id, status: "checked_in" };
      await sudo.prisma.clinicalAuditLog.create({ data: {
        eventType: "appointment.arrival_reconciled",
        occurredAt: now,
        actorType: "staff_user",
        actorReference: context.session?.itemId || "",
        facilityId: appointment.facilityId,
        patientId: appointment.patientId,
        appointmentId: appointment.id,
        metadata,
        createdAt: now
      } });
    }
    return queueResult(ticket, false);
  }, { timeout: 3e4 });
}
async function transitionCareQueue(_root, args, context) {
  requireOperator(context);
  if (!Number.isInteger(args.expectedVersion) || args.expectedVersion < 1) {
    throw new Error("Expected queue version is invalid");
  }
  const evidence = transitionEvidence(args.operationKey, {
    ticketId: args.ticketId,
    toStatus: args.toStatus,
    expectedVersion: args.expectedVersion,
    encounterId: args.encounterId || null
  });
  const scoped2 = await context.query.CareQueueTicket.findOne({
    where: { id: args.ticketId },
    query: "id status transitionVersion patient { id } facility { id } encounter { id }"
  });
  if (!scoped2?.patient?.id || !scoped2?.facility?.id) throw new Error("Queue ticket not found or not accessible");
  const encounterId = args.encounterId;
  if (encounterId) {
    const encounter = await context.query.Encounter.findOne({
      where: { id: encounterId },
      query: "id status patient { id } facility { id }"
    });
    if (!encounter || encounter.status !== "in_progress" || encounter.patient?.id !== scoped2.patient.id || encounter.facility?.id !== scoped2.facility.id) {
      throw new Error("Encounter must be in progress for the queue patient and facility");
    }
  }
  return context.transaction(async (transactionContext) => {
    await transactionContext.prisma.$executeRaw(import_client14.Prisma.sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`);
    const currentContext = await currentEpisodeActor(transactionContext, "queue");
    const visible = await currentContext.query.CareQueueTicket.findOne({ where: { id: args.ticketId }, query: "id patient { id } facility { id } encounter { id } appointment { id provider { id } }" });
    if (visible?.patient?.id !== scoped2.patient.id || visible?.facility?.id !== scoped2.facility.id) throw new Error("Current queue scope is unavailable");
    await lockEpisodeFacility(currentContext, visible.facility.id, visible.appointment?.provider?.id);
    await lockEpisodePatientProvider(currentContext, visible.facility.id, visible.patient.id, visible.appointment?.provider?.id);
    const sudo = currentContext.sudo();
    await sudo.prisma.$queryRaw(import_client14.Prisma.sql`SELECT "id" FROM "CareQueueTicket" WHERE "id" = ${args.ticketId} FOR UPDATE`);
    const prior = await sudo.prisma.workflowTransition.findUnique({ where: { operationKeyHash: evidence.operationKeyHash }, select: { actorReference: true } });
    if (prior && prior.actorReference !== currentContext.session.itemId) throw new Error("Original queue operation is not owned");
    const linkedEncounterId = encounterId || visible.encounter?.id;
    if (args.toStatus === "in_care" && linkedEncounterId) {
      await guardEpisodeChild(currentContext, { facilityId: visible.facility.id, patientId: visible.patient.id, encounterId: linkedEncounterId }, "new_care", false, Boolean(prior), "queue");
      if (!prior) {
        const parent = await currentContext.query.Encounter.findOne({ where: { id: linkedEncounterId }, query: "id status" });
        if (parent?.status !== "in_progress") throw new Error("Current encounter must be in progress for handoff");
      }
    }
    await lockTransitionOperation(sudo.prisma, evidence.operationKeyHash);
    await sudo.prisma.$queryRaw(
      import_client14.Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`care-queue-ticket:${args.ticketId}`}, 0))::text AS "lock"`
    );
    const replay = await replayTransition(sudo.prisma, evidence, "care_queue", args.ticketId);
    if (replay) return replay;
    const current = await sudo.prisma.careQueueTicket.findUnique({ where: { id: args.ticketId } });
    if (!current || current.transitionVersion !== args.expectedVersion) {
      throw new Error("Queue ticket changed; refresh before retrying");
    }
    if (args.toStatus === "in_care" && !encounterId && !current.encounterId) {
      throw new Error("Encounter is required before handing off into care");
    }
    const updated = await sudo.query.CareQueueTicket.updateOne({
      where: { id: current.id },
      data: {
        status: args.toStatus,
        ...encounterId ? { encounter: { connect: { id: encounterId } } } : {}
      },
      query: "id ticketNumber status priority reasonCode queueDate queuePosition transitionVersion arrivedAt calledAt completedAt"
    });
    const result8 = queueResult(updated, false);
    const eventType = `queue.${updated.status}`;
    const outbox = await sudo.prisma.clinicalOutboxEvent.findUnique({
      where: { eventKey: `queue:${current.id}:v${updated.transitionVersion}:${eventType}` },
      select: { id: true }
    });
    await recordTransition(sudo.prisma, {
      evidence,
      aggregateType: "care_queue",
      aggregateId: current.id,
      fromStatus: current.status,
      toStatus: updated.status,
      fromVersion: current.transitionVersion,
      toVersion: updated.transitionVersion,
      actorReference: context.session?.itemId || "",
      facilityId: current.facilityId,
      patientId: current.patientId,
      outboxEventId: outbox?.id,
      result: result8,
      occurredAt: /* @__PURE__ */ new Date()
    });
    return result8;
  }, { timeout: 3e4 });
}
var import_node_crypto11, import_client14;
var init_manageCareQueue = __esm({
  "features/keystone/mutations/clinical/manageCareQueue.ts"() {
    "use strict";
    import_node_crypto11 = require("node:crypto");
    import_client14 = require("@prisma/client");
    init_transitionEvidence();
    init_facilityTime();
    init_schedulePolicy();
    init_episodeFence();
  }
});

// features/keystone/mutations/clinical/dispatchClinicalOutbox.ts
async function dispatchInternalOutbox(_prisma, _requestedLimit = 10) {
  return { claimed: 0, delivered: 0 };
}
async function dispatchClinicalOutbox(_root, args, context) {
  if (!context.session?.data.role?.canAccessAllClinicalData) {
    throw new Error("Only the global maintenance administrator can inspect internal event processing");
  }
  return dispatchInternalOutbox(context.sudo().prisma, args.limit);
}
var init_dispatchClinicalOutbox = __esm({
  "features/keystone/mutations/clinical/dispatchClinicalOutbox.ts"() {
    "use strict";
  }
});

// features/keystone/mutations/clinical/episodeRelatedScope.ts
async function recheckEpisodeRelated(context, model, input, replayOnly = false) {
  if (input.medicalOrderId) {
    await context.prisma.$queryRaw(import_client15.Prisma.sql`SELECT "id" FROM "MedicalOrder" WHERE "id" = ${input.medicalOrderId} FOR SHARE`);
    const order = await context.query.MedicalOrder.findOne({
      where: { id: input.medicalOrderId },
      query: "id status orderType facility { id } patient { id } encounter { id }"
    });
    const orderType = model === "LabResult" || model === "LabResultCorrection" || model === "Specimen" ? "lab" : model === "Prescription" ? "medication" : model === "Procedure" ? "procedure" : null;
    if (!order || order.facility?.id !== input.facilityId || order.patient?.id !== input.patientId || order.encounter?.id !== input.encounterId || orderType && order.orderType !== orderType || !replayOnly && model !== "LabResultCorrection" && !["ordered", "in_progress"].includes(order.status)) throw new Error(EPISODE_DENIED);
  }
  if (input.labTestId) {
    await context.prisma.$queryRaw(import_client15.Prisma.sql`SELECT "id" FROM "LabTest" WHERE "id" = ${input.labTestId} FOR SHARE`);
    const test = await context.query.LabTest.findOne({ where: { id: input.labTestId }, query: "id active" });
    if (!test?.active) throw new Error(EPISODE_DENIED);
  }
  if (input.coverageId) {
    await context.prisma.$queryRaw(import_client15.Prisma.sql`SELECT "id" FROM "PatientCoverage" WHERE "id" = ${input.coverageId} FOR SHARE`);
    const coverage = await context.query.PatientCoverage.findOne({ where: { id: input.coverageId }, query: "id status facility { id } patient { id }" });
    if (!coverage || coverage.facility?.id !== input.facilityId || coverage.patient?.id !== input.patientId || !replayOnly && coverage.status !== "active") throw new Error(EPISODE_DENIED);
  }
}
var import_client15;
var init_episodeRelatedScope = __esm({
  "features/keystone/mutations/clinical/episodeRelatedScope.ts"() {
    "use strict";
    import_client15 = require("@prisma/client");
    init_episodeFence();
  }
});

// features/keystone/mutations/clinical/controlledWorkflows.ts
function requireOperator2(context) {
  const role = context.session?.data.role;
  if (!role?.canManagePatients && !role?.canAccessAllClinicalData) {
    throw new Error("Not authorized to manage clinical operations");
  }
}
function bounded4(value, label, max = 2e3, required = false) {
  const text63 = String(value ?? "").trim();
  if (required && !text63 || text63.length > max || /[\u0000-\u001f\u007f]/.test(text63)) {
    throw new Error(`${label} is invalid`);
  }
  return text63;
}
function canonical4(value) {
  if (Array.isArray(value)) return `[${value.map(canonical4).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key2, nested]) => `${JSON.stringify(key2)}:${canonical4(nested)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
function digest4(value) {
  return (0, import_node_crypto12.createHash)("sha256").update(value).digest("hex");
}
function creationEvidence(input) {
  const key2 = bounded4(input.operationKey, "Operation key", 200, true);
  if (!KEY_PATTERN2.test(key2)) throw new Error("Operation key is invalid");
  const { operationKey: _operationKey, ...payload } = input;
  return {
    operationKeyHash: digest4(key2),
    requestHash: digest4(canonical4(payload))
  };
}
function projection2(row, replayed = false) {
  return {
    id: row.id,
    status: row.status,
    transitionVersion: row.transitionVersion,
    replayed
  };
}
async function scope(context, input) {
  requireOperator2(context);
  const [facility, patient, encounter, provider] = await Promise.all([
    context.query.Facility.findOne({ where: { id: input.facilityId }, query: "id status" }),
    context.query.Patient.findOne({ where: { id: input.patientId }, query: "id status facilities { id }" }),
    input.encounterId ? context.query.Encounter.findOne({
      where: { id: input.encounterId },
      query: "id status patient { id } facility { id }"
    }) : null,
    input.providerId ? context.query.Provider.findOne({
      where: { id: input.providerId },
      query: "id status facilities { id }"
    }) : null
  ]);
  if (!facility || facility.status !== "active" || patient?.status !== "active" || !patient?.facilities?.some((item) => item.id === input.facilityId)) {
    throw new Error("Facility or patient not found or not accessible");
  }
  if (input.encounterId && (!encounter || encounter.patient?.id !== input.patientId || encounter.facility?.id !== input.facilityId)) {
    throw new Error("Encounter does not match the accessible patient and facility");
  }
  if (input.providerId && (provider?.status !== "active" || !provider?.facilities?.some((item) => item.id === input.facilityId))) {
    throw new Error("Provider does not match the accessible facility");
  }
  return { facility, patient, encounter, provider };
}
async function scopedRecord(context, model, id, authorize = requireOperator2) {
  authorize(context);
  const record2 = await context.query[model].findOne({
    where: { id },
    query: "id status transitionVersion facility { id } patient { id } encounter { id }"
  });
  if (!record2) throw new Error(`${model} not found or not accessible`);
  return record2;
}
async function createControlled(context, options) {
  const ev = creationEvidence(options.input);
  return context.transaction(async (transactionContext) => {
    if (options.model === "LabResult") await transactionContext.prisma.$executeRaw(import_client16.Prisma.sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`);
    const fresh = await currentEpisodeActor(transactionContext, options.model === "InsuranceClaim" ? "billing" : "clinical");
    if (options.model === "LabResult" && options.originalLabCommand) {
      const replay = await replayAcceptedLabResult(fresh, options.originalLabCommand, ev, options.originalLabCommand);
      if (replay) {
        if (replay.originalAcknowledgement.state.startsWith("legacy_")) throw new Error("Legacy result identity verified, but original body/status/version acknowledgement is unknown. Use read-only result readback and retain the original command.");
        return replay;
      }
    }
    const existingReceipt = await fresh.prisma[options.delegate].findUnique({ where: { operationKeyHash: ev.operationKeyHash }, select: { actorReference: true } });
    const guarded = await guardEpisodeChild(fresh, options.input, options.model === "InsuranceClaim" ? "claim" : options.model === "LabResult" ? "late_result" : "new_care", false, Boolean(existingReceipt));
    await recheckEpisodeRelated(guarded.context, options.model, options.input, Boolean(existingReceipt));
    const sudo = guarded.context.sudo();
    await sudo.prisma.$queryRaw(
      import_client16.Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${options.prefix}:create:${ev.operationKeyHash}`}, 0))::text AS "lock"`
    );
    const existing = await sudo.prisma[options.delegate].findUnique({
      where: { operationKeyHash: ev.operationKeyHash },
      select: { id: true, status: true, transitionVersion: true, requestHash: true, actorReference: true, facilityId: true, patientId: true, encounterId: true }
    });
    if (existing) {
      if (existing.requestHash !== ev.requestHash || existing.actorReference !== fresh.session.itemId || existing.facilityId !== options.input.facilityId || existing.patientId !== options.input.patientId || (existing.encounterId || null) !== (options.input.encounterId || null)) {
        throw new Error("Operation key was reused with a different payload or authority");
      }
      if (options.model === "LabResult") throw new Error("Existing result requires original receipt recovery; retain and retry the exact command");
      return projection2(existing, true);
    }
    const row = await sudo.query[options.model].createOne({
      data: { ...options.data, ...ev },
      query: "id status transitionVersion"
    });
    if (options.afterCreate) await options.afterCreate(sudo.prisma, row, ev);
    if (options.originalLabCommand) await persistOriginalLabReceipt(sudo.prisma, row, ev, options.originalLabCommand, fresh.session.itemId, options.originalLabCommand);
    return projection2(row, false);
  }, { timeout: 3e4 });
}
async function transitionControlled(context, options) {
  await scopedRecord(context, options.model, options.id, options.authorize || requireOperator2);
  if (!Number.isInteger(options.expectedVersion) || options.expectedVersion < 1) {
    throw new Error("Expected clinical record version is invalid");
  }
  const data = options.data || {};
  const ev = transitionEvidence(options.operationKey, {
    aggregateType: options.prefix,
    aggregateId: options.id,
    toStatus: options.toStatus,
    expectedVersion: options.expectedVersion,
    data
  });
  return context.transaction(async (transactionContext) => {
    if (options.model === "LabResult") await transactionContext.prisma.$executeRaw(import_client16.Prisma.sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`);
    const fresh = await currentEpisodeActor(transactionContext, options.model === "InsuranceClaim" ? "billing" : "clinical");
    if (options.model === "LabResult") {
      const original = await replayAcceptedLabTransition(fresh, options.id, ev, {
        operationKey: options.operationKey,
        resultId: options.id,
        toStatus: options.toStatus,
        expectedVersion: options.expectedVersion
      });
      if (original) {
        if (original.originalAcknowledgement.state.startsWith("legacy_")) throw new Error("Original lab transition status/version are known, but its full command is unknown. Retain the identity and use owned readback; no replacement key is authorized.");
        return original;
      }
    }
    const child = await currentEpisodeChild(fresh, options.model, options.id);
    const prior = await fresh.prisma.workflowTransition.findUnique({ where: { operationKeyHash: ev.operationKeyHash }, select: { actorReference: true } });
    if (prior && prior.actorReference !== fresh.session.itemId) throw new Error("Original child operation is not owned");
    const guarded = await guardEpisodeChild(
      fresh,
      child.input,
      options.model === "InsuranceClaim" ? "claim" : options.toStatus === "cancelled" ? "cancel_evidence" : options.model === "LabResult" ? "late_result" : "new_care",
      false,
      Boolean(prior)
    );
    await recheckEpisodeRelated(guarded.context, options.model, child.input, true);
    const sudo = guarded.context.sudo();
    await lockTransitionOperation(sudo.prisma, ev.operationKeyHash);
    await sudo.prisma.$queryRaw(
      import_client16.Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${options.prefix}:${options.id}`}, 0))::text AS "lock"`
    );
    const replay = options.model === "LabResult" ? await replayAcceptedLabTransition(fresh, options.id, ev, {
      operationKey: options.operationKey,
      resultId: options.id,
      toStatus: options.toStatus,
      expectedVersion: options.expectedVersion
    }) : await replayTransition(sudo.prisma, ev, options.prefix, options.id);
    if (replay) {
      if (options.model === "LabResult" && replay.originalAcknowledgement.state.startsWith("legacy_")) throw new Error("Original lab transition command is unknown; retain the original identity and use owned readback");
      return replay;
    }
    const current = await sudo.prisma[options.delegate].findUnique({
      where: { id: options.id },
      ...options.model === "LabResult" ? { select: { id: true, status: true, transitionVersion: true, facilityId: true, patientId: true, encounterId: true } } : {}
    });
    if (!current || current.transitionVersion !== options.expectedVersion) {
      throw new Error("Clinical record changed; refresh before retrying");
    }
    const row = await sudo.query[options.model].updateOne({
      where: { id: options.id },
      data: { status: options.toStatus, ...data },
      query: "id status transitionVersion"
    });
    if (options.afterTransition) await options.afterTransition(sudo.prisma, current, row, ev);
    const result8 = { ...projection2(row, false), ...options.model === "LabResult" ? { originalCommand: {
      operationKey: options.operationKey,
      resultId: options.id,
      toStatus: options.toStatus,
      expectedVersion: options.expectedVersion,
      actorReference: fresh.session.itemId
    } } : {} };
    const outbox = await sudo.prisma.clinicalOutboxEvent.findUnique({
      where: { eventKey: `${options.prefix}:${options.id}:v${row.transitionVersion}:${row.status}` },
      select: { id: true }
    });
    await recordTransition(sudo.prisma, {
      evidence: ev,
      aggregateType: options.prefix,
      aggregateId: options.id,
      fromStatus: current.status,
      toStatus: row.status,
      fromVersion: current.transitionVersion,
      toVersion: row.transitionVersion,
      actorReference: context.session?.itemId ?? "",
      facilityId: current.facilityId,
      patientId: current.patientId,
      outboxEventId: outbox?.id,
      result: result8,
      occurredAt: /* @__PURE__ */ new Date()
    });
    return result8;
  }, { timeout: 3e4 });
}
async function scopedBed(context, bedId, facilityId) {
  const bed = await context.query.Bed.findOne({
    where: { id: bedId },
    query: "id status transitionVersion facility { id } currentPatient { id } room { id }"
  });
  if (!bed || facilityId && bed.facility?.id !== facilityId) {
    throw new Error("Bed not found or not accessible in the facility");
  }
  return bed;
}
async function validateRelatedOrder(context, input) {
  if (!input.medicalOrderId) return;
  const order = await context.query.MedicalOrder.findOne({
    where: { id: input.medicalOrderId },
    query: "id orderType status facility { id } patient { id } encounter { id }"
  });
  if (!order || order.orderType !== input.orderType || order.facility?.id !== input.facilityId || order.patient?.id !== input.patientId || order.encounter?.id !== input.encounterId) {
    throw new Error(`Related ${input.orderType} order does not match the active patient encounter`);
  }
}
async function recordAdmissionTransition(prisma, input) {
  const result8 = projection2(input.row, false);
  const outbox = await prisma.clinicalOutboxEvent.findUnique({
    where: {
      eventKey: `admission:${input.current.id}:v${input.row.transitionVersion}:${input.row.status}`
    },
    select: { id: true }
  });
  await recordTransition(prisma, {
    evidence: input.ev,
    aggregateType: "admission",
    aggregateId: input.current.id,
    fromStatus: input.current.status,
    toStatus: input.row.status,
    fromVersion: input.current.transitionVersion,
    toVersion: input.row.transitionVersion,
    actorReference: input.actorReference,
    facilityId: input.current.facilityId,
    patientId: input.current.patientId,
    outboxEventId: outbox?.id,
    result: result8,
    occurredAt: input.occurredAt
  });
  return result8;
}
async function admitPatient(_root, { data }, context) {
  const input = { ...data, notes: bounded4(data.notes, "Admission notes", 4e3) };
  const scoped2 = await scope(context, {
    facilityId: data.facilityId,
    patientId: data.patientId,
    providerId: data.attendingProviderId,
    encounterId: data.encounterId
  });
  if (scoped2.encounter && !["open", "in_progress"].includes(scoped2.encounter.status)) {
    throw new Error("Admission encounter must be open or in progress");
  }
  const bed = await scopedBed(context, data.bedId, data.facilityId);
  const ev = creationEvidence(input);
  return context.transaction(async (transactionContext) => {
    const fresh = await currentEpisodeActor(transactionContext);
    const prior = await fresh.prisma.admission.findUnique({ where: { operationKeyHash: ev.operationKeyHash }, select: { actorReference: true } });
    if (prior && prior.actorReference !== fresh.session.itemId) throw new Error("Original admission operation is not owned");
    const guarded = await guardEpisodeChild(fresh, input, "new_care", false, Boolean(prior));
    if (input.encounterId && !prior) {
      const currentEncounter = await guarded.context.query.Encounter.findOne({ where: { id: input.encounterId }, query: "id status" });
      if (!["open", "in_progress"].includes(currentEncounter?.status)) throw new Error("Current admission encounter must be open or in progress");
    }
    await scopedBed(guarded.context, data.bedId, data.facilityId);
    const sudo = guarded.context.sudo();
    await sudo.prisma.$queryRaw(
      import_client16.Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`admission:create:${ev.operationKeyHash}`}, 0))::text AS "lock"`
    );
    const existing = await sudo.prisma.admission.findUnique({
      where: { operationKeyHash: ev.operationKeyHash }
    });
    if (existing) {
      if (existing.requestHash !== ev.requestHash) {
        throw new Error("Operation key was reused with a different payload");
      }
      return projection2(existing, true);
    }
    await sudo.prisma.$queryRaw(
      import_client16.Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`bed:${data.bedId}`}, 0))::text AS "lock"`
    );
    const currentBed = await sudo.prisma.bed.findUnique({ where: { id: data.bedId } });
    const activeReservation = await sudo.prisma.bedReservation.findFirst({
      where: { bedId: data.bedId, status: "active" }
    });
    const reservationMatches = Boolean(
      activeReservation && activeReservation.patientId === data.patientId && activeReservation.facilityId === data.facilityId && activeReservation.expiresAt > /* @__PURE__ */ new Date()
    );
    if (!currentBed || currentBed.facilityId !== data.facilityId || currentBed.currentPatientId || !(currentBed.status === "available" && !activeReservation || currentBed.status === "reserved" && reservationMatches)) {
      throw new Error("Bed is no longer available for this patient");
    }
    const now = /* @__PURE__ */ new Date();
    const admission = await sudo.query.Admission.createOne({
      data: {
        admissionNumber: `ADM-${(0, import_node_crypto12.randomUUID)()}`,
        facility: { connect: { id: data.facilityId } },
        patient: { connect: { id: data.patientId } },
        encounter: data.encounterId ? { connect: { id: data.encounterId } } : void 0,
        attendingProvider: { connect: { id: data.attendingProviderId } },
        room: { connect: { id: bed.room.id } },
        bed: { connect: { id: data.bedId } },
        admittedAt: now,
        notes: input.notes,
        ...ev
      },
      query: "id status transitionVersion"
    });
    if (activeReservation) {
      const consumed = await sudo.prisma.bedReservation.update({
        where: { id: activeReservation.id },
        data: { status: "consumed", transitionVersion: { increment: 1 }, consumedAt: now, admissionId: admission.id, actorReference: context.session.itemId }
      });
      await appendAuditAndOutbox(sudo.prisma, {
        eventKey: `bed_reservation:${consumed.id}:v${consumed.transitionVersion}:consumed`,
        eventType: "bed_reservation.consumed",
        aggregateType: "bed_reservation",
        aggregateId: consumed.id,
        facilityId: consumed.facilityId,
        patientId: consumed.patientId,
        actorReference: context.session.itemId,
        metadata: { source: "admission_workflow", aggregateId: consumed.id, admissionId: admission.id, bedId: consumed.bedId, fromStatus: activeReservation.status, status: consumed.status, transitionVersion: consumed.transitionVersion },
        occurredAt: now
      });
    }
    await sudo.prisma.bed.update({
      where: { id: data.bedId },
      data: {
        status: "occupied",
        currentPatientId: data.patientId,
        transitionVersion: { increment: 1 }
      }
    });
    await sudo.prisma.bedOccupancyEvent.create({
      data: {
        eventKey: `admission:${admission.id}:assigned:v1`,
        eventType: "assigned",
        facilityId: data.facilityId,
        patientId: data.patientId,
        admissionId: admission.id,
        bedId: data.bedId,
        actorReference: context.session.itemId,
        reasonCode: "admission",
        occurredAt: now
      }
    });
    return projection2(admission, false);
  }, { timeout: 3e4 });
}
async function transitionAdmission(_root, args, context) {
  const scoped2 = await scopedRecord(context, "Admission", args.admissionId);
  if (!Number.isInteger(args.expectedVersion) || args.expectedVersion < 1) {
    throw new Error("Expected admission version is invalid");
  }
  const reasonCode = bounded4(args.reasonCode, "Transfer reason", 80, args.toStatus === "transferred");
  const dischargeDisposition = bounded4(
    args.dischargeDisposition,
    "Discharge disposition",
    500,
    args.toStatus === "discharged"
  );
  const ev = transitionEvidence(args.operationKey, {
    admissionId: args.admissionId,
    toStatus: args.toStatus,
    expectedVersion: args.expectedVersion,
    bedId: args.bedId || null,
    reasonCode,
    dischargeDisposition
  });
  const target = args.toStatus === "transferred" ? await scopedBed(context, args.bedId, scoped2.facility.id) : null;
  return context.transaction(async (transactionContext) => {
    const fresh = await currentEpisodeActor(transactionContext);
    const child = await currentEpisodeChild(fresh, "Admission", args.admissionId);
    const guarded = await guardEpisodeChild(fresh, child.input, "cancel_evidence", false, true);
    const sudo = guarded.context.sudo();
    const prior = await sudo.prisma.workflowTransition.findUnique({ where: { operationKeyHash: ev.operationKeyHash }, select: { actorReference: true } });
    if (prior && prior.actorReference !== fresh.session.itemId) throw new Error("Original admission operation is not owned");
    if (args.toStatus === "transferred") await scopedBed(guarded.context, args.bedId, child.input.facilityId);
    await lockTransitionOperation(sudo.prisma, ev.operationKeyHash);
    await sudo.prisma.$queryRaw(
      import_client16.Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`admission:${args.admissionId}`}, 0))::text AS "lock"`
    );
    const replay = await replayTransition(sudo.prisma, ev, "admission", args.admissionId);
    if (replay) return replay;
    let current = await sudo.prisma.admission.findUnique({ where: { id: args.admissionId } });
    if (!current || current.transitionVersion !== args.expectedVersion) {
      throw new Error("Admission changed; refresh before retrying");
    }
    if (!["admitted", "transferred"].includes(current.status)) {
      throw new Error(`Invalid admission transition from ${current.status} to ${args.toStatus}`);
    }
    const now = /* @__PURE__ */ new Date();
    if (args.toStatus === "transferred") {
      if (!args.bedId || args.bedId === current.bedId || !target?.room?.id) {
        throw new Error("A different destination bed is required");
      }
      const bedIds = [...new Set([current.bedId, args.bedId].filter(Boolean))].sort();
      for (const bedId of bedIds) {
        await sudo.prisma.$queryRaw(
          import_client16.Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`bed:${bedId}`}, 0))::text AS "lock"`
        );
      }
      current = await sudo.prisma.admission.findUnique({ where: { id: args.admissionId } });
      const [newBed, currentBed] = await Promise.all([
        sudo.prisma.bed.findUnique({ where: { id: args.bedId } }),
        current?.bedId ? sudo.prisma.bed.findUnique({ where: { id: current.bedId } }) : null
      ]);
      if (!current || current.transitionVersion !== args.expectedVersion || !newBed || newBed.facilityId !== current.facilityId || newBed.status !== "available" || newBed.currentPatientId || current.bedId && currentBed?.currentPatientId !== current.patientId) {
        throw new Error("Admission or destination bed changed; refresh before retrying");
      }
      if (current.bedId) {
        await sudo.prisma.bed.update({
          where: { id: current.bedId },
          data: { status: "cleaning", currentPatientId: null, transitionVersion: { increment: 1 } }
        });
      }
      await sudo.prisma.bed.update({
        where: { id: args.bedId },
        data: { status: "occupied", currentPatientId: current.patientId, transitionVersion: { increment: 1 } }
      });
      await sudo.prisma.bedOccupancyEvent.create({
        data: {
          eventKey: `admission:${current.id}:transfer:v${current.transitionVersion + 1}`,
          eventType: "transferred",
          facilityId: current.facilityId,
          patientId: current.patientId,
          admissionId: current.id,
          bedId: args.bedId,
          previousBedId: current.bedId,
          actorReference: context.session.itemId,
          reasonCode,
          occurredAt: now
        }
      });
      const row = await sudo.query.Admission.updateOne({
        where: { id: current.id },
        data: {
          status: "transferred",
          room: { connect: { id: target.room.id } },
          bed: { connect: { id: args.bedId } }
        },
        query: "id status transitionVersion"
      });
      return recordAdmissionTransition(sudo.prisma, {
        ev,
        current,
        row,
        actorReference: context.session.itemId,
        occurredAt: now
      });
    }
    if (args.toStatus === "discharged") {
      if (current.bedId) {
        await sudo.prisma.$queryRaw(
          import_client16.Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`bed:${current.bedId}`}, 0))::text AS "lock"`
        );
        current = await sudo.prisma.admission.findUnique({ where: { id: args.admissionId } });
        const occupiedBed = current?.bedId ? await sudo.prisma.bed.findUnique({ where: { id: current.bedId } }) : null;
        if (!current || current.transitionVersion !== args.expectedVersion || !occupiedBed || occupiedBed.currentPatientId !== current.patientId) {
          throw new Error("Admission bed changed; refresh before retrying");
        }
        await sudo.prisma.bed.update({
          where: { id: current.bedId },
          data: { status: "cleaning", currentPatientId: null, transitionVersion: { increment: 1 } }
        });
      }
      await sudo.prisma.bedOccupancyEvent.create({
        data: {
          eventKey: `admission:${current.id}:released:v${current.transitionVersion + 1}`,
          eventType: "released",
          facilityId: current.facilityId,
          patientId: current.patientId,
          admissionId: current.id,
          bedId: current.bedId,
          actorReference: context.session.itemId,
          reasonCode: "discharge",
          occurredAt: now
        }
      });
      const row = await sudo.query.Admission.updateOne({
        where: { id: current.id },
        data: { status: "discharged", dischargeDisposition },
        query: "id status transitionVersion"
      });
      return recordAdmissionTransition(sudo.prisma, {
        ev,
        current,
        row,
        actorReference: context.session.itemId,
        occurredAt: now
      });
    }
    throw new Error("Unsupported admission transition");
  }, { timeout: 3e4 });
}
async function transitionBedReadiness(_root, args, context) {
  requireOperator2(context);
  if (!Number.isInteger(args.expectedVersion) || args.expectedVersion < 1) {
    throw new Error("Expected bed version is invalid");
  }
  const bed = await scopedBed(context, args.bedId);
  const facilityId = bed.facility?.id;
  if (!facilityId) throw new Error("Bed is missing direct facility scope");
  const ev = transitionEvidence(args.operationKey, {
    bedId: args.bedId,
    toStatus: args.toStatus,
    expectedVersion: args.expectedVersion
  });
  const allowed = {
    cleaning: ["available", "out_of_service"],
    available: ["out_of_service"],
    out_of_service: ["available"]
  };
  return context.transaction(async (transactionContext) => {
    const sudo = transactionContext.sudo();
    await lockTransitionOperation(sudo.prisma, ev.operationKeyHash);
    await sudo.prisma.$queryRaw(
      import_client16.Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`bed:${args.bedId}`}, 0))::text AS "lock"`
    );
    const replay = await replayTransition(sudo.prisma, ev, "bed", args.bedId);
    if (replay) return replay;
    const current = await sudo.prisma.bed.findUnique({ where: { id: args.bedId } });
    if (!current || current.facilityId !== facilityId || current.transitionVersion !== args.expectedVersion || current.currentPatientId) {
      throw new Error("Bed changed or remains occupied");
    }
    if (!allowed[current.status]?.includes(args.toStatus)) {
      throw new Error("Invalid bed readiness transition");
    }
    const now = /* @__PURE__ */ new Date();
    const updated = await sudo.prisma.bed.update({
      where: { id: current.id },
      data: { status: args.toStatus, transitionVersion: { increment: 1 } }
    });
    const metadata = {
      source: "bed_readiness_transition",
      aggregateType: "bed",
      aggregateId: current.id,
      fromStatus: current.status,
      status: updated.status,
      transitionVersion: updated.transitionVersion
    };
    const eventType = `bed.${updated.status}`;
    const audit = await sudo.prisma.clinicalAuditLog.create({
      data: {
        eventType,
        occurredAt: now,
        actorType: "staff_user",
        actorReference: context.session.itemId,
        facilityId,
        metadata,
        createdAt: now
      }
    });
    const outbox = await sudo.prisma.clinicalOutboxEvent.create({
      data: {
        eventKey: `bed:${current.id}:v${updated.transitionVersion}:${updated.status}`,
        eventType,
        aggregateType: "bed",
        aggregateId: current.id,
        status: "recorded",
        attempts: 0,
        nextAttemptAt: null,
        facilityId,
        payload: metadata,
        createdAt: now
      }
    });
    if (updated.status === "available") {
      await sudo.prisma.bedOccupancyEvent.create({
        data: {
          eventKey: `bed:${current.id}:available:v${updated.transitionVersion}`,
          eventType: "available",
          facilityId,
          bedId: current.id,
          actorReference: context.session.itemId,
          reasonCode: "readiness_complete",
          occurredAt: now
        }
      });
    }
    const result8 = {
      id: updated.id,
      status: updated.status,
      transitionVersion: updated.transitionVersion,
      replayed: false
    };
    await recordTransition(sudo.prisma, {
      evidence: ev,
      aggregateType: "bed",
      aggregateId: current.id,
      fromStatus: current.status,
      toStatus: updated.status,
      fromVersion: current.transitionVersion,
      toVersion: updated.transitionVersion,
      actorReference: context.session.itemId,
      facilityId,
      auditLogId: audit.id,
      outboxEventId: outbox.id,
      result: result8,
      occurredAt: now
    });
    return result8;
  }, { timeout: 3e4 });
}
async function createMedicalOrder(_root, { data }, context) {
  if (!ORDER_TYPES.has(data.orderType)) throw new Error("Order type is invalid");
  await scope(context, {
    facilityId: data.facilityId,
    patientId: data.patientId,
    encounterId: data.encounterId,
    providerId: data.orderingProviderId
  });
  const input = { ...data, summary: bounded4(data.summary, "Order summary", 4e3, true) };
  return createControlled(context, {
    model: "MedicalOrder",
    delegate: "medicalOrder",
    prefix: "medical_order",
    input,
    data: {
      orderNumber: `ORD-${(0, import_node_crypto12.randomUUID)()}`,
      orderType: data.orderType,
      facility: { connect: { id: data.facilityId } },
      patient: { connect: { id: data.patientId } },
      encounter: { connect: { id: data.encounterId } },
      orderingProvider: { connect: { id: data.orderingProviderId } },
      summary: input.summary
    }
  });
}
async function recordLabResult(_root, { data }, context) {
  if (JSON.stringify(data).length > 16e3) throw new Error("Original lab command is too large");
  if (!RESULT_FLAGS.has(data.abnormalFlag ?? "normal")) throw new Error("Result flag is invalid");
  const input = {
    ...data,
    resultValue: bounded4(data.resultValue, "Result value", 4e3, true),
    referenceRange: bounded4(data.referenceRange, "Reference range", 1e3)
  };
  return createControlled(context, {
    model: "LabResult",
    delegate: "labResult",
    prefix: "lab_result",
    input,
    originalLabCommand: data,
    data: {
      resultNumber: `RESULT-${(0, import_node_crypto12.randomUUID)()}`,
      facility: { connect: { id: data.facilityId } },
      patient: { connect: { id: data.patientId } },
      encounter: { connect: { id: data.encounterId } },
      medicalOrder: { connect: { id: data.medicalOrderId } },
      labTest: { connect: { id: data.labTestId } },
      resultValue: input.resultValue,
      referenceRange: input.referenceRange,
      abnormalFlag: data.abnormalFlag ?? "normal"
    }
  });
}
async function correctLabResult(_root, { data }, context) {
  if (JSON.stringify(data).length > 16e3) throw new Error("Original correction command is too large");
  const original = await context.query.LabResult.findOne({
    where: { id: data.resultId },
    query: "id status version facility { id } patient { id } encounter { id } medicalOrder { id } labTest { id }"
  });
  if (!original || !["final", "acknowledged", "corrected"].includes(original.status) || !original.facility?.id || !original.patient?.id || !original.encounter?.id || !original.medicalOrder?.id || !original.labTest?.id) {
    throw new Error("Final result not found or not accessible for correction");
  }
  await scope(context, {
    facilityId: original.facility.id,
    patientId: original.patient.id,
    encounterId: original.encounter.id
  });
  if (!RESULT_FLAGS.has(data.abnormalFlag ?? "normal")) throw new Error("Result flag is invalid");
  const input = {
    ...data,
    resultValue: bounded4(data.resultValue, "Corrected result value", 4e3, true),
    referenceRange: bounded4(data.referenceRange, "Reference range", 1e3)
  };
  const humanReviewReference = requireHumanEpisodeReview(data.humanReviewed, data.humanReviewReference);
  const ev = creationEvidence(input);
  return context.transaction(async (transactionContext) => {
    await transactionContext.prisma.$executeRaw(import_client16.Prisma.sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`);
    const fresh = await currentEpisodeActor(transactionContext);
    const accepted = await replayAcceptedLabCorrection(fresh, ev, data);
    if (accepted) {
      if (accepted.originalAcknowledgement.state.startsWith("legacy_")) throw new Error("Legacy correction identity verified, but original body/status/version acknowledgement is unknown. Use read-only result readback and retain the original command.");
      return accepted;
    }
    const child = await currentEpisodeChild(fresh, "LabResult", original.id);
    if (child.input.facilityId !== original.facility.id || child.input.patientId !== original.patient.id || child.input.encounterId !== original.encounter.id) throw new Error("Correction scope changed; review before retrying");
    const prior = await fresh.prisma.labResult.findUnique({ where: { operationKeyHash: ev.operationKeyHash }, select: { actorReference: true } });
    if (prior && prior.actorReference !== fresh.session.itemId) throw new Error("Original correction operation is not owned");
    const guarded = await guardEpisodeChild(fresh, child.input, "correction", true, Boolean(prior));
    await recheckEpisodeRelated(guarded.context, "LabResultCorrection", { ...child.input, medicalOrderId: original.medicalOrder.id, labTestId: original.labTest.id }, Boolean(prior));
    const sudo = guarded.context.sudo();
    await sudo.prisma.$queryRaw(
      import_client16.Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`lab-result-correction:${original.id}`}, 0))::text AS "lock"`
    );
    const existing = await sudo.prisma.labResult.findUnique({ where: { operationKeyHash: ev.operationKeyHash }, select: { id: true } });
    if (existing) throw new Error("Existing correction requires original receipt recovery; retain and retry the exact command");
    const priorCorrection = await sudo.prisma.labResult.findFirst({ where: { supersedesResultId: original.id }, select: { id: true } });
    if (priorCorrection) throw new Error("Result was already superseded; correct the latest version instead");
    const current = await sudo.prisma.labResult.findUnique({ where: { id: original.id }, select: {
      id: true,
      version: true,
      facilityId: true,
      patientId: true,
      encounterId: true,
      medicalOrderId: true,
      labTestId: true
    } });
    if (!current || current.version !== original.version || current.facilityId !== original.facility.id || current.patientId !== original.patient.id || current.encounterId !== original.encounter.id || current.medicalOrderId !== original.medicalOrder.id || current.labTestId !== original.labTest.id) throw new Error("Result changed; refresh before correcting");
    const created = await sudo.query.LabResult.createOne({
      data: {
        resultNumber: `RESULT-${(0, import_node_crypto12.randomUUID)()}`,
        facility: { connect: { id: original.facility.id } },
        patient: { connect: { id: original.patient.id } },
        encounter: { connect: { id: original.encounter.id } },
        medicalOrder: { connect: { id: original.medicalOrder.id } },
        labTest: { connect: { id: original.labTest.id } },
        supersedesResult: { connect: { id: original.id } },
        metadata: { humanReviewed: true, humanReviewReference, reviewedByReference: fresh.session.itemId, softwareClinicalDecisionPerformed: false },
        version: current.version + 1,
        resultValue: input.resultValue,
        referenceRange: input.referenceRange,
        abnormalFlag: data.abnormalFlag ?? "normal",
        ...ev
      },
      query: "id status transitionVersion"
    });
    const corrected = await sudo.query.LabResult.updateOne({
      where: { id: created.id },
      data: { status: "corrected" },
      query: "id status transitionVersion"
    });
    await persistOriginalLabReceipt(sudo.prisma, corrected, ev, data, fresh.session.itemId, {
      facilityId: original.facility.id,
      patientId: original.patient.id,
      encounterId: original.encounter.id,
      medicalOrderId: original.medicalOrder.id,
      labTestId: original.labTest.id
    }, current.version + 1, current.version);
    return projection2(corrected, false);
  }, { timeout: 3e4 });
}
async function createPrescription(_root, { data }, context) {
  await scope(context, {
    facilityId: data.facilityId,
    patientId: data.patientId,
    encounterId: data.encounterId,
    providerId: data.providerId
  });
  await validateRelatedOrder(context, {
    medicalOrderId: data.medicalOrderId,
    orderType: "medication",
    facilityId: data.facilityId,
    patientId: data.patientId,
    encounterId: data.encounterId
  });
  const recordingBasis = bounded4(data.recordingBasis, "Prescription recording basis", 80, true);
  if (!["external_record", "manual_reconciliation"].includes(recordingBasis)) {
    throw new Error("Prescription records must identify an external/manual recording basis");
  }
  const input = {
    ...data,
    recordingBasis,
    medicationName: bounded4(data.medicationName, "Medication name", 300, true),
    dosage: bounded4(data.dosage, "Dosage", 500, true),
    frequency: bounded4(data.frequency, "Frequency", 500, true),
    notes: bounded4(data.notes, "Prescription notes", 3e3)
  };
  return createControlled(context, {
    model: "Prescription",
    delegate: "prescription",
    prefix: "prescription",
    input,
    data: {
      prescriptionNumber: `RX-${(0, import_node_crypto12.randomUUID)()}`,
      facility: { connect: { id: data.facilityId } },
      patient: { connect: { id: data.patientId } },
      encounter: { connect: { id: data.encounterId } },
      provider: { connect: { id: data.providerId } },
      medicalOrder: data.medicalOrderId ? { connect: { id: data.medicalOrderId } } : void 0,
      recordingBasis,
      medicationName: input.medicationName,
      dosage: input.dosage,
      frequency: input.frequency,
      notes: input.notes
    }
  });
}
async function createProcedure(_root, { data }, context) {
  await scope(context, {
    facilityId: data.facilityId,
    patientId: data.patientId,
    encounterId: data.encounterId,
    providerId: data.providerId
  });
  await validateRelatedOrder(context, {
    medicalOrderId: data.medicalOrderId,
    orderType: "procedure",
    facilityId: data.facilityId,
    patientId: data.patientId,
    encounterId: data.encounterId
  });
  const input = {
    ...data,
    procedureName: bounded4(data.procedureName, "Procedure name", 300, true),
    notes: bounded4(data.notes, "Procedure notes", 3e3)
  };
  const scheduledAt = data.scheduledAt ? new Date(data.scheduledAt) : null;
  if (scheduledAt && Number.isNaN(scheduledAt.getTime())) throw new Error("Procedure schedule is invalid");
  return createControlled(context, {
    model: "Procedure",
    delegate: "procedure",
    prefix: "procedure",
    input,
    data: {
      procedureNumber: `PROC-${(0, import_node_crypto12.randomUUID)()}`,
      facility: { connect: { id: data.facilityId } },
      patient: { connect: { id: data.patientId } },
      encounter: { connect: { id: data.encounterId } },
      provider: { connect: { id: data.providerId } },
      medicalOrder: data.medicalOrderId ? { connect: { id: data.medicalOrderId } } : void 0,
      procedureName: input.procedureName,
      scheduledAt,
      notes: input.notes
    }
  });
}
async function createCarePlan(_root, { data }, context) {
  await scope(context, {
    facilityId: data.facilityId,
    patientId: data.patientId,
    encounterId: data.encounterId,
    providerId: data.providerId
  });
  const input = {
    ...data,
    title: bounded4(data.title, "Care plan title", 200, true),
    goals: bounded4(data.goals, "Care plan goals", 4e3, true),
    interventions: bounded4(data.interventions, "Care plan interventions", 4e3, true)
  };
  return createControlled(context, {
    model: "CarePlan",
    delegate: "carePlan",
    prefix: "care_plan",
    input,
    data: {
      title: input.title,
      facility: { connect: { id: data.facilityId } },
      patient: { connect: { id: data.patientId } },
      provider: { connect: { id: data.providerId } },
      encounter: data.encounterId ? { connect: { id: data.encounterId } } : void 0,
      goals: input.goals,
      interventions: input.interventions
    }
  });
}
async function appendClaimVersion(prisma, claimId, evidence, actorReference) {
  const claim = await prisma.insuranceClaim.findUnique({ where: { id: claimId } });
  if (!claim) throw new Error("Claim version source is missing");
  await prisma.claimVersion.create({ data: {
    versionKey: `${claim.id}:v${claim.transitionVersion}`,
    version: claim.transitionVersion,
    status: claim.status,
    ...evidence,
    facilityId: claim.facilityId,
    patientId: claim.patientId,
    claimId: claim.id,
    coverageId: claim.coverageId,
    reasonCode: claim.reasonCode || "",
    snapshot: {
      claimNumber: claim.claimNumber,
      status: claim.status,
      billedAmountCents: claim.billedAmountCents,
      paidAmountCents: claim.paidAmountCents,
      payerName: claim.payerName,
      reasonCode: claim.reasonCode || ""
    },
    actorReference,
    createdAt: /* @__PURE__ */ new Date()
  } });
}
function requireBillingOperator(context) {
  const role = context.session?.data.role;
  if (!role?.canAccessAllClinicalData && !role?.canManageBilling) {
    throw new Error("Billing permission is required to manage claims");
  }
}
function requireClinicalOrBillingOperator(context) {
  const role = context.session?.data.role;
  if (!role?.canAccessAllClinicalData && !role?.canManagePatients && !role?.canManageBilling) {
    throw new Error("Patient-operation or billing permission is required for this selector");
  }
}
async function facilityPatientScope(context, input) {
  const [facility, patient] = await Promise.all([
    context.query.Facility.findOne({ where: { id: input.facilityId }, query: "id status" }),
    context.query.Patient.findOne({ where: { id: input.patientId }, query: "id status facilities { id }" })
  ]);
  if (!facility || facility.status !== "active" || patient?.status !== "active" || !patient.facilities?.some((item) => item.id === input.facilityId)) throw new Error("Facility or patient not found or not accessible");
}
async function billingScope(context, input) {
  requireBillingOperator(context);
  await facilityPatientScope(context, input);
  if (input.encounterId) {
    const encounter = await context.sudo().query.Encounter.findOne({
      where: { id: input.encounterId },
      query: "id patient { id } facility { id }"
    });
    if (encounter?.patient?.id !== input.patientId || encounter?.facility?.id !== input.facilityId) {
      throw new Error("Encounter does not match the accessible billing patient and facility");
    }
  }
}
async function workflowPatientCandidates(_root, args, context) {
  requireClinicalOrBillingOperator(context);
  const facilityId = bounded4(args.facilityId, "Facility reference", 200, true);
  const facility = await context.query.Facility.findOne({ where: { id: facilityId }, query: "id status" });
  if (!facility || facility.status !== "active") throw new Error("Facility not found or not accessible");
  const search = bounded4(args.search, "Patient search", 100, true);
  if (search.length < 2) throw new Error("Enter at least two characters to search patients");
  const terms = search.split(/\s+/).filter(Boolean).slice(0, 2);
  const nameFilters = terms.flatMap((term) => [
    { firstName: { contains: term, mode: "insensitive" } },
    { lastName: { contains: term, mode: "insensitive" } },
    { id: { contains: term, mode: "insensitive" } }
  ]);
  if (terms.length > 1) nameFilters.push(
    { AND: [{ firstName: { contains: terms[0], mode: "insensitive" } }, { lastName: { contains: terms[1], mode: "insensitive" } }] },
    { AND: [{ firstName: { contains: terms[1], mode: "insensitive" } }, { lastName: { contains: terms[0], mode: "insensitive" } }] }
  );
  return context.query.Patient.findMany({
    where: {
      status: { equals: "active" },
      facilities: { some: { id: { equals: facilityId } } },
      OR: nameFilters
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
    take: Math.min(Math.max(Number.isInteger(args.take) ? args.take : 25, 1), 25),
    query: "id displayName"
  });
}
async function workflowEncounterCandidates(_root, args, context) {
  requireClinicalOrBillingOperator(context);
  await facilityPatientScope(context, { facilityId: args.facilityId, patientId: args.patientId });
  const search = bounded4(args.search, "Encounter search", 100, true);
  if (search.length < 2) throw new Error("Enter at least two characters to search encounters");
  const take = Number.isInteger(args.take) ? Math.min(Math.max(args.take, 1), 25) : 25;
  const skip = Number.isInteger(args.skip) ? Math.min(Math.max(args.skip, 0), 5e3) : 0;
  return context.sudo().prisma.encounter.findMany({
    where: {
      facilityId: args.facilityId,
      patientId: args.patientId,
      status: { in: ["open", "in_progress", "closed"] },
      encounterNumber: { contains: search, mode: "insensitive" }
    },
    select: { id: true, encounterNumber: true, status: true },
    orderBy: [{ encounterNumber: "asc" }, { id: "asc" }],
    take,
    skip
  });
}
async function prepareInsuranceClaim(_root, { data }, context) {
  requireBillingOperator(context);
  await billingScope(context, {
    facilityId: data.facilityId,
    patientId: data.patientId,
    encounterId: data.encounterId
  });
  if (data.coverageId) {
    const coverage = await context.query.PatientCoverage.findOne({
      where: { id: data.coverageId },
      query: "id status facility { id } patient { id } payerName"
    });
    if (!coverage || coverage.status !== "active" || coverage.facility?.id !== data.facilityId || coverage.patient?.id !== data.patientId) throw new Error("Active coverage does not match the claim patient and facility");
  }
  const input = { ...data, payerName: bounded4(data.payerName, "Payer name", 300, true) };
  if (!Number.isSafeInteger(data.billedAmountCents) || data.billedAmountCents < 0) {
    throw new Error("Billed amount must be non-negative integer cents");
  }
  return createControlled(context, {
    model: "InsuranceClaim",
    delegate: "insuranceClaim",
    prefix: "insurance_claim",
    input,
    data: {
      claimNumber: `CLAIM-${(0, import_node_crypto12.randomUUID)()}`,
      facility: { connect: { id: data.facilityId } },
      patient: { connect: { id: data.patientId } },
      encounter: { connect: { id: data.encounterId } },
      payerName: input.payerName,
      billedAmountCents: data.billedAmountCents,
      coverage: data.coverageId ? { connect: { id: data.coverageId } } : void 0
    },
    afterCreate: (prisma, row, evidence) => appendClaimVersion(prisma, row.id, evidence, context.session.itemId)
  });
}
function transitionInsuranceClaim(_root, args, context) {
  requireBillingOperator(context);
  if (["external_acknowledged", "external_rejected", "accepted", "denied"].includes(args.toStatus)) {
    throw new Error("Payer acknowledgement states require a verified signed integration event");
  }
  const notes = bounded4(args.notes, "Claim transition notes", 2e3);
  const reasonCode = bounded4(
    args.reasonCode,
    "Claim transition reason",
    80,
    args.toStatus === "corrected"
  );
  return transitionControlled(context, {
    model: "InsuranceClaim",
    delegate: "insuranceClaim",
    prefix: "insurance_claim",
    id: args.claimId,
    toStatus: args.toStatus,
    expectedVersion: args.expectedVersion,
    operationKey: args.operationKey,
    authorize: requireBillingOperator,
    data: { reasonCode, denialReason: notes },
    afterTransition: (prisma, _current, row, evidence) => appendClaimVersion(prisma, row.id, evidence, context.session.itemId)
  });
}
var import_node_crypto12, import_client16, KEY_PATTERN2, ORDER_TYPES, RESULT_FLAGS, transitionMedicalOrder, transitionLabResult, transitionPrescription, transitionProcedure, transitionCarePlan;
var init_controlledWorkflows = __esm({
  "features/keystone/mutations/clinical/controlledWorkflows.ts"() {
    "use strict";
    import_node_crypto12 = require("node:crypto");
    import_client16 = require("@prisma/client");
    init_transitionEvidence();
    init_evidence();
    init_episodeFence();
    init_episodeRelatedScope();
    init_episodePolicy();
    init_labResultRecovery();
    KEY_PATTERN2 = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,199}$/;
    ORDER_TYPES = /* @__PURE__ */ new Set(["lab", "medication", "imaging", "procedure", "consult"]);
    RESULT_FLAGS = /* @__PURE__ */ new Set(["normal", "low", "high", "critical"]);
    transitionMedicalOrder = (_root, args, context) => transitionControlled(context, {
      model: "MedicalOrder",
      delegate: "medicalOrder",
      prefix: "medical_order",
      id: args.orderId,
      toStatus: args.toStatus,
      expectedVersion: args.expectedVersion,
      operationKey: args.operationKey
    });
    transitionLabResult = (_root, args, context) => transitionControlled(context, {
      model: "LabResult",
      delegate: "labResult",
      prefix: "lab_result",
      id: args.resultId,
      toStatus: args.toStatus,
      expectedVersion: args.expectedVersion,
      operationKey: args.operationKey,
      data: args.toStatus === "acknowledged" ? { acknowledgedBy: { connect: { id: context.session.itemId } } } : {}
    });
    transitionPrescription = (_root, args, context) => transitionControlled(context, {
      model: "Prescription",
      delegate: "prescription",
      prefix: "prescription",
      id: args.prescriptionId,
      toStatus: args.toStatus,
      expectedVersion: args.expectedVersion,
      operationKey: args.operationKey
    });
    transitionProcedure = (_root, args, context) => transitionControlled(context, {
      model: "Procedure",
      delegate: "procedure",
      prefix: "procedure",
      id: args.procedureId,
      toStatus: args.toStatus,
      expectedVersion: args.expectedVersion,
      operationKey: args.operationKey
    });
    transitionCarePlan = (_root, args, context) => transitionControlled(context, {
      model: "CarePlan",
      delegate: "carePlan",
      prefix: "care_plan",
      id: args.carePlanId,
      toStatus: args.toStatus,
      expectedVersion: args.expectedVersion,
      operationKey: args.operationKey
    });
  }
});

// features/keystone/mutations/operational/billingWorkflows.ts
function requireBilling(context) {
  const role = context.session?.data.role;
  if (!role?.canManageBilling) {
    throw new Error("Not authorized to manage billing operations");
  }
}
function result(row, replayed = false) {
  return { id: row.id, status: row.status, transitionVersion: row.transitionVersion, replayed };
}
async function scopedInstallation(context, installationId, facilityId, kind) {
  if (!installationId) return null;
  const installation = await context.query.IntegrationInstallation.findOne({
    where: { id: installationId },
    query: "id status kind transitionVersion facility { id }"
  });
  if (!installation || installation.status !== "active" || installation.kind !== kind || installation.facility?.id !== facilityId) {
    throw new Error(`Active ${kind} integration not found in the facility`);
  }
  return installation;
}
async function recordPatientCoverage(_root, { data }, context) {
  requireBilling(context);
  await scopedFacilityPatient(context, data.facilityId, data.patientId);
  const input = {
    ...data,
    payerName: bounded2(data.payerName, "Payer name", 300, true),
    memberId: bounded2(data.memberId, "Member ID", 300, true),
    groupNumber: bounded2(data.groupNumber, "Group number", 300)
  };
  const evidence = operationEvidence(input);
  return context.transaction(async (transactionContext) => {
    const prisma = transactionContext.sudo().prisma;
    await lockOperation(prisma, "coverage-create", evidence.operationKeyHash);
    const existing = await prisma.patientCoverage.findUnique({ where: { operationKeyHash: evidence.operationKeyHash } });
    if (existing) {
      if (existing.requestHash !== evidence.requestHash) throw new Error("Operation key was reused with a different payload");
      return result(existing, true);
    }
    const now = /* @__PURE__ */ new Date();
    const coverage = await prisma.patientCoverage.create({
      data: {
        coverageNumber: `COV-${(0, import_node_crypto13.randomUUID)()}`,
        status: "unverified",
        transitionVersion: 1,
        ...evidence,
        actorReference: context.session.itemId,
        facilityId: data.facilityId,
        patientId: data.patientId,
        payerName: input.payerName,
        memberId: input.memberId,
        groupNumber: input.groupNumber,
        effectiveAt: data.effectiveAt ? new Date(data.effectiveAt) : null,
        terminatesAt: data.terminatesAt ? new Date(data.terminatesAt) : null
      }
    });
    await appendAuditAndOutbox(prisma, {
      eventKey: `coverage:${coverage.id}:v1:recorded`,
      eventType: "coverage.recorded",
      aggregateType: "coverage",
      aggregateId: coverage.id,
      facilityId: coverage.facilityId,
      patientId: coverage.patientId,
      actorReference: context.session.itemId,
      metadata: { source: "coverage_workflow", aggregateId: coverage.id, status: coverage.status, transitionVersion: 1 },
      occurredAt: now
    });
    return result(coverage);
  }, { timeout: 3e4 });
}
async function transitionPatientCoverage(_root, args, context) {
  requireBilling(context);
  if (!Number.isInteger(args.expectedVersion) || args.expectedVersion < 1) throw new Error("Expected coverage version is invalid");
  const scoped2 = await context.query.PatientCoverage.findOne({ where: { id: args.coverageId }, query: "id" });
  if (!scoped2) throw new Error("Coverage not found or not accessible");
  const reasonCode = bounded2(
    args.reasonCode,
    "Coverage evidence reason",
    80,
    ["active", "rejected"].includes(args.toStatus)
  );
  const evidence = transitionEvidence(args.operationKey, {
    coverageId: args.coverageId,
    toStatus: args.toStatus,
    expectedVersion: args.expectedVersion,
    reasonCode
  });
  const allowed = {
    unverified: ["active", "rejected", "inactive"],
    active: ["inactive"],
    inactive: [],
    rejected: ["unverified"]
  };
  return context.transaction(async (transactionContext) => {
    const prisma = transactionContext.sudo().prisma;
    await lockTransitionOperation(prisma, evidence.operationKeyHash);
    await prisma.$queryRaw(import_client17.Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`coverage:${args.coverageId}`}, 0))::text AS "lock"`);
    const replay = await replayTransition(prisma, evidence, "coverage", args.coverageId);
    if (replay) return replay;
    const current = await prisma.patientCoverage.findUnique({ where: { id: args.coverageId } });
    if (!current || current.transitionVersion !== args.expectedVersion) throw new Error("Coverage changed; refresh before retrying");
    if (!allowed[current.status]?.includes(args.toStatus)) throw new Error(`Invalid coverage transition from ${current.status} to ${args.toStatus}`);
    const now = /* @__PURE__ */ new Date();
    const updated = await prisma.patientCoverage.update({
      where: { id: current.id },
      data: {
        status: args.toStatus,
        transitionVersion: { increment: 1 },
        actorReference: context.session.itemId,
        ...args.toStatus === "active" ? { verifiedAt: now, verifiedById: context.session.itemId } : {}
      }
    });
    const events = await appendAuditAndOutbox(prisma, {
      eventKey: `coverage:${updated.id}:v${updated.transitionVersion}:${updated.status}`,
      eventType: `coverage.${updated.status}`,
      aggregateType: "coverage",
      aggregateId: updated.id,
      facilityId: updated.facilityId,
      patientId: updated.patientId,
      actorReference: context.session.itemId,
      metadata: { source: "coverage_workflow", aggregateId: updated.id, fromStatus: current.status, status: updated.status, transitionVersion: updated.transitionVersion, reasonCode },
      occurredAt: now
    });
    const projected = result(updated);
    await recordTransition(prisma, {
      evidence,
      aggregateType: "coverage",
      aggregateId: updated.id,
      fromStatus: current.status,
      toStatus: updated.status,
      fromVersion: current.transitionVersion,
      toVersion: updated.transitionVersion,
      actorReference: context.session.itemId,
      facilityId: updated.facilityId,
      patientId: updated.patientId,
      auditLogId: events.audit.id,
      outboxEventId: events.outbox.id,
      result: projected,
      occurredAt: now
    });
    return projected;
  }, { timeout: 3e4 });
}
async function recordPatientPayment(_root, { data }, context) {
  requireBilling(context);
  await scopedFacilityPatient(context, data.facilityId, data.patientId);
  const amountCents = requireSafeCents(data.amountCents, "Payment amount");
  const method = bounded2(data.method, "Payment method", 40, true);
  if (!["cash", "check", "card_external", "bank_external"].includes(method)) throw new Error("Payment method is invalid");
  const isExternal = method.endsWith("_external");
  const installation = await scopedInstallation(context, data.installationId, data.facilityId, "payment");
  if (isExternal && !installation) throw new Error("External payments require an active payment integration");
  if (!isExternal && installation) throw new Error("Manual payments cannot use an external integration");
  if (data.claimId) {
    const claim = await context.query.InsuranceClaim.findOne({ where: { id: data.claimId }, query: "id facility { id } patient { id }" });
    if (!claim || claim.facility?.id !== data.facilityId || claim.patient?.id !== data.patientId) throw new Error("Claim does not match the payment scope");
  }
  const input = { ...data, amountCents, method, currency: bounded2(data.currency || "USD", "Currency", 3, true).toUpperCase() };
  if (!/^[A-Z]{3}$/.test(input.currency)) throw new Error("Currency is invalid");
  const evidence = operationEvidence(input);
  return context.transaction(async (transactionContext) => {
    const prisma = transactionContext.sudo().prisma;
    await lockOperation(prisma, "payment-create", evidence.operationKeyHash);
    const existing = await prisma.patientPayment.findUnique({ where: { operationKeyHash: evidence.operationKeyHash } });
    if (existing) {
      if (existing.requestHash !== evidence.requestHash) throw new Error("Operation key was reused with a different payload");
      return result(existing, true);
    }
    const now = /* @__PURE__ */ new Date();
    const payment = await prisma.patientPayment.create({
      data: {
        paymentNumber: `PAY-${(0, import_node_crypto13.randomUUID)()}`,
        status: isExternal ? "pending" : "succeeded",
        transitionVersion: 1,
        ...evidence,
        actorReference: context.session.itemId,
        facilityId: data.facilityId,
        patientId: data.patientId,
        claimId: data.claimId || null,
        installationId: installation?.id || null,
        amountCents,
        refundedAmountCents: 0,
        currency: input.currency,
        method,
        externalReference: bounded2(data.externalReference, "External reference", 300),
        receivedAt: isExternal ? null : now
      }
    });
    await appendAuditAndOutbox(prisma, {
      eventKey: `payment:${payment.id}:v1:${payment.status}`,
      eventType: `payment.${payment.status}`,
      aggregateType: "payment",
      aggregateId: payment.id,
      facilityId: payment.facilityId,
      patientId: payment.patientId,
      actorReference: context.session.itemId,
      deliveryMode: isExternal ? "external" : "internal",
      installationId: installation?.id,
      installationVersion: installation?.transitionVersion,
      metadata: { source: "payment_workflow", aggregateId: payment.id, status: payment.status, transitionVersion: 1, amountCents, currency: input.currency },
      occurredAt: now
    });
    return result(payment);
  }, { timeout: 3e4 });
}
async function transitionPaymentLike(context, options) {
  requireBilling(context);
  if (!Number.isInteger(options.expectedVersion) || options.expectedVersion < 1) throw new Error("Expected billing version is invalid");
  if (!["succeeded", "failed", "cancelled"].includes(options.toStatus)) throw new Error("Billing transition status is invalid");
  if (options.toStatus === "succeeded") throw new Error("External billing success requires a verified integration event");
  const scoped2 = await context.query[options.model].findOne({ where: { id: options.id }, query: "id" });
  if (!scoped2) throw new Error("Billing record not found or not accessible");
  const reasonCode = bounded2(options.reasonCode, "Billing transition reason", 80, options.toStatus !== "succeeded");
  const externalReference = bounded2(options.externalReference, "External reference", 300);
  const evidence = transitionEvidence(options.operationKey, {
    aggregateId: options.id,
    expectedVersion: options.expectedVersion,
    toStatus: options.toStatus,
    reasonCode,
    externalReference
  });
  return context.transaction(async (transactionContext) => {
    const prisma = transactionContext.sudo().prisma;
    await lockTransitionOperation(prisma, evidence.operationKeyHash);
    await prisma.$queryRaw(import_client17.Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${options.aggregateType}:${options.id}`}, 0))::text AS "lock"`);
    const replay = await replayTransition(prisma, evidence, options.aggregateType, options.id);
    if (replay) return replay;
    const current = await prisma[options.delegate].findUnique({ where: { id: options.id } });
    if (!current || current.status !== "pending" || current.transitionVersion !== options.expectedVersion) throw new Error("Billing record changed or is no longer pending");
    const now = /* @__PURE__ */ new Date();
    if (options.aggregateType === "refund") {
      await prisma.$queryRaw(import_client17.Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`payment-refund:${current.paymentId}`}, 0))::text AS "lock"`);
    }
    const updated = await prisma[options.delegate].update({ where: { id: current.id }, data: {
      status: options.toStatus,
      transitionVersion: { increment: 1 },
      actorReference: context.session.itemId,
      ...externalReference ? { externalReference } : {},
      ...options.aggregateType === "payment" && options.toStatus === "succeeded" ? { receivedAt: now } : {},
      ...options.aggregateType === "payment" && options.toStatus === "failed" ? { failedAt: now } : {},
      ...options.aggregateType === "refund" && options.toStatus === "succeeded" ? { completedAt: now } : {},
      ...options.aggregateType === "refund" && options.toStatus === "failed" ? { failedAt: now } : {}
    } });
    if (options.aggregateType === "refund" && options.toStatus === "succeeded") {
      await prisma.patientPayment.update({ where: { id: current.paymentId }, data: { refundedAmountCents: { increment: current.amountCents } } });
    }
    const events = await appendAuditAndOutbox(prisma, {
      eventKey: `${options.aggregateType}:${updated.id}:v${updated.transitionVersion}:${updated.status}`,
      eventType: `${options.aggregateType}.${updated.status}`,
      aggregateType: options.aggregateType,
      aggregateId: updated.id,
      facilityId: updated.facilityId,
      patientId: updated.patientId,
      actorReference: context.session.itemId,
      metadata: { source: "billing_workflow", aggregateId: updated.id, fromStatus: current.status, status: updated.status, transitionVersion: updated.transitionVersion, reasonCode },
      occurredAt: now
    });
    const projected = result(updated);
    await recordTransition(prisma, {
      evidence,
      aggregateType: options.aggregateType,
      aggregateId: updated.id,
      fromStatus: current.status,
      toStatus: updated.status,
      fromVersion: current.transitionVersion,
      toVersion: updated.transitionVersion,
      actorReference: context.session.itemId,
      facilityId: updated.facilityId,
      patientId: updated.patientId,
      auditLogId: events.audit.id,
      outboxEventId: events.outbox.id,
      result: projected,
      occurredAt: now
    });
    return projected;
  }, { timeout: 3e4 });
}
function transitionPatientPayment(_root, args, context) {
  return transitionPaymentLike(context, {
    model: "PatientPayment",
    delegate: "patientPayment",
    aggregateType: "payment",
    id: args.paymentId,
    expectedVersion: args.expectedVersion,
    toStatus: args.toStatus,
    operationKey: args.operationKey,
    reasonCode: args.reasonCode,
    externalReference: args.externalReference
  });
}
function transitionPatientRefund(_root, args, context) {
  return transitionPaymentLike(context, {
    model: "PatientRefund",
    delegate: "patientRefund",
    aggregateType: "refund",
    id: args.refundId,
    expectedVersion: args.expectedVersion,
    toStatus: args.toStatus,
    operationKey: args.operationKey,
    reasonCode: args.reasonCode,
    externalReference: args.externalReference
  });
}
async function requestPatientRefund(_root, { data }, context) {
  requireBilling(context);
  const amountCents = requireSafeCents(data.amountCents, "Refund amount");
  const reasonCode = bounded2(data.reasonCode, "Refund reason", 80, true);
  const scoped2 = await context.query.PatientPayment.findOne({ where: { id: data.paymentId }, query: "id" });
  if (!scoped2) throw new Error("Payment not found or not accessible");
  const evidence = operationEvidence({ ...data, amountCents, reasonCode });
  return context.transaction(async (transactionContext) => {
    const prisma = transactionContext.sudo().prisma;
    await lockOperation(prisma, "refund-create", evidence.operationKeyHash);
    const existing = await prisma.patientRefund.findUnique({ where: { operationKeyHash: evidence.operationKeyHash } });
    if (existing) {
      if (existing.requestHash !== evidence.requestHash) throw new Error("Operation key was reused with a different payload");
      return result(existing, true);
    }
    await prisma.$queryRaw(import_client17.Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`payment-refund:${data.paymentId}`}, 0))::text AS "lock"`);
    const payment = await prisma.patientPayment.findUnique({ where: { id: data.paymentId } });
    if (!payment || payment.status !== "succeeded") throw new Error("Only a succeeded payment can be refunded");
    const reserved = await prisma.patientRefund.aggregate({
      where: { paymentId: payment.id, status: { in: ["pending", "succeeded"] } },
      _sum: { amountCents: true }
    });
    if (Number(reserved._sum.amountCents || 0) + amountCents > payment.amountCents) throw new Error("Refund would exceed the captured payment amount");
    const isExternal = ["card_external", "bank_external"].includes(payment.method);
    if (isExternal && !payment.installationId) throw new Error("External payment is missing its payment integration");
    const paymentInstallation = isExternal ? await prisma.integrationInstallation.findUnique({ where: { id: payment.installationId } }) : null;
    if (isExternal && (!paymentInstallation || paymentInstallation.status !== "active" || paymentInstallation.facilityId !== payment.facilityId)) {
      throw new Error("External payment integration is no longer active");
    }
    const now = /* @__PURE__ */ new Date();
    const refund = await prisma.patientRefund.create({
      data: {
        refundNumber: `REF-${(0, import_node_crypto13.randomUUID)()}`,
        status: isExternal ? "pending" : "succeeded",
        transitionVersion: 1,
        ...evidence,
        actorReference: context.session.itemId,
        facilityId: payment.facilityId,
        patientId: payment.patientId,
        paymentId: payment.id,
        installationId: payment.installationId,
        amountCents,
        reasonCode,
        completedAt: isExternal ? null : now
      }
    });
    if (!isExternal) {
      await prisma.patientPayment.update({ where: { id: payment.id }, data: { refundedAmountCents: { increment: amountCents } } });
    }
    await appendAuditAndOutbox(prisma, {
      eventKey: `refund:${refund.id}:v1:${refund.status}`,
      eventType: `refund.${refund.status}`,
      aggregateType: "refund",
      aggregateId: refund.id,
      facilityId: refund.facilityId,
      patientId: refund.patientId,
      actorReference: context.session.itemId,
      deliveryMode: isExternal ? "external" : "internal",
      installationId: payment.installationId,
      installationVersion: paymentInstallation?.transitionVersion,
      metadata: { source: "refund_workflow", aggregateId: refund.id, paymentId: payment.id, status: refund.status, transitionVersion: 1, amountCents },
      occurredAt: now
    });
    return result(refund);
  }, { timeout: 3e4 });
}
var import_node_crypto13, import_client17;
var init_billingWorkflows = __esm({
  "features/keystone/mutations/operational/billingWorkflows.ts"() {
    "use strict";
    import_node_crypto13 = require("node:crypto");
    import_client17 = require("@prisma/client");
    init_transitionEvidence();
    init_evidence();
  }
});

// features/keystone/mutations/operational/inventoryWorkflows.ts
function requireInventory(context) {
  const role = context.session?.data.role;
  if (!role?.canManageInventory) {
    throw new Error("Not authorized to manage inventory");
  }
}
function itemResult(row, replayed = false) {
  return {
    id: row.id,
    status: row.status,
    transitionVersion: row.transitionVersion,
    quantityOnHand: row.quantityOnHand,
    quantityReserved: row.quantityReserved,
    replayed
  };
}
async function createInventoryItem(_root, { data }, context) {
  requireInventory(context);
  const facility = await context.query.Facility.findOne({ where: { id: data.facilityId }, query: "id status" });
  if (!facility || facility.status !== "active") throw new Error("Facility not found or not accessible");
  const input = {
    ...data,
    sku: bounded2(data.sku, "SKU", 100, true).toUpperCase(),
    name: bounded2(data.name, "Inventory item name", 300, true),
    unit: bounded2(data.unit, "Inventory unit", 80, true)
  };
  const initialQuantity = Number(data.initialQuantity || 0);
  const reorderPoint = Number(data.reorderPoint || 0);
  if (!Number.isSafeInteger(initialQuantity) || initialQuantity < 0 || !Number.isSafeInteger(reorderPoint) || reorderPoint < 0) {
    throw new Error("Inventory quantities must be non-negative integers");
  }
  const evidence = operationEvidence(input);
  return context.transaction(async (transactionContext) => {
    const prisma = transactionContext.sudo().prisma;
    await lockOperation(prisma, "inventory-item-create", evidence.operationKeyHash);
    const existing = await prisma.inventoryItem.findUnique({ where: { operationKeyHash: evidence.operationKeyHash } });
    if (existing) {
      if (existing.requestHash !== evidence.requestHash) throw new Error("Operation key was reused with a different payload");
      return itemResult(existing, true);
    }
    const duplicateSku = await prisma.inventoryItem.findFirst({ where: { facilityId: data.facilityId, sku: input.sku } });
    if (duplicateSku) throw new Error("Inventory SKU already exists in the facility");
    const now = /* @__PURE__ */ new Date();
    const item = await prisma.inventoryItem.create({
      data: {
        sku: input.sku,
        name: input.name,
        unit: input.unit,
        status: "active",
        transitionVersion: 1,
        quantityOnHand: initialQuantity,
        quantityReserved: 0,
        reorderPoint,
        ...evidence,
        actorReference: context.session.itemId,
        facilityId: data.facilityId
      }
    });
    if (initialQuantity > 0) {
      await prisma.inventoryMovement.create({
        data: {
          movementNumber: `MOV-${(0, import_node_crypto14.randomUUID)()}`,
          operationKeyHash: hash(`initial:${evidence.operationKeyHash}`),
          requestHash: evidence.requestHash,
          movementType: "receive",
          quantityDelta: initialQuantity,
          resultingOnHand: initialQuantity,
          reservedDelta: 0,
          resultingReserved: 0,
          reasonCode: "initial_balance",
          facilityId: data.facilityId,
          itemId: item.id,
          actorReference: context.session.itemId,
          occurredAt: now
        }
      });
    }
    await appendAuditAndOutbox(prisma, {
      eventKey: `inventory_item:${item.id}:v1:created`,
      eventType: "inventory_item.created",
      aggregateType: "inventory_item",
      aggregateId: item.id,
      facilityId: item.facilityId,
      actorReference: context.session.itemId,
      metadata: { source: "inventory_workflow", aggregateId: item.id, status: item.status, transitionVersion: 1 },
      occurredAt: now
    });
    return itemResult(item);
  }, { timeout: 3e4 });
}
async function transitionInventoryItem(_root, args, context) {
  requireInventory(context);
  const scoped2 = await context.query.InventoryItem.findOne({ where: { id: args.itemId }, query: "id" });
  if (!scoped2) throw new Error("Inventory item not found or not accessible");
  if (!Number.isInteger(args.expectedVersion) || args.expectedVersion < 1) throw new Error("Expected inventory version is invalid");
  if (!["active", "inactive"].includes(args.toStatus)) throw new Error("Inventory status is invalid");
  const reasonCode = bounded2(args.reasonCode, "Inventory status reason", 80, true);
  const evidence = transitionEvidence(args.operationKey, { itemId: args.itemId, expectedVersion: args.expectedVersion, toStatus: args.toStatus, reasonCode });
  return context.transaction(async (transactionContext) => {
    const prisma = transactionContext.sudo().prisma;
    await lockTransitionOperation(prisma, evidence.operationKeyHash);
    await prisma.$queryRaw(import_client18.Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`inventory-item:${args.itemId}`}, 0))::text AS "lock"`);
    const replay = await replayTransition(prisma, evidence, "inventory_item", args.itemId);
    if (replay) return replay;
    const current = await prisma.inventoryItem.findUnique({ where: { id: args.itemId } });
    if (!current || current.transitionVersion !== args.expectedVersion || current.status === args.toStatus) throw new Error("Inventory item changed; refresh before retrying");
    if (args.toStatus === "inactive" && current.quantityReserved > 0) throw new Error("Reserved inventory must be released before deactivation");
    const now = /* @__PURE__ */ new Date();
    const updated = await prisma.inventoryItem.update({ where: { id: current.id }, data: { status: args.toStatus, transitionVersion: { increment: 1 }, actorReference: context.session.itemId } });
    const events = await appendAuditAndOutbox(prisma, {
      eventKey: `inventory_item:${updated.id}:v${updated.transitionVersion}:${updated.status}`,
      eventType: `inventory_item.${updated.status}`,
      aggregateType: "inventory_item",
      aggregateId: updated.id,
      facilityId: updated.facilityId,
      actorReference: context.session.itemId,
      metadata: { source: "inventory_workflow", aggregateId: updated.id, fromStatus: current.status, status: updated.status, transitionVersion: updated.transitionVersion, reasonCode },
      occurredAt: now
    });
    const projected = itemResult(updated);
    await recordTransition(prisma, {
      evidence,
      aggregateType: "inventory_item",
      aggregateId: updated.id,
      fromStatus: current.status,
      toStatus: updated.status,
      fromVersion: current.transitionVersion,
      toVersion: updated.transitionVersion,
      actorReference: context.session.itemId,
      facilityId: updated.facilityId,
      auditLogId: events.audit.id,
      outboxEventId: events.outbox.id,
      result: projected,
      occurredAt: now
    });
    return projected;
  }, { timeout: 3e4 });
}
async function moveInventory(_root, { data }, context) {
  requireInventory(context);
  if (!Number.isInteger(data.expectedVersion) || data.expectedVersion < 1) throw new Error("Expected inventory version is invalid");
  const movementType = bounded2(data.movementType, "Movement type", 40, true);
  if (!["receive", "consume", "adjust", "reserve", "release"].includes(movementType)) throw new Error("Inventory movement type is invalid");
  const quantityDelta = Number(data.quantityDelta || 0);
  const reservedDelta = Number(data.reservedDelta || 0);
  if (!Number.isSafeInteger(quantityDelta) || !Number.isSafeInteger(reservedDelta)) throw new Error("Inventory movement quantities must be integers");
  if (movementType === "receive" && (quantityDelta <= 0 || reservedDelta !== 0)) throw new Error("Receive movement must add on-hand quantity");
  if (movementType === "consume" && (quantityDelta >= 0 || reservedDelta !== 0)) throw new Error("Consume movement must subtract on-hand quantity");
  if (movementType === "reserve" && (quantityDelta !== 0 || reservedDelta <= 0)) throw new Error("Reserve movement must add reserved quantity");
  if (movementType === "release" && (quantityDelta !== 0 || reservedDelta >= 0)) throw new Error("Release movement must subtract reserved quantity");
  if (movementType === "adjust" && (quantityDelta === 0 || reservedDelta !== 0)) throw new Error("Adjustment must change on-hand quantity");
  const reasonCode = bounded2(data.reasonCode, "Inventory reason", 80, true);
  const scoped2 = await context.query.InventoryItem.findOne({ where: { id: data.itemId }, query: "id" });
  if (!scoped2) throw new Error("Inventory item not found or not accessible");
  const evidence = operationEvidence({ ...data, movementType, quantityDelta, reservedDelta, reasonCode });
  return context.transaction(async (transactionContext) => {
    const prisma = transactionContext.sudo().prisma;
    await lockOperation(prisma, "inventory-movement", evidence.operationKeyHash);
    const existing = await prisma.inventoryMovement.findUnique({ where: { operationKeyHash: evidence.operationKeyHash } });
    if (existing) {
      if (existing.requestHash !== evidence.requestHash) throw new Error("Operation key was reused with a different payload");
      const item2 = await prisma.inventoryItem.findUnique({ where: { id: existing.itemId } });
      if (!item2) throw new Error("Inventory replay item is missing");
      return itemResult(item2, true);
    }
    await prisma.$queryRaw(import_client18.Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`inventory-item:${data.itemId}`}, 0))::text AS "lock"`);
    const item = await prisma.inventoryItem.findUnique({ where: { id: data.itemId } });
    if (!item || item.status !== "active" || item.transitionVersion !== data.expectedVersion) {
      throw new Error("Inventory item changed or is inactive; refresh before retrying");
    }
    const nextOnHand = item.quantityOnHand + quantityDelta;
    const nextReserved = item.quantityReserved + reservedDelta;
    if (nextOnHand < 0 || nextReserved < 0 || nextReserved > nextOnHand) {
      throw new Error("Inventory movement would create an invalid or negative balance");
    }
    const now = /* @__PURE__ */ new Date();
    const updated = await prisma.inventoryItem.update({
      where: { id: item.id },
      data: {
        quantityOnHand: nextOnHand,
        quantityReserved: nextReserved,
        transitionVersion: { increment: 1 },
        actorReference: context.session.itemId
      }
    });
    const movement = await prisma.inventoryMovement.create({
      data: {
        movementNumber: `MOV-${(0, import_node_crypto14.randomUUID)()}`,
        ...evidence,
        movementType,
        quantityDelta,
        resultingOnHand: nextOnHand,
        reservedDelta,
        resultingReserved: nextReserved,
        reasonCode,
        facilityId: item.facilityId,
        itemId: item.id,
        actorReference: context.session.itemId,
        occurredAt: now
      }
    });
    await appendAuditAndOutbox(prisma, {
      eventKey: `inventory_item:${item.id}:v${updated.transitionVersion}:${movementType}`,
      eventType: `inventory.${movementType}`,
      aggregateType: "inventory_item",
      aggregateId: item.id,
      facilityId: item.facilityId,
      actorReference: context.session.itemId,
      metadata: { source: "inventory_workflow", aggregateId: item.id, movementId: movement.id, movementType, transitionVersion: updated.transitionVersion, quantityDelta, reservedDelta },
      occurredAt: now
    });
    return itemResult(updated);
  }, { timeout: 3e4 });
}
var import_node_crypto14, import_client18;
var init_inventoryWorkflows = __esm({
  "features/keystone/mutations/operational/inventoryWorkflows.ts"() {
    "use strict";
    import_node_crypto14 = require("node:crypto");
    import_client18 = require("@prisma/client");
    init_transitionEvidence();
    init_evidence();
  }
});

// features/keystone/mutations/operational/clinicalEvidenceWorkflows.ts
function requireClinical(context) {
  const role = context.session?.data.role;
  if (!role?.canManagePatients && !role?.canAccessAllClinicalData) throw new Error("Not authorized to manage clinical evidence");
}
function result2(row, replayed = false) {
  return { id: row.id, status: row.status, transitionVersion: row.transitionVersion, replayed };
}
async function validateEncounterProvider(context, data) {
  await scopedFacilityPatient(context, data.facilityId, data.patientId);
  const [encounter, provider] = await Promise.all([
    context.query.Encounter.findOne({ where: { id: data.encounterId }, query: "id status facility { id } patient { id }" }),
    data.providerId ? context.query.Provider.findOne({ where: { id: data.providerId }, query: "id status facilities { id }" }) : null
  ]);
  if (!encounter || encounter.facility?.id !== data.facilityId || encounter.patient?.id !== data.patientId) {
    throw new Error("Active encounter does not match the patient and facility");
  }
  if (data.providerId && (provider?.status !== "active" || !provider.facilities?.some((item) => item.id === data.facilityId))) {
    throw new Error("Provider does not match the active facility");
  }
}
async function createClinicalDocument(_root, { data }, context) {
  requireClinical(context);
  await validateEncounterProvider(context, data);
  const title = bounded2(data.title, "Document title", 300, true);
  const documentType = bounded2(data.documentType, "Document type", 80, true);
  const content = narrativeText(data.content, "Document content", 5e4, true);
  const evidence = operationEvidence({ ...data, title, documentType, content });
  return context.transaction(async (transactionContext) => {
    const fresh = await currentEpisodeActor(transactionContext);
    const prior = await fresh.prisma.clinicalDocument.findUnique({ where: { operationKeyHash: evidence.operationKeyHash }, select: { actorReference: true } });
    if (prior && prior.actorReference !== fresh.session.itemId) throw new Error("Original evidence operation is not owned");
    const guarded = await guardEpisodeChild(fresh, data, "new_care", false, Boolean(prior));
    await recheckEpisodeRelated(guarded.context, "ClinicalDocument", data, Boolean(prior));
    const prisma = guarded.context.prisma;
    await lockOperation(prisma, "clinical-document-create", evidence.operationKeyHash);
    const existing = await prisma.clinicalDocument.findUnique({ where: { operationKeyHash: evidence.operationKeyHash } });
    if (existing) {
      if (existing.requestHash !== evidence.requestHash) throw new Error("Operation key was reused with a different payload");
      return result2(existing, true);
    }
    const now = /* @__PURE__ */ new Date();
    const document = await prisma.clinicalDocument.create({
      data: {
        documentNumber: `DOC-${(0, import_node_crypto15.randomUUID)()}`,
        version: 1,
        status: "draft",
        transitionVersion: 1,
        ...evidence,
        facilityId: data.facilityId,
        patientId: data.patientId,
        encounterId: data.encounterId,
        authorId: data.providerId,
        documentType,
        title,
        content,
        contentHash: (0, import_node_crypto15.createHash)("sha256").update(content).digest("hex"),
        actorReference: context.session.itemId
      }
    });
    await appendAuditAndOutbox(prisma, {
      eventKey: `clinical_document:${document.id}:v1:created`,
      eventType: "clinical_document.created",
      aggregateType: "clinical_document",
      aggregateId: document.id,
      facilityId: document.facilityId,
      patientId: document.patientId,
      actorReference: context.session.itemId,
      metadata: { source: "clinical_document_workflow", aggregateId: document.id, status: document.status, documentVersion: 1, transitionVersion: 1 },
      occurredAt: now
    });
    return result2(document);
  }, { timeout: 3e4 });
}
async function transitionClinicalDocument(_root, args, context) {
  requireClinical(context);
  if (args.toStatus === "signed") {
    throw new Error("Clinical document signing is not available in this bounded patient-operations release");
  }
  const scoped2 = await context.query.ClinicalDocument.findOne({ where: { id: args.documentId }, query: "id" });
  if (!scoped2) throw new Error("Clinical document not found or not accessible");
  if (!Number.isInteger(args.expectedVersion) || args.expectedVersion < 1) throw new Error("Expected document version is invalid");
  const reason = bounded2(args.reason, "Document transition reason", 1e3, args.toStatus === "entered_in_error");
  const evidence = transitionEvidence(args.operationKey, { documentId: args.documentId, toStatus: args.toStatus, expectedVersion: args.expectedVersion, reason });
  const allowed = { draft: ["signed", "entered_in_error"], signed: ["entered_in_error"], amended: [], entered_in_error: [] };
  return context.transaction(async (transactionContext) => {
    const fresh = await currentEpisodeActor(transactionContext);
    const child = await currentEpisodeChild(fresh, "ClinicalDocument", args.documentId);
    const prior = await fresh.prisma.workflowTransition.findUnique({ where: { operationKeyHash: evidence.operationKeyHash }, select: { actorReference: true } });
    if (prior && prior.actorReference !== fresh.session.itemId) throw new Error("Original evidence operation is not owned");
    const guarded = await guardEpisodeChild(fresh, child.input, args.toStatus === "entered_in_error" ? "cancel_evidence" : "new_care", false, Boolean(prior));
    const prisma = guarded.context.prisma;
    await lockTransitionOperation(prisma, evidence.operationKeyHash);
    await prisma.$queryRaw(import_client19.Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`clinical-document:${args.documentId}`}, 0))::text AS "lock"`);
    const replay = await replayTransition(prisma, evidence, "clinical_document", args.documentId);
    if (replay) return replay;
    const current = await prisma.clinicalDocument.findUnique({ where: { id: args.documentId } });
    if (!current || current.transitionVersion !== args.expectedVersion) throw new Error("Clinical document changed; refresh before retrying");
    if (!allowed[current.status]?.includes(args.toStatus)) throw new Error(`Invalid clinical document transition from ${current.status} to ${args.toStatus}`);
    const now = /* @__PURE__ */ new Date();
    const updated = await prisma.clinicalDocument.update({ where: { id: current.id }, data: {
      status: args.toStatus,
      transitionVersion: { increment: 1 },
      actorReference: context.session.itemId,
      ...args.toStatus === "signed" ? { signedAt: now, signedById: context.session.itemId } : {}
    } });
    const events = await appendAuditAndOutbox(prisma, {
      eventKey: `clinical_document:${updated.id}:v${updated.transitionVersion}:${updated.status}`,
      eventType: `clinical_document.${updated.status}`,
      aggregateType: "clinical_document",
      aggregateId: updated.id,
      facilityId: updated.facilityId,
      patientId: updated.patientId,
      actorReference: context.session.itemId,
      metadata: { source: "clinical_document_workflow", aggregateId: updated.id, fromStatus: current.status, status: updated.status, documentVersion: updated.version, transitionVersion: updated.transitionVersion, reasonProvided: Boolean(reason) },
      occurredAt: now
    });
    const projected = result2(updated);
    await recordTransition(prisma, {
      evidence,
      aggregateType: "clinical_document",
      aggregateId: updated.id,
      fromStatus: current.status,
      toStatus: updated.status,
      fromVersion: current.transitionVersion,
      toVersion: updated.transitionVersion,
      actorReference: context.session.itemId,
      facilityId: updated.facilityId,
      patientId: updated.patientId,
      auditLogId: events.audit.id,
      outboxEventId: events.outbox.id,
      result: projected,
      occurredAt: now
    });
    return projected;
  }, { timeout: 3e4 });
}
async function amendClinicalDocument(_root, _args, context) {
  requireClinical(context);
  throw new Error("Clinical document amendment is unavailable until qualified signing authority is configured");
}
async function collectSpecimen(_root, { data }, context) {
  requireClinical(context);
  await validateEncounterProvider(context, { ...data, providerId: void 0 });
  const order = await context.query.MedicalOrder.findOne({ where: { id: data.medicalOrderId }, query: "id orderType status facility { id } patient { id } encounter { id }" });
  if (!order || order.orderType !== "lab" || !["ordered", "in_progress"].includes(order.status) || order.facility?.id !== data.facilityId || order.patient?.id !== data.patientId || order.encounter?.id !== data.encounterId) {
    throw new Error("Active laboratory order does not match the specimen scope");
  }
  const specimenType = bounded2(data.specimenType, "Specimen type", 120, true);
  const evidence = operationEvidence({ ...data, specimenType });
  return context.transaction(async (transactionContext) => {
    const fresh = await currentEpisodeActor(transactionContext);
    const prior = await fresh.prisma.specimen.findUnique({ where: { operationKeyHash: evidence.operationKeyHash }, select: { actorReference: true } });
    if (prior && prior.actorReference !== fresh.session.itemId) throw new Error("Original evidence operation is not owned");
    const guarded = await guardEpisodeChild(fresh, data, "new_care", false, Boolean(prior));
    await recheckEpisodeRelated(guarded.context, "Specimen", data, Boolean(prior));
    const prisma = guarded.context.prisma;
    await lockOperation(prisma, "specimen-collect", evidence.operationKeyHash);
    const existing = await prisma.specimen.findUnique({ where: { operationKeyHash: evidence.operationKeyHash } });
    if (existing) {
      if (existing.requestHash !== evidence.requestHash) throw new Error("Operation key was reused with a different payload");
      return result2(existing, true);
    }
    const now = /* @__PURE__ */ new Date();
    const specimen = await prisma.specimen.create({ data: {
      specimenNumber: `SPC-${(0, import_node_crypto15.randomUUID)()}`,
      status: "collected",
      transitionVersion: 1,
      ...evidence,
      facilityId: data.facilityId,
      patientId: data.patientId,
      encounterId: data.encounterId,
      medicalOrderId: data.medicalOrderId,
      specimenType,
      actorReference: context.session.itemId,
      collectedAt: now
    } });
    await appendAuditAndOutbox(prisma, {
      eventKey: `specimen:${specimen.id}:v1:collected`,
      eventType: "specimen.collected",
      aggregateType: "specimen",
      aggregateId: specimen.id,
      facilityId: specimen.facilityId,
      patientId: specimen.patientId,
      actorReference: context.session.itemId,
      metadata: { source: "specimen_workflow", aggregateId: specimen.id, status: specimen.status, transitionVersion: 1 },
      occurredAt: now
    });
    return result2(specimen);
  }, { timeout: 3e4 });
}
async function recordVitalSign(_root, { data }, context) {
  requireClinical(context);
  await validateEncounterProvider(context, { ...data, providerId: void 0 });
  const clinician = await context.query.Clinician.findOne({
    where: { id: data.clinicianId },
    query: "id active department { facilities { id } } provider { facilities { id } }"
  });
  if (!clinician?.active || ![
    ...clinician.department?.facilities || [],
    ...clinician.provider?.facilities || []
  ].some((facility) => facility.id === data.facilityId)) {
    throw new Error("Clinician does not match the active facility");
  }
  const integerFields = ["systolicBp", "diastolicBp", "heartRate", "respiratoryRate", "oxygenSaturation"];
  const values = {};
  for (const field of integerFields) {
    const raw = data[field];
    if (raw === void 0 || raw === null || raw === "") values[field] = null;
    else if (!Number.isSafeInteger(raw)) throw new Error("Blood pressure, pulse, respiration, and oxygen values must be whole numbers");
    else values[field] = Number(raw);
  }
  let temperatureTenthsC = null;
  if (data.temperatureC !== void 0 && data.temperatureC !== null && data.temperatureC !== "") {
    const temperature = Number(data.temperatureC);
    const tenths = Math.round(temperature * 10);
    if (!Number.isFinite(temperature) || Math.abs(temperature * 10 - tenths) > 1e-8) {
      throw new Error("Temperature must use at most one decimal place");
    }
    temperatureTenthsC = tenths;
  }
  if (temperatureTenthsC === null && !integerFields.some((field) => values[field] !== null)) {
    throw new Error("At least one vital sign value is required");
  }
  if (temperatureTenthsC !== null && (temperatureTenthsC < 250 || temperatureTenthsC > 450)) {
    throw new Error("Temperature is outside the supported recording range");
  }
  for (const field of ["systolicBp", "diastolicBp", "heartRate", "respiratoryRate"]) {
    if (values[field] !== null && (values[field] < 1 || values[field] > 300)) throw new Error("Vital sign value is outside the supported recording range");
  }
  if (values.oxygenSaturation !== null && (values.oxygenSaturation < 1 || values.oxygenSaturation > 100)) throw new Error("Oxygen saturation is outside the supported recording range");
  const notes = narrativeText(data.notes, "Vital sign notes", 2e3);
  const evidence = operationEvidence({ ...data, temperatureC: temperatureTenthsC === null ? null : temperatureTenthsC / 10, ...values, notes });
  return context.transaction(async (transactionContext) => {
    const fresh = await currentEpisodeActor(transactionContext);
    const prior = await fresh.prisma.vitalSign.findUnique({ where: { operationKeyHash: evidence.operationKeyHash }, select: { actorReference: true } });
    if (prior && prior.actorReference !== fresh.session.itemId) throw new Error("Original evidence operation is not owned");
    const guarded = await guardEpisodeChild(fresh, data, "new_care", false, Boolean(prior));
    await recheckEpisodeRelated(guarded.context, "VitalSign", data, Boolean(prior));
    await guarded.context.prisma.$queryRaw(import_client19.Prisma.sql`SELECT "id" FROM "Clinician" WHERE "id" = ${data.clinicianId} FOR SHARE`);
    const liveClinician = await guarded.context.query.Clinician.findOne({ where: { id: data.clinicianId }, query: "id active department { id } provider { id }" });
    if (!liveClinician?.active) throw new Error("Current clinician authority could not be verified");
    if (liveClinician.department?.id) {
      await guarded.context.prisma.$queryRaw(import_client19.Prisma.sql`SELECT "id" FROM "Department" WHERE "id" = ${liveClinician.department.id} FOR SHARE`);
      await guarded.context.prisma.$queryRaw(import_client19.Prisma.sql`SELECT "A" FROM "_Department_facilities" WHERE "A" = ${liveClinician.department.id} AND "B" = ${data.facilityId} FOR SHARE`);
    }
    if (liveClinician.provider?.id) {
      await guarded.context.prisma.$queryRaw(import_client19.Prisma.sql`SELECT "id" FROM "Provider" WHERE "id" = ${liveClinician.provider.id} FOR SHARE`);
      await guarded.context.prisma.$queryRaw(import_client19.Prisma.sql`SELECT "A" FROM "_Facility_providers" WHERE "A" = ${data.facilityId} AND "B" = ${liveClinician.provider.id} FOR SHARE`);
    }
    const currentClinician = await guarded.context.query.Clinician.findOne({ where: { id: data.clinicianId }, query: "id active department { facilities { id } } provider { status facilities { id } }" });
    if (!currentClinician?.active || ![...currentClinician.department?.facilities || [], ...currentClinician.provider?.status === "active" ? currentClinician.provider.facilities || [] : []].some((facility) => facility.id === data.facilityId)) throw new Error("Current clinician scope could not be verified");
    const prisma = guarded.context.prisma;
    await lockOperation(prisma, "vital-sign-record", evidence.operationKeyHash);
    const existing = await prisma.vitalSign.findUnique({ where: { operationKeyHash: evidence.operationKeyHash } });
    if (existing) {
      if (existing.requestHash !== evidence.requestHash) throw new Error("Operation key was reused with a different payload");
      return { id: existing.id, recordedAt: existing.recordedAt, replayed: true };
    }
    const now = /* @__PURE__ */ new Date();
    const vital = await prisma.vitalSign.create({ data: {
      ...evidence,
      facilityId: data.facilityId,
      patientId: data.patientId,
      encounterId: data.encounterId,
      recordedById: data.clinicianId,
      actorReference: context.session.itemId,
      recordedAt: now,
      temperatureC: null,
      temperatureTenthsC,
      ...values,
      notes
    } });
    await appendAuditAndOutbox(prisma, {
      eventKey: `vital_sign:${vital.id}:recorded`,
      eventType: "vital_sign.recorded",
      aggregateType: "vital_sign",
      aggregateId: vital.id,
      facilityId: vital.facilityId,
      patientId: vital.patientId,
      actorReference: context.session.itemId,
      metadata: { source: "vital_sign_workflow", aggregateId: vital.id, recordedAt: now.toISOString() },
      occurredAt: now
    });
    return { id: vital.id, recordedAt: vital.recordedAt, replayed: false };
  }, { timeout: 3e4 });
}
async function transitionSpecimen(_root, args, context) {
  requireClinical(context);
  const scoped2 = await context.query.Specimen.findOne({ where: { id: args.specimenId }, query: "id" });
  if (!scoped2) throw new Error("Specimen not found or not accessible");
  if (!Number.isInteger(args.expectedVersion) || args.expectedVersion < 1) throw new Error("Expected specimen version is invalid");
  const reason = bounded2(args.reason, "Specimen transition reason", 1e3, args.toStatus === "rejected");
  const evidence = transitionEvidence(args.operationKey, { specimenId: args.specimenId, toStatus: args.toStatus, expectedVersion: args.expectedVersion, reason });
  const allowed = { collected: ["received", "rejected"], received: ["processing", "rejected"], processing: ["disposed"], disposed: [], rejected: [] };
  return context.transaction(async (transactionContext) => {
    const fresh = await currentEpisodeActor(transactionContext);
    const child = await currentEpisodeChild(fresh, "Specimen", args.specimenId);
    const prior = await fresh.prisma.workflowTransition.findUnique({ where: { operationKeyHash: evidence.operationKeyHash }, select: { actorReference: true } });
    if (prior && prior.actorReference !== fresh.session.itemId) throw new Error("Original evidence operation is not owned");
    const guarded = await guardEpisodeChild(fresh, child.input, args.toStatus === "rejected" ? "cancel_evidence" : args.toStatus === "disposed" ? "retention_evidence" : "late_result", false, Boolean(prior));
    await recheckEpisodeRelated(guarded.context, "Specimen", child.input, true);
    const prisma = guarded.context.prisma;
    await lockTransitionOperation(prisma, evidence.operationKeyHash);
    await prisma.$queryRaw(import_client19.Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`specimen:${args.specimenId}`}, 0))::text AS "lock"`);
    const replay = await replayTransition(prisma, evidence, "specimen", args.specimenId);
    if (replay) return replay;
    const current = await prisma.specimen.findUnique({ where: { id: args.specimenId } });
    if (!current || current.transitionVersion !== args.expectedVersion) throw new Error("Specimen changed; refresh before retrying");
    if (!allowed[current.status]?.includes(args.toStatus)) throw new Error(`Invalid specimen transition from ${current.status} to ${args.toStatus}`);
    const now = /* @__PURE__ */ new Date();
    const updated = await prisma.specimen.update({ where: { id: current.id }, data: {
      status: args.toStatus,
      transitionVersion: { increment: 1 },
      actorReference: context.session.itemId,
      ...args.toStatus === "received" ? { receivedAt: now } : {},
      ...args.toStatus === "disposed" ? { disposedAt: now } : {},
      ...args.toStatus === "rejected" ? { rejectionReason: reason } : {}
    } });
    const events = await appendAuditAndOutbox(prisma, {
      eventKey: `specimen:${updated.id}:v${updated.transitionVersion}:${updated.status}`,
      eventType: `specimen.${updated.status}`,
      aggregateType: "specimen",
      aggregateId: updated.id,
      facilityId: updated.facilityId,
      patientId: updated.patientId,
      actorReference: context.session.itemId,
      metadata: { source: "specimen_workflow", aggregateId: updated.id, fromStatus: current.status, status: updated.status, transitionVersion: updated.transitionVersion, reasonProvided: Boolean(reason) },
      occurredAt: now
    });
    const projected = result2(updated);
    await recordTransition(prisma, {
      evidence,
      aggregateType: "specimen",
      aggregateId: updated.id,
      fromStatus: current.status,
      toStatus: updated.status,
      fromVersion: current.transitionVersion,
      toVersion: updated.transitionVersion,
      actorReference: context.session.itemId,
      facilityId: updated.facilityId,
      patientId: updated.patientId,
      auditLogId: events.audit.id,
      outboxEventId: events.outbox.id,
      result: projected,
      occurredAt: now
    });
    return projected;
  }, { timeout: 3e4 });
}
var import_node_crypto15, import_client19;
var init_clinicalEvidenceWorkflows = __esm({
  "features/keystone/mutations/operational/clinicalEvidenceWorkflows.ts"() {
    "use strict";
    init_narrativeText();
    import_node_crypto15 = require("node:crypto");
    import_client19 = require("@prisma/client");
    init_transitionEvidence();
    init_evidence();
    init_episodeFence();
    init_episodeRelatedScope();
  }
});

// features/keystone/mutations/operational/bedReservationWorkflows.ts
function requireBeds(context) {
  const role = context.session?.data.role;
  if (!role?.canManagePatients && !role?.canAccessAllClinicalData) throw new Error("Not authorized to reserve beds");
}
function result3(row, replayed = false) {
  return { id: row.id, status: row.status, transitionVersion: row.transitionVersion, replayed };
}
async function reserveBed(_root, { data }, context) {
  requireBeds(context);
  await scopedFacilityPatient(context, data.facilityId, data.patientId);
  if (!Number.isInteger(data.expectedBedVersion) || data.expectedBedVersion < 1) throw new Error("Expected bed version is invalid");
  const bed = await context.query.Bed.findOne({ where: { id: data.bedId }, query: "id facility { id }" });
  if (!bed || bed.facility?.id !== data.facilityId) throw new Error("Bed not found in the accessible facility");
  const expiresAt = new Date(data.expiresAt);
  const now = /* @__PURE__ */ new Date();
  if (Number.isNaN(expiresAt.getTime()) || expiresAt <= now || expiresAt.getTime() > now.getTime() + 24 * 60 * 6e4) {
    throw new Error("Bed reservation expiry must be within the next 24 hours");
  }
  const reasonCode = bounded2(data.reasonCode, "Reservation reason", 80, true);
  const evidence = operationEvidence({ ...data, expiresAt: expiresAt.toISOString(), reasonCode });
  return context.transaction(async (transactionContext) => {
    const prisma = transactionContext.sudo().prisma;
    await lockOperation(prisma, "bed-reservation-create", evidence.operationKeyHash);
    const replay = await prisma.bedReservation.findUnique({ where: { operationKeyHash: evidence.operationKeyHash } });
    if (replay) {
      if (replay.requestHash !== evidence.requestHash) throw new Error("Operation key was reused with a different payload");
      return result3(replay, true);
    }
    await prisma.$queryRaw(import_client20.Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`bed:${data.bedId}`}, 0))::text AS "lock"`);
    const currentBed = await prisma.bed.findUnique({ where: { id: data.bedId } });
    if (!currentBed || currentBed.facilityId !== data.facilityId || currentBed.transitionVersion !== data.expectedBedVersion) {
      throw new Error("Bed changed; refresh before retrying");
    }
    const prior = await prisma.bedReservation.findFirst({ where: { bedId: data.bedId, status: "active" } });
    if (prior && prior.expiresAt <= now) {
      const expired = await prisma.bedReservation.update({ where: { id: prior.id }, data: { status: "expired", transitionVersion: { increment: 1 }, releasedAt: now, actorReference: context.session.itemId } });
      await appendAuditAndOutbox(prisma, {
        eventKey: `bed_reservation:${expired.id}:v${expired.transitionVersion}:expired`,
        eventType: "bed_reservation.expired",
        aggregateType: "bed_reservation",
        aggregateId: expired.id,
        facilityId: expired.facilityId,
        patientId: expired.patientId,
        actorReference: context.session.itemId,
        metadata: { source: "bed_reservation_workflow", aggregateId: expired.id, bedId: expired.bedId, fromStatus: prior.status, status: expired.status, transitionVersion: expired.transitionVersion },
        occurredAt: now
      });
    } else if (prior) {
      throw new Error("Bed already has an active reservation");
    }
    if (!["available", ...prior && prior.expiresAt <= now ? ["reserved"] : []].includes(currentBed.status) || currentBed.currentPatientId) {
      throw new Error("Bed is not available for reservation");
    }
    const reservation = await prisma.bedReservation.create({ data: {
      reservationNumber: `BEDHOLD-${(0, import_node_crypto16.randomUUID)()}`,
      status: "active",
      transitionVersion: 1,
      ...evidence,
      facilityId: data.facilityId,
      patientId: data.patientId,
      bedId: data.bedId,
      actorReference: context.session.itemId,
      reasonCode,
      expiresAt
    } });
    await prisma.bed.update({ where: { id: currentBed.id }, data: { status: "reserved", transitionVersion: { increment: 1 } } });
    await appendAuditAndOutbox(prisma, {
      eventKey: `bed_reservation:${reservation.id}:v1:active`,
      eventType: "bed_reservation.active",
      aggregateType: "bed_reservation",
      aggregateId: reservation.id,
      facilityId: reservation.facilityId,
      patientId: reservation.patientId,
      actorReference: context.session.itemId,
      metadata: { source: "bed_reservation_workflow", aggregateId: reservation.id, bedId: reservation.bedId, status: reservation.status, transitionVersion: 1 },
      occurredAt: now
    });
    return result3(reservation);
  }, { timeout: 3e4 });
}
async function releaseBedReservation(_root, args, context) {
  requireBeds(context);
  const scoped2 = await context.query.BedReservation.findOne({ where: { id: args.reservationId }, query: "id" });
  if (!scoped2) throw new Error("Bed reservation not found or not accessible");
  if (!Number.isInteger(args.expectedVersion) || args.expectedVersion < 1) throw new Error("Expected reservation version is invalid");
  const reasonCode = bounded2(args.reasonCode, "Release reason", 80, true);
  const evidence = transitionEvidence(args.operationKey, { reservationId: args.reservationId, expectedVersion: args.expectedVersion, reasonCode });
  return context.transaction(async (transactionContext) => {
    const prisma = transactionContext.sudo().prisma;
    await lockTransitionOperation(prisma, evidence.operationKeyHash);
    await prisma.$queryRaw(import_client20.Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`bed-reservation:${args.reservationId}`}, 0))::text AS "lock"`);
    const replay = await replayTransition(prisma, evidence, "bed_reservation", args.reservationId);
    if (replay) return replay;
    const current = await prisma.bedReservation.findUnique({ where: { id: args.reservationId } });
    if (!current || current.status !== "active" || current.transitionVersion !== args.expectedVersion) throw new Error("Bed reservation changed or is no longer active");
    await prisma.$queryRaw(import_client20.Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`bed:${current.bedId}`}, 0))::text AS "lock"`);
    const bed = await prisma.bed.findUnique({ where: { id: current.bedId } });
    if (!bed || bed.status !== "reserved" || bed.currentPatientId) throw new Error("Reserved bed changed; refresh before releasing");
    const now = /* @__PURE__ */ new Date();
    const updated = await prisma.bedReservation.update({ where: { id: current.id }, data: { status: "released", transitionVersion: { increment: 1 }, releasedAt: now, reasonCode } });
    await prisma.bed.update({ where: { id: bed.id }, data: { status: "available", transitionVersion: { increment: 1 } } });
    const events = await appendAuditAndOutbox(prisma, {
      eventKey: `bed_reservation:${updated.id}:v${updated.transitionVersion}:released`,
      eventType: "bed_reservation.released",
      aggregateType: "bed_reservation",
      aggregateId: updated.id,
      facilityId: updated.facilityId,
      patientId: updated.patientId,
      actorReference: context.session.itemId,
      metadata: { source: "bed_reservation_workflow", aggregateId: updated.id, bedId: updated.bedId, fromStatus: current.status, status: updated.status, transitionVersion: updated.transitionVersion },
      occurredAt: now
    });
    const projected = result3(updated);
    await recordTransition(prisma, {
      evidence,
      aggregateType: "bed_reservation",
      aggregateId: updated.id,
      fromStatus: current.status,
      toStatus: updated.status,
      fromVersion: current.transitionVersion,
      toVersion: updated.transitionVersion,
      actorReference: context.session.itemId,
      facilityId: updated.facilityId,
      patientId: updated.patientId,
      auditLogId: events.audit.id,
      outboxEventId: events.outbox.id,
      result: projected,
      occurredAt: now
    });
    return projected;
  }, { timeout: 3e4 });
}
var import_node_crypto16, import_client20;
var init_bedReservationWorkflows = __esm({
  "features/keystone/mutations/operational/bedReservationWorkflows.ts"() {
    "use strict";
    import_node_crypto16 = require("node:crypto");
    import_client20 = require("@prisma/client");
    init_transitionEvidence();
    init_evidence();
  }
});

// features/keystone/mutations/operational/communicationWorkflows.ts
function requireCommunications(context) {
  const role = context.session?.data.role;
  if (!role?.canManageCommunications) throw new Error("Not authorized to manage communications");
}
async function scopedFacility(context, facilityId) {
  requireCommunications(context);
  const facility = await context.query.Facility.findOne({ where: { id: facilityId }, query: "id status" });
  if (!facility || facility.status !== "active") throw new Error("Facility not found or not accessible");
}
function result4(row, replayed = false) {
  return { id: row.id, status: row.status, transitionVersion: row.transitionVersion, replayed };
}
async function createCommunicationTemplate(_root, { data }, context) {
  await scopedFacility(context, data.facilityId);
  const templateKey = bounded2(data.templateKey, "Template key", 100, true).toLowerCase();
  const name = bounded2(data.name, "Template name", 200, true);
  const channel = bounded2(data.channel, "Template channel", 20, true);
  if (!["sms", "email"].includes(channel)) throw new Error("Template channel must be sms or email");
  const subjectTemplate = bounded2(data.subjectTemplate, "Subject template", 300);
  const bodyTemplate = narrativeText(data.bodyTemplate, "Body template", 4e3, true);
  const evidence = operationEvidence({ ...data, templateKey, name, channel, subjectTemplate, bodyTemplate });
  return context.transaction(async (transactionContext) => {
    const prisma = transactionContext.sudo().prisma;
    await lockOperation(prisma, "communication-template-create", evidence.operationKeyHash);
    const existing = await prisma.communicationTemplate.findUnique({ where: { operationKeyHash: evidence.operationKeyHash } });
    if (existing) {
      if (existing.requestHash !== evidence.requestHash) throw new Error("Operation key was reused with a different payload");
      return result4(existing, true);
    }
    if (await prisma.communicationTemplate.findFirst({ where: { facilityId: data.facilityId, templateKey } })) throw new Error("Template key already exists in the facility");
    const now = /* @__PURE__ */ new Date();
    const template = await prisma.communicationTemplate.create({ data: {
      templateKey,
      name,
      channel,
      status: "active",
      version: 1,
      transitionVersion: 1,
      ...evidence,
      actorReference: context.session.itemId,
      facilityId: data.facilityId,
      subjectTemplate,
      bodyTemplate
    } });
    await appendAuditAndOutbox(prisma, {
      eventKey: `communication_template:${template.id}:v1:active`,
      eventType: "communication_template.created",
      aggregateType: "communication_template",
      aggregateId: template.id,
      facilityId: template.facilityId,
      actorReference: context.session.itemId,
      metadata: { source: "communication_workflow", aggregateId: template.id, channel, status: template.status, templateVersion: 1, transitionVersion: 1 },
      occurredAt: now
    });
    return result4(template);
  }, { timeout: 3e4 });
}
async function reviseCommunicationTemplate(_root, args, context) {
  requireCommunications(context);
  const scoped2 = await context.query.CommunicationTemplate.findOne({ where: { id: args.templateId }, query: "id" });
  if (!scoped2) throw new Error("Communication template not found or not accessible");
  if (!Number.isInteger(args.expectedVersion) || args.expectedVersion < 1) throw new Error("Expected template version is invalid");
  const name = bounded2(args.name, "Template name", 200, true);
  const subjectTemplate = bounded2(args.subjectTemplate, "Subject template", 300);
  const bodyTemplate = narrativeText(args.bodyTemplate, "Body template", 4e3, true);
  const toStatus = bounded2(args.toStatus, "Template status", 20, true);
  if (!["active", "inactive"].includes(toStatus)) throw new Error("Template status is invalid");
  const evidence = transitionEvidence(args.operationKey, { templateId: args.templateId, expectedVersion: args.expectedVersion, name, subjectTemplate, bodyTemplate, toStatus });
  return context.transaction(async (transactionContext) => {
    const prisma = transactionContext.sudo().prisma;
    await lockTransitionOperation(prisma, evidence.operationKeyHash);
    await prisma.$queryRaw(import_client21.Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`communication-template:${args.templateId}`}, 0))::text AS "lock"`);
    const replay = await replayTransition(prisma, evidence, "communication_template", args.templateId);
    if (replay) return replay;
    const current = await prisma.communicationTemplate.findUnique({ where: { id: args.templateId } });
    if (!current || current.transitionVersion !== args.expectedVersion) throw new Error("Communication template changed; refresh before retrying");
    const now = /* @__PURE__ */ new Date();
    const updated = await prisma.communicationTemplate.update({ where: { id: current.id }, data: {
      name,
      subjectTemplate,
      bodyTemplate,
      status: toStatus,
      version: { increment: 1 },
      transitionVersion: { increment: 1 },
      actorReference: context.session.itemId
    } });
    const events = await appendAuditAndOutbox(prisma, {
      eventKey: `communication_template:${updated.id}:v${updated.transitionVersion}:${updated.status}`,
      eventType: "communication_template.revised",
      aggregateType: "communication_template",
      aggregateId: updated.id,
      facilityId: updated.facilityId,
      actorReference: context.session.itemId,
      metadata: { source: "communication_workflow", aggregateId: updated.id, fromStatus: current.status, status: updated.status, templateVersion: updated.version, transitionVersion: updated.transitionVersion },
      occurredAt: now
    });
    const projected = result4(updated);
    await recordTransition(prisma, {
      evidence,
      aggregateType: "communication_template",
      aggregateId: updated.id,
      fromStatus: current.status,
      toStatus: updated.status,
      fromVersion: current.transitionVersion,
      toVersion: updated.transitionVersion,
      actorReference: context.session.itemId,
      facilityId: updated.facilityId,
      auditLogId: events.audit.id,
      outboxEventId: events.outbox.id,
      result: projected,
      occurredAt: now
    });
    return projected;
  }, { timeout: 3e4 });
}
async function setCommunicationPreference(_root, { data }, context) {
  requireCommunications(context);
  await scopedFacilityPatient(context, data.facilityId, data.patientId);
  const channel = bounded2(data.channel, "Preference channel", 20, true);
  const purpose = bounded2(data.purpose, "Preference purpose", 40, true);
  const status = bounded2(data.status, "Preference status", 20, true);
  const reasonCode = bounded2(data.reasonCode, "Preference reason", 80, true);
  if (!["sms", "email"].includes(channel) || !["care_operations", "billing", "general"].includes(purpose) || !["allowed", "opted_out"].includes(status)) {
    throw new Error("Communication preference is invalid");
  }
  const expectedVersion = data.expectedVersion == null ? null : Number(data.expectedVersion);
  if (expectedVersion !== null && (!Number.isInteger(expectedVersion) || expectedVersion < 1)) throw new Error("Expected preference version is invalid");
  const payload = { facilityId: data.facilityId, patientId: data.patientId, channel, purpose, status, reasonCode, expectedVersion };
  const creation = operationEvidence({ operationKey: data.operationKey, ...payload });
  const transition = transitionEvidence(data.operationKey, payload);
  return context.transaction(async (transactionContext) => {
    const prisma = transactionContext.sudo().prisma;
    await lockTransitionOperation(prisma, transition.operationKeyHash);
    await prisma.$queryRaw(import_client21.Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`communication-preference:${data.facilityId}:${data.patientId}:${channel}:${purpose}`}, 0))::text AS "lock"`);
    const current = await prisma.communicationPreference.findFirst({ where: { facilityId: data.facilityId, patientId: data.patientId, channel, purpose } });
    if (!current) {
      if (expectedVersion !== null) throw new Error("Communication preference does not exist; refresh before retrying");
      const now2 = /* @__PURE__ */ new Date();
      const created = await prisma.communicationPreference.create({ data: {
        channel,
        purpose,
        status,
        transitionVersion: 1,
        ...creation,
        facilityId: data.facilityId,
        patientId: data.patientId,
        actorReference: context.session.itemId,
        reasonCode,
        changedAt: now2
      } });
      await appendAuditAndOutbox(prisma, {
        eventKey: `communication_preference:${created.id}:v1:${created.status}`,
        eventType: "communication_preference.recorded",
        aggregateType: "communication_preference",
        aggregateId: created.id,
        facilityId: created.facilityId,
        patientId: created.patientId,
        actorReference: context.session.itemId,
        metadata: { source: "communication_workflow", aggregateId: created.id, channel, purpose, status, transitionVersion: 1, reasonCode },
        occurredAt: now2
      });
      return result4(created);
    }
    if (current.operationKeyHash === creation.operationKeyHash) {
      if (current.requestHash !== creation.requestHash) throw new Error("Operation key was reused with a different payload");
      return result4(current, true);
    }
    const replay = await replayTransition(prisma, transition, "communication_preference", current.id);
    if (replay) return replay;
    if (expectedVersion === null || current.transitionVersion !== expectedVersion) throw new Error("Communication preference changed; refresh before retrying");
    if (current.status === status) throw new Error("Communication preference is already in that state");
    const now = /* @__PURE__ */ new Date();
    const updated = await prisma.communicationPreference.update({ where: { id: current.id }, data: {
      status,
      transitionVersion: { increment: 1 },
      actorReference: context.session.itemId,
      reasonCode,
      changedAt: now
    } });
    const events = await appendAuditAndOutbox(prisma, {
      eventKey: `communication_preference:${updated.id}:v${updated.transitionVersion}:${updated.status}`,
      eventType: `communication_preference.${updated.status}`,
      aggregateType: "communication_preference",
      aggregateId: updated.id,
      facilityId: updated.facilityId,
      patientId: updated.patientId,
      actorReference: context.session.itemId,
      metadata: { source: "communication_workflow", aggregateId: updated.id, channel, purpose, fromStatus: current.status, status, transitionVersion: updated.transitionVersion, reasonCode },
      occurredAt: now
    });
    const projected = result4(updated);
    await recordTransition(prisma, {
      evidence: transition,
      aggregateType: "communication_preference",
      aggregateId: updated.id,
      fromStatus: current.status,
      toStatus: updated.status,
      fromVersion: current.transitionVersion,
      toVersion: updated.transitionVersion,
      actorReference: context.session.itemId,
      facilityId: updated.facilityId,
      patientId: updated.patientId,
      auditLogId: events.audit.id,
      outboxEventId: events.outbox.id,
      result: projected,
      occurredAt: now
    });
    return projected;
  }, { timeout: 3e4 });
}
var import_client21;
var init_communicationWorkflows = __esm({
  "features/keystone/mutations/operational/communicationWorkflows.ts"() {
    "use strict";
    init_narrativeText();
    import_client21 = require("@prisma/client");
    init_transitionEvidence();
    init_evidence();
  }
});

// features/keystone/integrations/crypto.ts
function decodeKey(value, name) {
  const text63 = String(value || "").trim();
  const key2 = /^[a-f0-9]{64}$/i.test(text63) ? Buffer.from(text63, "hex") : Buffer.from(text63, "base64");
  if (key2.length !== 32) throw new Error(`${name} must decode to exactly 32 bytes`);
  return key2;
}
function integrationEncryptionKey() {
  return decodeKey(process.env.INTEGRATION_SECRET_ENCRYPTION_KEY, "INTEGRATION_SECRET_ENCRYPTION_KEY");
}
function exportEncryptionKey() {
  return decodeKey(process.env.EXPORT_ENCRYPTION_KEY, "EXPORT_ENCRYPTION_KEY");
}
function encryptSecret(plaintext, key2) {
  const iv = (0, import_node_crypto17.randomBytes)(12);
  const cipher = (0, import_node_crypto17.createCipheriv)("aes-256-gcm", key2, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64")
  };
}
function decryptSecret(input, key2) {
  const decipher = (0, import_node_crypto17.createDecipheriv)("aes-256-gcm", key2, Buffer.from(input.iv, "base64"));
  decipher.setAuthTag(Buffer.from(input.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(input.ciphertext, "base64")),
    decipher.final()
  ]).toString("utf8");
}
function sha256(value) {
  return (0, import_node_crypto17.createHash)("sha256").update(value).digest("hex");
}
function hmacSignature(secret, timestamp53, body) {
  return (0, import_node_crypto17.createHmac)("sha256", secret).update(`${timestamp53}.${body}`).digest("hex");
}
function safeEqualText(left, right) {
  const leftHash = Buffer.from(sha256(left), "hex");
  const rightHash = Buffer.from(sha256(right), "hex");
  return (0, import_node_crypto17.timingSafeEqual)(leftHash, rightHash);
}
var import_node_crypto17;
var init_crypto = __esm({
  "features/keystone/integrations/crypto.ts"() {
    "use strict";
    import_node_crypto17 = require("node:crypto");
  }
});

// features/keystone/lib/mail.ts
function getBaseUrlForEmails() {
  const configured = String(process.env.SMTP_STORE_LINK || "").trim();
  let url;
  try {
    url = new URL(configured);
  } catch {
    throw new Error("Canonical email link URL is not configured");
  }
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error("Canonical email link URL is invalid");
  }
  return url.toString().replace(/\/$/, "");
}
function passwordResetEmail({ url }) {
  const backgroundColor = "#f9f9f9";
  const textColor = "#444444";
  const mainBackgroundColor = "#ffffff";
  const buttonBackgroundColor = "#346df1";
  const buttonBorderColor = "#346df1";
  const buttonTextColor = "#ffffff";
  return `
    <body style="background: ${backgroundColor};">
      <table width="100%" border="0" cellspacing="20" cellpadding="0" style="background: ${mainBackgroundColor}; max-width: 600px; margin: auto; border-radius: 10px;">
        <tr>
          <td align="center" style="padding: 10px 0px 0px 0px; font-size: 18px; font-family: Helvetica, Arial, sans-serif; color: ${textColor};">
            Please click below to reset your password
          </td>
        </tr>
        <tr>
          <td align="center" style="padding: 20px 0;">
            <table border="0" cellspacing="0" cellpadding="0">
              <tr>
                <td align="center" style="border-radius: 5px;" bgcolor="${buttonBackgroundColor}"><a href="${url}" target="_blank" style="font-size: 18px; font-family: Helvetica, Arial, sans-serif; color: ${buttonTextColor}; text-decoration: none; border-radius: 5px; padding: 10px 20px; border: 1px solid ${buttonBorderColor}; display: inline-block; font-weight: bold;">Reset Password</a></td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding: 0px 0px 10px 0px; font-size: 16px; line-height: 22px; font-family: Helvetica, Arial, sans-serif; color: ${textColor};">
            If you did not request this email you can safely ignore it.
          </td>
        </tr>
      </table>
    </body>
  `;
}
async function sendPasswordResetEmail(resetToken, to, baseUrl) {
  const frontendUrl = baseUrl || getBaseUrlForEmails();
  const info = await transport.sendMail({
    to,
    from: process.env.SMTP_FROM,
    subject: "Your password reset token!",
    html: passwordResetEmail({
      // URL fragments are not sent in HTTP requests or access logs. The reset
      // form reads and immediately removes this fragment in the browser.
      url: `${frontendUrl}/dashboard/reset#token=${encodeURIComponent(resetToken)}`
    })
  });
}
var import_nodemailer, transport;
var init_mail = __esm({
  "features/keystone/lib/mail.ts"() {
    "use strict";
    import_nodemailer = require("nodemailer");
    transport = (0, import_nodemailer.createTransport)({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
      }
    });
  }
});

// features/keystone/integrations/endpointPolicy.ts
function canonicalAddress(address) {
  return address.trim().toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
}
function privateAddress(address) {
  const normalized = canonicalAddress(address);
  const family = (0, import_node_net.isIP)(normalized);
  if (family === 4) return nonGlobalIpv4.check(normalized, "ipv4");
  if (family === 6) return nonGlobalIpv6.check(normalized, "ipv6");
  return false;
}
async function validateIntegrationEndpoint(raw) {
  let endpoint2;
  try {
    endpoint2 = new URL(String(raw || "").trim());
  } catch {
    throw new Error("Integration endpoint URL is invalid");
  }
  if (endpoint2.username || endpoint2.password || endpoint2.hash || endpoint2.search) {
    throw new Error("Integration endpoint cannot contain credentials, query parameters, or fragments");
  }
  const hostname = endpoint2.hostname.toLowerCase();
  const addressHost = canonicalAddress(hostname);
  const allowlist = new Set(
    String(process.env.INTEGRATION_HOST_ALLOWLIST || "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean)
  );
  const localAllowed = process.env.NODE_ENV !== "production" && process.env.ALLOW_LOCAL_INTEGRATION_ENDPOINTS === "1";
  const localHost = hostname === "localhost" || hostname.endsWith(".local") || privateAddress(hostname);
  if (endpoint2.protocol !== "https:" && !(localAllowed && endpoint2.protocol === "http:" && localHost)) {
    throw new Error("Integration endpoint must use HTTPS");
  }
  if (!allowlist.has(hostname) && !(localAllowed && localHost)) {
    throw new Error("Integration endpoint host is not allowlisted");
  }
  if (!localAllowed) {
    let addresses;
    try {
      addresses = await (0, import_promises.lookup)(addressHost, { all: true });
    } catch {
      throw new Error("Integration endpoint host could not be resolved");
    }
    if (!addresses.length || addresses.some((item) => privateAddress(item.address))) {
      throw new Error("Integration endpoint resolves to a private or reserved address");
    }
  }
  endpoint2.pathname = endpoint2.pathname.replace(/\/+$/, "") || "/";
  return endpoint2.toString();
}
async function resolveIntegrationEndpoint(raw) {
  const normalized = await validateIntegrationEndpoint(raw);
  const endpoint2 = new URL(normalized);
  const hostname = endpoint2.hostname.toLowerCase();
  const addressHost = canonicalAddress(hostname);
  const localAllowed = process.env.NODE_ENV !== "production" && process.env.ALLOW_LOCAL_INTEGRATION_ENDPOINTS === "1";
  if ((0, import_node_net.isIP)(addressHost)) {
    if (!localAllowed && privateAddress(addressHost)) throw new Error("Integration endpoint resolves to a private or reserved address");
    return { url: normalized, address: addressHost };
  }
  let addresses;
  try {
    addresses = await (0, import_promises.lookup)(addressHost, { all: true });
  } catch {
    throw new Error("Integration endpoint host could not be resolved");
  }
  if (!addresses.length || !localAllowed && addresses.some((item) => privateAddress(item.address))) {
    throw new Error("Integration endpoint resolves to a private or reserved address");
  }
  return { url: normalized, address: addresses.map((item) => item.address).sort()[0] };
}
var import_promises, import_node_net, nonGlobalIpv4, nonGlobalIpv6;
var init_endpointPolicy = __esm({
  "features/keystone/integrations/endpointPolicy.ts"() {
    "use strict";
    import_promises = require("node:dns/promises");
    import_node_net = require("node:net");
    nonGlobalIpv4 = new import_node_net.BlockList();
    nonGlobalIpv6 = new import_node_net.BlockList();
    for (const [network, prefix] of [
      ["0.0.0.0", 8],
      ["10.0.0.0", 8],
      ["100.64.0.0", 10],
      ["127.0.0.0", 8],
      ["169.254.0.0", 16],
      ["172.16.0.0", 12],
      ["192.0.0.0", 24],
      ["192.0.2.0", 24],
      ["192.168.0.0", 16],
      ["198.18.0.0", 15],
      ["198.51.100.0", 24],
      ["203.0.113.0", 24],
      ["224.0.0.0", 4],
      ["240.0.0.0", 4]
    ]) nonGlobalIpv4.addSubnet(network, prefix, "ipv4");
    for (const [network, prefix] of [
      ["::", 96],
      ["::1", 128],
      ["::ffff:0:0", 96],
      ["64:ff9b::", 96],
      ["100::", 64],
      ["2001::", 32],
      ["2001:db8::", 32],
      ["2002::", 16],
      ["fc00::", 7],
      ["fe80::", 10],
      ["ff00::", 8]
    ]) nonGlobalIpv6.addSubnet(network, prefix, "ipv6");
  }
});

// features/keystone/integrations/outboxWorker.ts
function retryAt(attempt, eventId) {
  const base = Math.min(6 * 60 * 6e4, 6e4 * 2 ** Math.max(0, attempt - 1));
  const jitter = Number.parseInt((0, import_node_crypto18.createHash)("sha256").update(eventId).digest("hex").slice(0, 4), 16) % 3e4;
  return new Date(Date.now() + base + jitter);
}
async function postPinnedIntegration(target, body, headers) {
  const endpoint2 = new URL(target.url);
  const transport2 = endpoint2.protocol === "https:" ? import_node_https.request : import_node_http.request;
  return new Promise((resolve, reject) => {
    const request = transport2({
      protocol: endpoint2.protocol,
      hostname: endpoint2.hostname,
      port: endpoint2.port || void 0,
      path: `${endpoint2.pathname}${endpoint2.search}`,
      method: "POST",
      headers: { ...headers, "content-length": String(Buffer.byteLength(body)) },
      lookup: (_hostname, _options, callback) => {
        callback(null, target.address, (0, import_node_net2.isIP)(target.address));
      },
      ...endpoint2.protocol === "https:" ? { servername: endpoint2.hostname } : {}
    }, (response) => {
      const hash2 = (0, import_node_crypto18.createHash)("sha256");
      let bytes = 0;
      response.on("data", (chunk) => {
        bytes += chunk.length;
        if (bytes > MAX_RESPONSE_BYTES) response.destroy(new Error("integration_response_too_large"));
        else hash2.update(chunk);
      });
      response.on("end", () => resolve({
        status: response.statusCode || 0,
        responseDigest: hash2.digest("hex")
      }));
      response.on("error", reject);
    });
    request.setTimeout(1e4, () => request.destroy(new Error("integration_request_timeout")));
    request.on("error", reject);
    request.end(body);
  });
}
async function claimExternal(prisma, requestedLimit) {
  const limit = Math.max(1, Math.min(50, Math.floor(requestedLimit || 10)));
  const now = /* @__PURE__ */ new Date();
  const leaseUntil = new Date(now.getTime() + LEASE_MS);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(import_client22.Prisma.sql`
      UPDATE "ClinicalOutboxEvent"
      SET "status" = CASE WHEN "attempts" >= ${MAX_ATTEMPTS} THEN 'dead_letter' ELSE 'retry' END,
          "lastError" = CASE WHEN "attempts" >= ${MAX_ATTEMPTS} THEN 'maximum_attempts_exceeded' ELSE 'worker_lease_expired' END
      WHERE "status" = 'processing' AND "deliveryMode" = 'external'
        AND "nextAttemptAt" IS NOT NULL AND "nextAttemptAt" <= ${now}
    `);
    await tx.$executeRaw(import_client22.Prisma.sql`
      UPDATE "ClinicalOutboxEvent" event
      SET "status" = 'dead_letter', "nextAttemptAt" = NULL,
          "lastError" = 'integration_generation_revoked'
      FROM "IntegrationInstallation" installation
      WHERE event."installation" = installation."id"
        AND event."deliveryMode" = 'external'
        AND event."status" IN ('pending','retry')
        AND (installation."status" <> 'active' OR event."installationVersion" IS DISTINCT FROM installation."transitionVersion")
    `);
    const rows2 = await tx.$queryRaw(import_client22.Prisma.sql`
      SELECT event."id"
      FROM "ClinicalOutboxEvent" event
      JOIN "IntegrationInstallation" installation ON installation."id" = event."installation"
      WHERE event."status" IN ('pending','retry') AND event."deliveryMode" = 'external'
        AND event."attempts" < ${MAX_ATTEMPTS}
        AND (event."nextAttemptAt" IS NULL OR event."nextAttemptAt" <= ${now})
        AND installation."status" = 'active'
        AND event."installationVersion" = installation."transitionVersion"
      ORDER BY event."createdAt" ASC
      LIMIT ${limit}
      FOR UPDATE OF event SKIP LOCKED
    `);
    if (rows2.length) {
      await tx.clinicalOutboxEvent.updateMany({
        where: { id: { in: rows2.map((row) => row.id) }, status: { in: ["pending", "retry"] }, deliveryMode: "external" },
        data: { status: "processing", attempts: { increment: 1 }, nextAttemptAt: leaseUntil }
      });
    }
    return rows2.map((row) => row.id);
  }, { timeout: 3e4 });
}
async function authorizeClaimedDelivery(tx, eventId) {
  const claimed = await tx.clinicalOutboxEvent.findUnique({ where: { id: eventId } });
  if (!claimed || claimed.status !== "processing" || claimed.deliveryMode !== "external" || !claimed.installationId) return null;
  await tx.$queryRaw(import_client22.Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`integration:${claimed.installationId}`}, 0))::text AS "lock"`);
  const [event, installation] = await Promise.all([
    tx.clinicalOutboxEvent.findUnique({ where: { id: eventId } }),
    tx.integrationInstallation.findUnique({ where: { id: claimed.installationId } })
  ]);
  if (!event || event.status !== "processing" || !installation || installation.status !== "active" || event.installationVersion !== installation.transitionVersion) {
    if (event?.status === "processing") {
      await tx.clinicalOutboxEvent.update({ where: { id: event.id }, data: {
        status: "dead_letter",
        nextAttemptAt: null,
        lastError: "integration_generation_revoked"
      } });
    }
    return null;
  }
  return { ...event, installation };
}
async function deliveryPayload(prisma, event) {
  const data = { ...event.payload && typeof event.payload === "object" ? event.payload : {} };
  if (event.eventType === "message.queued" && event.aggregateType === "patient_message") {
    const message = await prisma.patientMessage.findUnique({
      where: { id: event.aggregateId },
      select: { id: true, facilityId: true, patientId: true, appointmentId: true, channel: true, purpose: true, subject: true, body: true, metadata: true }
    });
    if (!message || message.facilityId !== event.facilityId) throw new Error("integration_aggregate_scope_mismatch");
    let body = message.body;
    if (body.includes("{{intake_link}}")) {
      const intakeFormId = message.metadata && typeof message.metadata === "object" ? String(message.metadata.intakeFormId || "") : "";
      const intake = intakeFormId ? await prisma.intakeForm.findUnique({
        where: { id: intakeFormId },
        select: {
          id: true,
          facilityId: true,
          patientId: true,
          appointmentId: true,
          accessCodeHash: true,
          accessExpiresAt: true,
          accessUsedAt: true,
          accessRevokedAt: true
        }
      }) : null;
      if (!intake || intake.facilityId !== message.facilityId || intake.patientId !== message.patientId || intake.appointmentId !== message.appointmentId || !intake.accessExpiresAt || intake.accessUsedAt || intake.accessRevokedAt || intake.accessExpiresAt <= /* @__PURE__ */ new Date()) throw new Error("intake_access_unavailable");
      const access = deliverableIntakeAccessToken(intake.id, intake.accessExpiresAt);
      if (!verifyIntakeAccessToken(access.token, intake.accessCodeHash)) throw new Error("intake_access_digest_mismatch");
      const intakeUrl = `${getBaseUrlForEmails()}/intake#accessCode=${encodeURIComponent(access.token)}`;
      body = body.replaceAll("{{intake_link}}", intakeUrl);
    }
    data.message = {
      id: message.id,
      patientReference: message.patientId,
      channel: message.channel,
      purpose: message.purpose,
      subject: message.subject,
      body
    };
  }
  return {
    contractVersion: CONTRACT_VERSION,
    eventId: event.id,
    eventKey: event.eventKey,
    eventType: event.eventType,
    occurredAt: event.createdAt.toISOString(),
    facilityReference: event.facilityId,
    aggregate: { type: event.aggregateType, id: event.aggregateId },
    data
  };
}
async function markMessageSent(tx, event, now) {
  if (event.eventType !== "message.queued" || event.aggregateType !== "patient_message") return;
  const message = await tx.patientMessage.findUnique({ where: { id: event.aggregateId } });
  if (!message || message.facilityId !== event.facilityId || message.status !== "queued") return;
  const updated = await tx.patientMessage.update({
    where: { id: message.id },
    data: { status: "sent", transitionVersion: { increment: 1 }, sentAt: now }
  });
  const metadata = {
    source: "integration_outbox_worker",
    aggregateId: updated.id,
    fromStatus: message.status,
    status: updated.status,
    transitionVersion: updated.transitionVersion
  };
  await tx.clinicalAuditLog.create({ data: {
    eventType: "message.sent",
    occurredAt: now,
    actorType: "integration_worker",
    actorReference: event.installationId,
    facilityId: updated.facilityId,
    patientId: updated.patientId,
    metadata,
    createdAt: now
  } });
  await tx.clinicalOutboxEvent.create({ data: {
    eventKey: `patient_message:${updated.id}:v${updated.transitionVersion}:sent`,
    eventType: "message.sent",
    aggregateType: "patient_message",
    aggregateId: updated.id,
    contractVersion: "hospital.event.v1",
    deliveryMode: "internal",
    status: "recorded",
    attempts: 0,
    nextAttemptAt: null,
    facilityId: updated.facilityId,
    patientId: updated.patientId,
    appointmentId: updated.appointmentId,
    payload: metadata,
    createdAt: now
  } });
}
async function finalize(tx, event, outcome) {
  const now = /* @__PURE__ */ new Date();
  const current = await tx.clinicalOutboxEvent.findUnique({ where: { id: event.id } });
  if (!current || current.status !== "processing" || current.attempts !== event.attempts) return false;
  await tx.integrationDeliveryAttempt.create({ data: {
    attemptKey: `${event.id}:${event.installationId}:${event.attempts}`,
    facilityId: event.facilityId,
    installationId: event.installationId,
    outboxEventId: event.id,
    attemptNumber: event.attempts,
    status: outcome.status,
    responseStatus: outcome.responseStatus,
    errorCode: outcome.errorCode || "",
    responseDigest: outcome.responseDigest || "",
    startedAt: event.claimedAt,
    completedAt: now
  } });
  if (outcome.status === "succeeded") {
    await tx.clinicalOutboxEvent.update({ where: { id: event.id }, data: {
      status: "delivered",
      deliveredAt: now,
      nextAttemptAt: null,
      lastError: ""
    } });
    await tx.integrationInstallation.update({ where: { id: event.installationId }, data: {
      lastSuccessAt: now,
      lastErrorAt: null,
      lastErrorCode: ""
    } });
    await markMessageSent(tx, event, now);
  } else {
    const exhausted = event.attempts >= MAX_ATTEMPTS || outcome.status === "failed";
    await tx.clinicalOutboxEvent.update({ where: { id: event.id }, data: {
      status: exhausted ? "dead_letter" : "retry",
      nextAttemptAt: exhausted ? null : retryAt(event.attempts, event.id),
      lastError: outcome.errorCode || "integration_delivery_failed"
    } });
    await tx.integrationInstallation.update({ where: { id: event.installationId }, data: {
      lastErrorAt: now,
      lastErrorCode: outcome.errorCode || "integration_delivery_failed"
    } });
  }
  return true;
}
async function dispatchExternalOutbox(prisma, requestedLimit = 10) {
  const ids = await claimExternal(prisma, requestedLimit);
  let delivered = 0;
  let retried = 0;
  let deadLettered = 0;
  for (const id of ids) {
    const result8 = await prisma.$transaction(async (tx) => {
      const claimedAt = /* @__PURE__ */ new Date();
      const event = await authorizeClaimedDelivery(tx, id);
      if (!event) return { delivered: 0, retried: 0, deadLettered: 1 };
      const snapshot = { ...event, installationId: event.installation.id, claimedAt };
      try {
        const allowed = Array.isArray(event.installation.allowedEventTypes) ? event.installation.allowedEventTypes : [];
        if (!allowed.includes(event.eventType)) throw new Error("event_type_not_allowlisted");
        const endpoint2 = await resolveIntegrationEndpoint(event.installation.endpointUrl);
        const secret = decryptSecret({
          ciphertext: event.installation.signingSecretCiphertext,
          iv: event.installation.signingSecretIv,
          tag: event.installation.signingSecretTag
        }, integrationEncryptionKey());
        const payload = await deliveryPayload(tx, event);
        const body = JSON.stringify(payload);
        if (Buffer.byteLength(body) > 64e3) throw new Error("integration_payload_too_large");
        const timestamp53 = Math.floor(Date.now() / 1e3).toString();
        const response = await postPinnedIntegration(endpoint2, body, {
          "content-type": "application/json",
          "user-agent": "openfront-hospital-outbox/1",
          "x-openfront-contract": CONTRACT_VERSION,
          "x-openfront-event-id": event.id,
          "x-openfront-timestamp": timestamp53,
          "x-openfront-signature": `sha256=${hmacSignature(secret, timestamp53, body)}`
        });
        const { status: responseStatus, responseDigest } = response;
        if (responseStatus >= 200 && responseStatus < 300) {
          const changed2 = await finalize(tx, snapshot, { status: "succeeded", responseStatus, responseDigest });
          return { delivered: changed2 ? 1 : 0, retried: 0, deadLettered: 0 };
        }
        if (responseStatus === 408 || responseStatus === 425 || responseStatus === 429 || responseStatus >= 500) {
          const changed2 = await finalize(tx, snapshot, { status: "retry", responseStatus, responseDigest, errorCode: `http_${responseStatus}` });
          return {
            delivered: 0,
            retried: changed2 && event.attempts < MAX_ATTEMPTS ? 1 : 0,
            deadLettered: changed2 && event.attempts >= MAX_ATTEMPTS ? 1 : 0
          };
        }
        const changed = await finalize(tx, snapshot, { status: "failed", responseStatus, responseDigest, errorCode: `http_${responseStatus}` });
        return { delivered: 0, retried: 0, deadLettered: changed ? 1 : 0 };
      } catch (error) {
        const code = error instanceof Error ? error.message.slice(0, 120).replace(/[^A-Za-z0-9_.:-]/g, "_") : "integration_delivery_error";
        const terminal = [
          "event_type_not_allowlisted",
          "integration_payload_too_large",
          "integration_aggregate_scope_mismatch",
          "intake_access_unavailable",
          "intake_access_digest_mismatch"
        ].includes(code);
        const changed = await finalize(tx, snapshot, { status: terminal ? "failed" : "retry", errorCode: code });
        return {
          delivered: 0,
          retried: changed && !terminal && event.attempts < MAX_ATTEMPTS ? 1 : 0,
          deadLettered: changed && (terminal || event.attempts >= MAX_ATTEMPTS) ? 1 : 0
        };
      }
    }, { timeout: 3e4 });
    delivered += result8.delivered;
    retried += result8.retried;
    deadLettered += result8.deadLettered;
  }
  return { claimed: ids.length, delivered, retried, deadLettered };
}
var import_node_crypto18, import_node_http, import_node_https, import_node_net2, import_client22, MAX_ATTEMPTS, LEASE_MS, MAX_RESPONSE_BYTES, CONTRACT_VERSION;
var init_outboxWorker = __esm({
  "features/keystone/integrations/outboxWorker.ts"() {
    "use strict";
    import_node_crypto18 = require("node:crypto");
    import_node_http = require("node:http");
    import_node_https = require("node:https");
    import_node_net2 = require("node:net");
    import_client22 = require("@prisma/client");
    init_mail();
    init_intakeAccess();
    init_crypto();
    init_endpointPolicy();
    MAX_ATTEMPTS = 10;
    LEASE_MS = 5 * 6e4;
    MAX_RESPONSE_BYTES = 64e3;
    CONTRACT_VERSION = "hospital.webhook.v1";
  }
});

// features/keystone/mutations/operational/integrationWorkflows.ts
function requireIntegrations(context) {
  const role = context.session?.data.role;
  if (!role?.canManageIntegrations) throw new Error("Not authorized to manage integrations");
}
async function scopedFacility2(context, facilityId) {
  requireIntegrations(context);
  const facility = await context.query.Facility.findOne({ where: { id: facilityId }, query: "id status" });
  if (!facility || facility.status !== "active") throw new Error("Facility not found or not accessible");
  return facility;
}
function result5(row, replayed = false) {
  return { id: row.id, status: row.status, transitionVersion: row.transitionVersion, replayed };
}
async function createIntegrationInstallation(_root, { data }, context) {
  await scopedFacility2(context, data.facilityId);
  const name = bounded2(data.name, "Integration name", 200, true);
  const kind = bounded2(data.kind, "Integration kind", 40, true);
  if (!KINDS.has(kind)) throw new Error("Integration kind is invalid");
  const endpointUrl = await validateIntegrationEndpoint(data.endpointUrl);
  const allowedEventTypes = Array.from(new Set((Array.isArray(data.allowedEventTypes) ? data.allowedEventTypes : []).map((value) => bounded2(value, "Allowed event type", 100, true))));
  if (!allowedEventTypes.length || allowedEventTypes.length > 25 || allowedEventTypes.some((value) => !EVENT_TYPES.has(value))) {
    throw new Error("Integration event allowlist is invalid");
  }
  const input = { ...data, name, kind, endpointUrl, allowedEventTypes };
  const evidence = operationEvidence(input);
  return context.transaction(async (transactionContext) => {
    const prisma = transactionContext.sudo().prisma;
    await lockOperation(prisma, "integration-installation-create", evidence.operationKeyHash);
    const existing = await prisma.integrationInstallation.findUnique({ where: { operationKeyHash: evidence.operationKeyHash } });
    if (existing) {
      if (existing.requestHash !== evidence.requestHash) throw new Error("Operation key was reused with a different payload");
      return { ...result5(existing, true), installationKey: existing.installationKey, signingSecret: null };
    }
    const signingSecret = (0, import_node_crypto19.randomBytes)(32).toString("base64url");
    const encrypted = encryptSecret(signingSecret, integrationEncryptionKey());
    const now = /* @__PURE__ */ new Date();
    const installation = await prisma.integrationInstallation.create({ data: {
      installationKey: `INT-${(0, import_node_crypto19.randomUUID)()}`,
      name,
      kind,
      status: "active",
      transitionVersion: 1,
      ...evidence,
      facilityId: data.facilityId,
      endpointUrl,
      allowedEventTypes,
      signingSecretCiphertext: encrypted.ciphertext,
      signingSecretIv: encrypted.iv,
      signingSecretTag: encrypted.tag,
      keyVersion: 1,
      actorReference: context.session.itemId
    } });
    await appendAuditAndOutbox(prisma, {
      eventKey: `integration:${installation.id}:v1:active`,
      eventType: "integration.created",
      aggregateType: "integration",
      aggregateId: installation.id,
      facilityId: installation.facilityId,
      actorReference: context.session.itemId,
      metadata: { source: "integration_workflow", aggregateId: installation.id, kind, status: "active", transitionVersion: 1 },
      occurredAt: now
    });
    return { ...result5(installation), installationKey: installation.installationKey, signingSecret };
  }, { timeout: 3e4 });
}
async function transitionIntegrationInstallation(_root, args, context) {
  requireIntegrations(context);
  const scoped2 = await context.query.IntegrationInstallation.findOne({ where: { id: args.installationId }, query: "id" });
  if (!scoped2) throw new Error("Integration installation not found or not accessible");
  if (!Number.isInteger(args.expectedVersion) || args.expectedVersion < 1) throw new Error("Expected integration version is invalid");
  if (!["active", "paused", "revoked"].includes(args.toStatus)) throw new Error("Integration status is invalid");
  const evidence = transitionEvidence(args.operationKey, { installationId: args.installationId, expectedVersion: args.expectedVersion, toStatus: args.toStatus });
  const allowed = { active: ["paused", "revoked"], paused: ["active", "revoked"], revoked: [] };
  return context.transaction(async (transactionContext) => {
    const prisma = transactionContext.sudo().prisma;
    await lockTransitionOperation(prisma, evidence.operationKeyHash);
    await prisma.$queryRaw(import_client23.Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`integration:${args.installationId}`}, 0))::text AS "lock"`);
    const replay = await replayTransition(prisma, evidence, "integration", args.installationId);
    if (replay) return replay;
    const current = await prisma.integrationInstallation.findUnique({ where: { id: args.installationId } });
    if (!current || current.transitionVersion !== args.expectedVersion) throw new Error("Integration changed; refresh before retrying");
    if (!allowed[current.status]?.includes(args.toStatus)) throw new Error(`Invalid integration transition from ${current.status} to ${args.toStatus}`);
    const now = /* @__PURE__ */ new Date();
    const updated = await prisma.integrationInstallation.update({ where: { id: current.id }, data: {
      status: args.toStatus,
      transitionVersion: { increment: 1 },
      actorReference: context.session.itemId
    } });
    if (args.toStatus !== "active") {
      await prisma.clinicalOutboxEvent.updateMany({
        where: { installationId: updated.id, deliveryMode: "external", status: { in: ["pending", "retry"] } },
        data: { status: "dead_letter", nextAttemptAt: null, lastError: "integration_generation_revoked" }
      });
    }
    if (args.toStatus === "revoked") {
      await prisma.machineCredential.updateMany({ where: { installationId: updated.id, status: "active" }, data: { status: "revoked", revokedAt: now, transitionVersion: { increment: 1 } } });
    }
    const events = await appendAuditAndOutbox(prisma, {
      eventKey: `integration:${updated.id}:v${updated.transitionVersion}:${updated.status}`,
      eventType: `integration.${updated.status}`,
      aggregateType: "integration",
      aggregateId: updated.id,
      facilityId: updated.facilityId,
      actorReference: context.session.itemId,
      metadata: { source: "integration_workflow", aggregateId: updated.id, fromStatus: current.status, status: updated.status, transitionVersion: updated.transitionVersion },
      occurredAt: now
    });
    const projected = result5(updated);
    await recordTransition(prisma, {
      evidence,
      aggregateType: "integration",
      aggregateId: updated.id,
      fromStatus: current.status,
      toStatus: updated.status,
      fromVersion: current.transitionVersion,
      toVersion: updated.transitionVersion,
      actorReference: context.session.itemId,
      facilityId: updated.facilityId,
      auditLogId: events.audit.id,
      outboxEventId: events.outbox.id,
      result: projected,
      occurredAt: now
    });
    return projected;
  }, { timeout: 3e4 });
}
async function issueMachineCredential(_root, { data }, context) {
  requireIntegrations(context);
  const installation = await context.query.IntegrationInstallation.findOne({
    where: { id: data.installationId },
    query: "id status transitionVersion facility { id }"
  });
  if (!installation || installation.status !== "active") throw new Error("Active integration installation not found or not accessible");
  const name = bounded2(data.name, "Credential name", 200, true);
  const expiresAt = new Date(data.expiresAt);
  const now = /* @__PURE__ */ new Date();
  if (Number.isNaN(expiresAt.getTime()) || expiresAt <= now || expiresAt.getTime() > now.getTime() + 366 * 24 * 60 * 6e4) {
    throw new Error("Credential expiry must be within the next year");
  }
  const scopes = Array.from(new Set((Array.isArray(data.scopes) ? data.scopes : []).map((scope2) => bounded2(scope2, "Credential scope", 80, true))));
  if (!scopes.length || scopes.length > 10 || scopes.some((scope2) => scope2 !== "webhook:write")) throw new Error("Machine credential scopes are invalid");
  const evidence = operationEvidence({ ...data, name, expiresAt: expiresAt.toISOString(), scopes });
  return context.transaction(async (transactionContext) => {
    const prisma = transactionContext.sudo().prisma;
    await lockOperation(prisma, "machine-credential-create", evidence.operationKeyHash);
    const existing = await prisma.machineCredential.findUnique({ where: { operationKeyHash: evidence.operationKeyHash } });
    if (existing) {
      if (existing.requestHash !== evidence.requestHash) throw new Error("Operation key was reused with a different payload");
      return { ...result5(existing, true), credential: null, keyPrefix: existing.keyPrefix };
    }
    await prisma.$queryRaw(import_client23.Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`integration:${installation.id}`}, 0))::text AS "lock"`);
    const currentInstallation = await prisma.integrationInstallation.findUnique({ where: { id: installation.id } });
    if (!currentInstallation || currentInstallation.status !== "active" || currentInstallation.transitionVersion !== installation.transitionVersion) {
      throw new Error("Integration changed or is no longer active");
    }
    const prefix = (0, import_node_crypto19.randomBytes)(6).toString("hex");
    const credential = `ofh_${prefix}_${(0, import_node_crypto19.randomBytes)(32).toString("base64url")}`;
    const row = await prisma.machineCredential.create({ data: {
      name,
      keyPrefix: prefix,
      transitionVersion: 1,
      ...evidence,
      actorReference: context.session.itemId,
      secretDigest: sha256(credential),
      scopes,
      status: "active",
      facilityId: currentInstallation.facilityId,
      installationId: currentInstallation.id,
      createdById: context.session.itemId,
      createdAt: now,
      expiresAt
    } });
    await appendAuditAndOutbox(prisma, {
      eventKey: `machine_credential:${row.id}:v1:active`,
      eventType: "machine_credential.issued",
      aggregateType: "machine_credential",
      aggregateId: row.id,
      facilityId: row.facilityId,
      actorReference: context.session.itemId,
      metadata: { source: "integration_workflow", aggregateId: row.id, installationId: row.installationId, status: "active", transitionVersion: 1, expiresAt: expiresAt.toISOString() },
      occurredAt: now
    });
    return { ...result5(row), credential, keyPrefix: prefix };
  }, { timeout: 3e4 });
}
async function revokeMachineCredential(_root, args, context) {
  requireIntegrations(context);
  const scoped2 = await context.query.MachineCredential.findOne({ where: { id: args.credentialId }, query: "id" });
  if (!scoped2) throw new Error("Machine credential not found or not accessible");
  if (!Number.isInteger(args.expectedVersion) || args.expectedVersion < 1) throw new Error("Expected credential version is invalid");
  const evidence = transitionEvidence(args.operationKey, { credentialId: args.credentialId, expectedVersion: args.expectedVersion, toStatus: "revoked" });
  return context.transaction(async (transactionContext) => {
    const prisma = transactionContext.sudo().prisma;
    await lockTransitionOperation(prisma, evidence.operationKeyHash);
    const preliminary = await prisma.machineCredential.findUnique({ where: { id: args.credentialId } });
    if (!preliminary) throw new Error("Machine credential changed or is not active");
    await prisma.$queryRaw(import_client23.Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`integration:${preliminary.installationId}`}, 0))::text AS "lock"`);
    await prisma.$queryRaw(import_client23.Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`machine-credential:${args.credentialId}`}, 0))::text AS "lock"`);
    const replay = await replayTransition(prisma, evidence, "machine_credential", args.credentialId);
    if (replay) return replay;
    const current = await prisma.machineCredential.findUnique({ where: { id: args.credentialId } });
    if (!current || current.status !== "active" || current.transitionVersion !== args.expectedVersion) throw new Error("Machine credential changed or is not active");
    const now = /* @__PURE__ */ new Date();
    const updated = await prisma.machineCredential.update({ where: { id: current.id }, data: { status: "revoked", transitionVersion: { increment: 1 }, revokedAt: now } });
    const events = await appendAuditAndOutbox(prisma, {
      eventKey: `machine_credential:${updated.id}:v${updated.transitionVersion}:revoked`,
      eventType: "machine_credential.revoked",
      aggregateType: "machine_credential",
      aggregateId: updated.id,
      facilityId: updated.facilityId,
      actorReference: context.session.itemId,
      metadata: { source: "integration_workflow", aggregateId: updated.id, installationId: updated.installationId, status: "revoked", transitionVersion: updated.transitionVersion },
      occurredAt: now
    });
    const projected = result5(updated);
    await recordTransition(prisma, {
      evidence,
      aggregateType: "machine_credential",
      aggregateId: updated.id,
      fromStatus: current.status,
      toStatus: updated.status,
      fromVersion: current.transitionVersion,
      toVersion: updated.transitionVersion,
      actorReference: context.session.itemId,
      facilityId: updated.facilityId,
      auditLogId: events.audit.id,
      outboxEventId: events.outbox.id,
      result: projected,
      occurredAt: now
    });
    return projected;
  }, { timeout: 3e4 });
}
async function dispatchIntegrationOutbox(_root, args, context) {
  if (!context.session?.data.role?.canAccessAllClinicalData || !context.session?.data.role?.canManageIntegrations) {
    throw new Error("Only the global maintenance administrator can dispatch integration events");
  }
  return dispatchExternalOutbox(context.sudo().prisma, args.limit);
}
async function linkExternalIdentity(_root, { data }, context) {
  await scopedFacility2(context, data.facilityId);
  const system = bounded2(data.system, "External system", 120, true);
  const resourceType = bounded2(data.resourceType, "External resource type", 120, true);
  const externalId = bounded2(data.externalId, "External identifier", 300, true);
  const localType = bounded2(data.localType, "Local resource type", 80, true);
  const local = LOCAL_TYPES[localType];
  if (!local) throw new Error("Local resource type is not supported");
  const row = await context.query[local.list].findOne({ where: { id: data.localId }, query: local.query });
  const inFacility = localType === "patient" ? row?.facilities?.some((facility) => facility.id === data.facilityId) : row?.facility?.id === data.facilityId;
  if (!row || !inFacility) throw new Error("Local resource not found in the accessible facility");
  const input = { ...data, system, resourceType, externalId, localType };
  const evidence = operationEvidence(input);
  return context.transaction(async (transactionContext) => {
    const prisma = transactionContext.sudo().prisma;
    await lockOperation(prisma, "external-identity-link", evidence.operationKeyHash);
    const existing = await prisma.externalIdentityLink.findUnique({ where: { operationKeyHash: evidence.operationKeyHash } });
    if (existing) {
      if (existing.requestHash !== evidence.requestHash) throw new Error("Operation key was reused with a different payload");
      return { id: existing.id, status: existing.status, replayed: true };
    }
    const duplicate = await prisma.externalIdentityLink.findFirst({ where: { facilityId: data.facilityId, system, resourceType, externalId } });
    if (duplicate) throw new Error("External identity is already linked in the facility");
    const now = /* @__PURE__ */ new Date();
    const link = await prisma.externalIdentityLink.create({ data: {
      linkNumber: `XLINK-${(0, import_node_crypto19.randomUUID)()}`,
      facilityId: data.facilityId,
      system,
      resourceType,
      externalId,
      localType,
      localId: data.localId,
      status: "active",
      ...evidence,
      actorReference: context.session.itemId,
      createdAt: now
    } });
    await appendAuditAndOutbox(prisma, {
      eventKey: `external_identity:${link.id}:linked`,
      eventType: "external_identity.linked",
      aggregateType: "external_identity",
      aggregateId: link.id,
      facilityId: link.facilityId,
      actorReference: context.session.itemId,
      metadata: { source: "integration_workflow", aggregateId: link.id, system, resourceType, localType, localId: link.localId },
      occurredAt: now
    });
    return { id: link.id, status: link.status, replayed: false };
  }, { timeout: 3e4 });
}
var import_node_crypto19, import_client23, EVENT_TYPES, KINDS, LOCAL_TYPES;
var init_integrationWorkflows = __esm({
  "features/keystone/mutations/operational/integrationWorkflows.ts"() {
    "use strict";
    import_node_crypto19 = require("node:crypto");
    import_client23 = require("@prisma/client");
    init_crypto();
    init_outboxWorker();
    init_endpointPolicy();
    init_transitionEvidence();
    init_evidence();
    EVENT_TYPES = /* @__PURE__ */ new Set([
      "message.queued",
      "payment.pending",
      "refund.pending",
      "medical_order.ordered",
      "specimen.collected",
      "prescription.issued",
      "integration.test"
    ]);
    KINDS = /* @__PURE__ */ new Set(["communications", "payment", "laboratory", "pharmacy", "webhook"]);
    LOCAL_TYPES = {
      patient: { list: "Patient", query: "id facilities { id }" },
      appointment: { list: "Appointment", query: "id facility { id }" },
      encounter: { list: "Encounter", query: "id facility { id }" },
      claim: { list: "InsuranceClaim", query: "id facility { id }" },
      inventory_item: { list: "InventoryItem", query: "id facility { id }" }
    };
  }
});

// features/keystone/mutations/operational/retentionWorkflows.ts
function requireRetention(context) {
  const role = context.session?.data.role;
  if (!role?.canManageRetention) throw new Error("Not authorized to manage retention records");
}
async function scopedFacility3(context, facilityId) {
  requireRetention(context);
  const facility = await context.query.Facility.findOne({ where: { id: facilityId }, query: "id status" });
  if (!facility || facility.status !== "active") throw new Error("Facility not found or not accessible");
}
function result6(row, replayed = false) {
  return { id: row.id, status: row.status, transitionVersion: row.transitionVersion, replayed };
}
async function scopedTarget(context, facilityId, aggregateType, aggregateId) {
  const target = TARGETS[aggregateType];
  if (!target) throw new Error("Retention aggregate type is not supported");
  const row = await context.query[target.list].findOne({ where: { id: aggregateId }, query: target.query });
  const inFacility = aggregateType === "patient" ? row?.facilities?.some((facility) => facility.id === facilityId) : row?.facility?.id === facilityId;
  if (!row || !inFacility) throw new Error("Retention target not found in the accessible facility");
  return { ...row, patientId: row.patient?.id || (aggregateType === "patient" ? row.id : null) };
}
async function createRetentionPolicy(_root, { data }, context) {
  await scopedFacility3(context, data.facilityId);
  const recordType = bounded2(data.recordType, "Retention record type", 80, true);
  const retentionDays = Number(data.retentionDays);
  if (!Number.isSafeInteger(retentionDays) || retentionDays < 1 || retentionDays > 36500) throw new Error("Retention days must be between 1 and 36500");
  const evidence = operationEvidence({ ...data, recordType, retentionDays });
  return context.transaction(async (transactionContext) => {
    const currentContext = await currentHospitalActor(transactionContext, ["canManageRetention"]);
    await lockCurrentHospitalFacility(currentContext, data.facilityId);
    const prisma = currentContext.sudo().prisma;
    await lockOperation(prisma, "retention-policy-create", evidence.operationKeyHash);
    const existing = await prisma.retentionPolicy.findUnique({ where: { operationKeyHash: evidence.operationKeyHash } });
    if (existing) {
      if (existing.requestHash !== evidence.requestHash) throw new Error("Operation key was reused with a different payload");
      return result6(existing, true);
    }
    if (await prisma.retentionPolicy.findFirst({ where: { facilityId: data.facilityId, recordType } })) throw new Error("Retention policy already exists for this facility record type");
    const now = /* @__PURE__ */ new Date();
    const policy = await prisma.retentionPolicy.create({ data: {
      recordType,
      retentionDays,
      status: "active",
      transitionVersion: 1,
      ...evidence,
      actorReference: context.session.itemId,
      facilityId: data.facilityId
    } });
    await appendAuditAndOutbox(prisma, {
      eventKey: `retention_policy:${policy.id}:v1:active`,
      eventType: "retention_policy.created",
      aggregateType: "retention_policy",
      aggregateId: policy.id,
      facilityId: policy.facilityId,
      actorReference: context.session.itemId,
      metadata: { source: "retention_workflow", aggregateId: policy.id, recordType, retentionDays, status: "active", transitionVersion: 1 },
      occurredAt: now
    });
    return result6(policy);
  }, { timeout: 3e4 });
}
async function transitionRetentionPolicy(_root, args, context) {
  requireRetention(context);
  const scoped2 = await context.query.RetentionPolicy.findOne({ where: { id: args.policyId }, query: "id facility { id }" });
  if (!scoped2?.facility?.id) throw new Error("Retention policy not found or not accessible");
  if (!Number.isInteger(args.expectedVersion) || args.expectedVersion < 1) throw new Error("Expected policy version is invalid");
  if (!["active", "inactive"].includes(args.toStatus)) throw new Error("Retention policy status is invalid");
  const evidence = transitionEvidence(args.operationKey, { policyId: args.policyId, expectedVersion: args.expectedVersion, toStatus: args.toStatus });
  return context.transaction(async (transactionContext) => {
    const currentContext = await currentHospitalActor(transactionContext, ["canManageRetention"]);
    await lockCurrentHospitalFacility(currentContext, scoped2.facility.id);
    const prisma = currentContext.sudo().prisma;
    await lockTransitionOperation(prisma, evidence.operationKeyHash);
    await prisma.$queryRaw(import_client24.Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`retention-policy:${args.policyId}`}, 0))::text AS "lock"`);
    const replay = await replayTransition(prisma, evidence, "retention_policy", args.policyId);
    if (replay) return replay;
    const current = await prisma.retentionPolicy.findUnique({ where: { id: args.policyId } });
    if (!current || current.transitionVersion !== args.expectedVersion || current.status === args.toStatus) throw new Error("Retention policy changed; refresh before retrying");
    const now = /* @__PURE__ */ new Date();
    const updated = await prisma.retentionPolicy.update({ where: { id: current.id }, data: { status: args.toStatus, transitionVersion: { increment: 1 }, actorReference: context.session.itemId } });
    const events = await appendAuditAndOutbox(prisma, {
      eventKey: `retention_policy:${updated.id}:v${updated.transitionVersion}:${updated.status}`,
      eventType: `retention_policy.${updated.status}`,
      aggregateType: "retention_policy",
      aggregateId: updated.id,
      facilityId: updated.facilityId,
      actorReference: context.session.itemId,
      metadata: { source: "retention_workflow", aggregateId: updated.id, recordType: updated.recordType, fromStatus: current.status, status: updated.status, transitionVersion: updated.transitionVersion },
      occurredAt: now
    });
    const projected = result6(updated);
    await recordTransition(prisma, {
      evidence,
      aggregateType: "retention_policy",
      aggregateId: updated.id,
      fromStatus: current.status,
      toStatus: updated.status,
      fromVersion: current.transitionVersion,
      toVersion: updated.transitionVersion,
      actorReference: context.session.itemId,
      facilityId: updated.facilityId,
      auditLogId: events.audit.id,
      outboxEventId: events.outbox.id,
      result: projected,
      occurredAt: now
    });
    return projected;
  }, { timeout: 3e4 });
}
async function placeRecordHold(_root, { data }, context) {
  await scopedFacility3(context, data.facilityId);
  const aggregateType = bounded2(data.aggregateType, "Hold aggregate type", 80, true);
  const aggregateId = bounded2(data.aggregateId, "Hold aggregate ID", 200, true);
  const reasonCode = bounded2(data.reasonCode, "Hold reason", 80, true);
  const notes = bounded2(data.notes, "Hold notes", 2e3);
  const evidence = operationEvidence({ ...data, aggregateType, aggregateId, reasonCode, notes });
  return context.transaction(async (transactionContext) => {
    const currentContext = await currentHospitalActor(transactionContext, ["canManageRetention"]);
    await lockCurrentHospitalFacility(currentContext, data.facilityId);
    const prisma = currentContext.sudo().prisma;
    await lockOperation(prisma, "record-hold-create", evidence.operationKeyHash);
    const existing = await prisma.recordHold.findUnique({ where: { operationKeyHash: evidence.operationKeyHash } });
    if (existing) {
      if (existing.requestHash !== evidence.requestHash) throw new Error("Operation key was reused with a different payload");
      return result6(existing, true);
    }
    await prisma.$queryRaw(import_client24.Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`retention-target:${data.facilityId}:${aggregateType}:${aggregateId}`}, 0))::text AS "lock"`);
    const target = await scopedTarget(currentContext, data.facilityId, aggregateType, aggregateId);
    if (await prisma.recordHold.findFirst({ where: { facilityId: data.facilityId, aggregateType, aggregateId, status: "active" } })) throw new Error("An active hold already exists for this record");
    const now = /* @__PURE__ */ new Date();
    const hold = await prisma.recordHold.create({ data: {
      holdNumber: `HOLD-${(0, import_node_crypto20.randomUUID)()}`,
      aggregateType,
      aggregateId,
      status: "active",
      transitionVersion: 1,
      ...evidence,
      facilityId: data.facilityId,
      patientId: target.patientId,
      reasonCode,
      notes,
      actorReference: context.session.itemId,
      placedAt: now
    } });
    await appendAuditAndOutbox(prisma, {
      eventKey: `record_hold:${hold.id}:v1:active`,
      eventType: "record_hold.placed",
      aggregateType: "record_hold",
      aggregateId: hold.id,
      facilityId: hold.facilityId,
      patientId: hold.patientId,
      actorReference: context.session.itemId,
      metadata: { source: "retention_workflow", aggregateId: hold.id, heldAggregateType: aggregateType, heldAggregateId: aggregateId, reasonCode, status: "active", transitionVersion: 1 },
      occurredAt: now
    });
    return result6(hold);
  }, { timeout: 3e4 });
}
async function releaseRecordHold(_root, args, context) {
  requireRetention(context);
  const scoped2 = await context.query.RecordHold.findOne({ where: { id: args.holdId }, query: "id facility { id }" });
  if (!scoped2?.facility?.id) throw new Error("Record hold not found or not accessible");
  if (!Number.isInteger(args.expectedVersion) || args.expectedVersion < 1) throw new Error("Expected hold version is invalid");
  const reasonCode = bounded2(args.reasonCode, "Hold release reason", 80, true);
  const evidence = transitionEvidence(args.operationKey, { holdId: args.holdId, expectedVersion: args.expectedVersion, reasonCode });
  return context.transaction(async (transactionContext) => {
    const currentContext = await currentHospitalActor(transactionContext, ["canManageRetention"]);
    await lockCurrentHospitalFacility(currentContext, scoped2.facility.id);
    const prisma = currentContext.sudo().prisma;
    await lockTransitionOperation(prisma, evidence.operationKeyHash);
    await prisma.$queryRaw(import_client24.Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`record-hold:${args.holdId}`}, 0))::text AS "lock"`);
    const replay = await replayTransition(prisma, evidence, "record_hold", args.holdId);
    if (replay) return replay;
    const current = await prisma.recordHold.findUnique({ where: { id: args.holdId } });
    if (!current || current.status !== "active" || current.transitionVersion !== args.expectedVersion) throw new Error("Record hold changed or is no longer active");
    await prisma.$queryRaw(import_client24.Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`retention-target:${current.facilityId}:${current.aggregateType}:${current.aggregateId}`}, 0))::text AS "lock"`);
    const refreshed = await prisma.recordHold.findUnique({ where: { id: current.id } });
    if (!refreshed || refreshed.status !== "active" || refreshed.transitionVersion !== args.expectedVersion) throw new Error("Record hold changed or is no longer active");
    const now = /* @__PURE__ */ new Date();
    const updated = await prisma.recordHold.update({ where: { id: current.id }, data: { status: "released", transitionVersion: { increment: 1 }, reasonCode, actorReference: context.session.itemId, releasedAt: now } });
    const events = await appendAuditAndOutbox(prisma, {
      eventKey: `record_hold:${updated.id}:v${updated.transitionVersion}:released`,
      eventType: "record_hold.released",
      aggregateType: "record_hold",
      aggregateId: updated.id,
      facilityId: updated.facilityId,
      patientId: updated.patientId,
      actorReference: context.session.itemId,
      metadata: { source: "retention_workflow", aggregateId: updated.id, heldAggregateType: updated.aggregateType, heldAggregateId: updated.aggregateId, status: "released", transitionVersion: updated.transitionVersion, reasonCode },
      occurredAt: now
    });
    const projected = result6(updated);
    await recordTransition(prisma, {
      evidence,
      aggregateType: "record_hold",
      aggregateId: updated.id,
      fromStatus: current.status,
      toStatus: updated.status,
      fromVersion: current.transitionVersion,
      toVersion: updated.transitionVersion,
      actorReference: context.session.itemId,
      facilityId: updated.facilityId,
      patientId: updated.patientId,
      auditLogId: events.audit.id,
      outboxEventId: events.outbox.id,
      result: projected,
      occurredAt: now
    });
    return projected;
  }, { timeout: 3e4 });
}
async function recordRetentionDisposition(_root, { data }, context) {
  await scopedFacility3(context, data.facilityId);
  const aggregateType = bounded2(data.aggregateType, "Disposition aggregate type", 80, true);
  const aggregateId = bounded2(data.aggregateId, "Disposition aggregate ID", 200, true);
  const reasonCode = bounded2(data.reasonCode, "Disposition reason", 80, true);
  const requestedDecision = bounded2(data.decision, "Disposition decision", 40, true);
  if (!["retain", "review"].includes(requestedDecision)) throw new Error("Physical record disposal is not supported by this workflow");
  const evidence = operationEvidence({ ...data, aggregateType, aggregateId, reasonCode, requestedDecision });
  return context.transaction(async (transactionContext) => {
    const currentContext = await currentHospitalActor(transactionContext, ["canManageRetention"]);
    await lockCurrentHospitalFacility(currentContext, data.facilityId);
    const prisma = currentContext.sudo().prisma;
    await lockOperation(prisma, "retention-disposition-create", evidence.operationKeyHash);
    const existing = await prisma.retentionDisposition.findUnique({ where: { operationKeyHash: evidence.operationKeyHash } });
    if (existing) {
      if (existing.requestHash !== evidence.requestHash) throw new Error("Operation key was reused with a different payload");
      if (existing.actorReference !== currentContext.session.itemId || existing.facilityId !== data.facilityId) throw new Error("Original disposition owner could not be verified");
      await scopedTarget(currentContext, data.facilityId, aggregateType, aggregateId);
      return { id: existing.id, decision: existing.decision, replayed: true };
    }
    await prisma.$queryRaw(import_client24.Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`retention-target:${data.facilityId}:${aggregateType}:${aggregateId}`}, 0))::text AS "lock"`);
    await prisma.$queryRaw(import_client24.Prisma.sql`SELECT "id" FROM "RetentionPolicy" WHERE "id" = ${data.policyId} FOR SHARE`);
    const policy = await currentContext.query.RetentionPolicy.findOne({ where: { id: data.policyId }, query: "id status recordType retentionDays transitionVersion facility { id }" });
    if (!policy || policy.status !== "active" || policy.facility?.id !== data.facilityId || policy.recordType !== aggregateType) throw new Error("Active retention policy does not match the record");
    const table = TARGETS[aggregateType]?.list;
    if (!table) throw new Error("Retention aggregate type is not supported");
    await prisma.$queryRaw(import_client24.Prisma.sql`SELECT "id" FROM ${import_client24.Prisma.raw(`"${table}"`)} WHERE "id" = ${aggregateId} FOR SHARE`);
    const target = await scopedTarget(currentContext, data.facilityId, aggregateType, aggregateId);
    const calculatedAt = /* @__PURE__ */ new Date();
    const cutoffAt = new Date(calculatedAt.getTime() - policy.retentionDays * 24 * 60 * 6e4);
    const activeHold = await prisma.recordHold.findFirst({ where: { facilityId: data.facilityId, aggregateType, aggregateId, status: "active" } });
    const targetCreatedAt = new Date(target.createdAt);
    const decision = activeHold ? "blocked_by_hold" : targetCreatedAt > cutoffAt || requestedDecision === "retain" ? "retained" : "eligible_for_review";
    const now = /* @__PURE__ */ new Date();
    const disposition = await prisma.retentionDisposition.create({ data: {
      dispositionNumber: `DISP-${(0, import_node_crypto20.randomUUID)()}`,
      ...evidence,
      facilityId: data.facilityId,
      patientId: target.patientId,
      policyId: policy.id,
      recordType: policy.recordType,
      aggregateType,
      aggregateId,
      decision,
      reasonCode,
      actorReference: context.session.itemId,
      cutoffAt,
      reviewedAt: now
    } });
    await appendAuditAndOutbox(prisma, {
      eventKey: `retention_disposition:${disposition.id}:${decision}`,
      eventType: "retention.disposition_reviewed",
      aggregateType: "retention_disposition",
      aggregateId: disposition.id,
      facilityId: disposition.facilityId,
      patientId: disposition.patientId,
      actorReference: context.session.itemId,
      metadata: { source: "retention_workflow", aggregateId: disposition.id, reviewedAggregateType: aggregateType, reviewedAggregateId: aggregateId, decision, reasonCode, policyId: policy.id, policyRevision: policy.transitionVersion, retentionDays: policy.retentionDays, calculatedAt: calculatedAt.toISOString(), cutoffAt: cutoffAt.toISOString(), physicalDeletion: false },
      occurredAt: now
    });
    return { id: disposition.id, decision, replayed: false };
  }, { timeout: 3e4 });
}
var import_node_crypto20, import_client24, TARGETS;
var init_retentionWorkflows = __esm({
  "features/keystone/mutations/operational/retentionWorkflows.ts"() {
    "use strict";
    init_currentHospitalActor();
    import_node_crypto20 = require("node:crypto");
    import_client24 = require("@prisma/client");
    init_transitionEvidence();
    init_evidence();
    TARGETS = {
      patient: { list: "Patient", query: "id createdAt facilities { id }" },
      appointment: { list: "Appointment", query: "id createdAt facility { id } patient { id }" },
      encounter: { list: "Encounter", query: "id createdAt facility { id } patient { id }" },
      clinical_document: { list: "ClinicalDocument", query: "id createdAt facility { id } patient { id }" },
      claim: { list: "InsuranceClaim", query: "id createdAt facility { id } patient { id }" },
      export_job: { list: "ExportJob", query: "id createdAt facility { id }" }
    };
  }
});

// features/keystone/portability/inventoryCsv.ts
function parseCsv(source) {
  const rows2 = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field);
      rows2.push(row);
      row = [];
      field = "";
    } else if (character !== "\r") field += character;
  }
  if (quoted) throw new Error("CSV contains an unterminated quoted field");
  row.push(field);
  if (row.some((value) => value.length) || rows2.length === 0) rows2.push(row);
  return rows2;
}
function safeText(value, max) {
  const text63 = value.trim();
  return Boolean(text63) && text63.length <= max && !/^[=+\-@]/.test(text63) && !/[\u0000-\u001f\u007f]/.test(text63);
}
function previewInventoryCsv(source) {
  const csv = String(source || "");
  if (!csv || Buffer.byteLength(csv) > 1e5) throw new Error("Inventory CSV must be between 1 byte and 100 KB");
  const parsed = parseCsv(csv);
  const header = parsed.shift()?.map((value) => value.trim());
  if (JSON.stringify(header) !== JSON.stringify(["sku", "name", "unit", "quantity", "reorderPoint"])) {
    throw new Error("Inventory CSV header must be sku,name,unit,quantity,reorderPoint");
  }
  if (parsed.length > 100) throw new Error("Inventory CSV cannot contain more than 100 rows");
  const rows2 = [];
  const errors = [];
  const seen = /* @__PURE__ */ new Set();
  parsed.forEach((columns, index) => {
    const rowNumber = index + 2;
    if (columns.length !== 5) {
      errors.push({ rowNumber, code: "column_count" });
      return;
    }
    const [rawSku, rawName, rawUnit, rawQuantity, rawReorder] = columns;
    const sku = rawSku.trim().toUpperCase();
    const name = rawName.trim();
    const unit = rawUnit.trim();
    const quantity = Number(rawQuantity);
    const reorderPoint = Number(rawReorder);
    if (!/^[A-Z0-9][A-Z0-9._-]{0,99}$/.test(sku)) errors.push({ rowNumber, code: "invalid_sku" });
    if (!safeText(name, 300)) errors.push({ rowNumber, code: "invalid_name" });
    if (!safeText(unit, 80)) errors.push({ rowNumber, code: "invalid_unit" });
    if (!Number.isSafeInteger(quantity) || quantity < 0) errors.push({ rowNumber, code: "invalid_quantity" });
    if (!Number.isSafeInteger(reorderPoint) || reorderPoint < 0) errors.push({ rowNumber, code: "invalid_reorder_point" });
    if (seen.has(sku)) errors.push({ rowNumber, code: "duplicate_sku" });
    seen.add(sku);
    if (!errors.some((error) => error.rowNumber === rowNumber)) rows2.push({ rowNumber, sku, name, unit, quantity, reorderPoint });
  });
  return { rows: rows2, errors, rowCount: parsed.length };
}
function inventoryRowsToCsv(rows2) {
  const escape = (value) => {
    let text63 = String(value ?? "");
    if (/^[=+\-@]/.test(text63)) text63 = `'${text63}`;
    return /[",\r\n]/.test(text63) ? `"${text63.replaceAll('"', '""')}"` : text63;
  };
  return [
    "sku,name,unit,status,quantityOnHand,quantityReserved,reorderPoint",
    ...rows2.map((row) => [row.sku, row.name, row.unit, row.status, row.quantityOnHand, row.quantityReserved, row.reorderPoint].map(escape).join(","))
  ].join("\r\n");
}
var init_inventoryCsv = __esm({
  "features/keystone/portability/inventoryCsv.ts"() {
    "use strict";
  }
});

// features/keystone/mutations/operational/portabilityWorkflows.ts
function requirePortability(context) {
  const role = context.session?.data.role;
  if (!role?.canManageDataPortability) throw new Error("Not authorized to manage imports and exports");
}
function requireAuditReportAccess(context) {
  if (!context.session?.data.role?.canViewReports) {
    throw new Error("Report permission is required to export audit records");
  }
}
async function scopedFacility4(context, facilityId) {
  requirePortability(context);
  const facility = await context.query.Facility.findOne({ where: { id: facilityId }, query: "id status staff { id }" });
  const isGlobal = context.session?.data.role?.canAccessAllClinicalData === true;
  const isFacilityStaff = facility?.staff?.some((member) => member.id === context.session?.itemId);
  if (!facility || facility.status !== "active" || !isGlobal && !isFacilityStaff) {
    throw new Error("Facility not found, inactive, or not accessible");
  }
}
function result7(row, replayed = false) {
  return { id: row.id, status: row.status, transitionVersion: row.transitionVersion, replayed };
}
async function previewInventoryImport(_root, { data }, context) {
  await scopedFacility4(context, data.facilityId);
  const preview = previewInventoryCsv(data.csv);
  const sourceHash = sha256(String(data.csv));
  const evidence = operationEvidence({ operationKey: data.operationKey, facilityId: data.facilityId, importType: "inventory", sourceHash });
  return context.transaction(async (transactionContext) => {
    const prisma = transactionContext.sudo().prisma;
    await lockOperation(prisma, "import-preview", evidence.operationKeyHash);
    const existing = await prisma.importBatch.findUnique({ where: { operationKeyHash: evidence.operationKeyHash } });
    if (existing) {
      if (existing.requestHash !== evidence.requestHash) throw new Error("Operation key was reused with a different payload");
      return { ...result7(existing, true), rowCount: existing.rowCount, errorCount: existing.errorCount };
    }
    const now = /* @__PURE__ */ new Date();
    const batch = await prisma.importBatch.create({ data: {
      batchNumber: `IMPORT-${(0, import_node_crypto21.randomUUID)()}`,
      importType: "inventory",
      status: "previewed",
      transitionVersion: 1,
      ...evidence,
      sourceHash,
      facilityId: data.facilityId,
      rowCount: preview.rowCount,
      errorCount: preview.errors.length,
      preview,
      actorReference: context.session.itemId
    } });
    await appendAuditAndOutbox(prisma, {
      eventKey: `import_batch:${batch.id}:v1:previewed`,
      eventType: "import.previewed",
      aggregateType: "import_batch",
      aggregateId: batch.id,
      facilityId: batch.facilityId,
      actorReference: context.session.itemId,
      metadata: { source: "portability_workflow", aggregateId: batch.id, importType: "inventory", rowCount: batch.rowCount, errorCount: batch.errorCount, status: "previewed", transitionVersion: 1 },
      occurredAt: now
    });
    return { ...result7(batch), rowCount: batch.rowCount, errorCount: batch.errorCount };
  }, { timeout: 3e4 });
}
function batchRows(batch) {
  const rows2 = batch.preview && typeof batch.preview === "object" && Array.isArray(batch.preview.rows) ? batch.preview.rows : null;
  if (!rows2 || rows2.length !== batch.rowCount || rows2.some((row) => !Number.isInteger(row.rowNumber) || typeof row.sku !== "string")) {
    throw new Error("Import preview evidence is invalid");
  }
  return rows2;
}
async function applyInventoryImport(_root, args, context) {
  requirePortability(context);
  const scoped2 = await context.query.ImportBatch.findOne({ where: { id: args.batchId }, query: "id" });
  if (!scoped2) throw new Error("Import batch not found or not accessible");
  if (!Number.isInteger(args.expectedVersion) || args.expectedVersion < 1) throw new Error("Expected import version is invalid");
  const evidence = transitionEvidence(args.operationKey, { batchId: args.batchId, expectedVersion: args.expectedVersion, toStatus: "applied" });
  return context.transaction(async (transactionContext) => {
    const prisma = transactionContext.sudo().prisma;
    await lockTransitionOperation(prisma, evidence.operationKeyHash);
    await prisma.$queryRaw(import_client25.Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`import-batch:${args.batchId}`}, 0))::text AS "lock"`);
    const replay = await replayTransition(prisma, evidence, "import_batch", args.batchId);
    if (replay) return replay;
    const batch = await prisma.importBatch.findUnique({ where: { id: args.batchId } });
    if (!batch || batch.status !== "previewed" || batch.transitionVersion !== args.expectedVersion) throw new Error("Import batch changed or is not ready to apply");
    if (batch.errorCount > 0) throw new Error("Import preview errors must be resolved before apply");
    const rows2 = batchRows(batch);
    const existing = await prisma.inventoryItem.findMany({ where: { facilityId: batch.facilityId, sku: { in: rows2.map((row) => row.sku) } }, select: { sku: true } });
    if (existing.length) throw new Error("One or more import SKUs already exist in the facility");
    const now = /* @__PURE__ */ new Date();
    const appliedIds = [];
    for (const row of rows2) {
      const item = await prisma.inventoryItem.create({ data: {
        sku: row.sku,
        name: row.name,
        unit: row.unit,
        status: "active",
        transitionVersion: 1,
        quantityOnHand: row.quantity,
        quantityReserved: 0,
        reorderPoint: row.reorderPoint,
        operationKeyHash: hash(`import-item:${batch.id}:${row.rowNumber}`),
        requestHash: hash(`${batch.sourceHash}:${row.rowNumber}`),
        actorReference: context.session.itemId,
        facilityId: batch.facilityId
      } });
      appliedIds.push(item.id);
      if (row.quantity > 0) {
        await prisma.inventoryMovement.create({ data: {
          movementNumber: `MOV-${(0, import_node_crypto21.randomUUID)()}`,
          operationKeyHash: hash(`import-movement:${batch.id}:${row.rowNumber}`),
          requestHash: hash(`${batch.sourceHash}:movement:${row.rowNumber}`),
          movementType: "receive",
          quantityDelta: row.quantity,
          resultingOnHand: row.quantity,
          reservedDelta: 0,
          resultingReserved: 0,
          reasonCode: "authorized_import",
          facilityId: batch.facilityId,
          itemId: item.id,
          actorReference: context.session.itemId,
          occurredAt: now
        } });
      }
    }
    const updated = await prisma.importBatch.update({ where: { id: batch.id }, data: {
      status: "applied",
      transitionVersion: { increment: 1 },
      appliedIds,
      appliedAt: now,
      actorReference: context.session.itemId
    } });
    const events = await appendAuditAndOutbox(prisma, {
      eventKey: `import_batch:${updated.id}:v${updated.transitionVersion}:applied`,
      eventType: "import.applied",
      aggregateType: "import_batch",
      aggregateId: updated.id,
      facilityId: updated.facilityId,
      actorReference: context.session.itemId,
      metadata: { source: "portability_workflow", aggregateId: updated.id, importType: "inventory", rowCount: updated.rowCount, status: "applied", transitionVersion: updated.transitionVersion },
      occurredAt: now
    });
    const projected = result7(updated);
    await recordTransition(prisma, {
      evidence,
      aggregateType: "import_batch",
      aggregateId: updated.id,
      fromStatus: batch.status,
      toStatus: updated.status,
      fromVersion: batch.transitionVersion,
      toVersion: updated.transitionVersion,
      actorReference: context.session.itemId,
      facilityId: updated.facilityId,
      auditLogId: events.audit.id,
      outboxEventId: events.outbox.id,
      result: projected,
      occurredAt: now
    });
    return projected;
  }, { timeout: 3e4 });
}
async function rollbackInventoryImport(_root, args, context) {
  requirePortability(context);
  const scoped2 = await context.query.ImportBatch.findOne({ where: { id: args.batchId }, query: "id" });
  if (!scoped2) throw new Error("Import batch not found or not accessible");
  if (!Number.isInteger(args.expectedVersion) || args.expectedVersion < 1) throw new Error("Expected import version is invalid");
  const reasonCode = bounded2(args.reasonCode, "Import rollback reason", 80, true);
  const evidence = transitionEvidence(args.operationKey, { batchId: args.batchId, expectedVersion: args.expectedVersion, toStatus: "rolled_back", reasonCode });
  return context.transaction(async (transactionContext) => {
    const prisma = transactionContext.sudo().prisma;
    await lockTransitionOperation(prisma, evidence.operationKeyHash);
    await prisma.$queryRaw(import_client25.Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`import-batch:${args.batchId}`}, 0))::text AS "lock"`);
    const replay = await replayTransition(prisma, evidence, "import_batch", args.batchId);
    if (replay) return replay;
    const batch = await prisma.importBatch.findUnique({ where: { id: args.batchId } });
    if (!batch || batch.status !== "applied" || batch.transitionVersion !== args.expectedVersion || !Array.isArray(batch.appliedIds)) throw new Error("Import batch changed or cannot be rolled back");
    const rows2 = batchRows(batch);
    for (const itemId of [...batch.appliedIds].sort()) {
      await prisma.$queryRaw(import_client25.Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`inventory-item:${itemId}`}, 0))::text AS "lock"`);
      await prisma.$queryRaw(import_client25.Prisma.sql`SELECT "id" FROM "InventoryItem" WHERE "id" = ${itemId} FOR UPDATE`);
    }
    const items = await prisma.inventoryItem.findMany({ where: { id: { in: batch.appliedIds }, facilityId: batch.facilityId } });
    if (items.length !== rows2.length || items.some((item) => {
      const row = rows2.find((value) => value.sku === item.sku);
      return !row || item.status !== "active" || item.transitionVersion !== 1 || item.quantityOnHand !== row.quantity || item.quantityReserved !== 0;
    })) throw new Error("Imported inventory changed; rollback is no longer safe");
    const now = /* @__PURE__ */ new Date();
    for (const item of items) {
      const changed = await prisma.inventoryItem.updateMany({ where: { id: item.id, transitionVersion: 1, status: "active", quantityOnHand: item.quantityOnHand, quantityReserved: 0 }, data: { status: "inactive", quantityOnHand: 0, transitionVersion: { increment: 1 }, actorReference: context.session.itemId } });
      if (changed.count !== 1) throw new Error("Imported inventory changed; rollback is no longer safe");
      if (item.quantityOnHand > 0) {
        await prisma.inventoryMovement.create({ data: {
          movementNumber: `MOV-${(0, import_node_crypto21.randomUUID)()}`,
          operationKeyHash: hash(`import-rollback:${batch.id}:${item.id}`),
          requestHash: evidence.requestHash,
          movementType: "adjust",
          quantityDelta: -item.quantityOnHand,
          resultingOnHand: 0,
          reservedDelta: 0,
          resultingReserved: 0,
          reasonCode,
          facilityId: batch.facilityId,
          itemId: item.id,
          actorReference: context.session.itemId,
          occurredAt: now
        } });
      }
    }
    const updated = await prisma.importBatch.update({ where: { id: batch.id }, data: {
      status: "rolled_back",
      transitionVersion: { increment: 1 },
      rolledBackAt: now,
      actorReference: context.session.itemId
    } });
    const events = await appendAuditAndOutbox(prisma, {
      eventKey: `import_batch:${updated.id}:v${updated.transitionVersion}:rolled_back`,
      eventType: "import.rolled_back",
      aggregateType: "import_batch",
      aggregateId: updated.id,
      facilityId: updated.facilityId,
      actorReference: context.session.itemId,
      metadata: { source: "portability_workflow", aggregateId: updated.id, importType: "inventory", rowCount: updated.rowCount, status: "rolled_back", transitionVersion: updated.transitionVersion, reasonCode },
      occurredAt: now
    });
    const projected = result7(updated);
    await recordTransition(prisma, {
      evidence,
      aggregateType: "import_batch",
      aggregateId: updated.id,
      fromStatus: batch.status,
      toStatus: updated.status,
      fromVersion: batch.transitionVersion,
      toVersion: updated.transitionVersion,
      actorReference: context.session.itemId,
      facilityId: updated.facilityId,
      auditLogId: events.audit.id,
      outboxEventId: events.outbox.id,
      result: projected,
      occurredAt: now
    });
    return projected;
  }, { timeout: 3e4 });
}
function exportFilters(value) {
  if (value == null) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Export filters are invalid");
  const input = value;
  if (Object.keys(input).some((key2) => !["from", "to", "status"].includes(key2))) throw new Error("Export filter is not supported");
  const output = {};
  if (input.from) output.from = new Date(String(input.from)).toISOString();
  if (input.to) output.to = new Date(String(input.to)).toISOString();
  if (input.status) output.status = bounded2(input.status, "Export status filter", 40, true);
  if (output.from && output.to && new Date(output.from) > new Date(output.to)) throw new Error("Export date range is invalid");
  return output;
}
async function requestExportJob(_root, { data }, context) {
  await scopedFacility4(context, data.facilityId);
  const exportType = bounded2(data.exportType, "Export type", 40, true);
  const format = bounded2(data.format, "Export format", 10, true);
  if (!["patients", "appointments", "audit", "inventory"].includes(exportType) || !["csv", "json"].includes(format)) throw new Error("Export type or format is invalid");
  if (exportType === "audit") requireAuditReportAccess(context);
  const filters = exportFilters(data.filters);
  const evidence = operationEvidence({ ...data, exportType, format, filters });
  return context.transaction(async (transactionContext) => {
    const prisma = transactionContext.sudo().prisma;
    await lockOperation(prisma, "export-job-create", evidence.operationKeyHash);
    const existing = await prisma.exportJob.findUnique({ where: { operationKeyHash: evidence.operationKeyHash } });
    if (existing) {
      if (existing.requestHash !== evidence.requestHash) throw new Error("Operation key was reused with a different payload");
      return { ...result7(existing, true), accessToken: null, expiresAt: existing.expiresAt };
    }
    const accessToken = (0, import_node_crypto21.randomBytes)(32).toString("base64url");
    const now = /* @__PURE__ */ new Date();
    const expiresAt = new Date(now.getTime() + 60 * 6e4);
    const job = await prisma.exportJob.create({ data: {
      jobNumber: `EXPORT-${(0, import_node_crypto21.randomUUID)()}`,
      exportType,
      status: "queued",
      transitionVersion: 1,
      ...evidence,
      facilityId: data.facilityId,
      requestedById: context.session.itemId,
      format,
      filters,
      accessTokenDigest: sha256(accessToken),
      actorReference: context.session.itemId,
      expiresAt
    } });
    await appendAuditAndOutbox(prisma, {
      eventKey: `export_job:${job.id}:v1:queued`,
      eventType: "export.queued",
      aggregateType: "export_job",
      aggregateId: job.id,
      facilityId: job.facilityId,
      actorReference: context.session.itemId,
      metadata: { source: "portability_workflow", aggregateId: job.id, exportType, format, status: "queued", transitionVersion: 1, expiresAt: expiresAt.toISOString() },
      occurredAt: now
    });
    return { ...result7(job), accessToken, expiresAt };
  }, { timeout: 3e4 });
}
function requireCompleteExportRows(rows2) {
  if (rows2.length > MAX_EXPORT_ROWS) {
    throw new Error(`Export contains more than ${MAX_EXPORT_ROWS} rows; narrow the filters and retry`);
  }
  return rows2;
}
function dateWhere(filters) {
  return filters?.from || filters?.to ? { gte: filters.from ? new Date(filters.from) : void 0, lte: filters.to ? new Date(filters.to) : void 0 } : void 0;
}
function genericCsv(rows2) {
  if (!rows2.length) return "";
  const keys = Object.keys(rows2[0]);
  const escape = (value) => {
    let text63 = value instanceof Date ? value.toISOString() : typeof value === "object" && value !== null ? JSON.stringify(value) : String(value ?? "");
    if (/^[=+\-@]/.test(text63)) text63 = `'${text63}`;
    return /[",\r\n]/.test(text63) ? `"${text63.replaceAll('"', '""')}"` : text63;
  };
  return [keys.join(","), ...rows2.map((row) => keys.map((key2) => escape(row[key2])).join(","))].join("\r\n");
}
async function exportRows(prisma, job) {
  const filters = job.filters && typeof job.filters === "object" ? job.filters : {};
  const createdAt = dateWhere(filters);
  const status = filters.status ? { equals: filters.status } : void 0;
  const take = MAX_EXPORT_ROWS + 1;
  if (job.exportType === "inventory") {
    return prisma.inventoryItem.findMany({
      where: { facilityId: job.facilityId, ...status ? { status: filters.status } : {} },
      orderBy: [{ sku: "asc" }],
      take,
      select: { sku: true, name: true, unit: true, status: true, quantityOnHand: true, quantityReserved: true, reorderPoint: true }
    });
  }
  if (job.exportType === "appointments") {
    return prisma.appointment.findMany({
      where: { facilityId: job.facilityId, ...createdAt ? { createdAt } : {}, ...status ? { status: filters.status } : {} },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take,
      select: { id: true, appointmentNumber: true, status: true, patientId: true, providerId: true, appointmentTypeId: true, startsAt: true, endsAt: true, createdAt: true }
    });
  }
  if (job.exportType === "audit") {
    return prisma.clinicalAuditLog.findMany({
      where: { facilityId: job.facilityId, ...createdAt ? { createdAt } : {} },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take,
      select: { id: true, eventType: true, occurredAt: true, actorType: true, actorReference: true, patientId: true, appointmentId: true, intakeFormId: true, encounterId: true, metadata: true, createdAt: true }
    });
  }
  return prisma.patient.findMany({
    where: { facilities: { some: { id: job.facilityId } }, ...createdAt ? { createdAt } : {}, ...status ? { status: filters.status } : {} },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take,
    select: { id: true, firstName: true, lastName: true, dateOfBirth: true, email: true, phone: true, preferredContactMethod: true, status: true, createdAt: true }
  });
}
async function processExportJob(_root, args, context) {
  requirePortability(context);
  const scoped2 = await context.query.ExportJob.findOne({ where: { id: args.jobId }, query: "id exportType" });
  if (!scoped2) throw new Error("Export job not found or not accessible");
  if (scoped2.exportType === "audit") requireAuditReportAccess(context);
  if (!Number.isInteger(args.expectedVersion) || args.expectedVersion < 1) throw new Error("Expected export version is invalid");
  const evidence = transitionEvidence(args.operationKey, { jobId: args.jobId, expectedVersion: args.expectedVersion, toStatus: "ready" });
  return context.transaction(async (transactionContext) => {
    const prisma = transactionContext.sudo().prisma;
    await lockTransitionOperation(prisma, evidence.operationKeyHash);
    await prisma.$queryRaw(import_client25.Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`export-job:${args.jobId}`}, 0))::text AS "lock"`);
    const replay = await replayTransition(prisma, evidence, "export_job", args.jobId);
    if (replay) return replay;
    const job = await prisma.exportJob.findUnique({ where: { id: args.jobId } });
    if (!job || job.status !== "queued" || job.transitionVersion !== args.expectedVersion || job.expiresAt <= /* @__PURE__ */ new Date()) throw new Error("Export job changed or expired");
    const rows2 = requireCompleteExportRows(await exportRows(prisma, job));
    const artifact = job.format === "csv" ? job.exportType === "inventory" ? inventoryRowsToCsv(rows2) : genericCsv(rows2) : JSON.stringify({ exportType: job.exportType, generatedAt: (/* @__PURE__ */ new Date()).toISOString(), rows: rows2 });
    if (Buffer.byteLength(artifact) > 2e6) throw new Error("Export result exceeds the two megabyte bounded artifact limit");
    const encrypted = encryptSecret(artifact, exportEncryptionKey());
    const now = /* @__PURE__ */ new Date();
    const updated = await prisma.exportJob.update({ where: { id: job.id }, data: {
      status: "ready",
      transitionVersion: { increment: 1 },
      resultDigest: sha256(artifact),
      resultCiphertext: encrypted.ciphertext,
      resultIv: encrypted.iv,
      resultTag: encrypted.tag,
      objectKey: `database-encrypted:${job.id}`,
      readyAt: now,
      actorReference: context.session.itemId
    } });
    const events = await appendAuditAndOutbox(prisma, {
      eventKey: `export_job:${updated.id}:v${updated.transitionVersion}:ready`,
      eventType: "export.ready",
      aggregateType: "export_job",
      aggregateId: updated.id,
      facilityId: updated.facilityId,
      actorReference: context.session.itemId,
      metadata: { source: "portability_workflow", aggregateId: updated.id, exportType: updated.exportType, format: updated.format, rowCount: rows2.length, status: "ready", transitionVersion: updated.transitionVersion, expiresAt: updated.expiresAt.toISOString() },
      occurredAt: now
    });
    const projected = result7(updated);
    await recordTransition(prisma, {
      evidence,
      aggregateType: "export_job",
      aggregateId: updated.id,
      fromStatus: job.status,
      toStatus: updated.status,
      fromVersion: job.transitionVersion,
      toVersion: updated.transitionVersion,
      actorReference: context.session.itemId,
      facilityId: updated.facilityId,
      auditLogId: events.audit.id,
      outboxEventId: events.outbox.id,
      result: projected,
      occurredAt: now
    });
    return projected;
  }, { timeout: 3e4 });
}
var import_node_crypto21, import_client25, MAX_EXPORT_ROWS;
var init_portabilityWorkflows = __esm({
  "features/keystone/mutations/operational/portabilityWorkflows.ts"() {
    "use strict";
    import_node_crypto21 = require("node:crypto");
    import_client25 = require("@prisma/client");
    init_crypto();
    init_inventoryCsv();
    init_transitionEvidence();
    init_evidence();
    MAX_EXPORT_ROWS = 500;
  }
});

// features/keystone/mutations/onboarding/onboardingWorkflows.ts
function requireOnboarding(context) {
  const role = context.session?.data.role;
  if ((!role?.canManageOnboarding || !role?.canManagePatients || !role?.canManageAppointments) && !role?.canAccessAllClinicalData) {
    throw new Error("Not authorized to apply hospital onboarding records");
  }
}
async function createOnboardingAppointment(_root, { data }, context) {
  requireOnboarding(context);
  await scopedFacilityPatient(context, data.facilityId, data.patientId);
  const [provider, appointmentType] = await Promise.all([
    context.query.Provider.findOne({ where: { id: data.providerId }, query: "id status facilities { id }" }),
    context.query.AppointmentType.findOne({ where: { id: data.appointmentTypeId }, query: "id name status durationMinutes bufferBeforeMinutes bufferAfterMinutes providers { id }" })
  ]);
  if (provider?.status !== "active" || !provider.facilities?.some((item) => item.id === data.facilityId)) throw new Error("Provider is not active in the onboarding facility");
  if (appointmentType?.status !== "bookable" || !appointmentType.providers?.some((item) => item.id === data.providerId)) throw new Error("Appointment type is not bookable for the provider");
  const appointmentTypePolicy = normalizeAppointmentTypePolicy(appointmentType);
  const appointmentNumber = bounded2(data.appointmentNumber, "Appointment number", 100, true);
  const startsAt = new Date(data.startsAt);
  const endsAt = new Date(data.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) throw new Error("Appointment window is invalid");
  if (endsAt.getTime() !== startsAt.getTime() + appointmentTypePolicy.durationMinutes * 6e4) {
    throw new Error("Appointment window must match the appointment type duration");
  }
  if (!["requested", "confirmed"].includes(data.status)) throw new Error("Onboarding appointments must start requested or confirmed");
  const input = { ...data, appointmentNumber, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() };
  const evidence = operationEvidence(input);
  return context.transaction(async (transactionContext) => {
    const prisma = transactionContext.sudo().prisma;
    await lockOperation(prisma, "onboarding-appointment", evidence.operationKeyHash);
    const existing = await prisma.appointment.findUnique({ where: { appointmentNumber } });
    if (existing) {
      const sameScope = existing.facilityId === data.facilityId && existing.patientId === data.patientId && existing.providerId === data.providerId && existing.appointmentTypeId === data.appointmentTypeId;
      if (!sameScope) throw new Error("Onboarding appointment number already exists with different scope");
      const sameWindow = existing.startsAt.getTime() === startsAt.getTime() && existing.endsAt.getTime() === endsAt.getTime();
      if (!sameWindow && data.reconcileSchedule === true && ["requested", "confirmed"].includes(existing.status)) {
        await lockProviderSchedule(prisma, data.providerId);
        const schedule2 = await inspectProviderWindow(prisma, {
          providerId: data.providerId,
          facilityId: data.facilityId,
          startsAt,
          endsAt,
          bufferBeforeMinutes: appointmentTypePolicy.bufferBeforeMinutes,
          bufferAfterMinutes: appointmentTypePolicy.bufferAfterMinutes,
          excludeAppointmentId: existing.id
        });
        if (!schedule2.withinAvailability || schedule2.hasConflict) throw new Error("Onboarding appointment cannot be reconciled to the refreshed schedule");
        const updated = await prisma.appointment.update({
          where: { id: existing.id },
          data: {
            startsAt,
            endsAt,
            locationName: bounded2(data.locationName, "Location name", 300),
            reasonForVisit: bounded2(data.reasonForVisit, "Reason for visit", 2e3),
            bookingLockKey: `onboarding:${appointmentNumber}:${startsAt.toISOString()}`,
            transitionVersion: { increment: 1 }
          }
        });
        await appendAuditAndOutbox(prisma, {
          eventKey: `appointment:${updated.id}:v${updated.transitionVersion}:schedule_reconciled`,
          eventType: "appointment.schedule_reconciled",
          aggregateType: "appointment",
          aggregateId: updated.id,
          facilityId: updated.facilityId,
          patientId: updated.patientId,
          actorReference: context.session.itemId,
          metadata: { source: "onboarding_reconciliation", aggregateId: updated.id, status: updated.status, transitionVersion: updated.transitionVersion },
          occurredAt: /* @__PURE__ */ new Date()
        });
        return { id: updated.id, appointmentNumber: updated.appointmentNumber, status: updated.status, transitionVersion: updated.transitionVersion, replayed: false };
      }
      return { id: existing.id, appointmentNumber: existing.appointmentNumber, status: existing.status, transitionVersion: existing.transitionVersion, replayed: true };
    }
    await lockProviderSchedule(prisma, data.providerId);
    const schedule = await inspectProviderWindow(prisma, {
      providerId: data.providerId,
      facilityId: data.facilityId,
      startsAt,
      endsAt,
      bufferBeforeMinutes: appointmentTypePolicy.bufferBeforeMinutes,
      bufferAfterMinutes: appointmentTypePolicy.bufferAfterMinutes
    });
    if (!schedule.withinAvailability || schedule.hasConflict) throw new Error("Onboarding appointment is outside availability or conflicts");
    const now = /* @__PURE__ */ new Date();
    const appointment = await prisma.appointment.create({ data: {
      appointmentNumber,
      transitionVersion: 1,
      status: data.status,
      source: "front_desk",
      bookingLockKey: `${data.providerId}:${startsAt.toISOString()}`,
      startsAt,
      endsAt,
      locationName: bounded2(data.locationName, "Location name", 300),
      reasonForVisit: bounded2(data.reasonForVisit, "Reason for visit", 2e3),
      facilityId: data.facilityId,
      patientId: data.patientId,
      providerId: data.providerId,
      appointmentTypeId: data.appointmentTypeId
    } });
    await appendAuditAndOutbox(prisma, {
      eventKey: `appointment:${appointment.id}:v1:onboarded`,
      eventType: "appointment.onboarded",
      aggregateType: "appointment",
      aggregateId: appointment.id,
      facilityId: appointment.facilityId,
      patientId: appointment.patientId,
      actorReference: context.session.itemId,
      metadata: { source: "onboarding_workflow", aggregateId: appointment.id, status: appointment.status, transitionVersion: 1 },
      occurredAt: now
    });
    return { id: appointment.id, appointmentNumber: appointment.appointmentNumber, status: appointment.status, transitionVersion: 1, replayed: false };
  }, { timeout: 3e4 });
}
async function issueIntakeForm(_root, { data }, context) {
  requireOnboarding(context);
  await scopedFacilityPatient(context, data.facilityId, data.patientId);
  const appointment = await context.query.Appointment.findOne({ where: { id: data.appointmentId }, query: "id facility { id } patient { id }" });
  if (!appointment || appointment.facility?.id !== data.facilityId || appointment.patient?.id !== data.patientId) throw new Error("Appointment does not match the intake scope");
  const title = bounded2(data.title || "Pre-visit intake", "Intake title", 300, true);
  const templateKey = bounded2(data.templateKey || "pre_visit", "Template key", 100, true);
  const input = { ...data, title, templateKey };
  const evidence = operationEvidence(input);
  return context.transaction(async (transactionContext) => {
    const prisma = transactionContext.sudo().prisma;
    await lockOperation(prisma, "intake-issue", evidence.operationKeyHash);
    const byOperation = await prisma.intakeForm.findUnique({ where: { operationKeyHash: evidence.operationKeyHash } });
    const replayProjection = async (row) => {
      if (row.accessUsedAt || row.accessRevokedAt || ["submitted", "reviewed"].includes(row.status)) {
        return { id: row.id, status: row.status, transitionVersion: row.transitionVersion, accessCode: null, accessExpiresAt: row.accessExpiresAt, replayed: true };
      }
      let expiresAt = row.accessExpiresAt ? new Date(row.accessExpiresAt) : /* @__PURE__ */ new Date(0);
      let access2 = expiresAt > /* @__PURE__ */ new Date() ? deliverableIntakeAccessToken(row.id, expiresAt) : null;
      if (!access2 || !verifyIntakeAccessToken(access2.token, row.accessCodeHash)) {
        access2 = createDeliverableIntakeAccessToken(row.id);
        expiresAt = access2.expiresAt;
        row = await prisma.intakeForm.update({ where: { id: row.id }, data: {
          accessCodeHash: access2.tokenHash,
          accessExpiresAt: access2.expiresAt,
          accessUsedAt: null,
          accessRevokedAt: null
        } });
        await appendAuditAndOutbox(prisma, {
          eventKey: `intake:${row.id}:v${row.transitionVersion}:access_rotated:${Math.floor(expiresAt.getTime() / 1e3)}`,
          eventType: "intake.access_rotated",
          aggregateType: "intake_form",
          aggregateId: row.id,
          facilityId: row.facilityId,
          patientId: row.patientId,
          actorReference: context.session.itemId,
          metadata: { source: "onboarding_reconciliation", aggregateId: row.id, status: row.status, transitionVersion: row.transitionVersion },
          occurredAt: /* @__PURE__ */ new Date()
        });
      }
      return { id: row.id, status: row.status, transitionVersion: row.transitionVersion, accessCode: access2.token, accessExpiresAt: expiresAt, replayed: true };
    };
    if (byOperation) {
      if (byOperation.requestHash !== evidence.requestHash) throw new Error("Operation key was reused with a different payload");
      return replayProjection(byOperation);
    }
    const existing = await prisma.intakeForm.findFirst({ where: { appointmentId: data.appointmentId, templateKey } });
    if (existing) return replayProjection(existing);
    const intakeId = (0, import_node_crypto22.randomUUID)();
    const access = createDeliverableIntakeAccessToken(intakeId);
    const now = /* @__PURE__ */ new Date();
    const intake = await prisma.intakeForm.create({ data: {
      id: intakeId,
      ...evidence,
      title,
      templateKey,
      status: "not_sent",
      transitionVersion: 1,
      accessCodeHash: access.tokenHash,
      accessExpiresAt: access.expiresAt,
      facilityId: data.facilityId,
      patientId: data.patientId,
      appointmentId: data.appointmentId,
      formSchema: data.formSchema || { sections: ["contact", "reason_for_visit", "insurance"] }
    } });
    await appendAuditAndOutbox(prisma, {
      eventKey: `intake:${intake.id}:v1:issued`,
      eventType: "intake.issued",
      aggregateType: "intake_form",
      aggregateId: intake.id,
      facilityId: intake.facilityId,
      patientId: intake.patientId,
      actorReference: context.session.itemId,
      metadata: { source: "intake_issue_workflow", aggregateId: intake.id, status: intake.status, transitionVersion: 1 },
      occurredAt: now
    });
    return { id: intake.id, status: intake.status, transitionVersion: 1, accessCode: access.token, accessExpiresAt: access.expiresAt, replayed: false };
  }, { timeout: 3e4 });
}
var import_node_crypto22;
var init_onboardingWorkflows = __esm({
  "features/keystone/mutations/onboarding/onboardingWorkflows.ts"() {
    "use strict";
    import_node_crypto22 = require("node:crypto");
    init_intakeAccess();
    init_schedulePolicy();
    init_evidence();
  }
});

// features/lib/hospitalSetupShape.ts
function record(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function validateSetupShape(value) {
  if (!record(value) || !record(value.practiceInfo)) return "practiceInfo must be an object.";
  try {
    if (new TextEncoder().encode(JSON.stringify(value)).length > 5e5) return "Configuration exceeds 500,000 bytes.";
  } catch {
    return "Configuration must be JSON.";
  }
  const numeric = /* @__PURE__ */ new Set(["dayOffset", "startHour", "endHour", "startMinute", "endMinute", "durationMinutes", "bufferBeforeMinutes", "bufferAfterMinutes", "priceCents", "maxAppointments"]);
  const lists = /* @__PURE__ */ new Set(["departmentCodes", "providerKeys", "providerLastNames", "facilitySlugs"]);
  const objects = /* @__PURE__ */ new Set(["media", "insuranceSummary", "formSchema", "intakeRequirements"]);
  const typedRecord = (row, path) => {
    for (const [field, item] of Object.entries(row)) {
      if (item === void 0 || item === null) continue;
      if (numeric.has(field)) {
        if (typeof item !== "number" || !Number.isSafeInteger(item)) return `${path}.${field} must be an integer.`;
      } else if (field === "active") {
        if (typeof item !== "boolean") return `${path}.${field} must be a boolean.`;
      } else if (lists.has(field)) {
        if (!Array.isArray(item) || item.some((entry) => typeof entry !== "string")) return `${path}.${field} must be a list of strings.`;
      } else if (objects.has(field)) {
        if (!record(item)) return `${path}.${field} must be an object.`;
      } else if (typeof item !== "string") return `${path}.${field} must be text.`;
    }
    return null;
  };
  const profileError = typedRecord(value.practiceInfo, "practiceInfo");
  if (profileError) return profileError;
  for (const section of sections) {
    const rows2 = value[section];
    if (!Array.isArray(rows2) || rows2.length > 100) return `${section} must be an array with at most 100 entries.`;
    for (let index = 0; index < rows2.length; index++) {
      if (!record(rows2[index])) return `${section}[${index}] must be an object.`;
      const error = typedRecord(rows2[index], `${section}[${index}]`);
      if (error) return error;
    }
  }
  const walk = (item, path, depth) => {
    if (depth > 8) return `${path} is too deeply nested.`;
    if (typeof item === "string" && (item.length > 5e4 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(item))) return `${path} contains invalid text.`;
    if (typeof item === "number" && !Number.isFinite(item)) return `${path} must be finite.`;
    if (Array.isArray(item)) {
      if (item.length > 100) return `${path} has too many entries.`;
      for (let i = 0; i < item.length; i++) {
        const error = walk(item[i], `${path}[${i}]`, depth + 1);
        if (error) return error;
      }
    } else if (record(item)) {
      for (const [key2, nested] of Object.entries(item)) {
        const error = walk(nested, `${path}.${key2}`, depth + 1);
        if (error) return error;
      }
    }
    return null;
  };
  return walk(value, "configuration", 0);
}
var sections;
var init_hospitalSetupShape = __esm({
  "features/lib/hospitalSetupShape.ts"() {
    "use strict";
    sections = ["departments", "facilities", "providers", "clinicians", "appointmentTypes", "scheduleBlocks", "patients", "appointments", "intakeForms", "messages"];
  }
});

// features/keystone/mutations/onboarding/onboardingRegistrationPolicy.ts
function onboardingRegistrationReplayFields(existing) {
  if (!existing) {
    return {
      consent: {
        accepted: true,
        policyVersion: REGISTRATION_CONSENT.policyVersion,
        statementKey: REGISTRATION_CONSENT.statementKey
      },
      duplicateResolution: null,
      duplicatePatientId: null
    };
  }
  const duplicateResolution = existing.duplicateResolution === "link_existing" || existing.duplicateResolution === "create_new" ? existing.duplicateResolution : null;
  return {
    consent: {
      accepted: true,
      policyVersion: existing.consent.policyVersion,
      statementKey: existing.consent.statementKey
    },
    duplicateResolution,
    duplicatePatientId: duplicateResolution === "link_existing" ? existing.patientId : null
  };
}
function selectDeterministicOnboardingDuplicate(candidates) {
  if (candidates.length !== 1) return null;
  const [candidate] = candidates;
  const hasName = candidate.reasons.includes("date_of_birth_and_name");
  const hasContact = candidate.reasons.includes("date_of_birth_and_email") || candidate.reasons.includes("date_of_birth_and_phone");
  return hasName && hasContact ? candidate.patientId : null;
}
var init_onboardingRegistrationPolicy = __esm({
  "features/keystone/mutations/onboarding/onboardingRegistrationPolicy.ts"() {
    "use strict";
    init_registrationPolicy();
  }
});

// features/keystone/mutations/onboarding/applyHospitalOnboarding.ts
function requireOnboarding2(context) {
  const role = context.session?.data.role;
  if (!role?.canAccessAllClinicalData || !role?.canManageOnboarding) {
    throw new Error("Global onboarding authority is required to apply hospital setup");
  }
}
function bounded5(value, label, maximum, required = false) {
  const text63 = String(value ?? "").trim();
  if (required && !text63 || text63.length > maximum || /[\u0000-\u001f\u007f]/.test(text63)) throw new Error(`${label} is invalid`);
  return text63;
}
function rows(configuration, key2) {
  const value = configuration?.[key2];
  if (!Array.isArray(value) || value.length > MAX_ITEMS) throw new Error(`${key2} must be a bounded array`);
  return value;
}
function references(value, label) {
  if (!Array.isArray(value) || value.length > MAX_ITEMS) throw new Error(`${label} must be a bounded array`);
  return value;
}
function boundedJson(value, label, maximum = 5e4) {
  const serialized = JSON.stringify(value ?? {});
  if (!serialized || serialized.length > maximum) throw new Error(`${label} is too large`);
  return value ?? {};
}
function uniqueValues(values, label, normalize = (value) => String(value || "").trim().toLowerCase()) {
  const normalized = values.map(normalize);
  if (normalized.some((value) => !value) || new Set(normalized).size !== normalized.length) {
    throw new Error(`${label} values must be present and unique`);
  }
}
function canonicalImagePath2(value, label) {
  const path = bounded5(value, `${label} image`, 500);
  if (!path) return "";
  if (!path.startsWith("/images/") || path.includes("..")) throw new Error(`${label} image must be a canonical /images/ path`);
  return path;
}
function key(value, label) {
  const result8 = bounded5(value, label, 120, true).toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(result8)) throw new Error(`${label} is invalid`);
  return result8;
}
function profileMediaKey(value) {
  const result8 = bounded5(value, "Media key", 40, true);
  if (!["hero", "primaryCare", "behavioralHealth", "telehealth", "clinic"].includes(result8)) {
    throw new Error("Profile media key is invalid");
  }
  return result8;
}
async function reconcileImage(delegate, parentField, parentId, imagePath, altText) {
  const parentWhere = { [`${parentField}Id`]: parentId };
  const existing = await delegate.findFirst({
    where: parentWhere,
    orderBy: [{ order: "asc" }, { createdAt: "asc" }]
  });
  if (!imagePath) {
    await delegate.deleteMany({ where: parentWhere });
    return;
  }
  if (existing) {
    await delegate.update({ where: { id: existing.id }, data: { imagePath, altText, order: 0 } });
    await delegate.deleteMany({ where: { ...parentWhere, id: { not: existing.id } } });
  } else {
    await delegate.create({ data: { ...parentWhere, imagePath, altText, order: 0 } });
  }
}
async function applyHospitalOnboarding(_root, { configuration }, context) {
  requireOnboarding2(context);
  const shapeError = validateSetupShape(configuration);
  if (shapeError) throw new Error(shapeError);
  for (const department of configuration.departments) parseDepartmentStatus(department.status);
  if (!configuration || typeof configuration !== "object" || Array.isArray(configuration)) {
    throw new Error("Hospital onboarding configuration is invalid");
  }
  if (JSON.stringify(configuration).length > 5e5) throw new Error("Hospital onboarding configuration is too large");
  const profileInput = configuration.practiceInfo;
  if (profileInput.supportPhone && !publicPhoneHref(profileInput.supportPhone)) throw new Error("Scheduling phone must be a dialable number with an optional extension");
  if (profileInput?.logoIcon != null && typeof profileInput.logoIcon !== "string") throw new Error("Logo must be a valid, safe SVG document");
  const logoIcon = sanitizeStoreLogoSvg(profileInput?.logoIcon ?? DEFAULT_STORE_LOGO_ICON);
  if (!logoIcon) throw new Error("Logo must be a valid, safe SVG document");
  const logoColor = normalizeStoreLogoColor(profileInput?.logoColor ?? DEFAULT_STORE_LOGO_COLOR);
  if (!profileInput || typeof profileInput !== "object" || Array.isArray(profileInput)) {
    throw new Error("practiceInfo is required");
  }
  const departmentsInput = rows(configuration, "departments");
  const facilitiesInput = rows(configuration, "facilities");
  const providersInput = rows(configuration, "providers");
  const cliniciansInput = rows(configuration, "clinicians");
  const appointmentTypesInput = rows(configuration, "appointmentTypes");
  const scheduleBlocksInput = rows(configuration, "scheduleBlocks");
  const patientsInput = rows(configuration, "patients");
  const appointmentsInput = rows(configuration, "appointments");
  const intakeFormsInput = rows(configuration, "intakeForms");
  const messagesInput = rows(configuration, "messages");
  if ("portalAccess" in configuration) {
    throw new Error("Patient portal records are not available in this bounded release");
  }
  if (!departmentsInput.length || !facilitiesInput.length || !providersInput.length || !appointmentTypesInput.length) {
    throw new Error("Onboarding requires at least one department, facility, provider, and appointment type");
  }
  uniqueValues(departmentsInput.map((item) => item.code), "Department code");
  uniqueValues(facilitiesInput.map((item) => item.slug), "Facility slug");
  uniqueValues(providersInput.map((item) => item.onboardingKey), "Provider onboarding key");
  uniqueValues(cliniciansInput.map((item) => item.onboardingKey), "Clinician onboarding key");
  uniqueValues(appointmentTypesInput.map((item) => item.slug), "Appointment type slug");
  uniqueValues(scheduleBlocksInput.map((item) => item.onboardingKey), "Schedule onboarding key");
  uniqueValues(patientsInput.map((item) => item.patientKey), "Patient key");
  uniqueValues(patientsInput.map((item) => item.medicalRecordNumber), "Medical record number");
  uniqueValues(appointmentsInput.map((item) => item.appointmentNumber), "Appointment number");
  uniqueValues(intakeFormsInput.map((item) => `${item.appointmentNumber || ""}:${item.templateKey || ""}`), "Intake appointment/template");
  uniqueValues(messagesInput.map((item) => item.appointmentNumber), "Follow-up appointment number");
  const now = /* @__PURE__ */ new Date();
  const foundation = await context.transaction(async (transactionContext) => {
    const prisma = transactionContext.sudo().prisma;
    await prisma.$queryRaw(
      import_client26.Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended('hospital-onboarding-primary', 0))::text AS "lock"`
    );
    const profile = {
      profileKey: "primary",
      status: "active",
      name: bounded5(profileInput.name, "Hospital name", 200, true),
      shortName: bounded5(profileInput.shortName || profileInput.name, "Hospital short name", 80, true),
      market: bounded5(profileInput.market, "Hospital market", 300),
      description: bounded5(profileInput.description, "Hospital description", 2e3),
      locationName: bounded5(profileInput.locationName, "Primary location", 300),
      serviceArea: bounded5(profileInput.serviceArea, "Service area", 500),
      addressLine1: bounded5(profileInput.addressLine1, "Profile address", 300),
      city: bounded5(profileInput.city, "Profile city", 150),
      region: bounded5(profileInput.region, "Profile region", 150),
      postalCode: bounded5(profileInput.postalCode, "Profile postal code", 40),
      supportPhone: bounded5(profileInput.supportPhone, "Support phone", 40),
      supportEmail: (() => {
        const email = bounded5(profileInput.supportEmail, "Support email", 254);
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Support email is invalid");
        return email.toLowerCase();
      })(),
      media: (() => {
        const media = profileInput.media || {};
        if (!media || typeof media !== "object" || Array.isArray(media) || Object.keys(media).length > 20) {
          throw new Error("Profile media must be a bounded object");
        }
        return Object.fromEntries(Object.entries(media).map(([mediaKey, value]) => [
          profileMediaKey(mediaKey),
          canonicalImagePath2(value, `Profile ${mediaKey}`)
        ]));
      })()
    };
    await prisma.hospitalProfile.upsert({ where: { profileKey: "primary" }, create: { ...profile, logoIcon, logoColor }, update: profile });
    const departments = {};
    for (const input of departmentsInput) {
      const code = key(input.code, "Department code").toUpperCase();
      const data = {
        name: bounded5(input.name, "Department name", 200, true),
        code,
        status: parseDepartmentStatus(input.status),
        description: bounded5(input.description, "Department description", 2e3),
        phone: bounded5(input.phone, "Department phone", 40),
        email: bounded5(input.email, "Department email", 254)
      };
      const department = await prisma.department.upsert({ where: { code }, create: data, update: data });
      departments[code] = department;
      await reconcileImage(
        prisma.departmentImage,
        "department",
        department.id,
        canonicalImagePath2(input.imagePath, `Department ${code}`),
        bounded5(input.imageAltText || input.name, "Department image alt text", 500)
      );
    }
    const facilities = {};
    for (const input of facilitiesInput) {
      const slug = key(input.slug, "Facility slug");
      const timeZone = assertIanaTimeZone(input.timeZone);
      const departmentIds = references(input.departmentCodes, `Facility ${slug} departmentCodes`).map((code) => departments[String(code).toUpperCase()]?.id);
      if (departmentIds.some((id) => !id)) throw new Error(`Facility ${slug} references an unknown department`);
      const data = {
        name: bounded5(input.name, "Facility name", 200, true),
        slug,
        facilityType: ["clinic", "hospital", "telehealth"].includes(input.facilityType) ? input.facilityType : "hospital",
        status: ["active", "inactive"].includes(input.status) ? input.status : "active",
        addressLine1: bounded5(input.addressLine1, "Facility address", 300),
        addressLine2: bounded5(input.addressLine2, "Facility address", 300),
        city: bounded5(input.city, "Facility city", 150),
        region: bounded5(input.region, "Facility region", 150),
        postalCode: bounded5(input.postalCode, "Facility postal code", 40),
        phone: bounded5(input.phone, "Facility phone", 40),
        timeZone
      };
      const facility = await prisma.facility.upsert({
        where: { slug },
        create: {
          ...data,
          departments: { connect: departmentIds.map((id) => ({ id })) },
          staff: { connect: [{ id: context.session.itemId }] }
        },
        update: {
          ...data,
          departments: { set: departmentIds.map((id) => ({ id })) },
          staff: { connect: [{ id: context.session.itemId }] }
        }
      });
      facilities[slug] = facility;
      await reconcileImage(
        prisma.facilityImage,
        "facility",
        facility.id,
        canonicalImagePath2(input.imagePath, `Facility ${slug}`),
        bounded5(input.imageAltText || input.name, "Facility image alt text", 500)
      );
    }
    const providers = {};
    for (const input of providersInput) {
      const onboardingKey = key(input.onboardingKey, "Provider onboarding key");
      const facilitySlug = key(input.facilitySlug, `Provider ${onboardingKey} facility slug`);
      const facility = facilities[facilitySlug];
      if (!facility) throw new Error(`Provider ${onboardingKey} references an unknown facility`);
      const data = {
        onboardingKey,
        firstName: bounded5(input.firstName, "Provider first name", 100, true),
        lastName: bounded5(input.lastName, "Provider last name", 100, true),
        credentials: bounded5(input.credentials, "Provider credentials", 80),
        specialty: bounded5(input.specialty, "Provider specialty", 200),
        status: ["active", "unavailable", "inactive"].includes(input.status) ? input.status : "active",
        bio: bounded5(input.bio, "Provider bio", 3e3),
        locationName: facility.name
      };
      const provider = await prisma.provider.upsert({
        where: { onboardingKey },
        create: { ...data, facilities: { connect: [{ id: facility.id }] } },
        update: { ...data, facilities: { set: [{ id: facility.id }] } }
      });
      providers[onboardingKey] = provider;
    }
    for (const input of cliniciansInput) {
      const onboardingKey = key(input.onboardingKey, "Clinician onboarding key");
      const provider = providers[key(input.providerKey, `Clinician ${onboardingKey} provider key`)];
      const department = departments[String(input.departmentCode || "").toUpperCase()];
      if (!provider || !department) throw new Error(`Clinician ${onboardingKey} references an unknown provider or department`);
      const data = {
        onboardingKey,
        displayName: bounded5(input.displayName, "Clinician display name", 200, true),
        clinicianType: ["physician", "nurse", "therapist", "technician"].includes(input.clinicianType) ? input.clinicianType : "physician",
        providerId: provider.id,
        departmentId: department.id,
        licenseNumber: bounded5(input.licenseNumber, "Clinician local credential reference", 200),
        phone: bounded5(input.phone, "Clinician phone", 40),
        email: bounded5(input.email, "Clinician email", 254),
        active: input.active !== false
      };
      const clinician = await prisma.clinician.upsert({ where: { onboardingKey }, create: data, update: data });
      await reconcileImage(
        prisma.clinicianImage,
        "clinician",
        clinician.id,
        canonicalImagePath2(input.imagePath, `Clinician ${onboardingKey}`),
        bounded5(input.imageAltText || input.displayName, "Clinician image alt text", 500)
      );
    }
    const appointmentTypes = {};
    for (const input of appointmentTypesInput) {
      const slug = key(input.slug, "Appointment type slug");
      const providerIds = references(input.providerKeys, `Appointment type ${slug} providerKeys`).map((providerKey) => providers[key(providerKey, `Appointment type ${slug} provider key`)]?.id);
      if (!providerIds.length || providerIds.some((id) => !id)) throw new Error(`Appointment type ${slug} references an unknown provider`);
      const durationMinutes = Number(input.durationMinutes);
      const bufferBeforeMinutes = Number(input.bufferBeforeMinutes || 0);
      const bufferAfterMinutes = Number(input.bufferAfterMinutes || 0);
      const priceCents = Number(input.priceCents || 0);
      if (!Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 480) throw new Error(`Appointment type ${slug} duration is invalid`);
      if (!Number.isInteger(bufferBeforeMinutes) || bufferBeforeMinutes < 0 || bufferBeforeMinutes > 240 || !Number.isInteger(bufferAfterMinutes) || bufferAfterMinutes < 0 || bufferAfterMinutes > 240) {
        throw new Error(`Appointment type ${slug} buffers are invalid`);
      }
      if (!Number.isSafeInteger(priceCents) || priceCents < 0) throw new Error(`Appointment type ${slug} price is invalid`);
      const data = {
        name: bounded5(input.name, "Appointment type name", 200, true),
        slug,
        description: bounded5(input.description, "Appointment type description", 2e3),
        status: ["bookable", "internal", "paused"].includes(input.status) ? input.status : "bookable",
        durationMinutes,
        bufferBeforeMinutes,
        bufferAfterMinutes,
        priceCents,
        intakeRequirements: boundedJson(input.intakeRequirements, `Appointment type ${slug} intake requirements`)
      };
      const appointmentType = await prisma.appointmentType.upsert({
        where: { slug },
        create: { ...data, providers: { connect: providerIds.map((id) => ({ id })) } },
        update: { ...data, providers: { set: providerIds.map((id) => ({ id })) } }
      });
      appointmentTypes[slug] = appointmentType;
    }
    const referenceDates = /* @__PURE__ */ new Set();
    for (const input of scheduleBlocksInput) {
      const onboardingKey = key(input.onboardingKey, "Schedule onboarding key");
      const provider = providers[key(input.providerKey, `Schedule block ${onboardingKey} provider key`)];
      const facility = facilities[key(input.facilitySlug, `Schedule block ${onboardingKey} facility slug`)];
      if (!provider || !facility) throw new Error(`Schedule block ${onboardingKey} has missing scope`);
      const referenceDate = calendarDateInTimeZone(now, facility.timeZone);
      referenceDates.add(referenceDate);
      const dayOffset = Number(input.dayOffset);
      if (!Number.isInteger(dayOffset) || dayOffset < 1 || dayOffset > 180) throw new Error(`Schedule block ${onboardingKey} day offset is invalid`);
      const date = addCalendarDays(referenceDate, dayOffset);
      const startsAt = localDateTimeToUtc(date, Number(input.startHour), Number(input.startMinute || 0), facility.timeZone);
      const endsAt = localDateTimeToUtc(date, Number(input.endHour), Number(input.endMinute || 0), facility.timeZone);
      if (endsAt <= startsAt) throw new Error(`Schedule block ${onboardingKey} window is invalid`);
      const data = {
        onboardingKey,
        providerId: provider.id,
        facilityId: facility.id,
        blockType: ["available", "unavailable", "on_call", "admin_time"].includes(input.blockType) ? input.blockType : "available",
        startsAt,
        endsAt,
        recurrenceRule: bounded5(input.recurrenceRule, "Schedule recurrence", 500),
        maxAppointments: 1,
        locationName: bounded5(input.locationName || facility.name, "Schedule location", 300),
        notes: bounded5(input.notes, "Schedule notes", 2e3)
      };
      await prisma.providerScheduleBlock.upsert({ where: { onboardingKey }, create: data, update: data });
    }
    return { departments, facilities, providers, appointmentTypes, referenceDates: [...referenceDates].sort() };
  }, { timeout: 6e4 });
  const patients = {};
  for (const input of patientsInput) {
    const facility = foundation.facilities[key(input.facilitySlug, "Patient facility slug")];
    if (!facility) throw new Error("Onboarding patient references an unknown facility");
    const medicalRecordNumber = bounded5(input.medicalRecordNumber, "MRN", 100, true);
    const idempotencyKey = `onboarding-registration-${medicalRecordNumber}`;
    const existingRegistration = await context.sudo().prisma.patientRegistration.findFirst({
      where: {
        facilityId: facility.id,
        idempotencyKeyHash: hashRegistrationIdempotencyKey(idempotencyKey)
      },
      select: {
        patientId: true,
        duplicateResolution: true,
        consent: { select: { policyVersion: true, statementKey: true } }
      }
    });
    const replayFields = onboardingRegistrationReplayFields(existingRegistration);
    const registrationData = {
      facilityId: facility.id,
      idempotencyKey,
      medicalRecordNumber,
      firstName: input.firstName,
      lastName: input.lastName,
      dateOfBirth: String(input.dateOfBirth).slice(0, 10),
      email: input.email,
      phone: input.phone,
      preferredContactMethod: input.preferredContactMethod,
      consent: replayFields.consent,
      duplicateResolution: replayFields.duplicateResolution,
      duplicatePatientId: replayFields.duplicatePatientId
    };
    let result8 = await registerPatient(null, { data: registrationData }, context);
    if (result8.status === "duplicate_review") {
      const duplicatePatientId = selectDeterministicOnboardingDuplicate(result8.candidates || []);
      if (!duplicatePatientId) throw new Error("Onboarding patient requires staff duplicate review");
      result8 = await registerPatient(null, { data: {
        ...registrationData,
        duplicateResolution: "link_existing",
        duplicatePatientId
      } }, context);
    }
    if (result8.status !== "completed" || !result8.patientId) throw new Error("Onboarding patient registration did not complete");
    patients[key(input.patientKey, "Patient key")] = { id: result8.patientId, facilityId: facility.id };
  }
  const appointments = {};
  for (const input of appointmentsInput) {
    const patient = patients[key(input.patientKey, "Appointment patient key")];
    const provider = foundation.providers[key(input.providerKey, "Appointment provider key")];
    const appointmentType = foundation.appointmentTypes[key(input.appointmentTypeSlug, "Appointment type slug")];
    const facility = foundation.facilities[key(input.facilitySlug, "Appointment facility slug")];
    if (!patient || !provider || !appointmentType || !facility) throw new Error("Onboarding appointment has missing scope");
    const referenceDate = calendarDateInTimeZone(now, facility.timeZone);
    const dayOffset = Number(input.dayOffset);
    if (!Number.isInteger(dayOffset) || dayOffset < 1 || dayOffset > 180) throw new Error("Onboarding appointment day offset is invalid");
    const date = addCalendarDays(referenceDate, dayOffset);
    const startsAt = localDateTimeToUtc(date, Number(input.startHour), Number(input.startMinute || 0), facility.timeZone);
    const endsAt = new Date(startsAt.getTime() + Number(appointmentType.durationMinutes) * 6e4);
    const appointmentNumber = bounded5(input.appointmentNumber, "Appointment number", 100, true);
    const appointment = await createOnboardingAppointment(null, { data: {
      operationKey: `onboarding-appointment-${appointmentNumber}`,
      appointmentNumber,
      status: input.status,
      locationName: facility.name,
      reasonForVisit: input.reasonForVisit,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      patientId: patient.id,
      providerId: provider.id,
      facilityId: facility.id,
      appointmentTypeId: appointmentType.id,
      reconcileSchedule: true
    } }, context);
    appointments[appointmentNumber] = { ...appointment, facilityId: facility.id };
  }
  const intakeLinks = [];
  for (const input of intakeFormsInput) {
    const patient = patients[key(input.patientKey, "Intake patient key")];
    const appointmentNumber = bounded5(input.appointmentNumber, "Intake appointment number", 100, true);
    const appointment = appointments[appointmentNumber];
    if (!patient || !appointment) throw new Error("Onboarding intake has missing patient or appointment");
    const result8 = await issueIntakeForm(null, { data: {
      operationKey: `onboarding-intake-${appointmentNumber}-${key(input.templateKey, "Intake template key")}`,
      facilityId: appointment.facilityId,
      patientId: patient.id,
      appointmentId: appointment.id,
      title: input.title,
      templateKey: input.templateKey,
      formSchema: boundedJson(input.formSchema || { sections: ["contact", "reason_for_visit", "insurance"] }, "Intake form schema")
    } }, context);
    if (result8.accessCode && result8.accessExpiresAt) {
      intakeLinks.push({
        label: bounded5(input.title || input.templateKey, "Intake link label", 200, true),
        href: `/intake#accessCode=${encodeURIComponent(result8.accessCode)}`,
        expiresAt: new Date(result8.accessExpiresAt)
      });
    }
  }
  for (const input of messagesInput) {
    const patient = patients[key(input.patientKey, "Follow-up patient key")];
    const appointmentNumber = bounded5(input.appointmentNumber, "Follow-up appointment number", 100, true);
    const appointment = appointments[appointmentNumber];
    if (!patient || !appointment) throw new Error("Onboarding follow-up has missing patient or appointment");
    await sendSecurePatientMessage(null, {
      operationKey: `onboarding-follow-up-${appointmentNumber}`,
      facilityId: appointment.facilityId,
      patientId: patient.id,
      appointmentId: appointment.id,
      channel: "phone",
      purpose: "care_operations",
      subject: input.subject,
      body: input.body
    }, context);
  }
  return {
    status: "completed",
    referenceDate: foundation.referenceDates[0] || now.toISOString().slice(0, 10),
    counts: {
      departments: departmentsInput.length,
      facilities: facilitiesInput.length,
      providers: providersInput.length,
      clinicians: cliniciansInput.length,
      appointmentTypes: appointmentTypesInput.length,
      scheduleBlocks: scheduleBlocksInput.length,
      patients: patientsInput.length,
      appointments: appointmentsInput.length,
      intakeForms: intakeFormsInput.length,
      messages: messagesInput.length
    },
    intakeLinks
  };
}
var import_client26, MAX_ITEMS;
var init_applyHospitalOnboarding = __esm({
  "features/keystone/mutations/onboarding/applyHospitalOnboarding.ts"() {
    "use strict";
    init_publicPhone();
    init_hospitalSetupShape();
    init_departmentStatus();
    init_storeLogo();
    init_store_logo();
    import_client26 = require("@prisma/client");
    init_facilityTime();
    init_registerPatient();
    init_registrationPolicy();
    init_sendSecurePatientMessage();
    init_onboardingWorkflows();
    init_onboardingRegistrationPolicy();
    MAX_ITEMS = 100;
  }
});

// features/keystone/mutations/bootstrap/bootstrapHospital.ts
function bounded6(value, label, maximum) {
  const text63 = String(value || "").trim();
  if (!text63 || text63.length > maximum || /[\u0000-\u001f\u007f]/.test(text63)) throw new Error(`${label} is invalid`);
  return text63;
}
async function bootstrapHospital(_root, { secret, data }, context) {
  const configured = String(process.env.BOOTSTRAP_ADMIN_SECRET || "");
  if (configured.length < 48 || !secret || !safeEqualText(configured, String(secret))) {
    throw new Error("Hospital initialization is unavailable");
  }
  const name = bounded6(data?.name, "Administrator name", 150);
  const email = bounded6(data?.email, "Administrator email", 254).toLowerCase();
  const password2 = bounded6(data?.password, "Administrator password", 200);
  if (!/^\S+@\S+\.\S+$/.test(email) || password2.length < 16) throw new Error("Administrator details are invalid");
  return context.transaction(async (transactionContext) => {
    const sudo = transactionContext.sudo();
    await sudo.prisma.$executeRaw(import_client27.Prisma.sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`);
    await sudo.prisma.$queryRaw(
      import_client27.Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended('hospital-private-bootstrap', 0))::text AS "lock"`
    );
    if (await sudo.prisma.user.count() !== 0) return { status: "already_initialized" };
    await sudo.db.User.createOne({
      data: {
        name,
        email,
        password: password2,
        onboardingStatus: "not_started",
        role: {
          create: {
            name: "Global Clinical Administrator",
            canManageAppointments: true,
            canManageScheduling: true,
            canManagePatients: true,
            canManageProviders: true,
            canManageIntake: true,
            canManageCommunications: true,
            canManageBilling: true,
            canManageInventory: true,
            canManageIntegrations: true,
            canManageDataPortability: true,
            canManageRetention: true,
            canViewReports: true,
            canManageOnboarding: true,
            canSeeOtherPeople: true,
            canEditOtherPeople: true,
            canManagePeople: true,
            canManageRoles: true,
            canAccessDashboard: true,
            canAccessAllClinicalData: true
          }
        }
      },
      query: "id"
    });
    return { status: "created" };
  }, { timeout: 3e4 });
}
var import_client27;
var init_bootstrapHospital = __esm({
  "features/keystone/mutations/bootstrap/bootstrapHospital.ts"() {
    "use strict";
    import_client27 = require("@prisma/client");
    init_crypto();
  }
});

// features/keystone/context.ts
var import_context, PrismaModule, keystoneContext;
var init_context = __esm({
  "features/keystone/context.ts"() {
    "use strict";
    import_context = require("@keystone-6/core/context");
    init_keystone();
    PrismaModule = __toESM(require("@prisma/client"));
    keystoneContext = globalThis.keystoneContext ?? (0, import_context.getContext)(keystone_default, PrismaModule);
    if (process.env.NODE_ENV !== "production") {
      globalThis.keystoneContext = keystoneContext;
    }
  }
});

// features/keystone/security/passwordReset.ts
var passwordReset_exports = {};
__export(passwordReset_exports, {
  redeemPasswordReset: () => redeemPasswordReset,
  requestPasswordReset: () => requestPasswordReset
});
function pepper() {
  const value = String(process.env.PASSWORD_RESET_PEPPER || "");
  if (value.length < 48) throw new Error("Password reset pepper is not configured");
  return value;
}
function normalizeEmail2(value) {
  const email = String(value || "").trim().toLowerCase();
  return /^\S+@\S+\.\S+$/.test(email) && email.length <= 254 ? email : "";
}
function accountDigest(email) {
  return (0, import_node_crypto23.createHmac)("sha256", pepper()).update(`password-reset-account:${email}`).digest("hex");
}
function tokenDigest(token) {
  return (0, import_node_crypto23.createHash)("sha256").update(token).digest("hex");
}
async function requestPasswordReset(emailInput, networkIdentity) {
  const email = normalizeEmail2(emailInput);
  const normalizedForBucket = email || "invalid-account";
  const digest5 = accountDigest(normalizedForBucket);
  const now = /* @__PURE__ */ new Date();
  const prisma = keystoneContext.prisma;
  const [networkAllowed, accountAllowed] = await Promise.all([
    consumeSharedRateLimit(prisma, "password-reset-network", networkIdentity, 20, now, 3600),
    consumeSharedRateLimit(prisma, "password-reset-account", digest5, 3, now, 3600)
  ]);
  if (!networkAllowed || !accountAllowed || !email) return;
  const prepared = await keystoneContext.transaction(async (transactionContext) => {
    const tx = transactionContext.sudo().prisma;
    await tx.$executeRaw(import_client28.Prisma.sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`);
    await tx.$queryRaw(import_client28.Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`password-reset-account:${digest5}`}, 0))::text AS "lock"`);
    await tx.passwordResetRequest.updateMany({
      where: { accountDigest: digest5, status: "pending", expiresAt: { lte: now } },
      data: { status: "expired" }
    });
    const recent = await tx.passwordResetRequest.findFirst({
      where: {
        accountDigest: digest5,
        status: "pending",
        mailSentAt: { gt: new Date(now.getTime() - RESEND_COOLDOWN_MS) }
      },
      select: { id: true }
    });
    if (recent) return null;
    const user = await tx.user.findUnique({ where: { email }, select: { id: true, email: true } });
    if (!user) return null;
    const pending = await tx.passwordResetRequest.count({
      where: { userId: user.id, status: "pending", expiresAt: { gt: now } }
    });
    if (pending >= MAX_PENDING_TOKENS) return null;
    const token = `reset_${(0, import_node_crypto23.randomBytes)(32).toString("base64url")}`;
    const request = await tx.passwordResetRequest.create({
      data: {
        tokenDigest: tokenDigest(token),
        accountDigest: digest5,
        status: "pending",
        userId: user.id,
        expiresAt: new Date(now.getTime() + RESET_TTL_MS),
        createdAt: now
      }
    });
    return { id: request.id, token, email: user.email };
  }, { timeout: 3e4 });
  if (!prepared) return;
  const globalMailAllowed = await consumeSharedRateLimit(
    prisma,
    "password-reset-mail-global",
    "all-accounts",
    500,
    now,
    3600
  );
  if (!globalMailAllowed) {
    await prisma.passwordResetRequest.updateMany({
      where: { id: prepared.id, status: "pending" },
      data: { status: "delivery_failed", deliveryFailedAt: /* @__PURE__ */ new Date() }
    });
    return;
  }
  try {
    await sendPasswordResetEmail(prepared.token, prepared.email);
    await prisma.passwordResetRequest.updateMany({
      where: { id: prepared.id, status: "pending" },
      data: { mailSentAt: /* @__PURE__ */ new Date() }
    });
  } catch {
    await prisma.passwordResetRequest.updateMany({
      where: { id: prepared.id, status: "pending" },
      data: { status: "delivery_failed", deliveryFailedAt: /* @__PURE__ */ new Date() }
    });
  }
}
async function redeemPasswordReset(input, networkIdentity) {
  const email = normalizeEmail2(input.email);
  const token = String(input.token || "").trim();
  const password2 = String(input.password || "");
  if (!email || !/^reset_[A-Za-z0-9_-]{43}$/.test(token) || password2.length < 16 || password2.length > 200) return false;
  const digest5 = tokenDigest(token);
  const expectedAccountDigest = accountDigest(email);
  const now = /* @__PURE__ */ new Date();
  const prisma = keystoneContext.prisma;
  const [globalAllowed, networkAllowed, tokenAllowed] = await Promise.all([
    consumeSharedRateLimit(prisma, "password-reset-redeem-global", "all-clients", 2e3, now, 60),
    consumeSharedRateLimit(prisma, "password-reset-redeem-network", networkIdentity, 30, now, 3600),
    consumeSharedRateLimit(prisma, "password-reset-redeem-token", digest5, 5, now, 3600)
  ]);
  if (!globalAllowed || !networkAllowed || !tokenAllowed) return false;
  try {
    return await keystoneContext.transaction(async (transactionContext) => {
      const tx = transactionContext.sudo().prisma;
      await tx.$executeRaw(import_client28.Prisma.sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`);
      await tx.$queryRaw(import_client28.Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`password-reset-token:${digest5}`}, 0))::text AS "lock"`);
      const initial = await tx.passwordResetRequest.findUnique({
        where: { tokenDigest: digest5 },
        include: { user: { select: { id: true, email: true } } }
      });
      if (!initial || initial.status !== "pending" || initial.expiresAt <= now || initial.accountDigest !== expectedAccountDigest || initial.user.email.toLowerCase() !== email) return false;
      await tx.$queryRaw(import_client28.Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`password-reset-user:${initial.userId}`}, 0))::text AS "lock"`);
      const current = await tx.passwordResetRequest.findUnique({ where: { id: initial.id } });
      if (!current || current.status !== "pending" || current.expiresAt <= now) return false;
      await transactionContext.sudo().db.User.updateOne({
        where: { id: initial.userId },
        data: { password: password2 }
      });
      await tx.passwordResetRequest.update({
        where: { id: current.id },
        data: { status: "redeemed", redeemedAt: now }
      });
      await tx.passwordResetRequest.updateMany({
        where: { userId: initial.userId, status: "pending", id: { not: current.id } },
        data: { status: "superseded", supersededAt: now }
      });
      return true;
    }, { timeout: 3e4 });
  } catch {
    return false;
  }
}
var import_node_crypto23, import_client28, RESET_TTL_MS, RESEND_COOLDOWN_MS, MAX_PENDING_TOKENS;
var init_passwordReset = __esm({
  "features/keystone/security/passwordReset.ts"() {
    "use strict";
    import_node_crypto23 = require("node:crypto");
    import_client28 = require("@prisma/client");
    init_context();
    init_mail();
    init_graphqlSecurity();
    RESET_TTL_MS = 30 * 6e4;
    RESEND_COOLDOWN_MS = 5 * 6e4;
    MAX_PENDING_TOKENS = 3;
  }
});

// features/keystone/mutations/passwordResetMutations.ts
async function sendUserPasswordResetLink(_root, { email }, context) {
  const { requestPasswordReset: requestPasswordReset2 } = await Promise.resolve().then(() => (init_passwordReset(), passwordReset_exports));
  await requestPasswordReset2(email, context.openfrontNetworkIdentity || "unknown-graphql-client");
  return true;
}
async function redeemUserPasswordResetToken(_root, { email, token, password: password2 }, context) {
  const { redeemPasswordReset: redeemPasswordReset2 } = await Promise.resolve().then(() => (init_passwordReset(), passwordReset_exports));
  const redeemed = await redeemPasswordReset2({ email, token, password: password2 }, context.openfrontNetworkIdentity || "unknown-graphql-client");
  return redeemed ? null : { code: "FAILURE", message: "This reset link is invalid or has expired, or the new password is shorter than 16 characters." };
}
var init_passwordResetMutations = __esm({
  "features/keystone/mutations/passwordResetMutations.ts"() {
    "use strict";
  }
});

// features/keystone/mutations/index.ts
function extendGraphqlSchema(baseSchema) {
  return (0, import_schema.mergeSchemas)({
    schemas: [baseSchema],
    typeDefs: graphql8`
      input HospitalBootstrapInput {
        name: String!
        email: String!
        password: String!
      }

      type HospitalBootstrapResult { status: String! }
      enum PasswordResetRedemptionErrorCode { FAILURE TOKEN_EXPIRED TOKEN_REDEEMED }
      type RedeemUserPasswordResetTokenResult { code: PasswordResetRedemptionErrorCode! message: String! }

      input UserUpdateProfileInput {
        email: String
        name: String
        password: String
        onboardingStatus: String
      }

      input PatientAppointmentRequestInput {
        firstName: String!
        lastName: String!
        email: String
        phone: String
        dateOfBirth: String
      }

      input WorkflowConsentInput {
        accepted: Boolean!
        policyVersion: String!
        statementKey: String!
      }

      input PatientIntakeUpdateInput {
        email: String
        phone: String
        preferredContactMethod: String
        insuranceSummary: JSON
      }

      input PatientRegistrationInput {
        facilityId: ID!
        idempotencyKey: String!
        medicalRecordNumber: String!
        firstName: String!
        lastName: String!
        dateOfBirth: String!
        email: String
        phone: String
        preferredContactMethod: String
        consent: WorkflowConsentInput!
        duplicateResolution: String
        duplicatePatientId: ID
      }

      type PatientRegistrationCandidate {
        patientId: ID!
        displayName: String!
        dateOfBirth: String
        maskedEmail: String
        maskedPhone: String
        reasons: [String!]!
      }

      type PatientRegistrationResult {
        status: String!
        replayed: Boolean!
        registrationId: ID
        patientId: ID
        identifierId: ID
        medicalRecordNumber: String
        duplicateResolution: String
        candidates: [PatientRegistrationCandidate!]!
        candidateCount: Int!
        candidateLimit: Int!
        candidateCountIsLowerBound: Boolean!
      }

      type HospitalBranding {
        name: String!
        shortName: String!
        logoIcon: String
    logoColor: String
    brandTheme: String!
        market: String
        description: String
        locationName: String
        serviceArea: String
        addressLine1: String
        city: String
        region: String
        postalCode: String
        supportPhone: String
        supportEmail: String
        media: JSON
      }

      type BookableFacility {
        id: ID!
        name: String!
        timeZone: String!
      }

      type BookableProvider {
        id: ID!
        displayName: String
        specialty: String
        bio: String
        locationName: String
        facilities: [BookableFacility!]!
      }

      type BookableProviderVisitType {
        id: ID!
        name: String
        slug: String
        durationMinutes: Int
        formattedPrice: String
      }

      type BookableProviderEntry {
        id: ID!
        displayName: String!
        firstName: String
        lastName: String
        credentials: String
        specialty: String
        bio: String
        locationName: String
        imagePath: String
        imageAltText: String
        appointmentTypes: [BookableProviderVisitType!]!
      }

      type BookableAppointmentType {
        id: ID!
        name: String
        slug: String
        description: String
        durationMinutes: Int
        priceCents: Int
        formattedPrice: String
        providers: [BookableProvider!]!
      }

      type AvailableAppointmentSlot {
        providerId: ID!
        providerName: String!
        facilityId: ID!
        facilityName: String!
        facilityTimeZone: String!
        followUpMode: String!
        appointmentTypeId: ID!
        appointmentTypeName: String!
        startsAt: String!
        endsAt: String!
        durationMinutes: Int!
        remainingCapacity: Int!
      }

      type PatientIntakePatient {
        id: ID!
        displayName: String
        email: String
        phone: String
        dateOfBirth: DateTime
        preferredContactMethod: String
        insuranceSummary: JSON
      }

      type PatientIntakeProvider {
        id: ID!
        displayName: String
        specialty: String
      }

      type PatientIntakeAppointmentType {
        id: ID!
        name: String
        durationMinutes: Int
      }

      type PatientIntakeAppointment {
        id: ID!
        appointmentNumber: String
        status: String
        startsAt: DateTime
        endsAt: DateTime
        reasonForVisit: String
        facilityName: String
        facilityTimeZone: String!
        provider: PatientIntakeProvider
        appointmentType: PatientIntakeAppointmentType
      }

      type PatientIntakeForm {
        id: ID!
        title: String
        status: String
        templateKey: String
        formSchema: JSON
        submittedAt: DateTime
        accessCode: String
        patient: PatientIntakePatient
        appointment: PatientIntakeAppointment
      }

      type AppointmentRequestIntakeForm {
        id: ID!
        accessCode: String
        status: String
      }

      type AppointmentRequestPatient {
        id: ID!
        displayName: String
      }

      type AppointmentRequestResult {
        id: ID!
        appointmentNumber: String
        status: String
        startsAt: DateTime
        endsAt: DateTime
        patient: AppointmentRequestPatient
        provider: PatientIntakeProvider
        appointmentType: PatientIntakeAppointmentType
        intakeForms: [AppointmentRequestIntakeForm!]!
      }

      type ScheduleConflictItem {
        source: String!
        id: ID!
        reference: String!
        status: String!
        startsAt: DateTime!
        endsAt: DateTime!
      }

      type ScheduleConflictResult {
        withinAvailability: Boolean!
        hasConflict: Boolean!
        conflicts: [ScheduleConflictItem!]!
      }

      type AppointmentTransitionResult {
        id: ID!
        appointmentNumber: String!
        fromStatus: String!
        status: String!
        transitionVersion: Int!
        startsAt: DateTime!
        endsAt: DateTime!
        checkInAt: DateTime
        completedAt: DateTime
        cancellationReason: String
        replayed: Boolean!
      }

      type SecurePatientMessageResult {
        id: ID!
        status: String!
        channel: String!
        direction: String!
        recordedAt: DateTime!
        patientId: ID!
        appointmentId: ID
        replayed: Boolean!
      }

      input ConsentDecisionWorkflowInput {
        operationKey: String!
        facilityId: ID!
        patientId: ID!
        consentType: String!
        policyVersion: String!
        statementKey: String!
        decision: String!
        reasonCode: String
        supersedesConsentId: ID
      }

      input EncounterWorkflowInput {
        operationKey: String!
        facilityId: ID!
        patientId: ID!
        providerId: ID!
        appointmentId: ID
        departmentId: ID
        chiefComplaint: String
      }

      type EncounterOpenResult {
        id: ID!
        encounterNumber: String!
        status: String!
        transitionVersion: Int!
        replayed: Boolean!
      }

      type EncounterTransitionResult {
        id: ID!
        encounterNumber: String!
        fromStatus: String!
        status: String!
        transitionVersion: Int!
        startedAt: DateTime
        endedAt: DateTime
        replayed: Boolean!
        episodeReceipt: JSON
        outcome: String
        reasonCode: String
      }

      input EpisodePolicyReviewInput { operationKey: String! facilityId: ID! expectedRevision: Int! definition: JSON! reviewReference: String! attested: Boolean! }

      type IntakeTransitionResult {
        id: ID!
        fromStatus: String!
        status: String!
        transitionVersion: Int!
        reviewedAt: DateTime
        reviewedById: ID
        replayed: Boolean!
      }

      type ConsentDecisionResult { id: ID! decision: String! effectiveAt: DateTime! replayed: Boolean! }
      type ClinicalOutboxDispatchResult { claimed: Int! delivered: Int! }
      type ControlledClinicalResult { id: ID! status: String! transitionVersion: Int! replayed: Boolean! originalAcknowledgement: JSON }
      type ControlledBedResult { id: ID! status: String! transitionVersion: Int! replayed: Boolean! }

      input AdmissionWorkflowInput { operationKey: String! facilityId: ID! patientId: ID! encounterId: ID attendingProviderId: ID! bedId: ID! notes: String }
      input MedicalOrderWorkflowInput { operationKey: String! facilityId: ID! patientId: ID! encounterId: ID! orderingProviderId: ID! orderType: String! summary: String! }
      input LabResultWorkflowInput { operationKey: String! facilityId: ID! patientId: ID! encounterId: ID! medicalOrderId: ID! labTestId: ID! resultValue: String! referenceRange: String abnormalFlag: String }
      input LabResultCorrectionInput { operationKey: String! resultId: ID! resultValue: String! referenceRange: String abnormalFlag: String humanReviewed: Boolean! humanReviewReference: String! }
      input PrescriptionWorkflowInput { operationKey: String! facilityId: ID! patientId: ID! encounterId: ID! providerId: ID! medicalOrderId: ID recordingBasis: String! medicationName: String! dosage: String! frequency: String! notes: String }
      input ProcedureWorkflowInput { operationKey: String! facilityId: ID! patientId: ID! encounterId: ID! providerId: ID! medicalOrderId: ID procedureName: String! scheduledAt: String notes: String }
      input CarePlanWorkflowInput { operationKey: String! facilityId: ID! patientId: ID! encounterId: ID providerId: ID! title: String! goals: String! interventions: String! }
      input InsuranceClaimWorkflowInput { operationKey: String! facilityId: ID! patientId: ID! encounterId: ID! coverageId: ID payerName: String! billedAmountCents: Int! }
      input PatientCoverageWorkflowInput { operationKey: String! facilityId: ID! patientId: ID! payerName: String! memberId: String! groupNumber: String effectiveAt: String terminatesAt: String }
      input PatientPaymentWorkflowInput { operationKey: String! facilityId: ID! patientId: ID! claimId: ID installationId: ID amountCents: Int! currency: String method: String! externalReference: String }
      input PatientRefundWorkflowInput { operationKey: String! paymentId: ID! amountCents: Int! reasonCode: String! }
      input InventoryItemWorkflowInput { operationKey: String! facilityId: ID! sku: String! name: String! unit: String! initialQuantity: Int reorderPoint: Int }
      input InventoryMovementWorkflowInput { operationKey: String! itemId: ID! expectedVersion: Int! movementType: String! quantityDelta: Int! reservedDelta: Int reasonCode: String! }
      input ClinicalDocumentWorkflowInput { operationKey: String! facilityId: ID! patientId: ID! encounterId: ID! providerId: ID! documentType: String! title: String! content: String! }
      input ClinicalDocumentAmendmentInput { operationKey: String! documentId: ID! content: String! reason: String! }
      input SpecimenWorkflowInput { operationKey: String! facilityId: ID! patientId: ID! encounterId: ID! medicalOrderId: ID! specimenType: String! }
      input BedReservationWorkflowInput { operationKey: String! facilityId: ID! patientId: ID! bedId: ID! expectedBedVersion: Int! expiresAt: String! reasonCode: String! }
      input VitalSignWorkflowInput { operationKey: String! facilityId: ID! patientId: ID! encounterId: ID! clinicianId: ID! temperatureC: Float systolicBp: Int diastolicBp: Int heartRate: Int respiratoryRate: Int oxygenSaturation: Int notes: String }
      input CommunicationTemplateWorkflowInput { operationKey: String! facilityId: ID! templateKey: String! name: String! channel: String! subjectTemplate: String bodyTemplate: String! }
      input CommunicationPreferenceWorkflowInput { operationKey: String! facilityId: ID! patientId: ID! channel: String! purpose: String! status: String! expectedVersion: Int reasonCode: String! }
      input IntegrationInstallationWorkflowInput { operationKey: String! facilityId: ID! name: String! kind: String! endpointUrl: String! allowedEventTypes: [String!]! }
      input MachineCredentialWorkflowInput { operationKey: String! installationId: ID! name: String! scopes: [String!]! expiresAt: String! }
      input ExternalIdentityWorkflowInput { operationKey: String! facilityId: ID! system: String! resourceType: String! externalId: String! localType: String! localId: ID! }
      input RetentionPolicyWorkflowInput { operationKey: String! facilityId: ID! recordType: String! retentionDays: Int! }
      input RecordHoldWorkflowInput { operationKey: String! facilityId: ID! aggregateType: String! aggregateId: ID! reasonCode: String! notes: String }
      input RetentionDispositionWorkflowInput { operationKey: String! facilityId: ID! policyId: ID! aggregateType: String! aggregateId: ID! decision: String! reasonCode: String! }
      input InventoryImportPreviewInput { operationKey: String! facilityId: ID! csv: String! }
      input ExportJobWorkflowInput { operationKey: String! facilityId: ID! exportType: String! format: String! filters: JSON }
      input OnboardingAppointmentInput { operationKey: String! appointmentNumber: String! status: String! facilityId: ID! patientId: ID! providerId: ID! appointmentTypeId: ID! startsAt: String! endsAt: String! locationName: String reasonForVisit: String reconcileSchedule: Boolean }
      input IntakeIssueInput { operationKey: String! facilityId: ID! patientId: ID! appointmentId: ID! title: String templateKey: String formSchema: JSON }

      type HospitalOnboardingAccessLink { label: String! href: String! expiresAt: DateTime! }
      type HospitalOnboardingResult { status: String! referenceDate: String! counts: JSON! intakeLinks: [HospitalOnboardingAccessLink!]! }
      type OnboardingAppointmentResult { id: ID! appointmentNumber: String! status: String! transitionVersion: Int! replayed: Boolean! }
      type OneTimeAccessResult { id: ID! status: String! transitionVersion: Int accessCode: String accessExpiresAt: DateTime replayed: Boolean! }
      type OperationalInventoryResult { id: ID! status: String! transitionVersion: Int! quantityOnHand: Int! quantityReserved: Int! replayed: Boolean! }
      type VitalSignWorkflowResult { id: ID! recordedAt: DateTime! replayed: Boolean! }
      type IntegrationInstallationWorkflowResult { id: ID! status: String! transitionVersion: Int! installationKey: String signingSecret: String replayed: Boolean! }
      type MachineCredentialWorkflowResult { id: ID! status: String! transitionVersion: Int! keyPrefix: String credential: String replayed: Boolean! }
      type ExternalIdentityWorkflowResult { id: ID! status: String! replayed: Boolean! }
      type IntegrationDispatchResult { claimed: Int! delivered: Int! retried: Int! deadLettered: Int! }
      type ImportPreviewWorkflowResult { id: ID! status: String! transitionVersion: Int! rowCount: Int! errorCount: Int! replayed: Boolean! }
      type ExportJobWorkflowResult { id: ID! status: String! transitionVersion: Int! accessToken: String expiresAt: DateTime! replayed: Boolean! }
      type RetentionDispositionWorkflowResult { id: ID! decision: String! replayed: Boolean! }
      type WorkflowPatientCandidate { id: ID! displayName: String! }
      type WorkflowEncounterCandidate { id: ID! encounterNumber: String! status: String! }

      type CareQueueResult {
        id: ID!
        ticketNumber: String!
        status: String!
        priority: String!
        reasonCode: String!
        queueDate: String!
        queuePosition: Int!
        transitionVersion: Int!
        arrivedAt: DateTime!
        calledAt: DateTime
        completedAt: DateTime
        replayed: Boolean
      }

      type Query {
        episodePolicyWorkspace(facilityId: ID!, beforeRevision: Int, take: Int): JSON!
        episodeClosureWorkspace(encounterId: ID!, beforeVersion: Int, beforeRejectedId: ID, take: Int): JSON!
        episodeChildWorkspace(encounterId: ID!, model: String!, cursorId: ID, childId: ID, beforeChildVersion: Int, take: Int): JSON!
        labResultReadback(resultId: ID, command: LabResultWorkflowInput, correctionCommand: LabResultCorrectionInput, beforeVersion: Int): JSON!
        recoverEpisodeClosure(encounterId: ID!, operationKey: String!): JSON!
        redirectToInit: Boolean
        hospitalBranding: HospitalBranding
        bookableAppointmentTypes: [BookableAppointmentType!]!
        bookableProviders: [BookableProviderEntry!]!
        availableAppointmentSlots(
          appointmentTypeId: ID!
          providerId: ID!
          facilityId: ID!
          date: String!
        ): [AvailableAppointmentSlot!]!
        intakeFormByAccessCode(accessCode: String!): PatientIntakeForm
        appointmentScheduleConflicts(
          facilityId: ID!
          providerId: ID!
          startsAt: String!
          endsAt: String!
          excludeAppointmentId: ID
        ): ScheduleConflictResult!
        workflowPatientCandidates(facilityId: ID!, search: String!, take: Int): [WorkflowPatientCandidate!]!
        workflowEncounterCandidates(facilityId: ID!, patientId: ID!, search: String!, take: Int, skip: Int): [WorkflowEncounterCandidate!]!
      }

      type Mutation {
        reviewEpisodePolicy(data: EpisodePolicyReviewInput!): JSON!
        bootstrapHospital(secret: String!, data: HospitalBootstrapInput!): HospitalBootstrapResult!
        sendUserPasswordResetLink(email: String!): Boolean!
        redeemUserPasswordResetToken(email: String!, token: String!, password: String!): RedeemUserPasswordResetTokenResult
        updateActiveUser(data: UserUpdateProfileInput!): User

        registerPatient(data: PatientRegistrationInput!): PatientRegistrationResult!
        recordConsentDecision(data: ConsentDecisionWorkflowInput!): ConsentDecisionResult!
        arriveAppointment(appointmentId: ID!, idempotencyKey: String!, reasonCode: String): CareQueueResult!
        transitionCareQueue(operationKey: String!, ticketId: ID!, toStatus: String!, expectedVersion: Int!, encounterId: ID): CareQueueResult!
        dispatchClinicalOutbox(limit: Int): ClinicalOutboxDispatchResult!
        admitPatient(data: AdmissionWorkflowInput!): ControlledClinicalResult!
        transitionAdmission(operationKey: String!, admissionId: ID!, toStatus: String!, expectedVersion: Int!, bedId: ID, reasonCode: String, dischargeDisposition: String): ControlledClinicalResult!
        transitionBedReadiness(operationKey: String!, bedId: ID!, toStatus: String!, expectedVersion: Int!): ControlledBedResult!
        placeMedicalOrder(data: MedicalOrderWorkflowInput!): ControlledClinicalResult!
        transitionMedicalOrder(operationKey: String!, orderId: ID!, toStatus: String!, expectedVersion: Int!): ControlledClinicalResult!
        recordLabResult(data: LabResultWorkflowInput!): ControlledClinicalResult!
        transitionLabResult(operationKey: String!, resultId: ID!, toStatus: String!, expectedVersion: Int!): ControlledClinicalResult!
        correctLabResult(data: LabResultCorrectionInput!): ControlledClinicalResult!
        recordPrescription(data: PrescriptionWorkflowInput!): ControlledClinicalResult!
        transitionPrescription(operationKey: String!, prescriptionId: ID!, toStatus: String!, expectedVersion: Int!): ControlledClinicalResult!
        scheduleProcedure(data: ProcedureWorkflowInput!): ControlledClinicalResult!
        transitionProcedure(operationKey: String!, procedureId: ID!, toStatus: String!, expectedVersion: Int!): ControlledClinicalResult!
        establishCarePlan(data: CarePlanWorkflowInput!): ControlledClinicalResult!
        transitionCarePlan(operationKey: String!, carePlanId: ID!, toStatus: String!, expectedVersion: Int!): ControlledClinicalResult!
        prepareInsuranceClaim(data: InsuranceClaimWorkflowInput!): ControlledClinicalResult!
        transitionInsuranceClaim(operationKey: String!, claimId: ID!, toStatus: String!, expectedVersion: Int!, reasonCode: String, notes: String): ControlledClinicalResult!
        recordPatientCoverage(data: PatientCoverageWorkflowInput!): ControlledClinicalResult!
        transitionPatientCoverage(operationKey: String!, coverageId: ID!, toStatus: String!, expectedVersion: Int!, reasonCode: String): ControlledClinicalResult!
        recordPatientPayment(data: PatientPaymentWorkflowInput!): ControlledClinicalResult!
        transitionPatientPayment(operationKey: String!, paymentId: ID!, toStatus: String!, expectedVersion: Int!, reasonCode: String, externalReference: String): ControlledClinicalResult!
        requestPatientRefund(data: PatientRefundWorkflowInput!): ControlledClinicalResult!
        transitionPatientRefund(operationKey: String!, refundId: ID!, toStatus: String!, expectedVersion: Int!, reasonCode: String, externalReference: String): ControlledClinicalResult!
        registerInventoryItem(data: InventoryItemWorkflowInput!): OperationalInventoryResult!
        transitionInventoryItem(operationKey: String!, itemId: ID!, expectedVersion: Int!, toStatus: String!, reasonCode: String!): OperationalInventoryResult!
        moveInventory(data: InventoryMovementWorkflowInput!): OperationalInventoryResult!
        draftClinicalDocument(data: ClinicalDocumentWorkflowInput!): ControlledClinicalResult!
        transitionClinicalDocument(operationKey: String!, documentId: ID!, toStatus: String!, expectedVersion: Int!, reason: String): ControlledClinicalResult!
        amendClinicalDocument(data: ClinicalDocumentAmendmentInput!): ControlledClinicalResult!
        collectSpecimen(data: SpecimenWorkflowInput!): ControlledClinicalResult!
        transitionSpecimen(operationKey: String!, specimenId: ID!, toStatus: String!, expectedVersion: Int!, reason: String): ControlledClinicalResult!
        recordVitalSign(data: VitalSignWorkflowInput!): VitalSignWorkflowResult!
        reserveBed(data: BedReservationWorkflowInput!): ControlledClinicalResult!
        releaseBedReservation(operationKey: String!, reservationId: ID!, expectedVersion: Int!, reasonCode: String!): ControlledClinicalResult!
        registerCommunicationTemplate(data: CommunicationTemplateWorkflowInput!): ControlledClinicalResult!
        reviseCommunicationTemplate(operationKey: String!, templateId: ID!, expectedVersion: Int!, name: String!, subjectTemplate: String, bodyTemplate: String!, toStatus: String!): ControlledClinicalResult!
        setCommunicationPreference(data: CommunicationPreferenceWorkflowInput!): ControlledClinicalResult!
        installIntegration(data: IntegrationInstallationWorkflowInput!): IntegrationInstallationWorkflowResult!
        transitionIntegrationInstallation(operationKey: String!, installationId: ID!, expectedVersion: Int!, toStatus: String!): ControlledClinicalResult!
        issueMachineCredential(data: MachineCredentialWorkflowInput!): MachineCredentialWorkflowResult!
        revokeMachineCredential(operationKey: String!, credentialId: ID!, expectedVersion: Int!): ControlledClinicalResult!
        dispatchIntegrationOutbox(limit: Int): IntegrationDispatchResult!
        linkExternalIdentity(data: ExternalIdentityWorkflowInput!): ExternalIdentityWorkflowResult!
        establishRetentionPolicy(data: RetentionPolicyWorkflowInput!): ControlledClinicalResult!
        transitionRetentionPolicy(operationKey: String!, policyId: ID!, expectedVersion: Int!, toStatus: String!): ControlledClinicalResult!
        placeRecordHold(data: RecordHoldWorkflowInput!): ControlledClinicalResult!
        releaseRecordHold(operationKey: String!, holdId: ID!, expectedVersion: Int!, reasonCode: String!): ControlledClinicalResult!
        recordRetentionDisposition(data: RetentionDispositionWorkflowInput!): RetentionDispositionWorkflowResult!
        previewInventoryImport(data: InventoryImportPreviewInput!): ImportPreviewWorkflowResult!
        applyInventoryImport(operationKey: String!, batchId: ID!, expectedVersion: Int!): ControlledClinicalResult!
        rollbackInventoryImport(operationKey: String!, batchId: ID!, expectedVersion: Int!, reasonCode: String!): ControlledClinicalResult!
        requestExportJob(data: ExportJobWorkflowInput!): ExportJobWorkflowResult!
        processExportJob(operationKey: String!, jobId: ID!, expectedVersion: Int!): ControlledClinicalResult!
        applyHospitalOnboarding(configuration: JSON!): HospitalOnboardingResult!
        createOnboardingAppointment(data: OnboardingAppointmentInput!): OnboardingAppointmentResult!
        issueIntakeForm(data: IntakeIssueInput!): OneTimeAccessResult!

        requestAppointment(
          appointmentTypeId: ID!
          providerId: ID!
          facilityId: ID!
          startsAt: String!
          patient: PatientAppointmentRequestInput!
          reasonForVisit: String
          preferredContactMethod: String
          consent: WorkflowConsentInput!
        ): AppointmentRequestResult

        submitIntakeForm(
          accessCode: String!
          responses: JSON!
          patientUpdates: PatientIntakeUpdateInput
          consent: WorkflowConsentInput!
        ): PatientIntakeForm

        transitionAppointment(
          operationKey: String!
          appointmentId: ID!
          toStatus: String!
          expectedVersion: Int!
          reason: String
          operationalNotes: String
        ): AppointmentTransitionResult!

        transitionPatientMessage(
          operationKey: String!
          messageId: ID!
          toStatus: String!
          expectedVersion: Int!
          reasonCode: String
        ): ControlledClinicalResult!

        sendSecurePatientMessage(
          operationKey: String!
          facilityId: ID!
          patientId: ID!
          appointmentId: ID
          installationId: ID
          templateId: ID
          channel: String!
          purpose: String!
          subject: String
          body: String!
        ): SecurePatientMessageResult!

        openEncounter(data: EncounterWorkflowInput!): EncounterOpenResult!

        transitionEncounter(
          operationKey: String!
          encounterId: ID!
          toStatus: String!
          expectedVersion: Int!
          diagnosisSummary: String
          reason: String
          expectedReviewFingerprint: String
          reviewedTuple: JSON
        ): EncounterTransitionResult!

        transitionIntakeReview(
          operationKey: String!
          intakeFormId: ID!
          toStatus: String!
          expectedVersion: Int!
          reviewNotes: String
        ): IntakeTransitionResult!
      }
    `,
    resolvers: {
      Query: {
        episodePolicyWorkspace,
        episodeClosureWorkspace,
        episodeChildWorkspace,
        labResultReadback,
        recoverEpisodeClosure,
        redirectToInit,
        hospitalBranding: getHospitalBranding,
        bookableAppointmentTypes: getBookableAppointmentTypes,
        bookableProviders: getBookableProviders,
        availableAppointmentSlots: getAvailableAppointmentSlots,
        intakeFormByAccessCode: getIntakeFormByAccessCode,
        appointmentScheduleConflicts,
        workflowPatientCandidates,
        workflowEncounterCandidates
      },
      Mutation: {
        reviewEpisodePolicy,
        bootstrapHospital,
        sendUserPasswordResetLink,
        redeemUserPasswordResetToken,
        updateActiveUser,
        requestAppointment,
        submitIntakeForm,
        transitionAppointment,
        sendSecurePatientMessage,
        transitionPatientMessage,
        openEncounter,
        transitionEncounter,
        transitionIntakeReview,
        registerPatient,
        recordConsentDecision,
        arriveAppointment,
        transitionCareQueue,
        dispatchClinicalOutbox,
        admitPatient,
        transitionAdmission,
        transitionBedReadiness,
        placeMedicalOrder: createMedicalOrder,
        transitionMedicalOrder,
        recordLabResult,
        transitionLabResult,
        correctLabResult,
        recordPrescription: createPrescription,
        transitionPrescription,
        scheduleProcedure: createProcedure,
        transitionProcedure,
        establishCarePlan: createCarePlan,
        transitionCarePlan,
        prepareInsuranceClaim,
        transitionInsuranceClaim,
        recordPatientCoverage,
        transitionPatientCoverage,
        recordPatientPayment,
        transitionPatientPayment,
        requestPatientRefund,
        transitionPatientRefund,
        registerInventoryItem: createInventoryItem,
        transitionInventoryItem,
        moveInventory,
        draftClinicalDocument: createClinicalDocument,
        transitionClinicalDocument,
        amendClinicalDocument,
        collectSpecimen,
        transitionSpecimen,
        recordVitalSign,
        reserveBed,
        releaseBedReservation,
        registerCommunicationTemplate: createCommunicationTemplate,
        reviseCommunicationTemplate,
        setCommunicationPreference,
        installIntegration: createIntegrationInstallation,
        transitionIntegrationInstallation,
        issueMachineCredential,
        revokeMachineCredential,
        dispatchIntegrationOutbox,
        linkExternalIdentity,
        establishRetentionPolicy: createRetentionPolicy,
        transitionRetentionPolicy,
        placeRecordHold,
        releaseRecordHold,
        recordRetentionDisposition,
        previewInventoryImport,
        applyInventoryImport,
        rollbackInventoryImport,
        requestExportJob,
        processExportJob,
        applyHospitalOnboarding,
        createOnboardingAppointment,
        issueIntakeForm
      }
    }
  });
}
var import_schema, graphql8;
var init_mutations = __esm({
  "features/keystone/mutations/index.ts"() {
    "use strict";
    import_schema = require("@graphql-tools/schema");
    init_redirectToInit();
    init_getBookableAppointmentTypes();
    init_getHospitalBranding();
    init_getBookableProviders();
    init_getAvailableAppointmentSlots();
    init_requestAppointment();
    init_updateActiveUser();
    init_getIntakeFormByAccessCode();
    init_submitIntakeForm();
    init_appointmentScheduleConflicts();
    init_transitionAppointment();
    init_sendSecurePatientMessage();
    init_transitionPatientMessage();
    init_manageEncounter();
    init_episodeWorkflows();
    init_episodeChildWorkspace();
    init_labResultRecovery();
    init_recordConsentDecision();
    init_transitionIntakeReview();
    init_registerPatient();
    init_manageCareQueue();
    init_dispatchClinicalOutbox();
    init_controlledWorkflows();
    init_billingWorkflows();
    init_inventoryWorkflows();
    init_clinicalEvidenceWorkflows();
    init_bedReservationWorkflows();
    init_communicationWorkflows();
    init_integrationWorkflows();
    init_retentionWorkflows();
    init_portabilityWorkflows();
    init_onboardingWorkflows();
    init_applyHospitalOnboarding();
    init_bootstrapHospital();
    init_passwordResetMutations();
    graphql8 = String.raw;
  }
});

// features/keystone/security/sessionPolicy.ts
function hasReasonableEntropy(secret) {
  return new Set(secret).size >= 8 && !/^(.)\1+$/.test(secret);
}
function resolveSessionPolicy(environment = process.env) {
  const production = environment.NODE_ENV === "production";
  const configuredSecret = environment.SESSION_SECRET?.trim();
  if (production) {
    if (!environment.DATABASE_URL?.startsWith("postgresql://")) {
      throw new Error("DATABASE_URL must be configured with PostgreSQL in production");
    }
    if (!configuredSecret || configuredSecret.length < MIN_PRODUCTION_SECRET_LENGTH || configuredSecret === DEVELOPMENT_SESSION_SECRET || !hasReasonableEntropy(configuredSecret)) {
      throw new Error(`SESSION_SECRET must be a high-entropy value of at least ${MIN_PRODUCTION_SECRET_LENGTH} characters in production`);
    }
  }
  return {
    maxAge: 60 * 30,
    secret: configuredSecret || DEVELOPMENT_SESSION_SECRET,
    secure: production,
    sameSite: "lax",
    cookieName: "keystonejs-session",
    path: "/"
  };
}
function createSessionStrategy(environment = process.env) {
  const sealed = (0, import_session.statelessSessions)(resolveSessionPolicy(environment));
  return {
    async start({ context, data }) {
      if (data?.itemId && data?.listKey === "User") {
        const user = await context.prisma.user.findUnique({
          where: { id: data.itemId },
          select: { securityVersion: true }
        });
        if (!user) return "";
        const expectedVersion = context.openfrontAuthenticationVersionSnapshot?.get?.(data.itemId);
        if (!Number.isInteger(expectedVersion) || Number(expectedVersion) !== Number(user.securityVersion || 1)) return "";
        return sealed.start({
          context,
          data: {
            ...data,
            data: { ...data.data || {}, securityVersion: Number(user.securityVersion || 1) }
          }
        });
      }
      return sealed.start({ context, data });
    },
    end: sealed.end,
    async get({ context }) {
      const issued = await sealed.get({ context });
      if (!issued?.itemId || issued.listKey !== "User") return void 0;
      const user = await context.prisma.user.findUnique({
        where: { id: issued.itemId },
        include: { role: true }
      });
      if (!user || Number(issued.data?.securityVersion || 1) !== Number(user.securityVersion || 1)) return void 0;
      return {
        itemId: user.id,
        listKey: "User",
        data: {
          name: user.name,
          email: user.email,
          securityVersion: user.securityVersion,
          role: user.role
        }
      };
    }
  };
}
var import_session, DEVELOPMENT_SESSION_SECRET, MIN_PRODUCTION_SECRET_LENGTH;
var init_sessionPolicy = __esm({
  "features/keystone/security/sessionPolicy.ts"() {
    "use strict";
    import_session = require("@keystone-6/core/session");
    DEVELOPMENT_SESSION_SECRET = "local-development-session-secret-change-before-deploying";
    MIN_PRODUCTION_SECRET_LENGTH = 48;
  }
});

// features/keystone/security/runtimeConfig.ts
function decodesTo32Bytes(value) {
  try {
    const buffer = /^[a-f0-9]{64}$/i.test(value) ? Buffer.from(value, "hex") : Buffer.from(value, "base64");
    return buffer.length === 32;
  } catch {
    return false;
  }
}
function validateProductionEnvironment(environment = process.env) {
  if (environment.NODE_ENV !== "production") return;
  const missing = REQUIRED_PRODUCTION_VALUES.filter((name) => !String(environment[name] || "").trim());
  if (missing.length) throw new Error(`Missing production configuration: ${missing.join(", ")}`);
  if (!String(environment.DATABASE_URL).startsWith("postgresql://")) throw new Error("Production DATABASE_URL must use PostgreSQL");
  if (!decodesTo32Bytes(String(environment.INTEGRATION_SECRET_ENCRYPTION_KEY))) throw new Error("INTEGRATION_SECRET_ENCRYPTION_KEY must decode to 32 bytes");
  if (!decodesTo32Bytes(String(environment.EXPORT_ENCRYPTION_KEY))) throw new Error("EXPORT_ENCRYPTION_KEY must decode to 32 bytes");
  if (String(environment.SESSION_SECRET).length < 48) throw new Error("SESSION_SECRET must contain at least 48 characters");
  if (String(environment.OUTBOX_WORKER_SECRET).length < 48) throw new Error("OUTBOX_WORKER_SECRET must contain at least 48 characters");
  if (String(environment.BOOTSTRAP_ADMIN_SECRET).length < 48) throw new Error("BOOTSTRAP_ADMIN_SECRET must contain at least 48 characters");
  if (String(environment.PASSWORD_RESET_PEPPER).length < 48) throw new Error("PASSWORD_RESET_PEPPER must contain at least 48 characters");
  if (String(environment.AUTH_RATE_LIMIT_PEPPER).length < 48) throw new Error("AUTH_RATE_LIMIT_PEPPER must contain at least 48 characters");
  if (String(environment.INTAKE_DELIVERY_SIGNING_KEY).length < 48) throw new Error("INTAKE_DELIVERY_SIGNING_KEY must contain at least 48 characters");
  const smtpPort = Number(environment.SMTP_PORT);
  if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) throw new Error("SMTP_PORT must be an integer between 1 and 65535");
  let resetOrigin;
  try {
    resetOrigin = new URL(String(environment.SMTP_STORE_LINK));
  } catch {
    throw new Error("SMTP_STORE_LINK must be a valid HTTPS URL");
  }
  if (resetOrigin.protocol !== "https:" || resetOrigin.username || resetOrigin.password || resetOrigin.search || resetOrigin.hash) {
    throw new Error("SMTP_STORE_LINK must be a credential-free HTTPS URL without query or fragment");
  }
  let endpoint2;
  try {
    endpoint2 = new URL(String(environment.S3_ENDPOINT));
  } catch {
    throw new Error("S3_ENDPOINT must be a valid HTTPS URL");
  }
  if (endpoint2.protocol !== "https:" || endpoint2.username || endpoint2.password) throw new Error("S3_ENDPOINT must be a credential-free HTTPS URL");
}
var REQUIRED_PRODUCTION_VALUES;
var init_runtimeConfig = __esm({
  "features/keystone/security/runtimeConfig.ts"() {
    "use strict";
    REQUIRED_PRODUCTION_VALUES = [
      "DATABASE_URL",
      "SESSION_SECRET",
      "INTEGRATION_SECRET_ENCRYPTION_KEY",
      "EXPORT_ENCRYPTION_KEY",
      "OUTBOX_WORKER_SECRET",
      "BOOTSTRAP_ADMIN_SECRET",
      "PASSWORD_RESET_PEPPER",
      "AUTH_RATE_LIMIT_PEPPER",
      "INTAKE_DELIVERY_SIGNING_KEY",
      "SMTP_HOST",
      "SMTP_PORT",
      "SMTP_USER",
      "SMTP_PASSWORD",
      "SMTP_FROM",
      "SMTP_STORE_LINK",
      "S3_BUCKET_NAME",
      "S3_REGION",
      "S3_ACCESS_KEY_ID",
      "S3_SECRET_ACCESS_KEY",
      "S3_ENDPOINT"
    ];
  }
});

// features/keystone/index.ts
var import_auth, import_core64, import_config, databaseURL, bucketName, region, accessKeyId, secretAccessKey, endpoint, withAuth, keystone_default;
var init_keystone = __esm({
  "features/keystone/index.ts"() {
    "use strict";
    import_auth = require("@keystone-6/auth");
    import_core64 = require("@keystone-6/core");
    import_config = require("dotenv/config");
    init_models();
    init_mutations();
    init_sessionPolicy();
    init_runtimeConfig();
    validateProductionEnvironment();
    databaseURL = process.env.DATABASE_URL || "file:./keystone.db";
    ({
      S3_BUCKET_NAME: bucketName = "keystone-test",
      S3_REGION: region = "ap-southeast-2",
      S3_ACCESS_KEY_ID: accessKeyId = "keystone",
      S3_SECRET_ACCESS_KEY: secretAccessKey = "keystone",
      S3_ENDPOINT: endpoint = "https://sfo3.digitaloceanspaces.com"
    } = process.env);
    ({ withAuth } = (0, import_auth.createAuth)({
      listKey: "User",
      identityField: "email",
      secretField: "password",
      // Public Keystone bootstrap and password-reset mutations are deliberately not
      // enabled. Repository-owned, rate-limited routes provide both workflows.
      sessionData: `
    name
    email
    securityVersion
    role {
      id
      name
      canManageAppointments
      canManageScheduling
      canManagePatients
      canManageProviders
      canManageIntake
      canManageCommunications
      canManageBilling
      canManageInventory
      canManageIntegrations
      canManageDataPortability
      canManageRetention
      canViewReports
      canManageOnboarding
      canSeeOtherPeople
      canEditOtherPeople
      canManagePeople
      canManageRoles
      canAccessDashboard
      canAccessAllClinicalData
    }
  `
    }));
    keystone_default = withAuth(
      (0, import_core64.config)({
        db: {
          provider: "postgresql",
          url: databaseURL
        },
        lists: models,
        storage: {
          my_images: {
            kind: "s3",
            type: "image",
            bucketName,
            region,
            accessKeyId,
            secretAccessKey,
            endpoint,
            signed: { expiry: 5e3 },
            forcePathStyle: true
          }
        },
        ui: {
          isAccessAllowed: ({ session }) => session?.data.role?.canAccessDashboard ?? false
        },
        session: createSessionStrategy(),
        graphql: {
          extendGraphqlSchema
        }
      })
    );
  }
});

// keystone.ts
var keystone_exports = {};
__export(keystone_exports, {
  default: () => keystone_default2
});
module.exports = __toCommonJS(keystone_exports);
init_keystone();
var keystone_default2 = keystone_default;
//# sourceMappingURL=config.js.map
