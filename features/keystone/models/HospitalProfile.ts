import { publicPhoneHref } from '../../lib/publicPhone'
import { list } from '@keystone-6/core'
import { json, select, text } from '@keystone-6/core/fields'

import { denyAccess, isSignedIn, permissions } from '../access'
import { HOSPITAL_BRAND_THEME_OPTIONS, DEFAULT_HOSPITAL_BRAND_THEME } from '../../lib/hospitalBrandTheme'
import { sanitizeStoreLogoSvg } from '../utils/storeLogo'
import { DEFAULT_STORE_LOGO_ICON, DEFAULT_STORE_LOGO_COLOR, normalizeStoreLogoColor } from '../../platform/store-settings/lib/store-logo'
import { trackingFields } from './trackingFields'

/**
 * Persisted public identity for this independently operated installation.
 * This is deliberately a single-install branding profile, not an organization
 * tenancy claim. Public access is exposed only through the bounded
 * hospitalBranding custom GraphQL projection.
 */
export const HospitalProfile = list({
  access: {
    operation: {
      query: isSignedIn,
      create: permissions.canManageOnboarding,
      update: permissions.canManageOnboarding,
      delete: denyAccess,
    },
  },
  ui: {
    hideDelete: true,
    listView: { initialColumns: ['name', 'shortName', 'status', 'profileKey'] },
  },
  fields: {
    profileKey: text({ isIndexed: 'unique', validation: { isRequired: true }, defaultValue: 'primary' }),
    status: select({
      type: 'string',
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Inactive', value: 'inactive' },
      ],
      defaultValue: 'active',
      validation: { isRequired: true },
    }),
    name: text({ validation: { isRequired: true } }),
    shortName: text({ validation: { isRequired: true } }),
    logoIcon: text({
      db: { isNullable: true }, defaultValue: DEFAULT_STORE_LOGO_ICON,
      hooks: {
        resolveInput: ({ resolvedData, fieldKey }) => {
          const value = resolvedData[fieldKey]
          return value == null || value === '' ? value : typeof value === 'string' ? sanitizeStoreLogoSvg(value) : ''
        },
        validate: ({ inputData, resolvedData, fieldKey, addValidationError }) => {
          const submitted = inputData?.[fieldKey]
          if (submitted != null && submitted !== '' && (typeof submitted !== 'string' || !resolvedData?.[fieldKey])) addValidationError('Logo must be a valid, safe SVG document')
        },
      },
    }),
    logoColor: text({ db: { isNullable: true }, defaultValue: DEFAULT_STORE_LOGO_COLOR,
      hooks: { resolveInput: ({ resolvedData, fieldKey }) => resolvedData[fieldKey] === undefined ? undefined : normalizeStoreLogoColor(resolvedData[fieldKey]) },
    }),
    brandTheme: select({
      type: 'string',
      options: HOSPITAL_BRAND_THEME_OPTIONS.map(({ label, value }) => ({ label, value })),
      defaultValue: DEFAULT_HOSPITAL_BRAND_THEME,
      validation: { isRequired: true },
      ui: { description: 'Approved storefront chrome palette. Clinical warning, error, and success colors remain fixed.' },
    }),
    market: text(),
    description: text({ ui: { displayMode: 'textarea' } }),
    locationName: text(),
    serviceArea: text(),
    addressLine1: text(),
    city: text(),
    region: text(),
    postalCode: text(),
    supportPhone: text({ hooks: { validate: ({ resolvedData, fieldKey, addValidationError }) => {
      const value = resolvedData?.[fieldKey]
      if (value && !publicPhoneHref(value)) addValidationError('Scheduling phone must be a dialable number with an optional extension')
    } } }),
    supportEmail: text(),
    media: json({
      ui: { description: 'Canonical public /images/ paths only. Never store credentials, patient data, or remote URLs.' },
    }),
    ...trackingFields,
  },
})
