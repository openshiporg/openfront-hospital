'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Notice, Pill, Track } from '@/features/platform/components/ward'
import { deleteStaffUser } from '../actions/staff'

export function DeleteUserButton({ userId, userName }: { userId: string; userName: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function confirm() {
    setError(null)
    startTransition(async () => {
      const response = await deleteStaffUser(userId)
      if (!response.success) {
        setError(response.error)
        return
      }
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <AlertDialog open={open} onOpenChange={next => { setOpen(next); if (!next) setError(null) }}>
      <Track>
        <Pill size="sm" variant="plain" onClick={() => setOpen(true)} aria-label={`Delete ${userName}`}><Trash2 aria-hidden />Delete</Pill>
      </Track>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {userName}?</AlertDialogTitle>
          <AlertDialogDescription>The account is removed and can no longer sign in.</AlertDialogDescription>
        </AlertDialogHeader>
        {error && <Notice tone="bad">{error}</Notice>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Track>
            <Pill variant="danger" onClick={confirm} disabled={pending}>{pending ? 'Deleting…' : 'Delete user'}</Pill>
          </Track>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
