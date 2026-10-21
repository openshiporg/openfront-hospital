import { createHash, createHmac } from 'node:crypto'
import {
  getNamedType,
  isInterfaceType,
  isObjectType,
  Kind,
  type DocumentNode,
  type ExecutionResult,
  type FieldNode,
  type FragmentDefinitionNode,
  type GraphQLNamedType,
  type GraphQLSchema,
  type SelectionSetNode,
} from 'graphql'

type ResourceReference = { resourceType: string; referenceToken: string }
type AuditOptions = {
  schema?: GraphQLSchema
  referenceSecret: string
  variables?: Record<string, unknown>
  authority?: Record<string, unknown>
  purpose: string
  correlationReference: string
}

const PHI_ROOT_FIELD_NAMES = new Set([
  'episodeClosureWorkspace', 'episodeChildWorkspace', 'recoverEpisodeClosure', 'transitionEncounter', 'labResultReadback', 'recordLabResult',
  'patient', 'patients', 'patientsCount', 'appointment', 'appointments', 'appointmentsCount',
  'intakeForm', 'intakeForms', 'intakeFormsCount', 'encounter', 'encounters', 'encountersCount',
  'admission', 'admissions', 'admissionsCount', 'carePlan', 'carePlans', 'carePlansCount',
  'careQueueTicket', 'careQueueTickets', 'careQueueTicketsCount', 'patientMessage', 'patientMessages', 'patientMessagesCount',
  'patientConsent', 'patientConsents', 'patientConsentsCount', 'patientCoverage', 'patientCoverages', 'patientCoveragesCount',
  'patientIdentifier', 'patientIdentifiers', 'patientIdentifiersCount', 'patientPayment', 'patientPayments', 'patientPaymentsCount',
  'patientRefund', 'patientRefunds', 'patientRefundsCount', 'patientRegistration', 'patientRegistrations', 'patientRegistrationsCount',
  'patientPortalAccess', 'patientPortalAccesses', 'patientPortalAccessesCount', 'clinicalDocument', 'clinicalDocuments', 'clinicalDocumentsCount',
  'clinicalAuditLog', 'clinicalAuditLogs', 'clinicalAuditLogsCount', 'clinicalOutboxEvent', 'clinicalOutboxEvents', 'clinicalOutboxEventsCount',
  'workflowTransition', 'workflowTransitions', 'workflowTransitionsCount', 'labResult', 'labResults', 'labResultsCount',
  'medicalOrder', 'medicalOrders', 'medicalOrdersCount', 'prescription', 'prescriptions', 'prescriptionsCount',
  'procedure', 'procedures', 'proceduresCount', 'specimen', 'specimens', 'specimensCount', 'vitalSign', 'vitalSigns', 'vitalSignsCount',
  'insuranceClaim', 'insuranceClaims', 'insuranceClaimsCount', 'claimVersion', 'claimVersions', 'claimVersionsCount',
  'bedReservation', 'bedReservations', 'bedReservationsCount', 'bedOccupancyEvent', 'bedOccupancyEvents', 'bedOccupancyEventsCount',
  'recordHold', 'recordHolds', 'recordHoldsCount', 'retentionDisposition', 'retentionDispositions', 'retentionDispositionsCount',
  'exportJob', 'exportJobs', 'intakeFormByAccessCode', 'appointmentScheduleConflicts', 'workflowPatientCandidates', 'workflowEncounterCandidates',
])

const PHI_FIELD_NAMES = new Set([
  'firstName', 'lastName', 'displayName', 'dateOfBirth', 'email', 'phone', 'preferredContactMethod',
  'emergencyContactName', 'emergencyContactPhone', 'insuranceSummary', 'notes', 'reasonForVisit', 'operationalNotes',
  'responses', 'reviewNotes', 'chiefComplaint', 'diagnosisSummary', 'subject', 'body', 'memberId', 'groupNumber',
  'payerName', 'billedAmountCents', 'paidAmountCents', 'denialReason', 'resultValue', 'referenceRange', 'abnormalFlag',
  'medicationName', 'dosage', 'frequency', 'procedureName', 'goals', 'interventions', 'content', 'temperatureC',
  'temperatureTenthsC', 'systolicBp', 'diastolicBp', 'heartRate', 'respiratoryRate', 'oxygenSaturation', 'licenseNumber',
])

