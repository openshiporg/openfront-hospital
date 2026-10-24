'use server'

import { revalidatePath } from 'next/cache'
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import { INTAKE_SECTIONS, VISIT_STATUSES, validateVisitType, type VisitTypeInput, type VisitTypeResult } from './types'

function revalidateVisitType(id?: string) {
  revalidatePath('/dashboard/platform/visit-types')
  if (id) revalidatePath(`/dashboard/platform/visit-types/${id}`)
  revalidatePath('/dashboard/platform/providers')
  revalidatePath('/book', 'layout')
}

function cleanIds(ids: unknown) {
  return Array.isArray(ids) ? Array.from(new Set(ids.filter((v): v is string => typeof v === 'string' && v.length > 0 && v.length < 64))) : []
}

function cleanSections(sections: unknown) {
  const allowed = new Set<string>(INTAKE_SECTIONS.map((s) => s.value))
  return Array.isArray(sections) ? INTAKE_SECTIONS.map((s) => s.value).filter((v) => sections.includes(v) && allowed.has(v)) : []
}

function firstError(errors: Record<string, string | undefined>) {
  const entry = Object.entries(errors).find(([, v]) => v)
  const labels: Record<string, string> = {
    name: 'Name', slug: 'Slug', description: 'Description', durationMinutes: 'Duration', bufferBeforeMinutes: 'Buffer before',
    bufferAfterMinutes: 'Buffer after', priceCents: 'Price', status: 'Status',
  }
  return entry ? `${labels[entry[0]] ?? entry[0]}: ${entry[1]}` : null
}

function scalars(input: Partial<VisitTypeInput>) {
  const data: Record<string, unknown> = {}
  if (input.name !== undefined) data.name = input.name.trim()
  if (input.slug !== undefined) data.slug = input.slug.trim()
  if (input.description !== undefined) data.description = input.description.trim()
  for (const key of ['durationMinutes', 'bufferBeforeMinutes', 'bufferAfterMinutes', 'priceCents', 'status'] as const) {
    if (input[key] !== undefined) data[key] = input[key]
  }
  return data
}

export async function createVisitType(input: VisitTypeInput): Promise<VisitTypeResult<{ id: string }>> {
  const error = firstError(validateVisitType(input, false))
  if (error) return { success: false, error }
  const data: Record<string, unknown> = scalars(input)
  data.intakeRequirements = { sections: cleanSections(input.intakeSections) }
  const providerIds = cleanIds(input.providerIds)
  if (providerIds.length) data.providers = { connect: providerIds.map((id) => ({ id })) }
  const response = await keystoneClient<{ createAppointmentType: { id: string } | null }>(
    `mutation CreateVisitType($data: AppointmentTypeCreateInput!) { createAppointmentType(data: $data) { id } }`,
    { data },
  )
  if (!response.success || !response.data.createAppointmentType) {
    return { success: false, error: 'Visit type could not be created. The slug may already be in use.' }
  }
  revalidateVisitType()
  return { success: true, data: { id: response.data.createAppointmentType.id } }
}

export async function updateVisitType(id: string, input: Partial<VisitTypeInput>): Promise<VisitTypeResult> {
  const error = firstError(validateVisitType(input, true))
  if (error) return { success: false, error }
  const data: Record<string, unknown> = scalars(input)
  if (input.providerIds !== undefined) data.providers = { set: cleanIds(input.providerIds).map((v) => ({ id: v })) }
  if (input.intakeSections !== undefined) {
    const current = await keystoneClient<{ appointmentType: { intakeRequirements: unknown } | null }>(
      `query VisitTypeIntake($id: ID!) { appointmentType(where: { id: $id }) { intakeRequirements } }`,
      { id },
    )
    if (!current.success || !current.data.appointmentType) return { success: false, error: 'Visit type could not be saved.' }
    const existing = current.data.appointmentType.intakeRequirements
    const base = existing && typeof existing === 'object' && !Array.isArray(existing) ? (existing as Record<string, unknown>) : {}
    data.intakeRequirements = { ...base, sections: cleanSections(input.intakeSections) }
  }
  if (!Object.keys(data).length) return { success: true }
  const response = await keystoneClient<{ updateAppointmentType: { id: string } | null }>(
    `mutation UpdateVisitType($id: ID!, $data: AppointmentTypeUpdateInput!) { updateAppointmentType(where: { id: $id }, data: $data) { id } }`,
    { id, data },
  )
  if (!response.success || !response.data.updateAppointmentType) {
    return { success: false, error: 'Visit type could not be saved. The slug may already be in use.' }
  }
  revalidateVisitType(id)
  return { success: true }
}

export async function setVisitTypeStatus(id: string, status: string): Promise<VisitTypeResult> {
  if (!VISIT_STATUSES.some((s) => s.value === status)) return { success: false, error: 'Status is invalid.' }
  return updateVisitType(id, { status })
}
