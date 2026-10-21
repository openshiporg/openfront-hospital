import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'

import { deriveOperationalFabricAccess, type FabricQueryKey, type OperationalFabricRole } from './workspaceAccess'

export type FabricOption = { value: string; label: string; version?: number }
export type FabricWorkspace = {
  capabilities: ReturnType<typeof deriveOperationalFabricAccess>['capabilities']
  availability: Record<FabricQueryKey, boolean>
  unavailable: string[]
  notices: string[]
  facilitiesCount: number
  batches: Array<{ id: string; status: string; transitionVersion: number; rowCount: number; errorCount: number }>
  exports: Array<{ id: string; jobNumber: string; status: string; transitionVersion: number; exportType: string; format: string; expiresAt: string }>
  outbox: { pending: number; retry: number; deadLetter: number } | null
  totals: { inventory: number | null; exports: number | null; succeededPayments: number | null }
}

const authorityQuery = `
  query OperationalFabricAuthority {
    authenticatedItem {
      ... on User {
        id
        role {
          canAccessAllClinicalData
          canManagePatients
          canManageIntake
          canManageCommunications
          canManageBilling
          canManageInventory
          canManageIntegrations
          canManageDataPortability
          canManageRetention
          canViewReports
        }
      }
    }
  }
`

const queries: Record<FabricQueryKey, string> = {
  facilities: `
    query OperationalFabricFacilities {
      facilitiesCount(where:{status:{equals:"active"}})
    }
  `,
  patients: `
    query OperationalFabricPatientCount {
      patientsCount(where:{status:{equals:"active"}})
    }
  `,
  billing: `
    query OperationalFabricBilling {
      patientCoveragesCount(where:{status:{equals:"unverified"}})
      patientPaymentsCount(where:{status:{equals:"succeeded"}})
    }
  `,
  consents: `
    query OperationalFabricConsentCount {
      patientConsentsCount
    }
  `,
  inventory: `
    query OperationalFabricInventoryCount {
      inventoryItemsCount
    }
  `,
  integrations: `
    query OperationalFabricIntegrationCount {
      integrationInstallationsCount(where:{status:{equals:"active"}})
    }
  `,
  retention: `
    query OperationalFabricRetentionCount {
      retentionPoliciesCount(where:{status:{equals:"active"}})
    }
  `,
  portability: `
    query OperationalFabricPortability {
      importBatches(orderBy:[{createdAt:desc}],take:20){id status transitionVersion rowCount errorCount}
      importBatchesCount
      exportJobs(orderBy:[{createdAt:desc}],take:20){id jobNumber status transitionVersion exportType format expiresAt}
      exportJobsCount
    }
  `,
  encounters: `
    query OperationalFabricEncounterReadiness {
      encountersCount(where:{status:{in:["open","in_progress"]}})
    }
  `,
  outbox: `
    query OperationalFabricOutbox {
      pending:clinicalOutboxEventsCount(where:{status:{equals:"pending"}})
      retry:clinicalOutboxEventsCount(where:{status:{equals:"retry"}})
      deadLetter:clinicalOutboxEventsCount(where:{status:{equals:"dead_letter"}})
    }
  `,
}

type Projection = Record<string, any>
type WorkspaceData = Record<string, any>
type AuthorityResponse = {
  authenticatedItem?: { id?: string; role?: OperationalFabricRole | null } | null
}

const requiredProjection: Record<FabricQueryKey, { arrays: string[]; counts: string[] }> = {
  facilities: { arrays: [], counts: ['facilitiesCount'] },
  patients: { arrays: [], counts: ['patientsCount'] },
  billing: { arrays: [], counts: ['patientCoveragesCount', 'patientPaymentsCount'] },
  consents: { arrays: [], counts: ['patientConsentsCount'] },
  inventory: { arrays: [], counts: ['inventoryItemsCount'] },
  integrations: { arrays: [], counts: ['integrationInstallationsCount'] },
  retention: { arrays: [], counts: ['retentionPoliciesCount'] },
  portability: { arrays: ['importBatches', 'exportJobs'], counts: ['importBatchesCount', 'exportJobsCount'] },
  encounters: { arrays: [], counts: ['encountersCount'] },
  outbox: { arrays: [], counts: ['pending', 'retry', 'deadLetter'] },
}

