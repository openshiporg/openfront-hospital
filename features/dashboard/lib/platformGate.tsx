import { notFound } from 'next/navigation'
import type { ComponentType } from 'react'
import { getAuthenticatedUser } from '@/features/dashboard/actions/auth'
import { canUsePlatformPage } from './sidebarAccess'

/** 404s a platform page when the signed-in role lacks the permission the sidebar requires for it. */
export function gatePlatformPage<P extends object>(slug: string, Page: ComponentType<P>) {
  return async function GatedPlatformPage(props: P) {
    const me = await getAuthenticatedUser()
    const viewer = me.success ? (me.data as any)?.authenticatedItem : null
    if (!canUsePlatformPage(slug, viewer)) notFound()
    return <Page {...props} />
  }
}
