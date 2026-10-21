import { list } from '@keystone-6/core'
import { allOperations, denyAll } from '@keystone-6/core/access'
import { integer, password, relationship, select, text, timestamp } from '@keystone-6/core/fields'

import { isSignedIn, permissions, rules } from '../access'
import { trackingFields } from './trackingFields'

async function hasGlobalClinicalRole(context: any, item: any) {
  const roleId = item?.roleId || item?.role
  if (!roleId) return false
  const role = await context.sudo().prisma.role.findUnique({
    where: { id: String(roleId) },
    select: { canAccessAllClinicalData: true },
  })
  return role?.canAccessAllClinicalData === true
}

async function canUpdateCredential(
  { session, item, context }: any,
  allowNonGlobal: boolean,
) {
  if (await hasGlobalClinicalRole(context, item)) return session?.itemId === item?.id
  return allowNonGlobal
}

export const User = list({
  access: {
    operation: {
      ...allOperations(isSignedIn),
      // Public account creation is intentionally disabled. Empty deployments are
      // initialized only through the secret-gated transactional bootstrap route.
      create: permissions.canManagePeople,
      delete: permissions.canManagePeople,
    },
    filter: {
      query: rules.canReadPeople,
      update: rules.canUpdatePeople,
    },
    item: {
      delete: async ({ context, item }) => !(await hasGlobalClinicalRole(context, item)),
    },
  },
  hooks: {
    resolveInput: async ({ operation, resolvedData, item }) => {
      const next = { ...resolvedData }
      if (next.email !== undefined) {
        const email = String(next.email || '').trim().toLowerCase()
        if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) throw new Error('User email is invalid')
        next.email = email
      }
      if (operation === 'update' && (
        next.password !== undefined ||
        (next.email !== undefined && next.email !== item?.email)
      )) {
        next.securityVersion = Number(item?.securityVersion || 1) + 1
      }
      return next
    },
    afterOperation: async ({ operation, item, originalItem, context }) => {
      if (operation === 'update' && originalItem?.email !== item?.email) {
        await context.sudo().prisma.passwordResetRequest.updateMany({
          where: { userId: item.id, status: 'pending' },
          data: { status: 'superseded', supersededAt: new Date() },
        })
      }
    },
  },
  ui: {
    hideCreate: args => !permissions.canManagePeople(args),
    hideDelete: args => !permissions.canManagePeople(args),
    listView: {
      initialColumns: ['name', 'email', 'role', 'onboardingStatus'],
    },
    itemView: {
      defaultFieldMode: ({ session, item }) => {
        // canEditOtherPeople can edit other people
        if (session?.data.role?.canEditOtherPeople) return 'edit'

        // edit themselves
        if (session?.itemId === item?.id) return 'edit'

        // else, default all fields to read mode
        return 'read'
      },
    },
  },
  fields: {
    name: text({
      validation: {
        isRequired: true,
      },
    }),
    email: text({
      isFilterable: false,
      isOrderable: false,
      isIndexed: 'unique',
      access: {
        read: ({ session, item }) =>
          permissions.canManagePeople({ session }) || session?.itemId === item.id,
        update: args => canUpdateCredential(args, true),
      },
      validation: {
        isRequired: true,
      },
    }),
    password: password({
      access: {
        read: denyAll,
        update: args => canUpdateCredential(
          args,
          permissions.canManagePeople({ session: args.session }) || args.session?.itemId === args.item.id,
        ),
      },
      validation: { isRequired: true },
    }),
    securityVersion: integer({
      defaultValue: 1,
      validation: { isRequired: true, min: 1 },
      access: { read: isSignedIn, create: permissions.canAccessAllClinicalData, update: () => false },
      ui: { itemView: { fieldMode: 'read' } },
    }),
    // Retained only to avoid destructively dropping columns previously owned by
    // Keystone Auth. Repository-owned reset requests never read or write them.
    passwordResetToken: text({ db: { isNullable: true }, access: { read: denyAll, create: denyAll, update: denyAll } }),
    passwordResetIssuedAt: timestamp({ access: { read: denyAll, create: denyAll, update: denyAll } }),
    passwordResetRedeemedAt: timestamp({ access: { read: denyAll, create: denyAll, update: denyAll } }),
    role: relationship({
      ref: 'Role.assignedTo',
      access: {
        create: permissions.canAccessAllClinicalData,
        update: async ({ session, item, context }) =>
          permissions.canAccessAllClinicalData({ session }) && !(await hasGlobalClinicalRole(context, item)),
      },
      ui: {
        itemView: {
          fieldMode: args => (permissions.canManagePeople(args) ? 'edit' : 'read'),
        },
      },
    }),
    onboardingStatus: select({
      type: 'string',
      options: [
        { label: 'Not started', value: 'not_started' },
        { label: 'In progress', value: 'in_progress' },
        { label: 'Completed', value: 'completed' },
        { label: 'Dismissed', value: 'dismissed' },
      ],
      defaultValue: 'not_started',
      validation: { isRequired: true },
    }),
    facilities: relationship({
      ref: 'Facility.staff',
      many: true,
      access: {
        create: permissions.canAccessAllClinicalData,
        update: permissions.canAccessAllClinicalData,
      },
    }),
    patientProfile: relationship({
      ref: 'Patient.user',
      access: { create: permissions.canAccessAllClinicalData, update: permissions.canAccessAllClinicalData },
    }),
    providerProfile: relationship({
      ref: 'Provider.user',
      access: { create: permissions.canAccessAllClinicalData, update: permissions.canAccessAllClinicalData },
    }),
    patientPortalAccess: relationship({
      ref: 'PatientPortalAccess.user',
      access: { read: permissions.canAccessAllClinicalData, create: denyAll, update: denyAll },
    }),
    reviewedIntakeForms: relationship({
      ref: 'IntakeForm.reviewedBy',
      many: true,
      access: { create: () => false, update: () => false },
    }),
    ...trackingFields,
  },
});