import { list } from '@keystone-6/core'
import { allOperations } from '@keystone-6/core/access'
import { checkbox, relationship, text } from '@keystone-6/core/fields'

import { isSignedIn, permissions, rules } from '../access'
import { trackingFields } from './trackingFields'

export const Role = list({
  access: {
    operation: {
      ...allOperations(permissions.canManageRoles),
      query: isSignedIn,
    },
    filter: {
      query: rules.canReadRoles,
    },
    item: {
      create: ({ session, inputData }) =>
        permissions.canAccessAllClinicalData({ session }) ||
        (inputData.canAccessAllClinicalData !== true && inputData.assignedTo === undefined),
      update: ({ session, item, inputData }) =>
        !item.canAccessAllClinicalData &&
        (permissions.canAccessAllClinicalData({ session }) ||
          (inputData.canAccessAllClinicalData === undefined && inputData.assignedTo === undefined)),
      // The sole global authority is immutable in-band. Rotation/recovery is a
      // deployment-controlled operation, never generic Role CRUD.
      delete: ({ item }) => !item.canAccessAllClinicalData,
    },
  },
  ui: {
    hideCreate: args => !permissions.canManageRoles(args),
    hideDelete: args => !permissions.canManageRoles(args),
    listView: {
      initialColumns: ['name', 'assignedTo'],
    },
    itemView: {
      defaultFieldMode: args => (permissions.canManageRoles(args) ? 'edit' : 'read'),
    },
  },
  fields: {
    name: text({ validation: { isRequired: true } }),
    canManageAppointments: checkbox({ defaultValue: false }),
    canManageScheduling: checkbox({ defaultValue: false }),
    canManagePatients: checkbox({ defaultValue: false }),
    canManageProviders: checkbox({ defaultValue: false }),
    canManageIntake: checkbox({ defaultValue: false }),
    canManageCommunications: checkbox({ defaultValue: false }),
    canManageBilling: checkbox({ defaultValue: false }),
    canManageInventory: checkbox({ defaultValue: false }),
    canManageIntegrations: checkbox({ defaultValue: false }),
    canManageDataPortability: checkbox({ defaultValue: false }),
    canManageRetention: checkbox({ defaultValue: false }),
    canViewReports: checkbox({ defaultValue: false }),
    canManageOnboarding: checkbox({ defaultValue: false }),
    canSeeOtherPeople: checkbox({ defaultValue: false }),
    canEditOtherPeople: checkbox({ defaultValue: false }),
    canManagePeople: checkbox({ defaultValue: false }),
    canManageRoles: checkbox({ defaultValue: false }),
    canAccessDashboard: checkbox({ defaultValue: false }),
    canAccessAllClinicalData: checkbox({
      defaultValue: false,
      access: {
        create: permissions.canAccessAllClinicalData,
        update: permissions.canAccessAllClinicalData,
      },
      ui: { description: 'Explicit global clinical-data bypass. Keep disabled for facility, provider, and patient-scoped roles.' },
    }),
    assignedTo: relationship({
      ref: 'User.role',
      many: true,
      access: {
        create: permissions.canAccessAllClinicalData,
        update: permissions.canAccessAllClinicalData,
      },
      ui: {
        itemView: { fieldMode: 'read' },
      },
    }),
    ...trackingFields,
  },
});