const failureLabels: Record<FabricQueryKey, string> = {
  facilities: 'Facility scope could not be verified; facility-bound actions are hidden.',
  patients: 'Patient selection could not be verified; patient-bound actions are hidden.',
  billing: 'Billing records are unavailable; billing record options and actions are hidden.',
  consents: 'Consent access could not be verified; consent actions are hidden.',
  inventory: 'Inventory records are unavailable; inventory record options and actions are hidden.',
  integrations: 'Integration records are unavailable; credential actions are hidden.',
  retention: 'Retention policies are unavailable; retention record options and actions are hidden.',
  portability: 'Import/export records are unavailable; queued portability actions are hidden.',
  encounters: 'Encounter access could not be verified; encounter-hold actions are hidden.',
  outbox: 'Outbox counts are unavailable; no zero-count status is inferred.',
}

function hasRequiredProjection(data: Projection | undefined, key: FabricQueryKey) {
  if (!data) return false
  const required = requiredProjection[key]
  return required.arrays.every(field => Array.isArray(data[field])) &&
    required.counts.every(field => Number.isSafeInteger(data[field]) && data[field] >= 0)
}

function boundedNotice(label: string, total: number, loaded: number) {
  return total > loaded ? `${label}: showing the first ${loaded} of ${total}. Use its dedicated workspace or narrow status before acting outside this bounded list.` : null
}

export async function getOperationalFabricWorkspace(): Promise<FabricWorkspace> {
  const authorityResponse = await keystoneClient<AuthorityResponse>(authorityQuery)
  const actor = authorityResponse.success ? authorityResponse.data.authenticatedItem : null
  if (!authorityResponse.success || !actor?.id || !actor.role) {
    throw new Error('Operational fabric authority could not be verified')
  }

  const access = deriveOperationalFabricAccess(actor.role)
  const data: WorkspaceData = {
    facilitiesCount: 0,
    patientsCount: 0,
    patientCoveragesCount: 0,
    patientConsentsCount: 0,
    patientPaymentsCount: 0,
    inventoryItemsCount: 0,
    integrationInstallationsCount: 0,
    retentionPoliciesCount: 0,
    encountersCount: 0,
    importBatches: [], importBatchesCount: 0,
    exportJobs: [], exportJobsCount: 0,
    pending: 0, retry: 0, deadLetter: 0,
  }
  const availability = Object.fromEntries(
    (Object.keys(queries) as FabricQueryKey[]).map(key => [key, false]),
  ) as Record<FabricQueryKey, boolean>
  const unavailable: string[] = []

  if (access.capabilities.hasOperationalAccess) {
    const results = await Promise.all(access.queries.map(async key => ({
      key,
      response: await keystoneClient<Projection>(queries[key]),
    })))
    for (const { key, response } of results) {
      if (!response.success || !hasRequiredProjection(response.data, key)) {
        unavailable.push(failureLabels[key])
        continue
      }
      Object.assign(data, response.data)
      availability[key] = true
    }
  }

  const notices = [
    ...(availability.portability ? [
      boundedNotice('Import batches', data.importBatchesCount, data.importBatches.length),
      boundedNotice('Export jobs', data.exportJobsCount, data.exportJobs.length),
    ] : []),
  ].filter((message): message is string => Boolean(message))

  return {
    capabilities: access.capabilities,
    availability,
    unavailable,
    notices,
    facilitiesCount: data.facilitiesCount,
    batches: data.importBatches,
    exports: data.exportJobs,
    outbox: availability.outbox ? { pending: data.pending, retry: data.retry, deadLetter: data.deadLetter } : null,
    totals: {
      inventory: availability.inventory ? data.inventoryItemsCount : null,
      exports: availability.portability ? data.exportJobsCount : null,
      succeededPayments: availability.billing ? data.patientPaymentsCount : null,
    },
  }
}
