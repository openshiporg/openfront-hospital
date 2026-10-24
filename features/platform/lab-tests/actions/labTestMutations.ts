'use server'

import { revalidatePath } from 'next/cache'
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import { validateLabTest, type LabTestMutationResult } from '../lib/labTests'

const PATH = '/dashboard/platform/lab-tests'

export async function saveLabTest(id: string | null, input: Record<string, string>): Promise<LabTestMutationResult> {
  const { data, fieldErrors } = validateLabTest(input)
  if (Object.keys(fieldErrors).length) return { success: false, error: 'Check the highlighted fields.', fieldErrors }
  const response = id
    ? await keystoneClient<{ result: { id: string } | null }>(
        `mutation UpdateLabTest($id: ID!, $data: LabTestUpdateInput!) { result: updateLabTest(where: { id: $id }, data: $data) { id } }`,
        { id, data },
      )
    : await keystoneClient<{ result: { id: string } | null }>(
        `mutation CreateLabTest($data: LabTestCreateInput!) { result: createLabTest(data: $data) { id } }`,
        { data },
      )
  if (!response.success) return { success: false, error: response.error || 'Save failed.' }
  if (!response.data.result) return { success: false, error: 'Lab test was not saved.' }
  revalidatePath(PATH)
  return { success: true }
}

export async function setLabTestActive(id: string, active: boolean): Promise<LabTestMutationResult> {
  if (!id) return { success: false, error: 'Lab test missing.' }
  const response = await keystoneClient<{ result: { id: string } | null }>(
    `mutation SetLabTestActive($id: ID!, $active: Boolean!) { result: updateLabTest(where: { id: $id }, data: { active: $active }) { id } }`,
    { id, active },
  )
  if (!response.success) return { success: false, error: response.error || 'Update failed.' }
  if (!response.data.result) return { success: false, error: 'Lab test was not updated.' }
  revalidatePath(PATH)
  return { success: true }
}
