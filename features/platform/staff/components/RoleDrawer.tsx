'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Plus } from 'lucide-react'

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Notice, Pill, Track, fieldClass, labelClass } from '@/features/platform/components/ward'
import { createStaffRole, updateStaffRole } from '../actions/staff'
import { GLOBAL_ONLY_FLAGS, PERMISSION_FLAGS, PERMISSION_GROUPS, type PermissionFlag, type RoleFlags, type StaffRole } from '../types'

function initialFlags(role?: StaffRole): RoleFlags {
  const flags: RoleFlags = {}
  for (const flag of PERMISSION_FLAGS) flags[flag] = role?.[flag] === true
  return flags
}

export function RoleDrawer({ mode, role, viewerIsGlobal }: { mode: 'create' | 'edit'; role?: StaffRole; viewerIsGlobal: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [name, setName] = useState(role?.name || '')
  const [flags, setFlags] = useState<RoleFlags>(() => initialFlags(role))

  function reset() {
    setName(role?.name || '')
    setFlags(initialFlags(role))
    setError(null)
  }

  function toggle(flag: PermissionFlag) {
    setFlags(current => ({ ...current, [flag]: !current[flag] }))
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      const payload = { name, flags }
      const response = mode === 'create' ? await createStaffRole(payload) : role ? await updateStaffRole(role.id, payload) : null
      if (!response) return
      if (!response.success) {
        setError(response.error)
        return
      }
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <Sheet open={open} onOpenChange={next => { setOpen(next); if (next) reset() }}>
      <Track>
        {mode === 'create'
          ? <Pill variant="primary" onClick={() => setOpen(true)}><Plus aria-hidden />Add role</Pill>
          : <Pill size="sm" onClick={() => setOpen(true)}><Pencil aria-hidden />Edit</Pill>}
      </Track>
      <SheetContent className="flex w-full flex-col gap-4 overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{mode === 'create' ? 'Add role' : `Edit ${role?.name || 'role'}`}</SheetTitle>
          <SheetDescription className="sr-only">Role name and permissions</SheetDescription>
        </SheetHeader>
        <form onSubmit={submit} className="flex min-w-0 flex-col gap-5">
          <label className={labelClass}>
            Name
            <input className={fieldClass} value={name} onChange={event => setName(event.target.value)} required maxLength={120} autoComplete="off" />
          </label>
          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            {PERMISSION_GROUPS.map(group => (
              <fieldset key={group.key} className="min-w-0 rounded-[4px] border p-3">
                <legend className="px-1 tabular-nums text-xs font-medium text-muted-foreground">{group.label}</legend>
                <div className="grid gap-1.5">
                  {group.flags.map(flag => {
                    const locked = GLOBAL_ONLY_FLAGS.includes(flag.key) && !viewerIsGlobal
                    return (
                      <label key={flag.key} className="flex min-w-0 items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="mt-0.5 size-4 shrink-0 accent-teal-700"
                          checked={flags[flag.key] === true}
                          onChange={() => toggle(flag.key)}
                          disabled={locked}
                        />
                        <span className="min-w-0">
                          {flag.label}
                          {locked && <span className="block text-xs text-muted-foreground">Global role only</span>}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </fieldset>
            ))}
          </div>
          {error && <Notice tone="bad">{error}</Notice>}
          <Track className="self-start">
            <Pill type="submit" variant="primary" disabled={pending}>{pending ? 'Saving…' : mode === 'create' ? 'Create role' : 'Save'}</Pill>
            <Pill variant="plain" onClick={() => setOpen(false)} disabled={pending}>Cancel</Pill>
          </Track>
        </form>
      </SheetContent>
    </Sheet>
  )
}
