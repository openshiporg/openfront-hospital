'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, UserPlus } from 'lucide-react'

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Notice, Pill, Track, fieldClass, labelClass } from '@/features/platform/components/ward'
import { createStaffUser, updateStaffUser } from '../actions/staff'
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, type FacilityOption, type StaffRole, type StaffUser } from '../types'

type Capabilities = {
  /** Name can be written (create, or update when the viewer can edit this user). */
  canEditName: boolean
  /** Role relationship is writable for this target (global viewer, target not global). */
  canEditRole: boolean
  /** Facilities relationship is writable (global viewer). */
  canEditFacilities: boolean
}

export function UserDrawer({
  mode,
  user,
  roles,
  facilities,
  capabilities,
}: {
  mode: 'create' | 'edit'
  user?: StaffUser
  roles: StaffRole[]
  facilities: FacilityOption[]
  capabilities: Capabilities
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const initialFacilityIds = (user?.facilities || []).map(item => item.id)
  const [name, setName] = useState(user?.name || '')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [roleId, setRoleId] = useState(user?.role?.id || '')
  const [facilityIds, setFacilityIds] = useState<string[]>(initialFacilityIds)
  const facilitiesTruncated = Number(user?.facilitiesCount || 0) > initialFacilityIds.length
  // Global roles can only be assigned by global viewers through deployment flows; never offer them here.
  const assignableRoles = roles.filter(role => role.canAccessAllClinicalData !== true)

  function reset() {
    setName(user?.name || '')
    setEmail('')
    setPassword('')
    setRoleId(user?.role?.id || '')
    setFacilityIds(initialFacilityIds)
    setError(null)
  }

  function toggleFacility(id: string) {
    setFacilityIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    if (mode === 'create' && password.length < PASSWORD_MIN_LENGTH) {
      setError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`)
      return
    }
    startTransition(async () => {
      let response
      if (mode === 'create') {
        response = await createStaffUser({
          name,
          email,
          password,
          roleId: capabilities.canEditRole ? roleId || null : undefined,
          facilityIds: capabilities.canEditFacilities ? facilityIds : undefined,
        })
      } else if (user) {
        const sameFacilities = facilityIds.length === initialFacilityIds.length && facilityIds.every(id => initialFacilityIds.includes(id))
        response = await updateStaffUser(user.id, {
          name: capabilities.canEditName && name.trim() !== (user.name || '') ? name : undefined,
          roleId: capabilities.canEditRole && roleId !== (user.role?.id || '') ? roleId || null : undefined,
          facilityIds: capabilities.canEditFacilities && !facilitiesTruncated && !sameFacilities ? facilityIds : undefined,
        })
      }
      if (!response) return
      if (!response.success) {
        setError(response.error)
        return
      }
      setPassword('')
      setOpen(false)
      router.refresh()
    })
  }

  const nothingEditable = mode === 'edit' && !capabilities.canEditName && !capabilities.canEditRole && !capabilities.canEditFacilities
  if (nothingEditable) return null

  return (
    <Sheet open={open} onOpenChange={next => { setOpen(next); if (next) reset() }}>
      <Track>
        {mode === 'create'
          ? <Pill variant="primary" onClick={() => setOpen(true)}><UserPlus aria-hidden />Add user</Pill>
          : <Pill size="sm" onClick={() => setOpen(true)}><Pencil aria-hidden />Edit</Pill>}
      </Track>
      <SheetContent className="flex w-full flex-col gap-4 overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{mode === 'create' ? 'Add user' : `Edit ${user?.name || 'user'}`}</SheetTitle>
          <SheetDescription className="sr-only">{mode === 'create' ? 'Create a staff account' : 'Update staff account'}</SheetDescription>
        </SheetHeader>
        <form onSubmit={submit} className="flex min-w-0 flex-col gap-4">
          {capabilities.canEditName && (
            <label className={labelClass}>
              Name
              <input className={fieldClass} value={name} onChange={event => setName(event.target.value)} required maxLength={200} autoComplete="off" />
            </label>
          )}
          {mode === 'create' && (
            <>
              <label className={labelClass}>
                Email
                <input className={fieldClass} type="email" value={email} onChange={event => setEmail(event.target.value)} required maxLength={254} autoComplete="off" />
              </label>
              <label className={labelClass}>
                Password
                <input
                  className={fieldClass}
                  type="password"
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  required
                  minLength={PASSWORD_MIN_LENGTH}
                  maxLength={PASSWORD_MAX_LENGTH}
                  autoComplete="new-password"
                />
                <span className="font-normal">At least {PASSWORD_MIN_LENGTH} characters</span>
              </label>
            </>
          )}
          {capabilities.canEditRole && (
            <label className={labelClass}>
              Role
              <select className={fieldClass} value={roleId} onChange={event => setRoleId(event.target.value)}>
                <option value="">No role</option>
                {assignableRoles.map(role => <option key={role.id} value={role.id}>{role.name || 'Unnamed role'}</option>)}
              </select>
            </label>
          )}
          {capabilities.canEditFacilities && (
            <fieldset className="grid min-w-0 gap-2">
              <legend className="mb-1 text-xs font-medium text-muted-foreground">Facilities</legend>
              {facilitiesTruncated && <Notice tone="warn">This user has more facilities than can be shown. Facilities are read-only here.</Notice>}
              {!facilities.length && <p className="text-sm text-muted-foreground">No facilities visible.</p>}
              <div className="grid max-h-56 gap-1 overflow-y-auto rounded-[4px] border p-2">
                {facilities.map(facility => (
                  <label key={facility.id} className="flex min-w-0 items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted/50">
                    <input type="checkbox" checked={facilityIds.includes(facility.id)} onChange={() => toggleFacility(facility.id)} disabled={facilitiesTruncated} className="size-4 accent-teal-700" />
                    <span className="min-w-0 truncate">{facility.name || 'Unnamed facility'}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {mode === 'create' && !capabilities.canEditRole && <Notice>Role and facilities can be assigned only by a global clinical-data role.</Notice>}
          {error && <Notice tone="bad">{error}</Notice>}
          <Track className="self-start">
            <Pill type="submit" variant="primary" disabled={pending}>{pending ? 'Saving…' : mode === 'create' ? 'Create user' : 'Save'}</Pill>
            <Pill variant="plain" onClick={() => setOpen(false)} disabled={pending}>Cancel</Pill>
          </Track>
        </form>
      </SheetContent>
    </Sheet>
  )
}
