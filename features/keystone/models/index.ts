import { User } from './User'
import { Role } from './Role'
import { HospitalProfile } from './HospitalProfile'
import { PhiReadAudit } from './PhiReadAudit'
import { Patient } from './Patient'
import { PatientIdentifier } from './PatientIdentifier'
import { PatientRegistration } from './PatientRegistration'
import { Provider } from './Provider'
import { AppointmentType } from './AppointmentType'
import { ProviderScheduleBlock } from './ProviderScheduleBlock'
import { Appointment } from './Appointment'
import { IntakeForm } from './IntakeForm'
import { PatientMessage } from './PatientMessage'
import { PatientPortalAccess } from './PatientPortalAccess'
import { PatientConsent } from './PatientConsent'
import { ClinicalAuditLog } from './ClinicalAuditLog'
import { WorkflowTransition } from './WorkflowTransition'
import { CareQueueTicket } from './CareQueueTicket'
import { Encounter } from './Encounter'
import { EpisodeClosurePolicy } from './EpisodeClosurePolicy'

import { Admission } from './Admission'

import { Department } from './Department'
import { DepartmentImage } from './DepartmentImage'
import { Facility } from './Facility'
import { FacilityImage } from './FacilityImage'

import { Ward } from './Ward'

import { Room } from './Room'

import { Bed } from './Bed'
import { BedOccupancyEvent } from './BedOccupancyEvent'

import { Clinician } from './Clinician'
import { ClinicianImage } from './ClinicianImage'

import { VitalSign } from './VitalSign'

import { MedicalOrder } from './MedicalOrder'

import { Prescription } from './Prescription'

import { LabTest } from './LabTest'

import { LabResult } from './LabResult'

import { Procedure } from './Procedure'

import { InsuranceClaim } from './InsuranceClaim'

import { CarePlan } from './CarePlan'
import { PatientCoverage } from './PatientCoverage'
import { ClaimVersion } from './ClaimVersion'
import { PatientPayment } from './PatientPayment'
import { PatientRefund } from './PatientRefund'
import { PaymentProvider } from './PaymentProvider'
import { PaymentWebhookReceipt } from './PaymentWebhookReceipt'
import { InventoryItem } from './InventoryItem'
import { InventoryMovement } from './InventoryMovement'
import { CommunicationPreference } from './CommunicationPreference'
import { CommunicationTemplate } from './CommunicationTemplate'
import { BedReservation } from './BedReservation'
import { IntegrationInstallation } from './IntegrationInstallation'
import { MachineCredential } from './MachineCredential'
import { IntegrationWebhookReceipt } from './IntegrationWebhookReceipt'
import { ClinicalDocument } from './ClinicalDocument'
import { Specimen } from './Specimen'
import { RetentionPolicy } from './RetentionPolicy'
import { RetentionDisposition } from './RetentionDisposition'
import { RecordHold } from './RecordHold'
import { ImportBatch } from './ImportBatch'
import { ExportJob } from './ExportJob'
import { ExternalIdentityLink } from './ExternalIdentityLink'
import { RequestRateLimitBucket } from './RequestRateLimitBucket'
import { PasswordResetRequest } from './PasswordResetRequest'
import { permissions } from '../access'

const rawModels = {
  User,
  Role,
  HospitalProfile,
  PhiReadAudit,
  Patient,
  PatientIdentifier,
  PatientRegistration,
  Provider,
  AppointmentType,
  ProviderScheduleBlock,
  Appointment,
  IntakeForm,
  PatientMessage,
  PatientPortalAccess,
  PatientConsent,
  ClinicalAuditLog,
  WorkflowTransition,
  CareQueueTicket,
  CarePlan,
  InsuranceClaim,
  Procedure,
  LabResult,
  LabTest,
  Prescription,
  MedicalOrder,
  VitalSign,
  ClinicianImage,
  Clinician,
  Bed,
  BedOccupancyEvent,
  Room,
  Ward,
  FacilityImage,
  Facility,
  DepartmentImage,
  Department,
  Admission,
  Encounter,
  EpisodeClosurePolicy,
  PatientCoverage,
  ClaimVersion,
  PatientPayment,
  PatientRefund,
  PaymentProvider,
  PaymentWebhookReceipt,
  InventoryItem,
  InventoryMovement,
  CommunicationPreference,
  CommunicationTemplate,
  BedReservation,
  IntegrationInstallation,
  MachineCredential,
  IntegrationWebhookReceipt,
  ClinicalDocument,
  Specimen,
  RetentionPolicy,
  RetentionDisposition,
  RecordHold,
  ImportBatch,
  ExportJob,
  ExternalIdentityLink,
  RequestRateLimitBucket,
  PasswordResetRequest,
}

