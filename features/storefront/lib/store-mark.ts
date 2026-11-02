import { sanitizeStoreLogoSvg } from '@/features/keystone/utils/storeLogo'
import { DEFAULT_STORE_LOGO_ICON } from '@/features/platform/store-settings/lib/store-logo'

/**
 * The mark shown beside the practice name: the one saved in Store Settings, sanitized.
 * The icon is always shown, as in E-commerce; when nothing valid is saved the
 * platform default icon stands in. It is never hidden.
 */
export function storeOwnMark(logoIcon: string | null | undefined): string {
  const raw = (logoIcon || '').trim()
  return (raw && sanitizeStoreLogoSvg(raw)) || sanitizeStoreLogoSvg(DEFAULT_STORE_LOGO_ICON)
}
