'use server'

import { revalidatePath } from 'next/cache'
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import {
  STATUS_TARGETS,
  hasErrors,
  validateBed,
  validateDepartment,
  validateFacility,
  validateRoom,
  validateWard,
  type FormValues,
  type MutationResult,
  type StructureKind,
} from '../lib/structure'

const INVALID = 'Check the highlighted fields.'

function refresh() {
  revalidatePath('/dashboard/platform/facilities', 'layout')
}

function failure(error: string): MutationResult<never> {
  return { success: false, error: error || 'Save failed.' }
}

export async function createFacility(input: FormValues): Promise<MutationResult<{ id: string }>> {
  const { data, fieldErrors } = validateFacility(input)
  if (hasErrors(fieldErrors)) return { success: false, error: INVALID, fieldErrors }
  const response = await keystoneClient<{ createFacility: { id: string } | null }>(
    `mutation CreateFacility($data: FacilityCreateInput!) { createFacility(data: $data) { id } }`,
    { data },
  )
  if (!response.success) return failure(response.error)
  if (!response.data.createFacility) return failure('Facility was not created.')
  refresh()
  return { success: true, data: { id: response.data.createFacility.id } }
}

export async function updateFacility(id: string, input: FormValues): Promise<MutationResult> {
  if (!id) return failure('Facility missing.')
  const { data, fieldErrors } = validateFacility(input)
  if (hasErrors(fieldErrors)) return { success: false, error: INVALID, fieldErrors }
  const response = await keystoneClient<{ updateFacility: { id: string } | null }>(
    `mutation UpdateFacility($id: ID!, $data: FacilityUpdateInput!) { updateFacility(where: { id: $id }, data: $data) { id } }`,
    { id, data },
  )
  if (!response.success) return failure(response.error)
  if (!response.data.updateFacility) return failure('Facility was not updated.')
  refresh()
  return { success: true }
}

const STATUS_MUTATIONS: Record<StructureKind, string> = {
  facility: `mutation SetFacilityStatus($id: ID!, $status: String!) { result: updateFacility(where: { id: $id }, data: { status: $status }) { id } }`,
  department: `mutation SetDepartmentStatus($id: ID!, $status: String!) { result: updateDepartment(where: { id: $id }, data: { status: $status }) { id } }`,
  ward: `mutation SetWardStatus($id: ID!, $status: String!) { result: updateWard(where: { id: $id }, data: { status: $status }) { id } }`,
  room: `mutation SetRoomStatus($id: ID!, $status: String!) { result: updateRoom(where: { id: $id }, data: { status: $status }) { id } }`,
}

export async function setStructureStatus(kind: StructureKind, id: string, status: string): Promise<MutationResult> {
  if (!STATUS_MUTATIONS[kind] || !STATUS_TARGETS[kind].has(status) || !id) return failure('Invalid status change.')
  const response = await keystoneClient<{ result: { id: string } | null }>(STATUS_MUTATIONS[kind], { id, status })
  if (!response.success) return failure(response.error)
  if (!response.data.result) return failure('Status was not updated.')
  refresh()
  return { success: true }
}

export async function createDepartment(facilityId: string, input: FormValues): Promise<MutationResult> {
  if (!facilityId) return failure('Facility missing.')
  const { data, fieldErrors } = validateDepartment(input)
  if (hasErrors(fieldErrors)) return { success: false, error: INVALID, fieldErrors }
  const response = await keystoneClient<{ createDepartment: { id: string } | null }>(
    `mutation CreateDepartment($data: DepartmentCreateInput!) { createDepartment(data: $data) { id } }`,
    { data: { ...data, facilities: { connect: [{ id: facilityId }] } } },
  )
  if (!response.success) return failure(response.error)
  if (!response.data.createDepartment) return failure('Department was not created.')
  refresh()
  return { success: true }
}

export async function createWard(input: FormValues): Promise<MutationResult> {
  const { data, fieldErrors } = validateWard(input)
  if (hasErrors(fieldErrors)) return { success: false, error: INVALID, fieldErrors }
  const { departmentId, ...fields } = data
  const response = await keystoneClient<{ createWard: { id: string } | null }>(
    `mutation CreateWard($data: WardCreateInput!) { createWard(data: $data) { id } }`,
    { data: { ...fields, department: { connect: { id: departmentId } } } },
  )
  if (!response.success) return failure(response.error)
  if (!response.data.createWard) return failure('Ward was not created.')
  refresh()
  return { success: true }
}

export async function createRoom(input: FormValues): Promise<MutationResult> {
  const { data, fieldErrors } = validateRoom(input)
  if (hasErrors(fieldErrors)) return { success: false, error: INVALID, fieldErrors }
  const { wardId, ...fields } = data
  const response = await keystoneClient<{ createRoom: { id: string } | null }>(
    `mutation CreateRoom($data: RoomCreateInput!) { createRoom(data: $data) { id } }`,
    { data: { ...fields, ward: { connect: { id: wardId } } } },
  )
  if (!response.success) return failure(response.error)
  if (!response.data.createRoom) return failure('Room was not created.')
  refresh()
  return { success: true }
}

export async function createBed(input: FormValues): Promise<MutationResult> {
  const { data, fieldErrors } = validateBed(input)
  if (hasErrors(fieldErrors)) return { success: false, error: INVALID, fieldErrors }
  const response = await keystoneClient<{ createBed: { id: string } | null }>(
    `mutation CreateBed($data: BedCreateInput!) { createBed(data: $data) { id } }`,
    { data: { bedNumber: data.bedNumber, room: { connect: { id: data.roomId } }, facility: { connect: { id: data.facilityId } } } },
  )
  if (!response.success) return failure(response.error)
  if (!response.data.createBed) return failure('Bed was not created.')
  refresh()
  revalidatePath('/dashboard/platform/inpatient')
  return { success: true }
}