const PHI_TYPE_NAMES = new Set([
  'Patient', 'Appointment', 'IntakeForm', 'Encounter', 'Admission', 'CarePlan', 'CareQueueTicket', 'PatientMessage',
  'PatientConsent', 'PatientCoverage', 'PatientIdentifier', 'PatientPayment', 'PatientRefund', 'PatientRegistration',
  'PatientPortalAccess', 'ClinicalDocument', 'ClinicalAuditLog', 'ClinicalOutboxEvent', 'WorkflowTransition', 'LabResult',
  'MedicalOrder', 'Prescription', 'Procedure', 'Specimen', 'VitalSign', 'InsuranceClaim', 'ClaimVersion',
  'BedReservation', 'BedOccupancyEvent', 'RecordHold', 'RetentionDisposition', 'ExportJob',
  'PatientRegistrationResult', 'PatientRegistrationCandidate', 'PatientIntakePatient', 'PatientIntakeAppointment', 'WorkflowPatientCandidate', 'WorkflowEncounterCandidate',
])

const FACILITY_TYPE_NAMES = new Set(['Facility', 'BookableFacility'])
const VARIABLE_RESOURCE_TYPES: Record<string, string> = {
  patientId: 'Patient', appointmentId: 'Appointment', intakeFormId: 'IntakeForm', encounterId: 'Encounter',
  admissionId: 'Admission', carePlanId: 'CarePlan', ticketId: 'CareQueueTicket', careQueueTicketId: 'CareQueueTicket',
  patientMessageId: 'PatientMessage', consentId: 'PatientConsent', coverageId: 'PatientCoverage',
  identifierId: 'PatientIdentifier', paymentId: 'PatientPayment', refundId: 'PatientRefund',
  registrationId: 'PatientRegistration', documentId: 'ClinicalDocument', resultId: 'LabResult', orderId: 'MedicalOrder',
  prescriptionId: 'Prescription', procedureId: 'Procedure', specimenId: 'Specimen', bedId: 'Bed',
  reservationId: 'BedReservation', facilityId: 'Facility', exportJobId: 'ExportJob', jobId: 'ExportJob',
}

function operation(document: DocumentNode, operationName?: string | null) {
  const operations = document.definitions.filter(definition => definition.kind === Kind.OPERATION_DEFINITION)
  if (operationName) return operations.find(definition => definition.kind === Kind.OPERATION_DEFINITION && definition.name?.value === operationName)
  return operations.length === 1 ? operations[0] : undefined
}

function fieldsOf(type: GraphQLNamedType | null | undefined) {
  return type && (isObjectType(type) || isInterfaceType(type)) ? type.getFields() : null
}

function fieldType(schema: GraphQLSchema | undefined, parentType: GraphQLNamedType | null | undefined, field: FieldNode) {
  const definition = fieldsOf(parentType)?.[field.name.value]
  return definition ? getNamedType(definition.type) : null
}

function referenceToken(secret: string, resourceType: string, id: string) {
  if (!secret || secret.length < 32) throw new Error('A strong PHI audit reference secret is required')
  return createHmac('sha256', secret).update(`${resourceType}\0${id}`).digest('hex')
}

