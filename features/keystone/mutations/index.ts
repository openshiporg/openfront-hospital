import { mergeSchemas } from "@graphql-tools/schema";
import type { GraphQLSchema } from 'graphql';
import redirectToInit from "./redirectToInit";
import getBookableAppointmentTypes from "./booking/getBookableAppointmentTypes";
import getHospitalBranding from './booking/getHospitalBranding'
import getBookableProviders from "./booking/getBookableProviders";
import getAvailableAppointmentSlots from "./booking/getAvailableAppointmentSlots";
import requestAppointment from "./booking/requestAppointment";
import updateActiveUser from "./updateActiveUser";
import getIntakeFormByAccessCode from "./intake/getIntakeFormByAccessCode";
import submitIntakeForm from "./intake/submitIntakeForm";
import appointmentScheduleConflicts from "./scheduling/appointmentScheduleConflicts";
import transitionAppointment from "./appointments/transitionAppointment";
import sendSecurePatientMessage from "./communications/sendSecurePatientMessage";
import transitionPatientMessage from './communications/transitionPatientMessage'
import { openEncounter, transitionEncounter } from "./clinical/manageEncounter";
import { episodeClosureWorkspace, episodePolicyWorkspace, recoverEpisodeClosure, reviewEpisodePolicy } from "./clinical/episodeWorkflows";
import { episodeChildWorkspace } from "./clinical/episodeChildWorkspace";
import { labResultReadback } from "./clinical/labResultRecovery";
import recordConsentDecision from './clinical/recordConsentDecision'
import transitionIntakeReview from "./intake/transitionIntakeReview";
import registerPatient from "./registration/registerPatient";
import { arriveAppointment, transitionCareQueue } from "./clinical/manageCareQueue";
import dispatchClinicalOutbox from "./clinical/dispatchClinicalOutbox";
import { admitPatient, transitionAdmission, transitionBedReadiness, createMedicalOrder, transitionMedicalOrder, recordLabResult, transitionLabResult, correctLabResult, createPrescription, transitionPrescription, createProcedure, transitionProcedure, createCarePlan, transitionCarePlan, prepareInsuranceClaim, transitionInsuranceClaim, workflowPatientCandidates, workflowEncounterCandidates } from "./clinical/controlledWorkflows";
import { recordPatientCoverage, transitionPatientCoverage, recordPatientPayment, transitionPatientPayment, requestPatientRefund, transitionPatientRefund } from './operational/billingWorkflows'
import { createInventoryItem, transitionInventoryItem, moveInventory } from './operational/inventoryWorkflows'
import { createClinicalDocument, transitionClinicalDocument, amendClinicalDocument, collectSpecimen, transitionSpecimen, recordVitalSign } from './operational/clinicalEvidenceWorkflows'
import { reserveBed, releaseBedReservation } from './operational/bedReservationWorkflows'
import { createCommunicationTemplate, reviseCommunicationTemplate, setCommunicationPreference } from './operational/communicationWorkflows'
import { createIntegrationInstallation, transitionIntegrationInstallation, issueMachineCredential, revokeMachineCredential, dispatchIntegrationOutbox, linkExternalIdentity } from './operational/integrationWorkflows'
import { createRetentionPolicy, transitionRetentionPolicy, placeRecordHold, releaseRecordHold, recordRetentionDisposition } from './operational/retentionWorkflows'
import { previewInventoryImport, applyInventoryImport, rollbackInventoryImport, requestExportJob, processExportJob } from './operational/portabilityWorkflows'
import { createOnboardingAppointment, issueIntakeForm } from './onboarding/onboardingWorkflows'
import applyHospitalOnboarding from './onboarding/applyHospitalOnboarding'
import bootstrapHospital from './bootstrap/bootstrapHospital'
import { redeemUserPasswordResetToken, sendUserPasswordResetLink } from './passwordResetMutations'

const graphql = String.raw;

