type HookConfig = {
  delegate: string
  eventPrefix: string
  initialStatus: string
  transitions: Readonly<Record<string, readonly string[]>>
  requiredRelations: readonly string[]
  timestamps?: Record<string, string>
  versionOnUnchangedStatus?: boolean
}

function boundedCode(value: unknown, fallback = '') {
  const normalized = String(value ?? fallback).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_')
  if (!normalized || normalized.length > 80) throw new Error('Workflow code is invalid')
  return normalized
}

export function controlledClinicalHooks(config: HookConfig) {
  return {
    resolveInput: async ({ operation, resolvedData, item, context }: any) => {
      const status = operation === 'create' ? config.initialStatus : resolvedData.status
      const changed = operation === 'update' && status && (
        status !== item?.status || config.versionOnUnchangedStatus === true
      )
      const now = new Date()
      return {
        ...resolvedData,
        ...(resolvedData.reasonCode ? { reasonCode: boundedCode(resolvedData.reasonCode) } : {}),
        ...(operation === 'create' ? {
          status: config.initialStatus,
          transitionVersion: 1,
          actorReference: context.session?.itemId ?? '',
        } : {}),
        ...(changed ? {
          transitionVersion: Number(item?.transitionVersion || 0) + 1,
          actorReference: context.session?.itemId ?? '',
          ...(config.timestamps?.[status] ? { [config.timestamps[status]]: now } : {}),
        } : {}),
      }
    },
    validateInput: async ({ operation, resolvedData, item, addValidationError }: any) => {
      if (operation === 'create') {
        for (const relation of config.requiredRelations) {
          if (!resolvedData[relation]?.connect?.id) addValidationError(`${relation} is required for ${config.eventPrefix}`)
        }
        if (!resolvedData.operationKeyHash || !resolvedData.requestHash) addValidationError('Idempotency evidence is required')
      }
      if (operation === 'update' && resolvedData.status && resolvedData.status !== item?.status) {
        if (!config.transitions[item?.status]?.includes(resolvedData.status)) {
          addValidationError(`Invalid ${config.eventPrefix} transition from ${item?.status} to ${resolvedData.status}`)
        }
      }
    },
    beforeOperation: async ({ operation, context }: any) => {
      if (!context.session?.itemId) throw new Error(`Authenticated actor is required for ${config.eventPrefix}`)
      if (operation === 'delete') throw new Error(`${config.eventPrefix} history is immutable`)
    },
    afterOperation: async ({ operation, item, originalItem, context }: any) => {
      if (operation === 'delete' || !item || (operation === 'update' && item.status === originalItem?.status && item.transitionVersion === originalItem?.transitionVersion)) return
      const prisma = context.sudo().prisma as any
      const record = await prisma[config.delegate].findUnique({ where: { id: item.id } })
      if (!record?.facilityId || !record?.patientId) throw new Error(`${config.eventPrefix} tenancy was not persisted`)
      const eventType = operation === 'create' ? `${config.eventPrefix}.created` : `${config.eventPrefix}.${record.status}`
      const eventKey = operation === 'create'
        ? `${config.eventPrefix}:${record.facilityId}:create:${record.operationKeyHash}`
        : `${config.eventPrefix}:${record.id}:v${record.transitionVersion}:${record.status}`
      const now = new Date()
      const metadata = { source: 'controlled_clinical_hook', aggregateType: config.eventPrefix, aggregateId: record.id, status: record.status, transitionVersion: record.transitionVersion }
      await prisma.clinicalAuditLog.create({ data: { eventType, occurredAt: now, actorType: 'staff_user', actorReference: context.session?.itemId ?? '', facilityId: record.facilityId, patientId: record.patientId, encounterId: record.encounterId ?? null, metadata, createdAt: now } })
      await prisma.clinicalOutboxEvent.create({ data: { eventKey, eventType, aggregateType: config.eventPrefix, aggregateId: record.id, status: 'recorded', attempts: 0, nextAttemptAt: null, facilityId: record.facilityId, patientId: record.patientId, encounterId: record.encounterId ?? null, payload: metadata, createdAt: now } })
    },
  }
}

export const clinicalWorkflowDefinitions = {
  admission: { delegate: 'admission', eventPrefix: 'admission', initialStatus: 'admitted', requiredRelations: ['facility', 'patient', 'bed'], transitions: { admitted: ['transferred', 'discharged'], transferred: ['transferred', 'discharged'], discharged: [] }, timestamps: { discharged: 'dischargedAt' }, versionOnUnchangedStatus: true },
  medicalOrder: { delegate: 'medicalOrder', eventPrefix: 'medical_order', initialStatus: 'draft', requiredRelations: ['facility', 'patient', 'encounter', 'orderingProvider'], transitions: { draft: ['ordered', 'cancelled'], ordered: ['in_progress', 'cancelled'], in_progress: ['completed', 'cancelled'], completed: [], cancelled: [] }, timestamps: { ordered: 'orderedAt', completed: 'completedAt' } },
  labResult: { delegate: 'labResult', eventPrefix: 'lab_result', initialStatus: 'preliminary', requiredRelations: ['facility', 'patient', 'encounter', 'medicalOrder', 'labTest'], transitions: { pending: ['preliminary', 'final', 'cancelled'], preliminary: ['final', 'corrected', 'cancelled'], final: ['acknowledged'], acknowledged: [], corrected: ['acknowledged'], cancelled: [] }, timestamps: { final: 'resultedAt', acknowledged: 'acknowledgedAt' } },
  prescription: { delegate: 'prescription', eventPrefix: 'prescription', initialStatus: 'recorded_manual', requiredRelations: ['facility', 'patient', 'encounter', 'provider'], transitions: { recorded_manual: ['cancelled'], draft: ['cancelled'], active: ['cancelled'], held: ['cancelled'], completed: [], cancelled: [] }, timestamps: { cancelled: 'endsAt' } },
  procedure: { delegate: 'procedure', eventPrefix: 'procedure', initialStatus: 'scheduled', requiredRelations: ['facility', 'patient', 'encounter', 'provider'], transitions: { scheduled: ['in_progress', 'cancelled'], in_progress: ['completed', 'cancelled'], completed: [], cancelled: [] }, timestamps: { completed: 'completedAt' } },
  carePlan: { delegate: 'carePlan', eventPrefix: 'care_plan', initialStatus: 'draft', requiredRelations: ['facility', 'patient', 'provider'], transitions: { draft: ['active', 'cancelled'], active: ['completed', 'cancelled'], completed: [], cancelled: [] }, timestamps: { active: 'startsAt', completed: 'endsAt', cancelled: 'endsAt' } },
  insuranceClaim: { delegate: 'insuranceClaim', eventPrefix: 'insurance_claim', initialStatus: 'draft', requiredRelations: ['facility', 'patient', 'encounter'], transitions: { draft: ['prepared', 'cancelled'], prepared: ['submitted', 'corrected', 'cancelled'], submitted: ['external_acknowledged', 'external_rejected', 'corrected'], external_acknowledged: [], external_rejected: ['corrected'], accepted: [], denied: ['corrected'], corrected: ['prepared'], cancelled: [] }, timestamps: { submitted: 'submittedAt' } },
} as const
