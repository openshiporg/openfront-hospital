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

// Sidebar visibility follows the role: a list whose query access denies the session is hidden from navigation
// (Keystone evaluates ui.isHidden per session in admin meta). Explicit isHidden settings are kept.
export const models = Object.fromEntries(
  Object.entries(rawModels).map(([key, model]: [string, any]) => {
    const operationQuery = model?.access?.operation?.query
    const filterQuery = model?.access?.filter?.query
    const withMaxTake = { ...model, graphql: { ...model.graphql, maxTake: 100 } }
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
