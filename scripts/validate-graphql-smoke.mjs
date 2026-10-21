import fs from 'node:fs'
import { buildSchema, parse, validate } from 'graphql'

const schema = buildSchema(fs.readFileSync('schema.graphql', 'utf8'))

function operationFromSource(filePath, operationName) {
  const source = fs.readFileSync(filePath, 'utf8')
  const markerIndex = source.indexOf(`query ${operationName}`)
  if (markerIndex < 0) throw new Error(`Could not find ${operationName} in ${filePath}`)
  const start = source.lastIndexOf('`', markerIndex)
  const end = source.indexOf('`', markerIndex)
  if (start < 0 || end < 0) throw new Error(`Could not extract ${operationName} from ${filePath}`)
  return source.slice(start + 1, end)
}

const operations = {
  appointmentStatusCounts: operationFromSource(
    'features/platform/appointments/actions/appointments.ts',
    'AppointmentStatusCounts',
  ),
  intakeStatusCounts: operationFromSource(
    'features/platform/intake/actions/intake.ts',
    'IntakeStatusCounts',
  ),
  practiceReportsSummary: operationFromSource(
    'features/platform/reports/actions/practiceReports.ts',
    'PracticeReportSummary',
  ),
  practiceReportAppointmentsPage: operationFromSource(
    'features/platform/reports/actions/practiceReports.ts',
    'PracticeReportAppointmentPage',
  ),
  practiceReportIntakePage: operationFromSource(
    'features/platform/reports/actions/practiceReports.ts',
    'PracticeReportIntakePage',
  ),
  practiceReportMessagesPage: operationFromSource(
    'features/platform/reports/actions/practiceReports.ts',
    'PracticeReportMessagePage',
  ),
  practiceReportInventoryPage: operationFromSource(
    'features/platform/reports/actions/practiceReports.ts',
    'PracticeReportInventoryPage',
  ),
  bookableProviders: /* GraphQL */ `
    query BookableProvidersSmoke {
      bookableProviders {
        id
        displayName
        imagePath
        imageAltText
        appointmentTypes { id name slug }
      }
    }
  `,
  bookableAppointmentTypes: /* GraphQL */ `
    query BookableAppointmentTypesSmoke {
      bookableAppointmentTypes {
        id
        name
        slug
        durationMinutes
        providers { id displayName }
      }
    }
  `,
  availableAppointmentSlots: /* GraphQL */ `
    query AvailableAppointmentSlotsSmoke($appointmentTypeId: ID!, $providerId: ID!, $facilityId: ID!, $date: String!) {
      availableAppointmentSlots(appointmentTypeId: $appointmentTypeId, providerId: $providerId, facilityId: $facilityId, date: $date) {
        providerId
        providerName
        facilityId
        facilityName
        facilityTimeZone
        followUpMode
        appointmentTypeId
        appointmentTypeName
        startsAt
        endsAt
        durationMinutes
        remainingCapacity
      }
    }
  `,
  requestAppointment: /* GraphQL */ `
    mutation RequestAppointmentSmoke(
      $appointmentTypeId: ID!
      $providerId: ID!
      $facilityId: ID!
      $startsAt: String!
      $patient: PatientAppointmentRequestInput!
      $reasonForVisit: String
      $preferredContactMethod: String
      $consent: WorkflowConsentInput!
    ) {
      requestAppointment(
        appointmentTypeId: $appointmentTypeId
        providerId: $providerId
        facilityId: $facilityId
        startsAt: $startsAt
        patient: $patient
        reasonForVisit: $reasonForVisit
        preferredContactMethod: $preferredContactMethod
        consent: $consent
      ) {
        id
        appointmentNumber
        status
        patient { id displayName }
        intakeForms { id accessCode status }
      }
    }
  `,
  intakeFormByAccessCode: /* GraphQL */ `
    query IntakeFormByAccessCodeSmoke($accessCode: String!) {
      intakeFormByAccessCode(accessCode: $accessCode) {
        id
        title
        status
        accessCode
        patient { id displayName email phone }
        appointment { id appointmentNumber startsAt facilityName facilityTimeZone }
      }
    }
  `,
  submitIntakeForm: /* GraphQL */ `
    mutation SubmitIntakeFormSmoke($accessCode: String!, $responses: JSON!, $patientUpdates: PatientIntakeUpdateInput, $consent: WorkflowConsentInput!) {
      submitIntakeForm(accessCode: $accessCode, responses: $responses, patientUpdates: $patientUpdates, consent: $consent) {
        id
        title
        status
        submittedAt
      }
    }
  `,
  scheduleConflicts: /* GraphQL */ `
    query ScheduleConflictsSmoke($facilityId: ID!, $providerId: ID!, $startsAt: String!, $endsAt: String!, $excludeAppointmentId: ID) {
      appointmentScheduleConflicts(facilityId: $facilityId, providerId: $providerId, startsAt: $startsAt, endsAt: $endsAt, excludeAppointmentId: $excludeAppointmentId) {
        withinAvailability
        hasConflict
        conflicts { source id reference status startsAt endsAt }
      }
    }
  `,
  transitionAppointment: /* GraphQL */ `
    mutation TransitionAppointmentSmoke($operationKey: String!, $appointmentId: ID!, $toStatus: String!, $expectedVersion: Int!, $reason: String, $operationalNotes: String) {
      transitionAppointment(operationKey: $operationKey, appointmentId: $appointmentId, toStatus: $toStatus, expectedVersion: $expectedVersion, reason: $reason, operationalNotes: $operationalNotes) {
        id appointmentNumber fromStatus status startsAt endsAt checkInAt completedAt cancellationReason
      }
    }
  `,
  securePatientMessage: /* GraphQL */ `
    mutation SecurePatientMessageSmoke($operationKey: String!, $facilityId: ID!, $patientId: ID!, $appointmentId: ID, $channel: String!, $purpose: String!, $subject: String, $body: String!) {
      sendSecurePatientMessage(operationKey: $operationKey, facilityId: $facilityId, patientId: $patientId, appointmentId: $appointmentId, channel: $channel, purpose: $purpose, subject: $subject, body: $body) {
        id status channel direction recordedAt patientId appointmentId
      }
    }
  `,
  transitionIntakeReview: /* GraphQL */ `
    mutation TransitionIntakeReviewSmoke($operationKey: String!, $intakeFormId: ID!, $toStatus: String!, $expectedVersion: Int!, $reviewNotes: String) {
      transitionIntakeReview(operationKey: $operationKey, intakeFormId: $intakeFormId, toStatus: $toStatus, expectedVersion: $expectedVersion, reviewNotes: $reviewNotes) {
        id fromStatus status reviewedAt reviewedById
      }
    }
  `,
  openEncounter: /* GraphQL */ `
    mutation OpenEncounterSmoke($data: EncounterWorkflowInput!) {
      openEncounter(data: $data) { id encounterNumber status transitionVersion replayed }
    }
  `,
  transitionEncounter: /* GraphQL */ `
    mutation TransitionEncounterSmoke($operationKey: String!, $encounterId: ID!, $toStatus: String!, $expectedVersion: Int!, $diagnosisSummary: String, $reason: String) {
      transitionEncounter(operationKey: $operationKey, encounterId: $encounterId, toStatus: $toStatus, expectedVersion: $expectedVersion, diagnosisSummary: $diagnosisSummary, reason: $reason) {
        id encounterNumber fromStatus status transitionVersion startedAt endedAt
      }
    }
  `,
  controlledHospitalOperations: /* GraphQL */ `
    mutation ControlledHospitalOperationsSmoke($admission: AdmissionWorkflowInput!, $order: MedicalOrderWorkflowInput!, $result: LabResultWorkflowInput!, $correction: LabResultCorrectionInput!, $prescription: PrescriptionWorkflowInput!, $procedure: ProcedureWorkflowInput!, $plan: CarePlanWorkflowInput!, $claim: InsuranceClaimWorkflowInput!) {
      admitPatient(data: $admission) { id status transitionVersion replayed }
      placeMedicalOrder(data: $order) { id status transitionVersion replayed }
      recordLabResult(data: $result) { id status transitionVersion replayed }
      correctLabResult(data: $correction) { id status transitionVersion replayed }
      recordPrescription(data: $prescription) { id status transitionVersion replayed }
      scheduleProcedure(data: $procedure) { id status transitionVersion replayed }
      establishCarePlan(data: $plan) { id status transitionVersion replayed }
      prepareInsuranceClaim(data: $claim) { id status transitionVersion replayed }
    }
  `,
  controlledHospitalQueues: /* GraphQL */ `
    query ControlledHospitalQueuesSmoke {
      admissions(take: 1) { id status transitionVersion facility { id } patient { id } bed { id } }
      beds(take: 1) { id status currentPatient { id } }
      bedOccupancyEvents(take: 1) { id eventType facility { id } patient { id } }
      medicalOrders(take: 1) { id status transitionVersion facility { id } }
      labResults(take: 1) { id status transitionVersion facility { id } }
      prescriptions(take: 1) { id status transitionVersion facility { id } }
      procedures(take: 1) { id status transitionVersion facility { id } }
      carePlans(take: 1) { id status transitionVersion facility { id } }
      insuranceClaims(take: 1) { id status transitionVersion facility { id } }
    }
  `,
  careQueueOperations: /* GraphQL */ `
    mutation CareQueueOperationsSmoke($appointmentId: ID!, $key: String!, $operationKey: String!, $ticketId: ID!, $version: Int!) {
      arriveAppointment(appointmentId: $appointmentId, idempotencyKey: $key) { id status transitionVersion replayed }
      transitionCareQueue(operationKey: $operationKey, ticketId: $ticketId, toStatus: "called", expectedVersion: $version) { id status transitionVersion }
      dispatchClinicalOutbox(limit: 1) { claimed delivered }
    }
  `,
  careQueuePage: /* GraphQL */ `
    query CareQueuePageSmoke {
      careQueueTickets(take: 1) {
        id ticketNumber status transitionVersion patient { displayName }
        appointment { appointmentNumber }
        encounter { id encounterNumber }
      }
      appointments(where: { status: { equals: "confirmed" } }, take: 1) {
        id appointmentNumber startsAt patient { displayName } provider { displayName } facility { name }
      }
    }
  `,
  operationsWorkspaceOptions: /* GraphQL */ `
    query OperationsWorkspaceOptionsSmoke {
      facilities(where: { status: { equals: "active" } }, take: 1) { id name }
      departments(where: { status: { equals: "active" } }, take: 1) { id name facilities { name } }
      patients(where: { status: { equals: "active" } }, take: 1) { id displayName }
      patientCoverages(where: { status: { equals: "active" } }, take: 1) { id coverageNumber payerName patient { displayName } }
      appointments(where: { status: { in: ["checked_in", "in_visit"] } }, take: 1) {
        id appointmentNumber patient { displayName } provider { displayName } facility { name }
      }
      encounters(where: { status: { in: ["open", "in_progress"] } }, take: 1) {
        id encounterNumber status patient { displayName } facility { name }
      }
      providers(where: { status: { equals: "active" } }, take: 1) { id displayName specialty }
      clinicians(where: { active: { equals: true } }, take: 1) { id displayName clinicianType }
      beds(where: { status: { equals: "available" } }, take: 1) {
        id bedNumber room { roomNumber ward { name department { facilities { name } } } }
      }
      labTests(where: { active: { equals: true } }, take: 1) { id name code }
      medicalOrders(where: { status: { in: ["draft", "ordered", "in_progress"] } }, take: 1) {
        id orderNumber orderType status patient { displayName }
      }
      labResults(where: { status: { in: ["final", "acknowledged", "corrected"] } }, take: 1) {
        id resultNumber version status patient { displayName } supersedingResult { id }
      }
    }
  `,
  registerPatient: /* GraphQL */ `
    mutation RegisterPatientSmoke($data: PatientRegistrationInput!) {
      registerPatient(data: $data) {
        status replayed registrationId patientId identifierId medicalRecordNumber duplicateResolution
        candidates { patientId displayName dateOfBirth maskedEmail maskedPhone reasons }
      }
    }
  `,
  registrationWorkspace: /* GraphQL */ `
    query RegistrationWorkspaceSmoke {
      facilities(take: 1) { id name }
      patientRegistrations(take: 1) {
        id status duplicateResolution createdAt
        facility { name }
        patient { displayName }
        identifier { maskedValue }
      }
    }
  `,
  operationalFabricMutations: /* GraphQL */ `
    mutation OperationalFabricMutationsSmoke(
      $coverage: PatientCoverageWorkflowInput!
      $payment: PatientPaymentWorkflowInput!
      $inventory: InventoryItemWorkflowInput!
      $template: CommunicationTemplateWorkflowInput!
      $installation: IntegrationInstallationWorkflowInput!
      $policy: RetentionPolicyWorkflowInput!
      $import: InventoryImportPreviewInput!
      $export: ExportJobWorkflowInput!
      $vital: VitalSignWorkflowInput!
    ) {
      recordPatientCoverage(data:$coverage){id status transitionVersion replayed}
      recordPatientPayment(data:$payment){id status transitionVersion replayed}
      registerInventoryItem(data:$inventory){id status transitionVersion quantityOnHand quantityReserved replayed}
      registerCommunicationTemplate(data:$template){id status transitionVersion replayed}
      installIntegration(data:$installation){id status transitionVersion installationKey signingSecret replayed}
      establishRetentionPolicy(data:$policy){id status transitionVersion replayed}
      previewInventoryImport(data:$import){id status transitionVersion rowCount errorCount replayed}
      requestExportJob(data:$export){id status transitionVersion accessToken expiresAt replayed}
      recordVitalSign(data:$vital){id recordedAt replayed}
    }
  `,
  operationalFabricWorkspace: /* GraphQL */ `
    query OperationalFabricWorkspaceSmoke {
      patientCoverages(take:1){id status facility{id} patient{id}}
      patientPayments(take:1){id status transitionVersion amountCents}
      patientRefunds(take:1){id status transitionVersion amountCents}
      inventoryItems(take:1){id status transitionVersion quantityOnHand quantityReserved}
      integrationInstallations(take:1){id status transitionVersion}
      machineCredentials(take:1){id status transitionVersion keyPrefix}
      retentionPolicies(take:1){id status transitionVersion}
      retentionDispositions(take:1){id decision reviewedAt}
      importBatches(take:1){id status transitionVersion rowCount errorCount}
      exportJobs(take:1){id status transitionVersion expiresAt}
      clinicalDocuments(take:1){id status transitionVersion}
      specimens(take:1){id status transitionVersion}
    }
  `,
  batch3HospitalWorkflows: /* GraphQL */ `
    mutation Batch3HospitalWorkflowsSmoke(
      $configuration: JSON!
      $consent: ConsentDecisionWorkflowInput!
      $operationKey: String!
      $coverageId: ID!
      $coverageVersion: Int!
      $reservation: BedReservationWorkflowInput!
      $reservationId: ID!
      $reservationVersion: Int!
    ) {
      applyHospitalOnboarding(configuration: $configuration) { status referenceDate counts intakeLinks { label href expiresAt } }
      recordConsentDecision(data: $consent) { id decision effectiveAt replayed }
      transitionPatientCoverage(operationKey: $operationKey, coverageId: $coverageId, toStatus: "active", expectedVersion: $coverageVersion, reasonCode: "reviewed_evidence") { id status transitionVersion replayed }
      reserveBed(data: $reservation) { id status transitionVersion replayed }
      releaseBedReservation(operationKey: $operationKey, reservationId: $reservationId, expectedVersion: $reservationVersion, reasonCode: "plan_changed") { id status transitionVersion replayed }
    }
  `,
  hospitalBranding: /* GraphQL */ `
    query HospitalBrandingSmoke {
      hospitalBranding { name shortName market description locationName serviceArea addressLine1 city region postalCode supportPhone supportEmail media }
    }
  `,
  workflowPatientCandidates: /* GraphQL */ `
    query WorkflowPatientCandidatesSmoke($facilityId: ID!, $search: String!) {
      workflowPatientCandidates(facilityId: $facilityId, search: $search, take: 25) { id displayName }
    }
  `,
  workflowEncounterCandidates: /* GraphQL */ `
    query WorkflowEncounterCandidatesSmoke($facilityId: ID!, $patientId: ID!, $search: String!) {
      workflowEncounterCandidates(facilityId: $facilityId, patientId: $patientId, search: $search, take: 25, skip: 0) { id encounterNumber status }
    }
  `,
  patientWorkspace: /* GraphQL */ `
    query PatientWorkspaceSmoke($where:PatientWhereInput!){

      patients(where:$where,take:1){id displayName status appointmentsCount facilities{name} identifiers{maskedValue}}
      patientsCount(where:$where)
    }
  `,
  clinicalOperationsDashboard: /* GraphQL */ `
    query ClinicalOperationsDashboardSmoke {
      encounters(take: 1) { id patient { displayName } provider { displayName } department { name } }
      admissions(take: 1) { id patient { displayName } room { roomNumber } bed { bedNumber } }
      departments(take: 1) { id name images(take: 1) { imagePath altText } }
      facilities(take: 1) { id name departments { name } images(take: 1) { imagePath altText } }
      wards(take: 1) { id name department { name } }
      rooms(take: 1) { id roomNumber ward { name } }
      beds(take: 1) { id bedNumber currentPatient { displayName } }
      clinicians(take: 1) { id displayName department { name } images(take: 1) { imagePath altText } }
      vitalSigns(take: 1) { id patient { displayName } encounter { encounterNumber } }
      medicalOrders(take: 1) { id patient { displayName } }
      prescriptions(take: 1) { id patient { displayName } }
      labTests(take: 1) { id name }
      labResults(take: 1) { id patient { displayName } labTest { name } }
      procedures(take: 1) { id patient { displayName } provider { displayName } }
      insuranceClaims(take: 1) { id patient { displayName } }
      carePlans(take: 1) { id patient { displayName } provider { displayName } }
    }
  `,
}

let failures = 0
for (const [name, source] of Object.entries(operations)) {
  const errors = validate(schema, parse(source))
  if (errors.length) {
    failures += 1
    console.error(`GraphQL smoke validation failed for ${name}:`)
    for (const error of errors) console.error(`- ${error.message}`)
  }
}

if (failures) process.exit(1)
console.log(`GraphQL smoke documents validated: ${Object.keys(operations).length} operations.`)