function selectionDescription(document: DocumentNode, operationName: string | null | undefined, schema?: GraphQLSchema) {
  const selected = new Set<string>()
  const roots = new Set<string>()
  const fragments = new Map<string, FragmentDefinitionNode>()
  for (const definition of document.definitions) {
    if (definition.kind === Kind.FRAGMENT_DEFINITION) fragments.set(definition.name.value, definition)
  }
  const seenFragments = new Set<string>()
  const selectedOperation = operation(document, operationName)
  let readsProtectedData = false
  const rootType = selectedOperation?.operation === 'query'
    ? schema?.getQueryType()
    : selectedOperation?.operation === 'mutation'
      ? schema?.getMutationType()
      : schema?.getSubscriptionType()

  const walk = (selectionSet: SelectionSetNode, parentType: GraphQLNamedType | null | undefined, root = false) => {
    for (const selection of selectionSet.selections) {
      if (selection.kind === Kind.FIELD) {
        const name = selection.name.value
        const outputType = fieldType(schema, parentType, selection)
        selected.add(name)
        if (root) {
          roots.add(name)
          if (PHI_ROOT_FIELD_NAMES.has(name)) readsProtectedData = true
        }
        if (PHI_FIELD_NAMES.has(name)) readsProtectedData = true
        if (outputType && (PHI_TYPE_NAMES.has(outputType.name) || FACILITY_TYPE_NAMES.has(outputType.name))) {
          if (PHI_TYPE_NAMES.has(outputType.name)) readsProtectedData = true
        }
        if (selection.selectionSet) walk(selection.selectionSet, outputType)
      } else if (selection.kind === Kind.INLINE_FRAGMENT) {
        const conditionType = selection.typeCondition ? schema?.getType(selection.typeCondition.name.value) : parentType
        walk(selection.selectionSet, conditionType || parentType, root)
      } else if (!seenFragments.has(selection.name.value)) {
        seenFragments.add(selection.name.value)
        const fragment = fragments.get(selection.name.value)
        if (fragment) {
          const conditionType = schema?.getType(fragment.typeCondition.name.value)
          walk(fragment.selectionSet, conditionType || parentType, root)
        }
      }
    }
  }
  if (selectedOperation) walk(selectedOperation.selectionSet, rootType, true)
  const rootFields = [...roots].sort()
  // Keep compatibility with a missing schema during isolated source-level tests;
  // the live GraphQL endpoint always supplies its executable schema.
  if (!schema && rootFields.some(root => PHI_ROOT_FIELD_NAMES.has(root))) readsProtectedData = true
  return {
    operation: selectedOperation,
    rootFields,
    selectedFields: [...selected].filter(name => PHI_FIELD_NAMES.has(name)).sort(),
    readsProtectedData,
    fragments,
  }
}

function addReference(target: Map<string, ResourceReference>, secret: string, resourceType: string, id: unknown) {
  if (typeof id !== 'string' || !id || id.length > 200) return
  const token = referenceToken(secret, resourceType, id)
  target.set(`${resourceType}:${token}`, { resourceType, referenceToken: token })
}

function recordId(typeName: string, record: Record<string, unknown>) {
  if (typeof record.id === 'string') return record.id
  if (typeName === 'PatientRegistrationCandidate' || typeName === 'PatientRegistrationResult') {
    return typeof record.patientId === 'string' ? record.patientId : null
  }
  return null
}

function collectTypedReferences(
  selectionSet: SelectionSetNode,
  parentType: GraphQLNamedType | null | undefined,
  value: unknown,
  schema: GraphQLSchema,
  secret: string,
  resources: Map<string, ResourceReference>,
  facilities: Map<string, ResourceReference>,
  fragments: Map<string, FragmentDefinitionNode>,
  seenFragments = new Set<string>(),
) {
  if (Array.isArray(value)) {
    for (const item of value) collectTypedReferences(selectionSet, parentType, item, schema, secret, resources, facilities, fragments, seenFragments)
    return
  }
  if (!value || typeof value !== 'object') return
  const record = value as Record<string, unknown>
  const typeName = parentType?.name || ''
  const id = recordId(typeName, record)
  if (id && PHI_TYPE_NAMES.has(typeName)) addReference(resources, secret,
    typeName === 'PatientRegistrationCandidate' || typeName === 'PatientIntakePatient' ? 'Patient' :
      typeName === 'WorkflowPatientCandidate' ? 'Patient' : typeName === 'WorkflowEncounterCandidate' ? 'Encounter' : typeName,
    id,
  )
  if (id && FACILITY_TYPE_NAMES.has(typeName)) addReference(facilities, secret, 'Facility', id)

  for (const selection of selectionSet.selections) {
    if (selection.kind === Kind.FIELD) {
      const name = selection.alias?.value || selection.name.value
      if (!selection.selectionSet) {
        const resourceType = VARIABLE_RESOURCE_TYPES[selection.name.value]
        if (resourceType) {
          const target = resourceType === 'Facility' ? facilities : resources
          addReference(target, secret, resourceType, record[name])
        }
        continue
      }
      const childType = fieldType(schema, parentType, selection)
      collectTypedReferences(selection.selectionSet, childType, record[name], schema, secret, resources, facilities, fragments, new Set(seenFragments))
    } else if (selection.kind === Kind.INLINE_FRAGMENT) {
      const conditionType = selection.typeCondition ? schema.getType(selection.typeCondition.name.value) : parentType
      collectTypedReferences(selection.selectionSet, conditionType || parentType, record, schema, secret, resources, facilities, fragments, new Set(seenFragments))
    } else if (!seenFragments.has(selection.name.value)) {
      const fragment = fragments.get(selection.name.value)
      if (fragment) {
        const nextSeen = new Set(seenFragments)
        nextSeen.add(selection.name.value)
        const conditionType = schema.getType(fragment.typeCondition.name.value)
        collectTypedReferences(fragment.selectionSet, conditionType || parentType, record, schema, secret, resources, facilities, fragments, nextSeen)
      }
    }
  }
}

