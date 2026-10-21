'use server'

import { revalidatePath } from 'next/cache'
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'

export async function loadEpisodePolicy(facilityId: string, beforeRevision?: number) {
  return keystoneClient<{ episodePolicyWorkspace: any }>(`query EpisodePolicy($facilityId:ID!,$beforeRevision:Int){episodePolicyWorkspace(facilityId:$facilityId,beforeRevision:$beforeRevision,take:25)}`, { facilityId, beforeRevision })
}
export async function reviewEpisodePolicy(data: Record<string, unknown>) {
  const response = await keystoneClient<{ reviewEpisodePolicy: any }>(`mutation ReviewEpisodePolicy($data:EpisodePolicyReviewInput!){reviewEpisodePolicy(data:$data)}`, { data })
  revalidatePath('/dashboard/platform/encounters')
  return response
}
export async function loadEpisode(encounterId: string, beforeVersion?: number, beforeRejectedId?: string) {
  return keystoneClient<{ episodeClosureWorkspace: any }>(`query EpisodeClosure($encounterId:ID!,$beforeVersion:Int,$beforeRejectedId:ID){episodeClosureWorkspace(encounterId:$encounterId,beforeVersion:$beforeVersion,beforeRejectedId:$beforeRejectedId,take:25)}`, { encounterId, beforeVersion, beforeRejectedId })
}
export async function loadEpisodeChildren(encounterId: string, model: string, cursorId?: string, childId?: string, beforeChildVersion?: number) {
  return keystoneClient<{ episodeChildWorkspace: any }>(`query EpisodeChildren($encounterId:ID!,$model:String!,$cursorId:ID,$childId:ID,$beforeChildVersion:Int){episodeChildWorkspace(encounterId:$encounterId,model:$model,cursorId:$cursorId,childId:$childId,beforeChildVersion:$beforeChildVersion,take:25)}`, { encounterId, model, cursorId, childId, beforeChildVersion })
}
export async function recoverEpisode(encounterId: string, operationKey: string) {
  return keystoneClient<{ recoverEpisodeClosure: any }>(`query RecoverEpisode($encounterId:ID!,$operationKey:String!){recoverEpisodeClosure(encounterId:$encounterId,operationKey:$operationKey)}`, { encounterId, operationKey })
}
