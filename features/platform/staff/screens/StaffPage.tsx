import Link from 'next/link'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'

import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { WorkspaceLoadError } from '@/features/platform/components/WorkspaceLoadError'
import {
  Board,
  BoardRow,
  Code,
  EmptyBoard,
  FilterBar,
  Notice,
  Pill,
  Readout,
  ReadoutStrip,
  SegmentedLinks,
  StatusTag,
  Track,
  WardBody,
  WardHeader,
  WardSection,
  fieldClass,
  type WardTone,
} from '@/features/platform/components/ward'
import { getStaffFacilityOptions, getStaffRoles, getStaffUsers, getStaffViewer } from '../actions/staff'
import { DeleteUserButton } from '../components/DeleteUserButton'
import { RoleDrawer } from '../components/RoleDrawer'
import { UserDrawer } from '../components/UserDrawer'
import { PERMISSION_GROUPS, type StaffRole } from '../types'

const PAGE_SIZE = 40
const MAX_PAGE = 25

const onboardingTone: Record<string, WardTone> = { completed: 'ok', in_progress: 'info', not_started: 'warn', dismissed: 'idle' }

function one(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : ''
}

function href(params: { view: string; search?: string; role?: string; page?: number }) {
  const query = new URLSearchParams()
  if (params.view !== 'users') query.set('view', params.view)
  if (params.search) query.set('search', params.search)
  if (params.role) query.set('role', params.role)
  if (params.page && params.page > 1) query.set('page', String(params.page))
  return `/dashboard/platform/staff${query.size ? `?${query}` : ''}`
}

function enabledFlags(role: StaffRole) {
  return PERMISSION_GROUPS.map(group => ({
    label: group.label,
    flags: group.flags.filter(flag => role[flag.key] === true).map(flag => flag.label),
  })).filter(group => group.flags.length)
}