function collectVariableReferences(
  value: unknown,
  secret: string,
  resources: Map<string, ResourceReference>,
  facilities: Map<string, ResourceReference>,
) {
  if (!value || typeof value !== 'object') return
  if (Array.isArray(value)) {
    for (const item of value) collectVariableReferences(item, secret, resources, facilities)
    return
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const resourceType = VARIABLE_RESOURCE_TYPES[key]
    if (resourceType) {
      const target = resourceType === 'Facility' ? facilities : resources
      if (Array.isArray(nested)) for (const id of nested) addReference(target, secret, resourceType, id)
      else addReference(target, secret, resourceType, nested)
    }
    collectVariableReferences(nested, secret, resources, facilities)
  }
}

export function phiReadAuditDescriptor(
  document: DocumentNode,
  operationName: string | null | undefined,
  result: ExecutionResult,
  options: AuditOptions,
) {
  const selection = selectionDescription(document, operationName, options.schema)
  if (!selection.operation || (!selection.readsProtectedData && selection.selectedFields.length === 0)) return null
  const resources = new Map<string, ResourceReference>()
  const facilities = new Map<string, ResourceReference>()
  if (options.schema) {
    const rootType = selection.operation.operation === 'query'
      ? options.schema.getQueryType()
      : selection.operation.operation === 'mutation'
        ? options.schema.getMutationType()
        : options.schema.getSubscriptionType()
    collectTypedReferences(selection.operation.selectionSet, rootType, result.data, options.schema, options.referenceSecret, resources, facilities, selection.fragments)
  }
  collectVariableReferences(options.variables, options.referenceSecret, resources, facilities)
  const resourceReferences = [...resources.values()].sort((left, right) => `${left.resourceType}:${left.referenceToken}`.localeCompare(`${right.resourceType}:${right.referenceToken}`)).slice(0, 2_000)
  const scopeReferences = [...facilities.values()].map(reference => reference.referenceToken).sort().slice(0, 100)
  const selectionMaterial = JSON.stringify({ roots: selection.rootFields, fields: selection.selectedFields, operation: selection.operation.operation })
  return {
    operationType: selection.operation.operation,
    operationName: operationName || selection.operation.name?.value || 'anonymous-operation',
    rootFields: selection.rootFields,
    selectedFields: selection.selectedFields,
    selectionDigest: createHash('sha256').update(selectionMaterial).digest('hex'),
    resourceReferences,
    scopeReferences,
    resultReferenceDigest: resourceReferences.length
      ? createHash('sha256').update(resourceReferences.map(reference => `${reference.resourceType}:${reference.referenceToken}`).join('\0')).digest('hex')
      : '',
    resultCount: resourceReferences.length,
    authority: options.authority || {},
    purpose: options.purpose,
    correlationReference: options.correlationReference,
    success: !result.errors?.length,
  }
}

export async function recordPhiReadAudit(prisma: any, actorReference: string, descriptor: NonNullable<ReturnType<typeof phiReadAuditDescriptor>>) {
  await prisma.phiReadAudit.create({
    data: {
      eventType: 'phi.read',
      occurredAt: new Date(),
      actorReference,
      operationType: descriptor.operationType,
      operationName: descriptor.operationName,
      rootFields: descriptor.rootFields,
      selectedFields: descriptor.selectedFields,
      selectionDigest: descriptor.selectionDigest,
      resultReferenceDigest: descriptor.resultReferenceDigest,
      resourceReferences: descriptor.resourceReferences,
      scopeReferences: descriptor.scopeReferences,
      authority: descriptor.authority,
      purpose: descriptor.purpose,
      correlationReference: descriptor.correlationReference,
      resultCount: descriptor.resultCount,
      success: descriptor.success,
    },
  })
}
