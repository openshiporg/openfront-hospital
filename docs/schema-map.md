# Openfront Hospital: schema map

Source: `features/keystone/models/**` (63 lists), `features/keystone/mutations/**`, `features/keystone/access.ts`, onboarding (`mutations/onboarding/applyHospitalOnboarding.ts`).

Two kinds of list:
- **Master data**: plain Keystone CRUD behind permissions, usually `canAccessAllClinicalData`. Covers Facility, Department, Ward, Room, Bed (create only), Provider, Clinician, AppointmentType, LabTest, ProviderScheduleBlock, HospitalProfile, User and Role.
- **Controlled clinical and operational records**: GraphQL create, update and delete are denied or omitted. Every write goes through a workflow mutation that carries `operationKey`, `expectedVersion` and a `transitionVersion`, writes a `WorkflowTransition` and audit row, and may enqueue a `ClinicalOutboxEvent`.

## Lists

| List | Purpose | Key fields | Relationships | Created by | States / transitions |
|---|---|---|---|---|---|
| HospitalProfile | Public identity of the practice | name, shortName, logoIcon, logoColor, brandTheme, address, supportPhone/Email, media, status | — | Merchant (onboarding, store settings) | active / inactive |
| Facility | Site boundary for all data (clinic, hospital, telehealth) | name, slug, facilityType, timeZone, phone, city, region, postalCode, status | departments, providers, staff (User), patients, appointments, encounters, images | Merchant (onboarding or admin) | active / inactive |
| FacilityImage | Facility photo | image, altText, order | facility | Merchant | — |
| Department | Clinical department | name, code, description, phone, email, status | facilities, wards, clinicians, images | Merchant | active / closed |
| DepartmentImage | Department photo | image, altText, order | department | Merchant | — |
| Ward | Inpatient unit | name, floor, capacity, status | department, rooms | Merchant | open / closed |
| Room | Room in a ward | roomNumber, roomType (private / semi_private / icu / procedure), status | ward, beds | Merchant | available / occupied / cleaning / maintenance |
| Bed | Bed in a room | bedNumber, status, transitionVersion | facility, room, currentPatient | Merchant creates it; status changes only through `transitionBedReadiness` and admissions | available / reserved / occupied / cleaning / out_of_service (available → reserved → occupied → cleaning → available) |
| BedOccupancyEvent | Bed history | eventType, occurredAt | facility, patient, admission, bed, previousBed | System | assigned / transferred / released / cleaning_started / available |
| BedReservation | Bed hold before admission | reservationNumber, expiresAt | facility, bed, patient | Staff: `reserveBed`, `releaseBedReservation` | active → consumed / released / expired |
| Provider | Bookable clinician directory entry | firstName, lastName, displayName, credentials, specialty, bio, locationName, status | user, facilities, appointmentTypes, scheduleBlocks, appointments, clinicians | Merchant | active / unavailable / inactive |
| Clinician | Care-team member record (license, department) | displayName, clinicianType (physician / nurse / therapist / technician), licenseNumber, email, phone, active | provider, department, images | Merchant | active flag |
| ClinicianImage | Clinician portrait | image, altText, order | clinician | Merchant | — |
| AppointmentType | Visit catalog used by the storefront | name, slug, description, durationMinutes, buffers, priceCents, intakeRequirements, status | providers, appointments | Merchant | bookable / internal / paused |
| ProviderScheduleBlock | Provider availability | blockType, startsAt, endsAt, maxAppointments, recurrenceRule, locationName, notes | provider, facility | Scheduler | available / unavailable / on_call / admin_time |
| Appointment | A visit | appointmentNumber, status, startsAt, endsAt, source, reasonForVisit, estimatedFeeCents, cancellationReason, checkInAt, completedAt | patient, provider, appointmentType, facility, intakeForms, messages, consents, careQueueTickets | Customer (`requestAppointment`), staff, onboarding | requested → confirmed → checked_in → in_visit → completed; cancelled / no_show (`transitionAppointment`) |
| Patient | Patient master record | firstName, lastName, dateOfBirth (immutable), email, phone, preferredContactMethod, insuranceSummary, emergency contact, status | user, facilities, identifiers, registrations, appointments, intakeForms, messages, consents, portalAccess | Customer booking, `registerPatient`, staff | active / inactive / archived |
| PatientIdentifier | MRN and external IDs (masked) | identifierType, maskedValue, normalizedValue, status | patient, facility | System (registration) | active / superseded |
| PatientRegistration | Registration provenance and duplicate resolution | status, duplicateResolution, provenance | patient, facility, identifier, consent, auditLog | `registerPatient` | completed; duplicateResolution no_candidate / create_new / link_existing |
| PatientConsent | Consent decisions (versioned) | consentType, decision, policyVersion, statementKey, captureMethod, evidence | patient, appointment, intakeForm, supersedes | Customer (booking, intake), staff (`recordConsentDecision`) | granted / declined / withdrawn; superseding chain |
| PatientPortalAccess | Portal invite record | inviteEmail, invite dates, status | patient, user | No mutation issues invites yet | invited / active / suspended / closed |
| IntakeForm | One-time pre-visit form | title, templateKey, formSchema, responses, status, access dates, reviewNotes | patient, appointment, facility, reviewedBy, consents | System on booking; staff (`issueIntakeForm`); customer (`submitIntakeForm`) | not_sent → sent → in_progress → submitted → needs_review / reviewed (`transitionIntakeReview`) |
| PatientMessage | Outbound and inbound patient messages | purpose, channel, direction, subject, body, status, sentAt, deliveredAt | patient, appointment, facility, template, installation | System, staff (`sendSecurePatientMessage`, `transitionPatientMessage`) | draft / manual_required / queued → sent → delivered / completed; failed; inbound received |
| CommunicationTemplate | Versioned message templates | templateKey, channel, subjectTemplate, version, status | facility | Staff (`registerCommunicationTemplate`, `reviseCommunicationTemplate`) | active / inactive |
| CommunicationPreference | Per-patient channel and purpose preference | channel, purpose, status | facility, patient | Staff (`setCommunicationPreference`) | allowed / opted_out |
| CareQueueTicket | Front-desk arrival queue | ticketNumber, queueDate, queuePosition, priority, status, arrivedAt | facility, appointment, patient, encounter | Staff (`arriveAppointment`, `transitionCareQueue`) | waiting → called → in_care → completed; cancelled (priority routine / time_sensitive) |
| Encounter | Clinical visit episode | encounterNumber, status, chiefComplaint, diagnosisSummary, startedAt, endedAt | patient, provider, department, appointment, facility | Staff (`openEncounter`, `transitionEncounter`) | open → in_progress → closed; cancelled; episode closure policy |
| EpisodeClosurePolicy | Rules for closing an episode (revisioned) | definition, revision, effectiveAt | facility | Staff (`reviewEpisodePolicy`) | revisions |
| Admission | Inpatient stay | admissionNumber, status, admittedAt, dischargedAt, dischargeDisposition, notes | patient, facility, encounter, attendingProvider, room, bed | Staff (`admitPatient`, `transitionAdmission`) | admitted → transferred → discharged |
| VitalSign | Vitals reading | BP, heart rate, respiratory rate, temperature, SpO2, recordedAt | patient, encounter, facility, recordedBy | Staff (`recordVitalSign`) | append-only |
| MedicalOrder | Lab, imaging, medication, procedure or consult order | orderNumber, orderType, status, summary | patient, encounter, facility, orderingProvider | Staff (`placeMedicalOrder`, `transitionMedicalOrder`) | draft → ordered → in_progress → completed; cancelled |
| LabTest | Lab test catalog | code, name, category, specimenType, turnaroundHours, active | — | Merchant | active flag |
| Specimen | Collected specimen | specimenNumber, specimenType, collectedAt, status | patient, order, facility | Staff (`collectSpecimen`, `transitionSpecimen`) | collected → received → processing → disposed; rejected |
| LabResult | Versioned lab result | resultNumber, status, resultValue, referenceRange, abnormalFlag, version | patient, encounter, medicalOrder, labTest, supersedes chain, acknowledgedBy | Staff (`recordLabResult`, `transitionLabResult`, `correctLabResult`) | preliminary → final → acknowledged; corrected; cancelled |
| Prescription | Medication record | prescriptionNumber, medicationName, dosage, frequency, status, recordingBasis | patient, encounter, medicalOrder, provider | Staff (`recordPrescription`, `transitionPrescription`) | draft / recorded_manual → active → held → completed; cancelled |
| Procedure | Scheduled procedure | procedureNumber, procedureName, scheduledAt, completedAt, status | patient, encounter, order, provider | Staff (`scheduleProcedure`, `transitionProcedure`) | scheduled → in_progress → completed; cancelled |
| CarePlan | Care plan | title, goals, interventions, startsAt, endsAt, status | patient, encounter, provider, facility | Staff (`establishCarePlan`, `transitionCarePlan`) | draft → active → completed; cancelled |
| ClinicalDocument | Versioned clinical note | documentNumber, documentType, status, supersedes | patient, encounter, facility | Staff (`draftClinicalDocument`, `transitionClinicalDocument`, `amendClinicalDocument`) | draft → signed → amended / entered_in_error |
| PatientCoverage | Insurance coverage | coverageNumber, payerName, memberId, groupNumber, effectiveAt, status | patient, facility | Staff (`recordPatientCoverage`, `transitionPatientCoverage`) | unverified → active / inactive / rejected |
| InsuranceClaim | Claim | claimNumber, status, payerName, billed/paid cents, denialReason | patient, encounter, coverage, facility, versions | Staff (`prepareInsuranceClaim`, `transitionInsuranceClaim`) | draft → prepared → submitted → external_acknowledged / external_rejected → corrected; cancelled |
| ClaimVersion | Immutable claim snapshot | version, versionKey | claim, coverage, facility | System | append-only |
| PatientPayment | Patient payment | paymentNumber, amountCents, method, receivedAt, refundedAmountCents, status | patient, facility | Staff (`recordPatientPayment`, `transitionPatientPayment`) | pending → succeeded / failed / cancelled |
| PatientRefund | Refund | refundNumber, amountCents, reasonCode, status | payment, facility | Staff (`requestPatientRefund`, `transitionPatientRefund`) | pending → succeeded / failed / cancelled |
| InventoryItem | Supply SKU per facility | sku, quantityOnHand, quantityReserved, reorderPoint, status | facility | Staff (`registerInventoryItem`, `transitionInventoryItem`, imports) | active / inactive |
| InventoryMovement | Stock movement | movementNumber, movementType, quantityDelta, reservedDelta | item, prescription | Staff (`moveInventory`) | append-only |
| ImportBatch | Inventory CSV import | batchNumber, preview, status | facility | Staff (`previewInventoryImport`, `applyInventoryImport`, `rollbackInventoryImport`) | previewed → applied → rolled_back; failed |
| ExportJob | Encrypted data export | jobNumber, filters, status, expiresAt | facility | Staff (`requestExportJob`, `processExportJob`) | queued → processing → ready → expired; failed |
| IntegrationInstallation | External integration | installationKey, kind, allowedEventTypes, status, lastSuccessAt | facility | Staff (`installIntegration`, `transitionIntegrationInstallation`) | active / paused / revoked |
| MachineCredential | Integration credential (digest only) | name, expiresAt, status | facility, createdBy | Staff (`issueMachineCredential`, `revokeMachineCredential`) | active / revoked / expired |
| IntegrationDeliveryAttempt | Outbound delivery attempt | attemptNumber, status, responseStatus | installation | System worker | append-only |
| IntegrationWebhookReceipt | Inbound webhook receipt | receiptKey, requestDigest, status | facility | System | append-only |
| ClinicalOutboxEvent | Outbound event queue | aggregateType, eventKey, status, attempts | facility, installation | System | recorded / pending → processing → delivered; retry; dead_letter |
| ExternalIdentityLink | Link to external system IDs | linkNumber, system, localType, status | — | Staff (`linkExternalIdentity`) | active |
| RetentionPolicy | Retention rules per record type | recordType, status | facility | Staff (`establishRetentionPolicy`, `transitionRetentionPolicy`) | active / inactive |
| RecordHold | Legal hold | holdNumber, status | facility, patient | Staff (`placeRecordHold`, `releaseRecordHold`) | active / released |
| RetentionDisposition | Disposition decision | recordType, decision, cutoffAt | policy, patient, facility | Staff (`recordRetentionDisposition`) | append-only |
| WorkflowTransition | Every controlled transition | aggregateType, from/to status and version, result | auditLog, outboxEvent, patient, facility | System | append-only |
| ClinicalAuditLog | Clinical audit trail | eventType, actorType, occurredAt, metadata | patient, appointment, encounter, intakeForm, consent | System | append-only |
| PhiReadAudit | PHI read audit | operationName, purpose, rootFields, resultCount, success | — | System (GraphQL plugin) | append-only |
| User | Staff and portal login | name, email, password, onboardingStatus, securityVersion | role, facilities, providerProfile, patientProfile | Merchant (init, staff admin) | onboarding not_started / in_progress / completed / dismissed |
| Role | Permission set | 20 `can*` flags | assignedTo | Merchant | — |
| PasswordResetRequest | Reset token digests | tokenDigest, status, expiresAt | user | System | issued → redeemed / superseded |
| RequestRateLimitBucket | Shared rate-limit counters | operation, count | — | System | — |

