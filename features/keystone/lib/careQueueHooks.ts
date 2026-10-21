const TRANSITIONS: Record<string, string[]> = {
  waiting: ['called', 'cancelled'],
  called: ['in_care', 'waiting', 'cancelled'],
  in_care: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
}

export function normalizeQueueReason(value: unknown) {
  const normalized = String(value ?? 'scheduled_visit').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_')
  if (!normalized || normalized.length > 80) throw new Error('Queue reason code is invalid')
  return normalized
}

export async function resolveCareQueueInput({ operation, resolvedData, item, context }: any) {
  const status = operation === 'create' ? 'waiting' : resolvedData.status
  const statusChanged = operation === 'update' && status && status !== item?.status
  const now = new Date()
  return {
    ...resolvedData,
    ...(resolvedData.reasonCode !== undefined ? { reasonCode: normalizeQueueReason(resolvedData.reasonCode) } : {}),
    ...(operation === 'create' ? { status: 'waiting', transitionVersion: 1, arrivedAt: resolvedData.arrivedAt ?? now, actorReference: context.session?.itemId ?? '' } : {}),
    ...(statusChanged ? {
      transitionVersion: Number(item?.transitionVersion || 0) + 1,
      actorReference: context.session?.itemId ?? '',
      ...(status === 'called' ? { calledAt: now } : {}),
      ...(['completed', 'cancelled'].includes(status) ? { completedAt: now } : {}),
    } : {}),
  }
}

export async function validateCareQueueInput({ operation, resolvedData, item, addValidationError }: any) {
  if (operation === 'create') {
    for (const key of ['facility', 'patient', 'appointment']) {
      if (!resolvedData[key]?.connect?.id) addValidationError(`Queue ticket ${key} is required`)
    }
    if (resolvedData.status !== 'waiting') addValidationError('Queue tickets must begin waiting')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(resolvedData.queueDate ?? ''))) addValidationError('Queue date is required')
    if (!Number.isInteger(resolvedData.queuePosition) || resolvedData.queuePosition < 1) addValidationError('Queue position must be a positive integer')
  }
  if (operation === 'update' && resolvedData.status && resolvedData.status !== item?.status) {
    if (!TRANSITIONS[item?.status]?.includes(resolvedData.status)) {
      addValidationError(`Invalid queue transition from ${item?.status} to ${resolvedData.status}`)
    }
  }
}

export async function beforeCareQueueOperation({ operation, resolvedData, context }: any) {
  if (!context.session?.itemId) throw new Error('Authenticated actor is required for queue operations')
  if (operation === 'delete') throw new Error('Queue history is immutable and cannot be deleted')
  if (operation === 'create') {
    const appointmentId = resolvedData.appointment?.connect?.id
    const appointment = appointmentId
      ? await context.sudo().prisma.appointment.findUnique({ where: { id: appointmentId }, select: { status: true } })
      : null
    if (!appointment || appointment.status !== 'checked_in') {
      throw new Error('Appointment must be checked in before queue creation')
    }
  }
}

export async function afterCareQueueOperation({ operation, item, originalItem, context }: any) {
  if (operation === 'delete' || !item) return
  if (operation === 'update' && item.status === originalItem?.status) return
  const record = await context.sudo().prisma.careQueueTicket.findUnique({ where: { id: item.id } })
  if (!record) throw new Error('Persisted queue ticket was not found for hook propagation')
  const eventType = operation === 'create' ? 'queue.arrived' : `queue.${record.status}`
  const eventKey = operation === 'create'
    ? `queue:${record.facilityId}:arrival:${record.idempotencyKeyHash}`
    : `queue:${record.id}:v${record.transitionVersion}:${eventType}`
  const now = new Date()
  const metadata = { source: 'care_queue_hook', queueTicketId: record.id, status: record.status, transitionVersion: record.transitionVersion }
  await context.sudo().prisma.clinicalAuditLog.create({ data: { eventType, occurredAt: now, actorType: 'staff_user', actorReference: context.session?.itemId ?? '', facilityId: record.facilityId, patientId: record.patientId, appointmentId: record.appointmentId, encounterId: record.encounterId, metadata, createdAt: now } })
  await context.sudo().prisma.clinicalOutboxEvent.create({ data: { eventKey, eventType, aggregateType: 'care_queue', aggregateId: record.id, status: 'recorded', attempts: 0, nextAttemptAt: null, facilityId: record.facilityId, patientId: record.patientId, appointmentId: record.appointmentId, encounterId: record.encounterId, payload: metadata, createdAt: now } })
}