export function extendGraphqlSchema(baseSchema: GraphQLSchema) {
  return mergeSchemas({
    schemas: [baseSchema],
    typeDefs: graphql`
      input HospitalBootstrapInput {
        name: String!
        email: String!
        password: String!
      }

      type HospitalBootstrapResult { status: String! }
      enum PasswordResetRedemptionErrorCode { FAILURE TOKEN_EXPIRED TOKEN_REDEEMED }
      type RedeemUserPasswordResetTokenResult { code: PasswordResetRedemptionErrorCode! message: String! }

      input UserUpdateProfileInput {
        email: String
        name: String
        password: String
        onboardingStatus: String
      }

      input PatientAppointmentRequestInput {
        firstName: String!
        lastName: String!
        email: String
        phone: String
        dateOfBirth: String
      }

      input WorkflowConsentInput {
        accepted: Boolean!
        policyVersion: String!
        statementKey: String!
      }

      input PatientIntakeUpdateInput {
        email: String
        phone: String
        preferredContactMethod: String
        insuranceSummary: JSON
      }

      input PatientRegistrationInput {
        facilityId: ID!
        idempotencyKey: String!
        medicalRecordNumber: String!
        firstName: String!
        lastName: String!
        dateOfBirth: String!
        email: String
        phone: String
        preferredContactMethod: String
        consent: WorkflowConsentInput!
        duplicateResolution: String
        duplicatePatientId: ID
      }

      type PatientRegistrationCandidate {
        patientId: ID!
        displayName: String!
        dateOfBirth: String
        maskedEmail: String
        maskedPhone: String
        reasons: [String!]!
      }

      type PatientRegistrationResult {
        status: String!
        replayed: Boolean!
        registrationId: ID
        patientId: ID
        identifierId: ID
        medicalRecordNumber: String
        duplicateResolution: String
        candidates: [PatientRegistrationCandidate!]!
        candidateCount: Int!
        candidateLimit: Int!
        candidateCountIsLowerBound: Boolean!
      }

      type HospitalBranding {
        name: String!
        shortName: String!
        logoIcon: String
    logoColor: String
    brandTheme: String!
        market: String
        description: String
        locationName: String
        serviceArea: String
        addressLine1: String
        city: String
        region: String
        postalCode: String
        supportPhone: String
        supportEmail: String
        media: JSON
      }

      type BookableFacility {
        id: ID!
        name: String!
        timeZone: String!
      }

      type BookableProvider {
        id: ID!
        displayName: String
        specialty: String
        bio: String
        locationName: String
        facilities: [BookableFacility!]!
      }

      type BookableProviderVisitType {
        id: ID!
        name: String
        slug: String
        durationMinutes: Int
        formattedPrice: String
      }

      type BookableProviderEntry {
        id: ID!
        displayName: String!
        firstName: String
        lastName: String
        credentials: String
        specialty: String
        bio: String
        locationName: String
        imagePath: String
        imageAltText: String
        appointmentTypes: [BookableProviderVisitType!]!
      }

      type BookableAppointmentType {
        id: ID!
        name: String
        slug: String
        description: String
        durationMinutes: Int
        priceCents: Int
        formattedPrice: String
        providers: [BookableProvider!]!
      }

      type AvailableAppointmentSlot {
        providerId: ID!
        providerName: String!
        facilityId: ID!
        facilityName: String!
        facilityTimeZone: String!
        followUpMode: String!
        appointmentTypeId: ID!
        appointmentTypeName: String!
        startsAt: String!
        endsAt: String!
        durationMinutes: Int!
        remainingCapacity: Int!
      }

      type PatientIntakePatient {
        id: ID!
        displayName: String
        email: String
        phone: String
        dateOfBirth: DateTime
        preferredContactMethod: String
        insuranceSummary: JSON
      }

      type PatientIntakeProvider {
        id: ID!
        displayName: String
        specialty: String
      }

      type PatientIntakeAppointmentType {
        id: ID!
        name: String
        durationMinutes: Int
      }

      type PatientIntakeAppointment {
        id: ID!
        appointmentNumber: String
        status: String
        startsAt: DateTime
        endsAt: DateTime
        reasonForVisit: String
        facilityName: String
        facilityTimeZone: String!
        provider: PatientIntakeProvider
        appointmentType: PatientIntakeAppointmentType
      }

      type PatientIntakeForm {
        id: ID!
        title: String
        status: String
        templateKey: String
        formSchema: JSON
        submittedAt: DateTime
        accessCode: String
        patient: PatientIntakePatient
        appointment: PatientIntakeAppointment
      }

      type AppointmentRequestIntakeForm {
        id: ID!
        accessCode: String
        status: String
      }

      type AppointmentRequestPatient {
        id: ID!
        displayName: String
      }

      type AppointmentRequestResult {
        id: ID!
        appointmentNumber: String
        status: String
        startsAt: DateTime
        endsAt: DateTime
        patient: AppointmentRequestPatient
        provider: PatientIntakeProvider
        appointmentType: PatientIntakeAppointmentType
        intakeForms: [AppointmentRequestIntakeForm!]!
      }

      type ScheduleConflictItem {
        source: String!
        id: ID!
        reference: String!
        status: String!
        startsAt: DateTime!
        endsAt: DateTime!
      }

      type ScheduleConflictResult {
        withinAvailability: Boolean!
        hasConflict: Boolean!
        conflicts: [ScheduleConflictItem!]!
      }

      type AppointmentTransitionResult {
        id: ID!
        appointmentNumber: String!
        fromStatus: String!
        status: String!
        transitionVersion: Int!
        startsAt: DateTime!
        endsAt: DateTime!
        checkInAt: DateTime
        completedAt: DateTime
        cancellationReason: String
        replayed: Boolean!
      }

      type SecurePatientMessageResult {
        id: ID!
        status: String!
        channel: String!
        direction: String!
        recordedAt: DateTime!
        patientId: ID!
        appointmentId: ID
        replayed: Boolean!
      }

      input ConsentDecisionWorkflowInput {
        operationKey: String!
        facilityId: ID!
        patientId: ID!
        consentType: String!
        policyVersion: String!
        statementKey: String!
        decision: String!
        reasonCode: String
        supersedesConsentId: ID
      }

      input EncounterWorkflowInput {
        operationKey: String!
        facilityId: ID!
        patientId: ID!
        providerId: ID!
        appointmentId: ID
        departmentId: ID
        chiefComplaint: String
      }

      type EncounterOpenResult {
        id: ID!
        encounterNumber: String!
        status: String!
        transitionVersion: Int!
        replayed: Boolean!
      }

      type EncounterTransitionResult {
        id: ID!
        encounterNumber: String!
        fromStatus: String!
        status: String!
        transitionVersion: Int!
        startedAt: DateTime
        endedAt: DateTime
        replayed: Boolean!
        episodeReceipt: JSON
        outcome: String
        reasonCode: String
      }

      input EpisodePolicyReviewInput { operationKey: String! facilityId: ID! expectedRevision: Int! definition: JSON! reviewReference: String! attested: Boolean! }

      type IntakeTransitionResult {
        id: ID!
        fromStatus: String!
        status: String!
        transitionVersion: Int!
        reviewedAt: DateTime
        reviewedById: ID
        replayed: Boolean!
      }

      type ConsentDecisionResult { id: ID! decision: String! effectiveAt: DateTime! replayed: Boolean! }
      type ClinicalOutboxDispatchResult { claimed: Int! delivered: Int! }
      type ControlledClinicalResult { id: ID! status: String! transitionVersion: Int! replayed: Boolean! originalAcknowledgement: JSON }
      type ControlledBedResult { id: ID! status: String! transitionVersion: Int! replayed: Boolean! }

      input AdmissionWorkflowInput { operationKey: String! facilityId: ID! patientId: ID! encounterId: ID attendingProviderId: ID! bedId: ID! notes: String }
      input MedicalOrderWorkflowInput { operationKey: String! facilityId: ID! patientId: ID! encounterId: ID! orderingProviderId: ID! orderType: String! summary: String! }
      input LabResultWorkflowInput { operationKey: String! facilityId: ID! patientId: ID! encounterId: ID! medicalOrderId: ID! labTestId: ID! resultValue: String! referenceRange: String abnormalFlag: String }
      input LabResultCorrectionInput { operationKey: String! resultId: ID! resultValue: String! referenceRange: String abnormalFlag: String humanReviewed: Boolean! humanReviewReference: String! }
      input PrescriptionWorkflowInput { operationKey: String! facilityId: ID! patientId: ID! encounterId: ID! providerId: ID! medicalOrderId: ID recordingBasis: String! medicationName: String! dosage: String! frequency: String! notes: String }
      input ProcedureWorkflowInput { operationKey: String! facilityId: ID! patientId: ID! encounterId: ID! providerId: ID! medicalOrderId: ID procedureName: String! scheduledAt: String notes: String }
      input CarePlanWorkflowInput { operationKey: String! facilityId: ID! patientId: ID! encounterId: ID providerId: ID! title: String! goals: String! interventions: String! }
      input InsuranceClaimWorkflowInput { operationKey: String! facilityId: ID! patientId: ID! encounterId: ID! coverageId: ID payerName: String! billedAmountCents: Int! }
      input PatientCoverageWorkflowInput { operationKey: String! facilityId: ID! patientId: ID! payerName: String! memberId: String! groupNumber: String effectiveAt: String terminatesAt: String }
      input PatientPaymentWorkflowInput { operationKey: String! facilityId: ID! patientId: ID! claimId: ID installationId: ID amountCents: Int! currency: String method: String! externalReference: String }
      input PatientRefundWorkflowInput { operationKey: String! paymentId: ID! amountCents: Int! reasonCode: String! }
      input InventoryItemWorkflowInput { operationKey: String! facilityId: ID! sku: String! name: String! unit: String! initialQuantity: Int reorderPoint: Int }
      input InventoryMovementWorkflowInput { operationKey: String! itemId: ID! expectedVersion: Int! movementType: String! quantityDelta: Int! reservedDelta: Int reasonCode: String! }
      input ClinicalDocumentWorkflowInput { operationKey: String! facilityId: ID! patientId: ID! encounterId: ID! providerId: ID! documentType: String! title: String! content: String! }
      input ClinicalDocumentAmendmentInput { operationKey: String! documentId: ID! content: String! reason: String! }
      input SpecimenWorkflowInput { operationKey: String! facilityId: ID! patientId: ID! encounterId: ID! medicalOrderId: ID! specimenType: String! }
      input BedReservationWorkflowInput { operationKey: String! facilityId: ID! patientId: ID! bedId: ID! expectedBedVersion: Int! expiresAt: String! reasonCode: String! }
      input VitalSignWorkflowInput { operationKey: String! facilityId: ID! patientId: ID! encounterId: ID! clinicianId: ID! temperatureC: Float systolicBp: Int diastolicBp: Int heartRate: Int respiratoryRate: Int oxygenSaturation: Int notes: String }
      input CommunicationTemplateWorkflowInput { operationKey: String! facilityId: ID! templateKey: String! name: String! channel: String! subjectTemplate: String bodyTemplate: String! }
      input CommunicationPreferenceWorkflowInput { operationKey: String! facilityId: ID! patientId: ID! channel: String! purpose: String! status: String! expectedVersion: Int reasonCode: String! }
      input IntegrationInstallationWorkflowInput { operationKey: String! facilityId: ID! name: String! kind: String! endpointUrl: String! allowedEventTypes: [String!]! }
      input MachineCredentialWorkflowInput { operationKey: String! installationId: ID! name: String! scopes: [String!]! expiresAt: String! }
      input ExternalIdentityWorkflowInput { operationKey: String! facilityId: ID! system: String! resourceType: String! externalId: String! localType: String! localId: ID! }
      input RetentionPolicyWorkflowInput { operationKey: String! facilityId: ID! recordType: String! retentionDays: Int! }
      input RecordHoldWorkflowInput { operationKey: String! facilityId: ID! aggregateType: String! aggregateId: ID! reasonCode: String! notes: String }
      input RetentionDispositionWorkflowInput { operationKey: String! facilityId: ID! policyId: ID! aggregateType: String! aggregateId: ID! decision: String! reasonCode: String! }
      input InventoryImportPreviewInput { operationKey: String! facilityId: ID! csv: String! }
      input ExportJobWorkflowInput { operationKey: String! facilityId: ID! exportType: String! format: String! filters: JSON }
      input OnboardingAppointmentInput { operationKey: String! appointmentNumber: String! status: String! facilityId: ID! patientId: ID! providerId: ID! appointmentTypeId: ID! startsAt: String! endsAt: String! locationName: String reasonForVisit: String reconcileSchedule: Boolean }
      input IntakeIssueInput { operationKey: String! facilityId: ID! patientId: ID! appointmentId: ID! title: String templateKey: String formSchema: JSON }

      type HospitalOnboardingAccessLink { label: String! href: String! expiresAt: DateTime! }
      type HospitalOnboardingResult { status: String! referenceDate: String! counts: JSON! intakeLinks: [HospitalOnboardingAccessLink!]! }
      type OnboardingAppointmentResult { id: ID! appointmentNumber: String! status: String! transitionVersion: Int! replayed: Boolean! }
      type OneTimeAccessResult { id: ID! status: String! transitionVersion: Int accessCode: String accessExpiresAt: DateTime replayed: Boolean! }
      type OperationalInventoryResult { id: ID! status: String! transitionVersion: Int! quantityOnHand: Int! quantityReserved: Int! replayed: Boolean! }
      type VitalSignWorkflowResult { id: ID! recordedAt: DateTime! replayed: Boolean! }
      type IntegrationInstallationWorkflowResult { id: ID! status: String! transitionVersion: Int! installationKey: String signingSecret: String replayed: Boolean! }
      type MachineCredentialWorkflowResult { id: ID! status: String! transitionVersion: Int! keyPrefix: String credential: String replayed: Boolean! }
      type ExternalIdentityWorkflowResult { id: ID! status: String! replayed: Boolean! }
      type IntegrationDispatchResult { claimed: Int! delivered: Int! retried: Int! deadLettered: Int! }
      type ImportPreviewWorkflowResult { id: ID! status: String! transitionVersion: Int! rowCount: Int! errorCount: Int! replayed: Boolean! }
      type ExportJobWorkflowResult { id: ID! status: String! transitionVersion: Int! accessToken: String expiresAt: DateTime! replayed: Boolean! }
      type RetentionDispositionWorkflowResult { id: ID! decision: String! replayed: Boolean! }
      type WorkflowPatientCandidate { id: ID! displayName: String! }
      type WorkflowEncounterCandidate { id: ID! encounterNumber: String! status: String! }

      type CareQueueResult {
        id: ID!
        ticketNumber: String!
        status: String!
        priority: String!
        reasonCode: String!
        queueDate: String!
        queuePosition: Int!
        transitionVersion: Int!
        arrivedAt: DateTime!
        calledAt: DateTime
        completedAt: DateTime
        replayed: Boolean
      }

      type Query {
        episodePolicyWorkspace(facilityId: ID!, beforeRevision: Int, take: Int): JSON!
        episodeClosureWorkspace(encounterId: ID!, beforeVersion: Int, beforeRejectedId: ID, take: Int): JSON!
        episodeChildWorkspace(encounterId: ID!, model: String!, cursorId: ID, childId: ID, beforeChildVersion: Int, take: Int): JSON!
        labResultReadback(resultId: ID, command: LabResultWorkflowInput, correctionCommand: LabResultCorrectionInput, beforeVersion: Int): JSON!
        recoverEpisodeClosure(encounterId: ID!, operationKey: String!): JSON!
        redirectToInit: Boolean
        hospitalBranding: HospitalBranding
        bookableAppointmentTypes: [BookableAppointmentType!]!
        bookableProviders: [BookableProviderEntry!]!
        availableAppointmentSlots(
          appointmentTypeId: ID!
          providerId: ID!
          facilityId: ID!
          date: String!
        ): [AvailableAppointmentSlot!]!
        intakeFormByAccessCode(accessCode: String!): PatientIntakeForm
        appointmentScheduleConflicts(
          facilityId: ID!
          providerId: ID!
          startsAt: String!
          endsAt: String!
          excludeAppointmentId: ID
        ): ScheduleConflictResult!
        workflowPatientCandidates(facilityId: ID!, search: String!, take: Int): [WorkflowPatientCandidate!]!
        workflowEncounterCandidates(facilityId: ID!, patientId: ID!, search: String!, take: Int, skip: Int): [WorkflowEncounterCandidate!]!
      }

      type Mutation {
        reviewEpisodePolicy(data: EpisodePolicyReviewInput!): JSON!
        bootstrapHospital(secret: String!, data: HospitalBootstrapInput!): HospitalBootstrapResult!
        sendUserPasswordResetLink(email: String!): Boolean!
        redeemUserPasswordResetToken(email: String!, token: String!, password: String!): RedeemUserPasswordResetTokenResult
        updateActiveUser(data: UserUpdateProfileInput!): User

        registerPatient(data: PatientRegistrationInput!): PatientRegistrationResult!
        recordConsentDecision(data: ConsentDecisionWorkflowInput!): ConsentDecisionResult!
        arriveAppointment(appointmentId: ID!, idempotencyKey: String!, reasonCode: String): CareQueueResult!
        transitionCareQueue(operationKey: String!, ticketId: ID!, toStatus: String!, expectedVersion: Int!, encounterId: ID): CareQueueResult!
        dispatchClinicalOutbox(limit: Int): ClinicalOutboxDispatchResult!
        admitPatient(data: AdmissionWorkflowInput!): ControlledClinicalResult!
        transitionAdmission(operationKey: String!, admissionId: ID!, toStatus: String!, expectedVersion: Int!, bedId: ID, reasonCode: String, dischargeDisposition: String): ControlledClinicalResult!
        transitionBedReadiness(operationKey: String!, bedId: ID!, toStatus: String!, expectedVersion: Int!): ControlledBedResult!
        placeMedicalOrder(data: MedicalOrderWorkflowInput!): ControlledClinicalResult!
        transitionMedicalOrder(operationKey: String!, orderId: ID!, toStatus: String!, expectedVersion: Int!): ControlledClinicalResult!
        recordLabResult(data: LabResultWorkflowInput!): ControlledClinicalResult!
        transitionLabResult(operationKey: String!, resultId: ID!, toStatus: String!, expectedVersion: Int!): ControlledClinicalResult!
        correctLabResult(data: LabResultCorrectionInput!): ControlledClinicalResult!
        recordPrescription(data: PrescriptionWorkflowInput!): ControlledClinicalResult!
        transitionPrescription(operationKey: String!, prescriptionId: ID!, toStatus: String!, expectedVersion: Int!): ControlledClinicalResult!
        scheduleProcedure(data: ProcedureWorkflowInput!): ControlledClinicalResult!
        transitionProcedure(operationKey: String!, procedureId: ID!, toStatus: String!, expectedVersion: Int!): ControlledClinicalResult!
        establishCarePlan(data: CarePlanWorkflowInput!): ControlledClinicalResult!
        transitionCarePlan(operationKey: String!, carePlanId: ID!, toStatus: String!, expectedVersion: Int!): ControlledClinicalResult!
        prepareInsuranceClaim(data: InsuranceClaimWorkflowInput!): ControlledClinicalResult!
        transitionInsuranceClaim(operationKey: String!, claimId: ID!, toStatus: String!, expectedVersion: Int!, reasonCode: String, notes: String): ControlledClinicalResult!
        recordPatientCoverage(data: PatientCoverageWorkflowInput!): ControlledClinicalResult!
        transitionPatientCoverage(operationKey: String!, coverageId: ID!, toStatus: String!, expectedVersion: Int!, reasonCode: String): ControlledClinicalResult!
        recordPatientPayment(data: PatientPaymentWorkflowInput!): ControlledClinicalResult!
        transitionPatientPayment(operationKey: String!, paymentId: ID!, toStatus: String!, expectedVersion: Int!, reasonCode: String, externalReference: String): ControlledClinicalResult!
        requestPatientRefund(data: PatientRefundWorkflowInput!): ControlledClinicalResult!
        transitionPatientRefund(operationKey: String!, refundId: ID!, toStatus: String!, expectedVersion: Int!, reasonCode: String, externalReference: String): ControlledClinicalResult!
        registerInventoryItem(data: InventoryItemWorkflowInput!): OperationalInventoryResult!
        transitionInventoryItem(operationKey: String!, itemId: ID!, expectedVersion: Int!, toStatus: String!, reasonCode: String!): OperationalInventoryResult!
        moveInventory(data: InventoryMovementWorkflowInput!): OperationalInventoryResult!
        draftClinicalDocument(data: ClinicalDocumentWorkflowInput!): ControlledClinicalResult!
        transitionClinicalDocument(operationKey: String!, documentId: ID!, toStatus: String!, expectedVersion: Int!, reason: String): ControlledClinicalResult!
        amendClinicalDocument(data: ClinicalDocumentAmendmentInput!): ControlledClinicalResult!
        collectSpecimen(data: SpecimenWorkflowInput!): ControlledClinicalResult!
        transitionSpecimen(operationKey: String!, specimenId: ID!, toStatus: String!, expectedVersion: Int!, reason: String): ControlledClinicalResult!
        recordVitalSign(data: VitalSignWorkflowInput!): VitalSignWorkflowResult!
        reserveBed(data: BedReservationWorkflowInput!): ControlledClinicalResult!
        releaseBedReservation(operationKey: String!, reservationId: ID!, expectedVersion: Int!, reasonCode: String!): ControlledClinicalResult!
        registerCommunicationTemplate(data: CommunicationTemplateWorkflowInput!): ControlledClinicalResult!
        reviseCommunicationTemplate(operationKey: String!, templateId: ID!, expectedVersion: Int!, name: String!, subjectTemplate: String, bodyTemplate: String!, toStatus: String!): ControlledClinicalResult!
        setCommunicationPreference(data: CommunicationPreferenceWorkflowInput!): ControlledClinicalResult!
        installIntegration(data: IntegrationInstallationWorkflowInput!): IntegrationInstallationWorkflowResult!
        transitionIntegrationInstallation(operationKey: String!, installationId: ID!, expectedVersion: Int!, toStatus: String!): ControlledClinicalResult!
        issueMachineCredential(data: MachineCredentialWorkflowInput!): MachineCredentialWorkflowResult!
        revokeMachineCredential(operationKey: String!, credentialId: ID!, expectedVersion: Int!): ControlledClinicalResult!
        dispatchIntegrationOutbox(limit: Int): IntegrationDispatchResult!
        linkExternalIdentity(data: ExternalIdentityWorkflowInput!): ExternalIdentityWorkflowResult!
        establishRetentionPolicy(data: RetentionPolicyWorkflowInput!): ControlledClinicalResult!
        transitionRetentionPolicy(operationKey: String!, policyId: ID!, expectedVersion: Int!, toStatus: String!): ControlledClinicalResult!
        placeRecordHold(data: RecordHoldWorkflowInput!): ControlledClinicalResult!
        releaseRecordHold(operationKey: String!, holdId: ID!, expectedVersion: Int!, reasonCode: String!): ControlledClinicalResult!
        recordRetentionDisposition(data: RetentionDispositionWorkflowInput!): RetentionDispositionWorkflowResult!
        previewInventoryImport(data: InventoryImportPreviewInput!): ImportPreviewWorkflowResult!
        applyInventoryImport(operationKey: String!, batchId: ID!, expectedVersion: Int!): ControlledClinicalResult!
        rollbackInventoryImport(operationKey: String!, batchId: ID!, expectedVersion: Int!, reasonCode: String!): ControlledClinicalResult!
        requestExportJob(data: ExportJobWorkflowInput!): ExportJobWorkflowResult!
        processExportJob(operationKey: String!, jobId: ID!, expectedVersion: Int!): ControlledClinicalResult!
        applyHospitalOnboarding(configuration: JSON!): HospitalOnboardingResult!
        createOnboardingAppointment(data: OnboardingAppointmentInput!): OnboardingAppointmentResult!
        issueIntakeForm(data: IntakeIssueInput!): OneTimeAccessResult!

        requestAppointment(
          appointmentTypeId: ID!
          providerId: ID!
          facilityId: ID!
          startsAt: String!
          patient: PatientAppointmentRequestInput!
          reasonForVisit: String
          preferredContactMethod: String
          consent: WorkflowConsentInput!
        ): AppointmentRequestResult

        submitIntakeForm(
          accessCode: String!
          responses: JSON!
          patientUpdates: PatientIntakeUpdateInput
          consent: WorkflowConsentInput!
        ): PatientIntakeForm

        transitionAppointment(
          operationKey: String!
          appointmentId: ID!
          toStatus: String!
          expectedVersion: Int!
          reason: String
          operationalNotes: String
        ): AppointmentTransitionResult!

        transitionPatientMessage(
          operationKey: String!
          messageId: ID!
          toStatus: String!
          expectedVersion: Int!
          reasonCode: String
        ): ControlledClinicalResult!

        sendSecurePatientMessage(
          operationKey: String!
          facilityId: ID!
          patientId: ID!
          appointmentId: ID
          installationId: ID
          templateId: ID
          channel: String!
          purpose: String!
          subject: String
          body: String!
        ): SecurePatientMessageResult!

        openEncounter(data: EncounterWorkflowInput!): EncounterOpenResult!

        transitionEncounter(
          operationKey: String!
          encounterId: ID!
          toStatus: String!
          expectedVersion: Int!
          diagnosisSummary: String
          reason: String
          expectedReviewFingerprint: String
          reviewedTuple: JSON
        ): EncounterTransitionResult!

        transitionIntakeReview(
          operationKey: String!
          intakeFormId: ID!
          toStatus: String!
          expectedVersion: Int!
          reviewNotes: String
        ): IntakeTransitionResult!
      }
    `,
    resolvers: {
      Query: {
        episodePolicyWorkspace,
        episodeClosureWorkspace,
        episodeChildWorkspace,
        labResultReadback,
        recoverEpisodeClosure,
        redirectToInit,
        hospitalBranding: getHospitalBranding,
        bookableAppointmentTypes: getBookableAppointmentTypes,
        bookableProviders: getBookableProviders,
        availableAppointmentSlots: getAvailableAppointmentSlots,
        intakeFormByAccessCode: getIntakeFormByAccessCode,
        appointmentScheduleConflicts,
        workflowPatientCandidates,
        workflowEncounterCandidates,
      },
      Mutation: {
        reviewEpisodePolicy,
        bootstrapHospital,
        sendUserPasswordResetLink,
        redeemUserPasswordResetToken,
        updateActiveUser,
        requestAppointment,
        submitIntakeForm,
        transitionAppointment,
        sendSecurePatientMessage,
        transitionPatientMessage,
        openEncounter,
        transitionEncounter,
        transitionIntakeReview,
        registerPatient,
        recordConsentDecision,
        arriveAppointment,
        transitionCareQueue,
        dispatchClinicalOutbox,
        admitPatient,
        transitionAdmission,
        transitionBedReadiness,
        placeMedicalOrder: createMedicalOrder,
        transitionMedicalOrder,
        recordLabResult,
        transitionLabResult,
        correctLabResult,
        recordPrescription: createPrescription,
        transitionPrescription,
        scheduleProcedure: createProcedure,
        transitionProcedure,
        establishCarePlan: createCarePlan,
        transitionCarePlan,
        prepareInsuranceClaim,
        transitionInsuranceClaim,
        recordPatientCoverage,
        transitionPatientCoverage,
        recordPatientPayment,
        transitionPatientPayment,
        requestPatientRefund,
        transitionPatientRefund,
        registerInventoryItem: createInventoryItem,
        transitionInventoryItem,
        moveInventory,
        draftClinicalDocument: createClinicalDocument,
        transitionClinicalDocument,
        amendClinicalDocument,
        collectSpecimen,
        transitionSpecimen,
        recordVitalSign,
        reserveBed,
        releaseBedReservation,
        registerCommunicationTemplate: createCommunicationTemplate,
        reviseCommunicationTemplate,
        setCommunicationPreference,
        installIntegration: createIntegrationInstallation,
        transitionIntegrationInstallation,
        issueMachineCredential,
        revokeMachineCredential,
        dispatchIntegrationOutbox,
        linkExternalIdentity,
        establishRetentionPolicy: createRetentionPolicy,
        transitionRetentionPolicy,
        placeRecordHold,
        releaseRecordHold,
        recordRetentionDisposition,
        previewInventoryImport,
        applyInventoryImport,
        rollbackInventoryImport,
        requestExportJob,
        processExportJob,
        applyHospitalOnboarding,
        createOnboardingAppointment,
        issueIntakeForm,
      },
    },
  });
}