## Merchant workflows

1. **Set up the practice:** HospitalProfile → Facility → Department → Ward → Room → Bed. Staff accounts: User and Role.
2. **Build the visit catalog:** Provider (and Clinician) → AppointmentType (duration, buffers, price, which providers) → ProviderScheduleBlock (availability).
3. **Take a booking:** the storefront calls `requestAppointment` → Patient + Appointment (requested) + IntakeForm + PatientConsent → staff confirm (`transitionAppointment`) → PatientMessage follow-up.
4. **Prepare the visit:** IntakeForm submitted → staff review (`transitionIntakeReview`).
5. **Arrive and get seen:** `arriveAppointment` → CareQueueTicket → `transitionCareQueue` → `openEncounter` → Encounter in_progress → closed (EpisodeClosurePolicy).
6. **Clinical work inside an encounter:** VitalSign, MedicalOrder → Specimen → LabResult (acknowledge, correct), Prescription, Procedure, CarePlan, ClinicalDocument.
7. **Inpatient:** BedReservation → Admission (bed assigned, BedOccupancyEvent) → transfer → discharge → bed cleaning → available.
8. **Register a walk-in:** `registerPatient` → Patient + PatientIdentifier (MRN) + PatientRegistration (duplicate review) + consent.
9. **Revenue cycle:** PatientCoverage → InsuranceClaim (prepare → submit → acknowledge or reject → correct) with ClaimVersion; PatientPayment → PatientRefund.
10. **Supplies:** InventoryItem → InventoryMovement; CSV ImportBatch.
11. **Communications:** CommunicationTemplate, CommunicationPreference, PatientMessage queue.
12. **Platform operations:** IntegrationInstallation, MachineCredential, outbox; RetentionPolicy, RecordHold, RetentionDisposition; ExportJob.
13. **Oversight:** reports; audit trail (ClinicalAuditLog, WorkflowTransition, PhiReadAudit).