export async function StaffPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await props.searchParams
  const view = one(params.view) === 'roles' ? 'roles' : 'users'
  const search = one(params.search).trim().slice(0, 100)
  const roleFilter = one(params.role).slice(0, 128)
  const page = Math.min(MAX_PAGE, Math.max(1, Number.parseInt(one(params.page), 10) || 1))
  const breadcrumbs = [{ type: 'link' as const, label: 'Dashboard', href: '/dashboard' }, { type: 'page' as const, label: 'Staff' }]

  const viewerResponse = await getStaffViewer()
  if (!viewerResponse.success) return <WorkspaceLoadError title="Staff" description="Your account and role could not be verified." breadcrumbs={breadcrumbs} />
  const viewer = viewerResponse.data
  const viewerRole = viewer.role || {}
  const viewerIsGlobal = viewerRole.canAccessAllClinicalData === true
  const canManagePeople = viewerRole.canManagePeople === true
  const canManageRoles = viewerRole.canManageRoles === true

  const [usersResponse, rolesResponse, facilitiesResponse] = await Promise.all([
    view === 'users' ? getStaffUsers({ search, roleId: roleFilter, take: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE }) : Promise.resolve(null),
    getStaffRoles(),
    viewerIsGlobal && view === 'users' ? getStaffFacilityOptions() : Promise.resolve(null),
  ])

  if (!rolesResponse.success || (usersResponse && !usersResponse.success)) {
    return <WorkspaceLoadError title="Staff" description="Staff accounts or roles may be unavailable for this session." breadcrumbs={breadcrumbs} />
  }

  const roles = rolesResponse.data.roles
  const facilities = facilitiesResponse?.success ? facilitiesResponse.data.facilities : []
  const facilitiesTruncated = facilitiesResponse?.success ? facilitiesResponse.data.facilitiesCount > facilities.length : false

  const headerActions = view === 'users'
    ? (canManagePeople ? <UserDrawer mode="create" roles={roles} facilities={facilities} capabilities={{ canEditName: true, canEditRole: viewerIsGlobal, canEditFacilities: viewerIsGlobal }} /> : null)
    : (canManageRoles ? <RoleDrawer mode="create" viewerIsGlobal={viewerIsGlobal} /> : null)

  return (
    <PageContainer
      title="Staff"
      breadcrumbs={breadcrumbs}
      header={<WardHeader title="Staff" meta={`${rolesResponse.data.rolesCount} ${rolesResponse.data.rolesCount === 1 ? 'role' : 'roles'} visible`} actions={headerActions} />}
    >
      <WardBody>
        <SegmentedLinks
          label="Staff view"
          options={[
            { href: href({ view: 'users' }), label: 'Users', active: view === 'users' },
            { href: href({ view: 'roles' }), label: 'Roles', active: view === 'roles', count: rolesResponse.data.rolesCount },
          ]}
        />

        {view === 'users' && usersResponse?.success && (() => {
          const { users, usersCount } = usersResponse.data
          const totalPages = Math.min(MAX_PAGE, Math.max(1, Math.ceil(usersCount / PAGE_SIZE)))
          const first = usersCount ? (page - 1) * PAGE_SIZE + 1 : 0
          const last = Math.min(page * PAGE_SIZE, usersCount)
          return (
            <>
              {viewerRole.canSeeOtherPeople !== true && <Notice tone="warn">Only your own account is visible. Seeing other staff requires the “See other people” permission.</Notice>}
              {facilitiesTruncated && <Notice tone="warn">Only the first {facilities.length} facilities can be assigned here.</Notice>}

              <FilterBar>
                <label className="relative w-full sm:min-w-64 sm:flex-1">
                  <span className="sr-only">Search by name</span>
                  <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden />
                  <input className={`${fieldClass} pl-9 text-base sm:text-sm`} type="search" name="search" defaultValue={search} placeholder="Name" />
                </label>
                <label className="w-full sm:w-56">
                  <span className="sr-only">Role</span>
                  <select name="role" defaultValue={roleFilter} className={fieldClass}>
                    <option value="">All roles</option>
                    <option value="none">No role</option>
                    {roles.map(role => <option key={role.id} value={role.id}>{role.name || 'Unnamed role'}</option>)}
                  </select>
                </label>
                <Track>
                  <Pill type="submit" variant="primary">Search</Pill>
                  <Pill asChild variant="plain"><Link href={href({ view: 'users' })}>Reset</Link></Pill>
                </Track>
              </FilterBar>

              <WardSection
                id="staff-users"
                title="Users"
                actions={<span className="tabular-nums text-xs  text-muted-foreground">{usersCount ? `${first}–${last} of ${usersCount}` : '0 users'}</span>}
              >
                {!users.length ? <EmptyBoard title={search || roleFilter ? 'No matching users' : 'No users visible'} /> : (
                  <Board>
                    {users.map(user => {
                      const isSelf = user.id === viewer.id
                      const targetIsGlobal = user.role?.canAccessAllClinicalData === true
                      const capabilities = {
                        canEditName: viewerRole.canEditOtherPeople === true || isSelf,
                        canEditRole: viewerIsGlobal && !targetIsGlobal,
                        canEditFacilities: viewerIsGlobal,
                      }
                      const canDelete = canManagePeople && !targetIsGlobal && !isSelf
                      const status = user.onboardingStatus || 'unknown'
                      return (
                        <BoardRow
                          key={user.id}
                          title={<>{user.name || 'Unnamed user'}{isSelf && <span className="ml-2 text-xs font-normal text-muted-foreground">You</span>}</>}
                          meta={<>
                            <span className="break-all">{user.email || <span className="italic">Email restricted</span>}</span>
                            <span>{user.role ? (user.role.name || 'Unnamed role') : 'No visible role'}</span>
                            <span>
                              {user.facilities?.length ? user.facilities.map(item => item.name).filter(Boolean).join(' · ') : 'No visible facilities'}
                              {Number(user.facilitiesCount || 0) > (user.facilities?.length || 0) && ` +${Number(user.facilitiesCount) - (user.facilities?.length || 0)}`}
                            </span>
                            <StatusTag status={status} tone={onboardingTone[status] || 'idle'} className="font-normal" />
                          </>}
                          aside={<>
                            <UserDrawer mode="edit" user={user} roles={roles} facilities={facilities} capabilities={capabilities} />
                            {canDelete && <DeleteUserButton userId={user.id} userName={user.name || 'this user'} />}
                          </>}
                        />
                      )
                    })}
                  </Board>
                )}
                {usersCount > PAGE_SIZE && (
                  <nav aria-label="User pages" className="mt-4 flex min-w-0 flex-wrap items-center justify-between gap-2">
                    <p className="tabular-nums text-xs  text-muted-foreground">Page {page} of {totalPages}</p>
                    <Track>
                      {page > 1
                        ? <Pill asChild size="sm"><Link href={href({ view, search, role: roleFilter, page: page - 1 })}><ChevronLeft aria-hidden />Previous</Link></Pill>
                        : <Pill size="sm" variant="plain" disabled><ChevronLeft aria-hidden />Previous</Pill>}
                      {page < totalPages
                        ? <Pill asChild size="sm"><Link href={href({ view, search, role: roleFilter, page: page + 1 })}>Next<ChevronRight aria-hidden /></Link></Pill>
                        : <Pill size="sm" variant="plain" disabled>Next<ChevronRight aria-hidden /></Pill>}
                    </Track>
                  </nav>
                )}
              </WardSection>
            </>
          )
        })()}

        {view === 'roles' && (
          <>
            {!canManageRoles && <Notice tone="warn">Only your own role is visible. Managing roles requires the “Manage roles” permission.</Notice>}
            <ReadoutStrip>
              <Readout label="Roles" value={rolesResponse.data.rolesCount} />
              <Readout label="Assigned users" value={roles.reduce((sum, role) => sum + Number(role.assignedToCount || 0), 0)} sub="Visible to you" />
              <Readout label="Global roles" tone="accent" value={roles.filter(role => role.canAccessAllClinicalData === true).length} />
            </ReadoutStrip>
            <WardSection id="staff-roles" title="Roles" count={roles.length}>
              {!roles.length ? <EmptyBoard title="No roles visible" /> : (
                <Board>
                  {roles.map(role => {
                    const isGlobal = role.canAccessAllClinicalData === true
                    const groups = enabledFlags(role)
                    return (
                      <BoardRow
                        key={role.id}
                        tone={isGlobal ? 'accent' : undefined}
                        status={isGlobal ? 'Global' : undefined}
                        title={role.name || 'Unnamed role'}
                        meta={<>
                          <span className="tabular-nums">{role.assignedToCount ?? 0} {role.assignedToCount === 1 ? 'user' : 'users'}</span>
                          {isGlobal && <span className="font-medium text-teal-700 dark:text-teal-300">All clinical data · locked</span>}
                          {!groups.length && <span>No permissions</span>}
                        </>}
                        aside={canManageRoles && !isGlobal ? <RoleDrawer mode="edit" role={role} viewerIsGlobal={viewerIsGlobal} /> : undefined}
                      >
                        {groups.length > 0 && (
                          <dl className="grid gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2 lg:grid-cols-3">
                            {groups.map(group => (
                              <div key={group.label} className="min-w-0">
                                <dt className="tabular-nums text-[11px]  text-muted-foreground">{group.label}</dt>
                                <dd className="text-foreground">{group.flags.join(', ')}</dd>
                              </div>
                            ))}
                          </dl>
                        )}
                      </BoardRow>
                    )
                  })}
                </Board>
              )}
              {rolesResponse.data.rolesCount > roles.length && <p className="mt-2 tabular-nums text-xs text-muted-foreground">Showing <Code>{roles.length}</Code> of {rolesResponse.data.rolesCount}</p>}
            </WardSection>
          </>
        )}
      </WardBody>
    </PageContainer>
  )
}

export default StaffPage
