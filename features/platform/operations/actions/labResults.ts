'use server'

import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'

export async function loadLabResult(resultId: string, beforeVersion?: number) {
  return keystoneClient<{ labResultReadback: unknown }>(`query LabResultDetail($resultId:ID!,$beforeVersion:Int){labResultReadback(resultId:$resultId,beforeVersion:$beforeVersion)}`, { resultId, beforeVersion })
}

export async function recoverLabCommand(command: Record<string, unknown>, correction = false) {
  const response = correction
    ? await keystoneClient<{ labResultReadback: unknown }>(`query RecoverLabCorrection($command:LabResultCorrectionInput!){labResultReadback(correctionCommand:$command)}`, { command })
    : await keystoneClient<{ labResultReadback: unknown }>(`query RecoverLabResult($command:LabResultWorkflowInput!){labResultReadback(command:$command)}`, { command })
  const readback = response.data?.labResultReadback
  const outcome = readback && typeof readback === 'object' && 'outcome' in readback ? readback.outcome : null
  return { success: response.success && outcome === 'accepted', readback,
    error: response.error || (outcome === 'accepted' ? undefined : 'Original acknowledgement is not fully established. Keep the exact original command; unknown is not rejection or permission for a new key.') }
}