// Filter-path rule: Keystone does not apply a related list's access filter or a field's read access to where/orderBy
// input, so a role could count rows by values it cannot read (e.g. bedsCount(where: { currentPatient: { firstName } })).
// A relation is filterable only by a session that can read the related list (User needs canSeeOtherPeople, Patient needs
// patient PHI access, since those scopes are otherwise the session's own row), and a read-gated scalar is filterable and
// orderable only with its read permission. Secrets, tokens and digests are never filterable. Explicit settings are kept.
const NEVER_FILTERABLE = /^(password|idempotencyKeyHash|accountDigest|passwordResetToken|accessCodeHash|accessTokenDigest|inviteTokenDigest|tokenDigest|secretDigest|signingSecret\w*|result(Ciphertext|Iv|Tag)|credentials|payload|objectKey)$/

async function canQueryList(listKey: string, args: any): Promise<boolean> {
  if (!args.session) return false
  if (listKey === 'User') return !!args.session.data?.role?.canSeeOtherPeople
  if (listKey === 'Patient') return permissions.canReadPatientPhi(args) || permissions.canAccessAllClinicalData(args)
  const access = (rawModels as any)[listKey]?.access
  const operation = typeof access === 'function' ? access : access?.operation?.query ?? access?.operation
  if (typeof operation === 'function' && !(await operation({ ...args, listKey, operation: 'query' }))) return false
  const filter = access?.filter?.query
  if (typeof filter === 'function' && (await filter({ ...args, listKey, operation: 'query' })) === false) return false
  return true
}

function readGate(read: any) {
  return async (args: any) => {
    try { return (await read({ ...args, item: undefined, operation: 'read' })) === true } catch { return false }
  }
}

// A relation filter is not narrowed by the related list's row scope. From a row-scoped list the starting rows already
// limit what can be reached; from an unscoped list (e.g. AppointmentType) only global clinical access may filter into a
// row-scoped list, or a facility role could count other facilities' patients.
const isRowScoped = (listKey: string) => typeof (rawModels as any)[listKey]?.access?.filter?.query === 'function'

function withFilterAccess(fields: Record<string, any>, sourceScoped: boolean) {
  return Object.fromEntries(Object.entries(fields).map(([fieldKey, fieldFn]) => {
    if (fieldKey.startsWith('__group') || typeof fieldFn !== 'function') return [fieldKey, fieldFn]
    return [fieldKey, (data: any) => {
      const f = fieldFn(data)
      let gate: boolean | ((args: any) => Promise<boolean>) | undefined
      if (NEVER_FILTERABLE.test(fieldKey)) gate = false
      else if (f.dbField?.kind === 'relation') {
        const target = f.dbField.list
        gate = async (args: any) => (await canQueryList(target, args)) &&
          (sourceScoped || !isRowScoped(target) || permissions.canAccessAllClinicalData(args))
      }
      else {
        const read = typeof f.access === 'function' ? f.access : f.access?.read
        if (typeof read === 'function') gate = readGate(read)
      }
      if (gate === undefined) return f
      return { ...f, isFilterable: f.isFilterable ?? gate, isOrderable: f.isOrderable ?? gate }
    }]
  }))
}

// Sidebar visibility follows the role: a list whose query access denies the session is hidden from navigation
// (Keystone evaluates ui.isHidden per session in admin meta). Explicit isHidden settings are kept.
export const models = Object.fromEntries(
  Object.entries(rawModels).map(([key, model]: [string, any]) => {
    const operationQuery = model?.access?.operation?.query
    const filterQuery = model?.access?.filter?.query
    const withMaxTake = { ...model, fields: withFilterAccess(model.fields, typeof model?.access?.filter?.query === 'function'), graphql: { ...model.graphql, maxTake: 100 } }
    if (typeof operationQuery !== 'function' && typeof filterQuery !== 'function') return [key, withMaxTake]
    const existing = model?.ui?.isHidden
    const isHidden = (args: any) => {
      if (existing === true || (typeof existing === 'function' && existing(args))) return true
      if (typeof operationQuery === 'function' && !operationQuery(args)) return true
      return typeof filterQuery === 'function' && filterQuery(args) === false
    }
    return [key, { ...withMaxTake, ui: { ...(model.ui ?? {}), isHidden } }]
  }),
) as typeof rawModels

export default models