## Coverage (platform pages)

Before this pass, compared with after.

| Workflow / list | Before | After |
|---|---|---|
| HospitalProfile | `/platform/store-settings` (store-settings) | same |
| Facility, Department, Ward, Room, Bed setup | **MISSING** (generic admin lists only) | `/platform/facilities` + `/platform/facilities/[id]` (facilities) |
| Provider, Clinician | **MISSING** (schedules only lists blocks) | `/platform/providers` + `/platform/providers/[id]` (providers) |
| AppointmentType | **MISSING** | `/platform/visit-types` + `/platform/visit-types/[id]` (visit-types) |
| ProviderScheduleBlock | `/platform/schedules` (schedules) | same |
| LabTest | **MISSING** (only used as a selector) | `/platform/lab-tests` (lab-tests) |
| Appointment | `/platform/appointments` (appointments) | same |
| Patient chart (identifiers, appointments, intake, messages, consents, encounters) | **THIN**: list only, no detail | `/platform/patients/[id]` (patients): read-only chart. Demographic edits need a new workflow mutation, because Patient has GraphQL update omitted and email/phone are update-denied |
| PatientRegistration, PatientIdentifier | `/platform/registration` (registration) | same |
| IntakeForm | `/platform/intake` (intake) | same |
| PatientMessage | `/platform/communications` (communications) | same |
| CommunicationTemplate, CommunicationPreference | `/platform/operational-fabric` (operational-fabric) | same |
| CareQueueTicket | `/platform/care-queue` (clinical) | same |
| Encounter, EpisodeClosurePolicy | `/platform/encounters` (clinical) | same |
| Admission, Bed readiness, BedReservation, BedOccupancyEvent | `/platform/inpatient` (operations) | same |
| MedicalOrder, Specimen, LabResult, Prescription, Procedure, CarePlan, ClinicalDocument, VitalSign | `/platform/clinical-fulfillment` + `/platform/encounters` episode workspace (operations, clinical) | same |
| InsuranceClaim, ClaimVersion | `/platform/claims` (operations) | same |
| PatientCoverage, PatientPayment, PatientRefund, PatientConsent | `/platform/operational-fabric` (operational-fabric) | same |
| InventoryItem, InventoryMovement, ImportBatch | `/platform/operational-fabric` (operational-fabric) | same |
| Integrations, credentials, outbox, retention, holds, exports, external identity | `/platform/operational-fabric` (operational-fabric) | same |
| User, Role (staff and permissions) | **MISSING** | `/platform/staff` (staff) |
| ClinicalAuditLog, WorkflowTransition | **MISSING** | `/platform/audit` (audit) |
| Reports | `/platform/reports` (reports) | same |

No page needed:
- BedOccupancyEvent: covered by inpatient.
- ClaimVersion: covered by claims.
- IntegrationDeliveryAttempt, IntegrationWebhookReceipt, ClinicalOutboxEvent: covered by operational-fabric.
- PhiReadAudit: security log, readable in the admin list; audit links to it.
- PasswordResetRequest, RequestRateLimitBucket: system only, never readable.
- PatientPortalAccess: no workflow issues invites; nothing for staff to act on.
- FacilityImage, DepartmentImage, ClinicianImage: edited in the admin item pages.

## Storefront flows

| Flow | Before | After |
|---|---|---|
| Browse care (service lines, visit types) | `/`, `/care`, `/book` | same |
| Clinician detail | **MISSING** (list only) | `/providers/[id]` |
| Locations | **MISSING** (footer address only) | `/locations` |
| Book: visit → clinician, place and time → details | `/book/[slug]` | same |
| Confirmation | Inline receipt with reference and intake link | same |
| Pre-visit intake | `/intake#accessCode=…` | same |
| Account history | **MISSING** | **MISSING**: there are no patient accounts. PatientPortalAccess has no invite or sign-in workflow, and exposing appointment history publicly would need a new authenticated PHI surface. Out of scope for a UI pass. |
