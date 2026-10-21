'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'

/** Private drafts stay in memory. This guards document exits and link navigation;
 * callers must also guard their own local discard/reset controls. */
export function useDraftExitGuard(dirty: boolean, unresolved = false) {
  const [destination, setDestination] = useState<string | null>(null)
  const leaving = useRef(false)
  useEffect(() => {
    if (!dirty) return
    const unload = (event: BeforeUnloadEvent) => {
      if (leaving.current) return
      event.preventDefault()
      event.returnValue = ''
    }
    const click = (event: MouseEvent) => {
      if (leaving.current || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (!(link instanceof HTMLAnchorElement) || link.target === '_blank' || link.hasAttribute('download')) return
      const url = new URL(link.href, window.location.href)
      if (url.href === window.location.href || (url.origin === location.origin && url.pathname === location.pathname && url.search === location.search)) return
      event.preventDefault()
      event.stopPropagation()
      setDestination(url.href)
    }
    window.addEventListener('beforeunload', unload)
    document.addEventListener('click', click, true)
    return () => {
      window.removeEventListener('beforeunload', unload)
      document.removeEventListener('click', click, true)
    }
  }, [dirty])
  return <AlertDialog open={destination !== null} onOpenChange={open => !open && setDestination(null)}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Leave this draft?</AlertDialogTitle>
        <AlertDialogDescription>{unresolved ? 'The original submission outcome is unknown. Reconcile its original receipt before a separate operation. Its private command currently exists only in this workspace; leaving or reloading may lose that local recovery material.' : 'Unsaved text will be discarded. Stay to save or review it before leaving.'}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Stay and review</AlertDialogCancel>
        <AlertDialogAction disabled={unresolved} onClick={() => { if (destination) { leaving.current = true; window.location.assign(destination) } }}>{unresolved ? 'Original outcome must be reconciled' : 'Discard draft and leave'}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
}
