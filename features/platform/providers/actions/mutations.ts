'use server'

import { revalidatePath } from 'next/cache'
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import type { ActionResult, ClinicianInput, ProviderInput } from './types'

const STATUS_VALUES = ['active', 'unavailable', 'inactive']
const CLINICIAN_VALUES = ['physician', 'nurse', 'therapist', 'technician']

function revalidateProvider(id?: string) {
  revalidatePath('/dashboard/platform/providers')
  if (id) revalidatePath(`/dashboard/platform/providers/${id}`)
  revalidatePath('/dashboard/platform/visit-types')
}

function cleanIds(ids: unknown) {
  return Array.isArray(ids) ? Array.from(new Set(ids.filter((v): v is string => typeof v === 'string' && v.length > 0 && v.length < 64))) : []
}

function validateProvider(input: Partial<ProviderInput>, partial: boolean): string | null {
  if (!partial || input.firstName !== undefined) if (!input.firstName?.trim()) return 'First name is required.'
  if (!partial || input.lastName !== undefined) if (!input.lastName?.trim()) return 'Last name is required.'
  if (input.status !== undefined && !STATUS_VALUES.includes(input.status)) return 'Status is invalid.'
  for (const key of ['firstName', 'lastName', 'credentials', 'specialty', 'locationName'] as const) {
    if ((input[key]?.length ?? 0) > 200) return 'A field is too long.'
  }
  if ((input.bio?.length ?? 0) > 5000) return 'Bio is too long.'
  return null
}

function providerScalars(input: Partial<ProviderInput>) {
  const data: Record<string, unknown> = {}
  for (const key of ['firstName', 'lastName', 'credentials', 'specialty', 'bio', 'locationName', 'status'] as const) {
    if (input[key] !== undefined) data[key] = input[key]!.trim()
  }
  return data
}

export async function createProvider(input: ProviderInput): Promise<ActionResult<{ id: string }>> {
  const error = validateProvider(input, false)
  if (error) return { success: false, error }
  const data: Record<string, unknown> = providerScalars(input)
  const facilityIds = cleanIds(input.facilityIds)
  const typeIds = cleanIds(input.appointmentTypeIds)
  if (facilityIds.length) data.facilities = { connect: facilityIds.map((id) => ({ id })) }
  if (typeIds.length) data.appointmentTypes = { connect: typeIds.map((id) => ({ id })) }
  const response = await keystoneClient<{ createProvider: { id: string } | null }>(
    `mutation CreateProvider($data: ProviderCreateInput!) { createProvider(data: $data) { id } }`,
    { data },
  )
  if (!response.success || !response.data.createProvider) return { success: false, error: 'Provider could not be created.' }
  revalidateProvider()
  return { success: true, data: { id: response.data.createProvider.id } }
}

export async function updateProvider(id: string, input: Partial<ProviderInput>): Promise<ActionResult> {
  const error = validateProvider(input, true)
  if (error) return { success: false, error }
  const data: Record<string, unknown> = providerScalars(input)
  if (input.facilityIds !== undefined) data.facilities = { set: cleanIds(input.facilityIds).map((v) => ({ id: v })) }
  if (input.appointmentTypeIds !== undefined) data.appointmentTypes = { set: cleanIds(input.appointmentTypeIds).map((v) => ({ id: v })) }
  if (!Object.keys(data).length) return { success: true }
  const response = await keystoneClient<{ updateProvider: { id: string } | null }>(
    `mutation UpdateProvider($id: ID!, $data: ProviderUpdateInput!) { updateProvider(where: { id: $id }, data: $data) { id } }`,
    { id, data },
  )
  if (!response.success || !response.data.updateProvider) return { success: false, error: 'Provider could not be saved.' }
  revalidateProvider(id)
  return { success: true }
}

function validateClinician(input: Partial<ClinicianInput>, partial: boolean): string | null {
  if (!partial || input.displayName !== undefined) if (!input.displayName?.trim()) return 'Display name is required.'
  if (input.clinicianType !== undefined && !CLINICIAN_VALUES.includes(input.clinicianType)) return 'Clinician type is invalid.'
  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) return 'Email is invalid.'
  for (const key of ['displayName', 'licenseNumber', 'email', 'phone'] as const) {
    if ((input[key]?.length ?? 0) > 200) return 'A field is too long.'
  }
  return null
}

function clinicianScalars(input: Partial<ClinicianInput>) {
  const data: Record<string, unknown> = {}
  for (const key of ['displayName', 'clinicianType', 'licenseNumber', 'email', 'phone'] as const) {
    if (input[key] !== undefined) data[key] = input[key]!.trim()
  }
  if (input.active !== undefined) data.active = Boolean(input.active)
  return data
}

export async function createClinician(providerId: string, input: ClinicianInput): Promise<ActionResult> {
  const error = validateClinician(input, false)
  if (error) return { success: false, error }
  const data: Record<string, unknown> = { ...clinicianScalars(input), provider: { connect: { id: providerId } } }
  if (input.departmentId) data.department = { connect: { id: input.departmentId } }
  const response = await keystoneClient<{ createClinician: { id: string } | null }>(
    `mutation CreateClinician($data: ClinicianCreateInput!) { createClinician(data: $data) { id } }`,
    { data },
  )
  if (!response.success || !response.data.createClinician) return { success: false, error: 'Clinician record could not be created.' }
  revalidateProvider(providerId)
  return { success: true }
}

export async function updateClinician(providerId: string, clinicianId: string, input: Partial<ClinicianInput>): Promise<ActionResult> {
  const error = validateClinician(input, true)
  if (error) return { success: false, error }
  const data = clinicianScalars(input)
  if (!Object.keys(data).length) return { success: true }
  const response = await keystoneClient<{ updateClinician: { id: string } | null }>(
    `mutation UpdateClinician($id: ID!, $data: ClinicianUpdateInput!) { updateClinician(where: { id: $id }, data: $data) { id } }`,
    { id: clinicianId, data },
  )
  if (!response.success || !response.data.updateClinician) return { success: false, error: 'Clinician record could not be saved.' }
  revalidateProvider(providerId)
  return { success: true }
}
