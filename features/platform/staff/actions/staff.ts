'use server'

import { revalidatePath } from 'next/cache'

import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import {
  GLOBAL_ONLY_FLAGS,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PERMISSION_FLAGS,
  type FacilityOption,
  type RoleFlags,
  type RoleInput,
  type StaffRole,
  type StaffUser,
  type StaffUserInput,
  type StaffViewer,
} from '../types'

const STAFF_PATH = '/dashboard/platform/staff'
const flagSelection = PERMISSION_FLAGS.join(' ')

export async function getStaffViewer() {
  const response = await keystoneClient<{ authenticatedItem: { id: string; role?: RoleFlags | null } | null }>(
    `query StaffViewer { authenticatedItem { ... on User { id role { ${flagSelection} } } } }`,
  )
  if (!response.success) return { success: false as const, error: response.error }
  const item = response.data.authenticatedItem
  if (!item) return { success: false as const, error: 'Not signed in.' }
  return { success: true as const, data: { id: item.id, role: item.role ?? null } satisfies StaffViewer }
}

export async function getStaffUsers(params: { search: string; roleId: string; take: number; skip: number }) {
  const where: Record<string, unknown> = {}
  if (params.search) where.name = { contains: params.search, mode: 'insensitive' }
  if (params.roleId === 'none') where.role = null
  else if (params.roleId) where.role = { id: { equals: params.roleId } }
  return keystoneClient<{ users: StaffUser[]; usersCount: number }>(
    `query StaffUsers($where: UserWhereInput!, $take: Int!, $skip: Int!) {
      users(where: $where, orderBy: [{ name: asc }], take: $take, skip: $skip) {
        id name email onboardingStatus
        role { id name canAccessAllClinicalData }
        facilities(orderBy: [{ name: asc }], take: 10) { id name }
        facilitiesCount
      }
      usersCount(where: $where)
    }`,
    { where, take: params.take, skip: params.skip },
  )
}

export async function getStaffRoles() {
  return keystoneClient<{ roles: StaffRole[]; rolesCount: number }>(
    `query StaffRoles {
      roles(orderBy: [{ name: asc }], take: 100) { id name assignedToCount ${flagSelection} }
      rolesCount
    }`,
  )
}

export async function getStaffFacilityOptions() {
  return keystoneClient<{ facilities: FacilityOption[]; facilitiesCount: number }>(
    `query StaffFacilityOptions { facilities(orderBy: [{ name: asc }], take: 100) { id name } facilitiesCount }`,
  )
}

function validateUserInput(input: StaffUserInput, creating: boolean): string | null {
  if (creating || input.name !== undefined) {
    const name = String(input.name || '').trim()
    if (!name) return 'Name is required.'
    if (name.length > 200) return 'Name is too long.'
  }
  if (creating) {
    const email = String(input.email || '').trim()
    if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) return 'Enter a valid email.'
    const password = String(input.password || '')
    if (password.length < PASSWORD_MIN_LENGTH) return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`
    if (password.length > PASSWORD_MAX_LENGTH) return `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`
  }
  return null
}

export async function createStaffUser(input: StaffUserInput) {
  const invalid = validateUserInput(input, true)
  if (invalid) return { success: false as const, error: invalid }
  const data: Record<string, unknown> = {
    name: String(input.name).trim(),
    email: String(input.email).trim().toLowerCase(),
    password: String(input.password),
  }
  if (input.roleId) data.role = { connect: { id: input.roleId } }
  if (input.facilityIds?.length) data.facilities = { connect: input.facilityIds.map(id => ({ id })) }
  const response = await keystoneClient<{ createUser: { id: string } | null }>(
    `mutation CreateStaffUser($data: UserCreateInput!) { createUser(data: $data) { id } }`,
    { data },
  )
  if (!response.success) return { success: false as const, error: 'The user could not be created. Check access and that the email is not already in use.' }
  if (!response.data.createUser) return { success: false as const, error: 'The user was not created.' }
  revalidatePath(STAFF_PATH)
  return { success: true as const, data: response.data.createUser }
}

export async function updateStaffUser(id: string, input: StaffUserInput) {
  const invalid = validateUserInput(input, false)
  if (invalid) return { success: false as const, error: invalid }
  const data: Record<string, unknown> = {}
  if (input.name !== undefined) data.name = String(input.name).trim()
  if (input.roleId !== undefined) data.role = input.roleId ? { connect: { id: input.roleId } } : { disconnect: true }
  if (input.facilityIds !== undefined) data.facilities = { set: input.facilityIds.map(facilityId => ({ id: facilityId })) }
  if (!Object.keys(data).length) return { success: false as const, error: 'No changes.' }
  const response = await keystoneClient<{ updateUser: { id: string } | null }>(
    `mutation UpdateStaffUser($id: ID!, $data: UserUpdateInput!) { updateUser(where: { id: $id }, data: $data) { id } }`,
    { id, data },
  )
  if (!response.success || !response.data.updateUser) return { success: false as const, error: 'The user could not be updated with this session’s access.' }
  revalidatePath(STAFF_PATH)
  return { success: true as const, data: response.data.updateUser }
}

export async function deleteStaffUser(id: string) {
  const response = await keystoneClient<{ deleteUser: { id: string } | null }>(
    `mutation DeleteStaffUser($id: ID!) { deleteUser(where: { id: $id }) { id } }`,
    { id },
  )
  if (!response.success || !response.data.deleteUser) return { success: false as const, error: 'The user could not be deleted with this session’s access.' }
  revalidatePath(STAFF_PATH)
  return { success: true as const, data: response.data.deleteUser }
}

function roleData(input: RoleInput, allowGlobalFlags: boolean) {
  const data: Record<string, unknown> = { name: String(input.name || '').trim() }
  for (const flag of PERMISSION_FLAGS) {
    if (!allowGlobalFlags && GLOBAL_ONLY_FLAGS.includes(flag)) continue
    if (input.flags[flag] !== undefined && input.flags[flag] !== null) data[flag] = input.flags[flag] === true
  }
  return data
}

async function viewerIsGlobal() {
  const viewer = await getStaffViewer()
  return viewer.success && viewer.data.role?.canAccessAllClinicalData === true
}

export async function createStaffRole(input: RoleInput) {
  const name = String(input.name || '').trim()
  if (!name) return { success: false as const, error: 'Role name is required.' }
  if (name.length > 120) return { success: false as const, error: 'Role name is too long.' }
  const data = roleData(input, await viewerIsGlobal())
  const response = await keystoneClient<{ createRole: { id: string } | null }>(
    `mutation CreateStaffRole($data: RoleCreateInput!) { createRole(data: $data) { id } }`,
    { data },
  )
  if (!response.success || !response.data.createRole) return { success: false as const, error: 'The role could not be created with this session’s access.' }
  revalidatePath(STAFF_PATH)
  return { success: true as const, data: response.data.createRole }
}

export async function updateStaffRole(id: string, input: RoleInput) {
  const name = String(input.name || '').trim()
  if (!name) return { success: false as const, error: 'Role name is required.' }
  if (name.length > 120) return { success: false as const, error: 'Role name is too long.' }
  const data = roleData(input, await viewerIsGlobal())
  const response = await keystoneClient<{ updateRole: { id: string } | null }>(
    `mutation UpdateStaffRole($id: ID!, $data: RoleUpdateInput!) { updateRole(where: { id: $id }, data: $data) { id } }`,
    { id, data },
  )
  if (!response.success || !response.data.updateRole) return { success: false as const, error: 'The role could not be updated with this session’s access.' }
  revalidatePath(STAFF_PATH)
  return { success: true as const, data: response.data.updateRole }
}
