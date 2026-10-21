import 'dotenv/config'
import { createHash, createHmac, randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { PrismaClient } from '@prisma/client'

import { assertLocalGraphqlEndpoint, assertSafeRuntimeDatabase } from './lib/runtime-guard.mjs'

const endpoint = process.env.OPENFRONT_GRAPHQL_URL
const databaseUrl = process.env.DATABASE_URL
const credentialsPath = process.env.OPENFRONT_RUNTIME_ADMIN_PATH
if (!credentialsPath) throw new Error('OPENFRONT_RUNTIME_ADMIN_PATH is required')
assertLocalGraphqlEndpoint(endpoint, 'operational fabric proof')
const guard = assertSafeRuntimeDatabase(databaseUrl, 'operational fabric proof')
if (!guard.disposable) throw new Error('Operational fabric behavior proof requires a disposable Hospital database')

const prisma = new PrismaClient()
const runId = randomUUID().replaceAll('-', '').slice(0, 12)
const prefix = `runtime-fabric-${runId}`
const key = label => `${prefix}-operation-${label}`
const digest = value => createHash('sha256').update(value).digest('hex')
const received = []
const failingEventIds = new Set()

const receiver = createServer(async (request, response) => {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  const body = Buffer.concat(chunks).toString('utf8')
  let payload = null
  try { payload = JSON.parse(body) } catch {}
  received.push({ headers: request.headers, body, payload })
  if (payload?.eventId && failingEventIds.has(payload.eventId)) {
    response.writeHead(500, { 'content-type': 'application/json' })
    response.end('{"retry":true}')
  } else {
    response.writeHead(202, { 'content-type': 'application/json' })
    response.end('{"accepted":true}')
  }
})
await new Promise(resolve => receiver.listen(0, '127.0.0.1', resolve))
const receiverPort = receiver.address().port
const receiverUrl = `http://127.0.0.1:${receiverPort}/events`

async function raw(query, variables = {}, cookie) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30_000),
  })
  const payload = await response.json()
  return { status: response.status, ...payload }
}
function messages(payload) { return payload.errors?.map(error => error.message).join('; ') || '' }
async function gql(name, query, variables = {}, cookie) {
  const payload = await raw(query, variables, cookie)
  if (payload.errors?.length) throw new Error(`${name}: ${messages(payload)}`)
  return payload.data
}
async function denied(name, query, variables, cookie, expected) {
  const payload = await raw(query, variables, cookie)
  const errorText = messages(payload)
  const productionMasked = errorText === 'Unexpected error.'
  if (!payload.errors?.length || (expected && !productionMasked && !errorText.includes(expected))) {
    throw new Error(`${name} was not denied: ${messages(payload) || JSON.stringify(payload)}`)
  }
}
async function authenticate(email, password) {
  const data = await gql('authenticate', `mutation($email:String!,$password:String!){authenticateUserWithPassword(email:$email,password:$password){... on UserAuthenticationWithPasswordSuccess{sessionToken}}}`, { email, password })
  const token = data.authenticateUserWithPassword?.sessionToken
  if (!token) throw new Error('Runtime admin authentication failed')
  return `keystonejs-session=${token}`
}
const controlled = 'id status transitionVersion replayed'

async function signedWebhook(baseUrl, installationKey, credential, signingSecret, payload) {
  const body = JSON.stringify(payload)
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const signature = createHmac('sha256', signingSecret).update(`${timestamp}.${body}`).digest('hex')
  return fetch(`${baseUrl}/api/integrations/${installationKey}/webhook`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${credential}`,
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(body)),
      'x-openfront-timestamp': timestamp,
      'x-openfront-signature': `sha256=${signature}`,
    },
    body,
    signal: AbortSignal.timeout(30_000),
  })
}

try {
  const credentials = JSON.parse(await readFile(credentialsPath, 'utf8'))
  const adminCookie = await authenticate(credentials.email || credentials.identity, credentials.password)
  const facility = await prisma.facility.findFirst({ where: { status: 'active', patients: { some: {} }, providers: { some: {} } }, orderBy: { name: 'asc' } })
  if (!facility) throw new Error('No canonical active facility is available')
  const patient = await prisma.patient.findFirst({ where: { status: 'active', facilities: { some: { id: facility.id } } }, orderBy: { createdAt: 'asc' } })
  const provider = await prisma.provider.findFirst({ where: { status: 'active', facilities: { some: { id: facility.id } } }, orderBy: { createdAt: 'asc' } })
  const clinician = provider ? await prisma.clinician.findFirst({ where: { active: true, providerId: provider.id } }) : null
  let labTest = await prisma.labTest.findFirst({ where: { active: true }, orderBy: { createdAt: 'asc' } })
  if (!labTest) labTest = await prisma.labTest.create({ data: {
    name: 'Runtime fabric panel', code: `${prefix}-lab-test`, category: 'runtime-proof', specimenType: 'synthetic', turnaroundHours: 1, active: true,
  } })
  let room = await prisma.room.findFirst({ where: { ward: { department: { facilities: { some: { id: facility.id } } } } } })
  if (!room) {
    const department = await prisma.department.findFirst({ where: { facilities: { some: { id: facility.id } } }, orderBy: { createdAt: 'asc' } })
    if (!department) throw new Error('Canonical facility department is incomplete')
    const ward = await prisma.ward.create({ data: { name: `${prefix} ward`, departmentId: department.id, floor: 'runtime', status: 'open', capacity: 1 } })
    room = await prisma.room.create({ data: { roomNumber: `${prefix}-ROOM`, wardId: ward.id, roomType: 'private', status: 'available' } })
  }
  if (!patient || !provider || !clinician || !labTest || !room) throw new Error('Canonical clinical fixture relationships are incomplete')

  const encounter = (await gql('open encounter', `mutation($data:EncounterWorkflowInput!){openEncounter(data:$data){id status transitionVersion replayed}}`, { data: {
    operationKey: key('encounter'), facilityId: facility.id, patientId: patient.id, providerId: provider.id, chiefComplaint: 'Local runtime operations proof',
  } }, adminCookie)).openEncounter

  const foreignFacility = await prisma.facility.create({ data: { name: `${prefix} Other`, slug: `${prefix}-other`, status: 'active', facilityType: 'clinic' } })
  const scopedRole = await prisma.role.create({ data: {
    name: `${prefix} scoped role`, canManagePatients: true, canManageBilling: true, canManageInventory: true,
    canManageIntegrations: true, canManageDataPortability: true, canManageRetention: true, canManageCommunications: true,
    canViewReports: true, canAccessDashboard: true,
  } })
  const scopedPassword = `RuntimeFabric-${runId}-Password!`
  const scopedEmail = `${prefix}@example.test`
  await gql('create scoped operator', `mutation($data:UserCreateInput!){createUser(data:$data){id}}`, { data: {
    name: 'Scoped fabric operator', email: scopedEmail, password: scopedPassword,
    role: { connect: { id: scopedRole.id } }, facilities: { connect: [{ id: foreignFacility.id }] },
  } }, adminCookie)
  const scopedCookie = await authenticate(scopedEmail, scopedPassword)
  await denied('cross-facility coverage', `mutation($data:PatientCoverageWorkflowInput!){recordPatientCoverage(data:$data){id}}`, { data: {
    operationKey: key('cross-coverage'), facilityId: facility.id, patientId: patient.id, payerName: 'Blocked payer', memberId: 'blocked-member',
  } }, scopedCookie, 'not found or not accessible')

  const consentType = `${prefix}_release_authorization`
  const consentMutation = `mutation($data:ConsentDecisionWorkflowInput!){recordConsentDecision(data:$data){id decision effectiveAt replayed}}`
  const consentInput = {
    operationKey: key('consent-grant'), facilityId: facility.id, patientId: patient.id,
    consentType, policyVersion: 'runtime-v1', statementKey: 'runtime-release-authorization-v1', decision: 'granted',
  }
  await denied('cross-facility consent', consentMutation, { data: { ...consentInput, operationKey: key('cross-consent') } }, scopedCookie, 'not found or not accessible')
  const consent = (await gql('record consent grant', consentMutation, { data: consentInput }, adminCookie)).recordConsentDecision
  const consentReplay = (await gql('replay consent grant', consentMutation, { data: consentInput }, adminCookie)).recordConsentDecision
  if (consent.id !== consentReplay.id || !consentReplay.replayed || consent.decision !== 'granted') throw new Error('Consent decision replay failed')
  const withdrawalInput = {
    operationKey: key('consent-withdraw'), facilityId: facility.id, patientId: patient.id,
    consentType, policyVersion: 'runtime-v1', statementKey: 'runtime-release-authorization-v1',
    decision: 'withdrawn', reasonCode: 'patient_withdrew', supersedesConsentId: consent.id,
  }
  const withdrawal = (await gql('withdraw consent', consentMutation, { data: withdrawalInput }, adminCookie)).recordConsentDecision
  if (withdrawal.decision !== 'withdrawn') throw new Error('Consent withdrawal was not recorded')
  await denied('second consent withdrawal', consentMutation, { data: { ...withdrawalInput, operationKey: key('consent-withdraw-again') } }, adminCookie, 'current accessible decision')
  const consentHistory = await prisma.patientConsent.findMany({ where: { consentType, patientId: patient.id }, include: { supersedingDecision: true } })
  if (consentHistory.length !== 2 || consentHistory.find(row => row.id === consent.id)?.supersedingDecision?.id !== withdrawal.id) {
    throw new Error('Consent supersession history is incomplete')
  }

  const coverageInput = { operationKey: key('coverage'), facilityId: facility.id, patientId: patient.id, payerName: 'Local Fixture Plan', memberId: `MEM-${runId}`, groupNumber: `GRP-${runId}` }
  const coverage = (await gql('record coverage', `mutation($data:PatientCoverageWorkflowInput!){recordPatientCoverage(data:$data){${controlled}}}`, { data: coverageInput }, adminCookie)).recordPatientCoverage
  const coverageReplay = (await gql('replay coverage', `mutation($data:PatientCoverageWorkflowInput!){recordPatientCoverage(data:$data){${controlled}}}`, { data: coverageInput }, adminCookie)).recordPatientCoverage
  if (coverage.id !== coverageReplay.id || !coverageReplay.replayed) throw new Error('Coverage replay was not exactly once')
  await denied('coverage key mismatch', `mutation($data:PatientCoverageWorkflowInput!){recordPatientCoverage(data:$data){id}}`, { data: { ...coverageInput, payerName: 'Different payer' } }, adminCookie, 'different payload')
  const coverageTransitionQuery = `mutation($operationKey:String!,$id:ID!,$version:Int!){transitionPatientCoverage(operationKey:$operationKey,coverageId:$id,toStatus:"active",expectedVersion:$version,reasonCode:"reviewed_external_evidence"){${controlled}}}`
  const coverageTransitions = await Promise.all([
    raw(coverageTransitionQuery, { operationKey: key('coverage-active'), id: coverage.id, version: 1 }, adminCookie),
    raw(coverageTransitionQuery, { operationKey: key('coverage-active'), id: coverage.id, version: 1 }, adminCookie),
  ])
  if (coverageTransitions.some(payload => payload.errors?.length) || coverageTransitions.filter(payload => payload.data.transitionPatientCoverage.replayed).length !== 1) throw new Error('Coverage transition replay failed')

  const claim = (await gql('prepare claim', `mutation($data:InsuranceClaimWorkflowInput!){prepareInsuranceClaim(data:$data){${controlled}}}`, { data: {
    operationKey: key('claim'), facilityId: facility.id, patientId: patient.id, encounterId: encounter.id, coverageId: coverage.id,
    payerName: 'Local Fixture Plan', billedAmountCents: 12500,
  } }, adminCookie)).prepareInsuranceClaim
  for (const [index, status] of ['prepared', 'submitted'].entries()) {
    await gql(`claim ${status}`, `mutation($operationKey:String!,$id:ID!,$status:String!,$version:Int!){transitionInsuranceClaim(operationKey:$operationKey,claimId:$id,toStatus:$status,expectedVersion:$version,reasonCode:"operator_action"){${controlled}}}`, { operationKey: key(`claim-${status}`), id: claim.id, status, version: index + 1 }, adminCookie)
  }
  if (await prisma.claimVersion.count({ where: { claimId: claim.id } }) !== 3) throw new Error('Claim version history is incomplete')

  const installMutation = `mutation($data:IntegrationInstallationWorkflowInput!){installIntegration(data:$data){id status transitionVersion installationKey signingSecret replayed}}`
  const communicationInstallInput = { operationKey: key('comm-install'), facilityId: facility.id, name: `${prefix} communications`, kind: 'communications', endpointUrl: receiverUrl, allowedEventTypes: ['message.queued'] }
  const communicationInstall = (await gql('install communications', installMutation, { data: communicationInstallInput }, adminCookie)).installIntegration
  const installReplay = (await gql('replay communications install', installMutation, { data: communicationInstallInput }, adminCookie)).installIntegration
  if (!communicationInstall.signingSecret || installReplay.signingSecret !== null || !installReplay.replayed) throw new Error('Integration signing secret was not one-time')
  const credentialMutation = `mutation($data:MachineCredentialWorkflowInput!){issueMachineCredential(data:$data){id status transitionVersion keyPrefix credential replayed}}`
  const credentialInput = { operationKey: key('comm-credential'), installationId: communicationInstall.id, name: `${prefix} inbound`, scopes: ['webhook:write'], expiresAt: new Date(Date.now() + 24 * 60 * 60_000).toISOString() }
  const communicationCredential = (await gql('issue communication credential', credentialMutation, { data: credentialInput }, adminCookie)).issueMachineCredential
  const credentialReplay = (await gql('replay communication credential', credentialMutation, { data: credentialInput }, adminCookie)).issueMachineCredential
  if (!communicationCredential.credential || credentialReplay.credential !== null || !credentialReplay.replayed) throw new Error('Machine credential was not one-time')
  const credentialRow = await prisma.machineCredential.findUnique({ where: { id: communicationCredential.id } })
  if (!credentialRow || credentialRow.secretDigest === communicationCredential.credential || credentialRow.secretDigest !== digest(communicationCredential.credential)) throw new Error('Machine credential was not hash-only at rest')

  const publicAppointmentType = await prisma.appointmentType.findFirst({
    where: { status: 'bookable', providers: { some: { id: provider.id } } },
    orderBy: { createdAt: 'asc' },
  })
  if (!publicAppointmentType) throw new Error('No bookable appointment type is available for communications delivery proof')
  const publicStart = new Date(Date.now() + 45 * 24 * 60 * 60_000)
  publicStart.setUTCHours(9, 0, 0, 0)
  while (await prisma.providerScheduleBlock.findFirst({ where: {
    providerId: provider.id, blockType: 'available', startsAt: { lt: new Date(publicStart.getTime() + 3 * 60 * 60_000) },
    endsAt: { gt: new Date(publicStart.getTime() - 60 * 60_000) },
  } })) publicStart.setUTCDate(publicStart.getUTCDate() + 1)
  const publicBlockStart = new Date(publicStart); publicBlockStart.setUTCHours(8, 0, 0, 0)
  await prisma.providerScheduleBlock.create({ data: {
    providerId: provider.id, facilityId: facility.id, onboardingKey: `${prefix}-public-follow-up`, blockType: 'available',
    startsAt: publicBlockStart, endsAt: new Date(publicBlockStart.getTime() + 4 * 60 * 60_000), maxAppointments: 1, locationName: facility.name,
  } })
  const publicRequest = (await gql('public booking follow-up', `mutation($type:ID!,$provider:ID!,$facility:ID!,$startsAt:String!,$patient:PatientAppointmentRequestInput!,$consent:WorkflowConsentInput!){requestAppointment(appointmentTypeId:$type,providerId:$provider,facilityId:$facility,startsAt:$startsAt,patient:$patient,preferredContactMethod:"email",consent:$consent){id patient{id} intakeForms{id accessCode}}}`, {
    type: publicAppointmentType.id,
    provider: provider.id,
    facility: facility.id,
    startsAt: publicStart.toISOString(),
    patient: { firstName: 'Runtime', lastName: `Followup-${runId}`, email: `${prefix}-followup@example.test` },
    consent: { accepted: true, policyVersion: '2026-07-10', statementKey: 'hospital_appointment_request_acknowledgement_v1' },
  })).requestAppointment
  const publicIntake = publicRequest.intakeForms?.[0]
  if (!publicIntake?.accessCode) throw new Error('Public booking did not issue a one-time intake access value')
  await gql('dispatch public booking follow-up', `mutation{dispatchIntegrationOutbox(limit:100){claimed delivered retried deadLettered}}`, {}, adminCookie)
  const publicDelivery = received.find(item => item.payload?.aggregate?.id && item.payload?.data?.message?.body?.includes(publicIntake.accessCode))
  const [storedPublicMessage, storedPublicIntake, storedPublicEvent] = await Promise.all([
    prisma.patientMessage.findFirst({ where: { appointmentId: publicRequest.id, direction: 'outbound' } }),
    prisma.intakeForm.findUnique({ where: { id: publicIntake.id } }),
    prisma.clinicalOutboxEvent.findFirst({ where: { appointmentId: publicRequest.id, eventType: 'message.queued' } }),
  ])
  if (
    !publicDelivery || !publicDelivery.payload.data.message.body.includes(`/intake#accessCode=${publicIntake.accessCode}`) ||
    storedPublicIntake?.accessCodeHash !== digest(publicIntake.accessCode) ||
    !storedPublicMessage?.body.includes('{{intake_link}}') || storedPublicMessage.body.includes(publicIntake.accessCode) ||
    JSON.stringify(storedPublicEvent?.payload || {}).includes(publicIntake.accessCode)
  ) throw new Error('Public booking intake link was not delivered through a token-safe retryable integration event')

  const existingGeneralEmailPreference = await prisma.communicationPreference.findFirst({ where: {
    facilityId: facility.id, patientId: patient.id, channel: 'email', purpose: 'general',
  } })
  let optedOutPreferenceVersion = existingGeneralEmailPreference?.transitionVersion || 0
  if (existingGeneralEmailPreference?.status !== 'opted_out') {
    const optedOutPreference = (await gql('establish opted-out general email baseline', `mutation($data:CommunicationPreferenceWorkflowInput!){setCommunicationPreference(data:$data){${controlled}}}`, { data: {
      operationKey: key('preference-opted-out'), facilityId: facility.id, patientId: patient.id, channel: 'email', purpose: 'general', status: 'opted_out', reasonCode: 'runtime_proof_baseline',
      ...(existingGeneralEmailPreference ? { expectedVersion: existingGeneralEmailPreference.transitionVersion } : {}),
    } }, adminCookie)).setCommunicationPreference
    optedOutPreferenceVersion = optedOutPreference.transitionVersion
  }
  await denied('opted-out general message', `mutation($key:String!,$facility:ID!,$patient:ID!,$installation:ID!){sendSecurePatientMessage(operationKey:$key,facilityId:$facility,patientId:$patient,installationId:$installation,channel:"email",purpose:"general",body:"Local general message"){id}}`, { key: key('general-denied'), facility: facility.id, patient: patient.id, installation: communicationInstall.id }, adminCookie, 'opted out')
  await gql('allow general email', `mutation($data:CommunicationPreferenceWorkflowInput!){setCommunicationPreference(data:$data){${controlled}}}`, { data: {
    operationKey: key('preference'), facilityId: facility.id, patientId: patient.id, channel: 'email', purpose: 'general', status: 'allowed', reasonCode: 'patient_request', expectedVersion: optedOutPreferenceVersion,
  } }, adminCookie)
  await gql('register template', `mutation($data:CommunicationTemplateWorkflowInput!){registerCommunicationTemplate(data:$data){${controlled}}}`, { data: {
    operationKey: key('template'), facilityId: facility.id, templateKey: `${prefix}-general`, name: 'Local general template', channel: 'email', subjectTemplate: 'Hospital update', bodyTemplate: 'Your requested update is ready.',
  } }, adminCookie)
  const message = (await gql('queue external message', `mutation($key:String!,$facility:ID!,$patient:ID!,$installation:ID!){sendSecurePatientMessage(operationKey:$key,facilityId:$facility,patientId:$patient,installationId:$installation,channel:"email",purpose:"general",subject:"Hospital update",body:"Your requested update is ready."){id status}}`, { key: key('message'), facility: facility.id, patient: patient.id, installation: communicationInstall.id }, adminCookie)).sendSecurePatientMessage
  const dispatched = (await gql('dispatch message', `mutation{dispatchIntegrationOutbox(limit:10){claimed delivered retried deadLettered}}`, {}, adminCookie)).dispatchIntegrationOutbox
  if (dispatched.delivered < 1 || !received.some(item => item.payload?.aggregate?.id === message.id)) throw new Error('Signed integration delivery did not complete')
  const delivery = received.find(item => item.payload?.aggregate?.id === message.id)
  const signature = String(delivery.headers['x-openfront-signature'] || '').replace(/^sha256=/, '')
  const expectedSignature = createHmac('sha256', communicationInstall.signingSecret).update(`${delivery.headers['x-openfront-timestamp']}.${delivery.body}`).digest('hex')
  if (signature !== expectedSignature || delivery.payload.contractVersion !== 'hospital.webhook.v1') throw new Error('Outbound webhook signature or contract version is invalid')
  if ((await prisma.patientMessage.findUnique({ where: { id: message.id } }))?.status !== 'sent') throw new Error('Message did not move to sent after delivery')

  const appBase = new URL(endpoint); appBase.pathname = ''; appBase.search = ''
  const deliveredEvent = { eventId: `${prefix}-message-delivered`, eventType: 'message.delivered', aggregateId: message.id, externalReference: `${prefix}-provider-message` }
  const webhook = await signedWebhook(appBase.toString().replace(/\/$/, ''), communicationInstall.installationKey, communicationCredential.credential, communicationInstall.signingSecret, deliveredEvent)
  if (webhook.status !== 200) throw new Error(`Signed inbound message webhook failed: ${webhook.status} ${await webhook.text()}`)
  const webhookReplay = await signedWebhook(appBase.toString().replace(/\/$/, ''), communicationInstall.installationKey, communicationCredential.credential, communicationInstall.signingSecret, deliveredEvent)
  const replayPayload = await webhookReplay.json()
  if (webhookReplay.status !== 200 || !replayPayload.replayed) throw new Error('Inbound webhook replay was not deduplicated')
  const altered = { ...deliveredEvent, aggregateId: encounter.id }
  const alteredResponse = await signedWebhook(appBase.toString().replace(/\/$/, ''), communicationInstall.installationKey, communicationCredential.credential, communicationInstall.signingSecret, altered)
  if (alteredResponse.status !== 409) throw new Error('Webhook event ID payload mismatch was not rejected')

  const paymentInstall = (await gql('install payment', installMutation, { data: { operationKey: key('payment-install'), facilityId: facility.id, name: `${prefix} payment`, kind: 'payment', endpointUrl: receiverUrl, allowedEventTypes: ['payment.pending', 'refund.pending'] } }, adminCookie)).installIntegration
  const paymentCredential = (await gql('issue payment credential', credentialMutation, { data: { operationKey: key('payment-credential'), installationId: paymentInstall.id, name: `${prefix} payment inbound`, scopes: ['webhook:write'], expiresAt: new Date(Date.now() + 24 * 60 * 60_000).toISOString() } }, adminCookie)).issueMachineCredential
  const payment = (await gql('record external payment', `mutation($data:PatientPaymentWorkflowInput!){recordPatientPayment(data:$data){${controlled}}}`, { data: {
    operationKey: key('payment'), facilityId: facility.id, patientId: patient.id, claimId: claim.id, installationId: paymentInstall.id,
    amountCents: 5000, currency: 'USD', method: 'card_external', externalReference: `${prefix}-payment-request`,
  } }, adminCookie)).recordPatientPayment
  await denied('unsigned external payment success', `mutation($operationKey:String!,$id:ID!){transitionPatientPayment(operationKey:$operationKey,paymentId:$id,toStatus:"succeeded",expectedVersion:1){id}}`, { operationKey: key('payment-unsigned-success'), id: payment.id }, adminCookie, 'verified integration event')
  await gql('dispatch payment request', `mutation{dispatchIntegrationOutbox(limit:10){claimed delivered retried deadLettered}}`, {}, adminCookie)
  const paymentEvent = { eventId: `${prefix}-payment-succeeded`, eventType: 'payment.succeeded', aggregateId: payment.id, externalReference: `${prefix}-payment-provider` }
  const paymentWebhook = await signedWebhook(appBase.toString().replace(/\/$/, ''), paymentInstall.installationKey, paymentCredential.credential, paymentInstall.signingSecret, paymentEvent)
  if (paymentWebhook.status !== 200) throw new Error(`Payment webhook failed: ${paymentWebhook.status}`)
  const refund = (await gql('request external refund', `mutation($data:PatientRefundWorkflowInput!){requestPatientRefund(data:$data){${controlled}}}`, { data: { operationKey: key('refund'), paymentId: payment.id, amountCents: 1200, reasonCode: 'patient_request' } }, adminCookie)).requestPatientRefund
  await denied('unsigned external refund success', `mutation($operationKey:String!,$id:ID!){transitionPatientRefund(operationKey:$operationKey,refundId:$id,toStatus:"succeeded",expectedVersion:1){id}}`, { operationKey: key('refund-unsigned-success'), id: refund.id }, adminCookie, 'verified integration event')
  await denied('over refund', `mutation($data:PatientRefundWorkflowInput!){requestPatientRefund(data:$data){id}}`, { data: { operationKey: key('refund-over'), paymentId: payment.id, amountCents: 5000, reasonCode: 'invalid_total' } }, adminCookie, 'exceed')
  await gql('dispatch refund request', `mutation{dispatchIntegrationOutbox(limit:10){claimed delivered retried deadLettered}}`, {}, adminCookie)
  const refundWebhook = await signedWebhook(appBase.toString().replace(/\/$/, ''), paymentInstall.installationKey, paymentCredential.credential, paymentInstall.signingSecret, { eventId: `${prefix}-refund-succeeded`, eventType: 'refund.succeeded', aggregateId: refund.id, externalReference: `${prefix}-refund-provider` })
  if (refundWebhook.status !== 200) throw new Error(`Refund webhook failed: ${refundWebhook.status}`)
  const finalPayment = await prisma.patientPayment.findUnique({ where: { id: payment.id } })
  if (finalPayment?.status !== 'succeeded' || finalPayment.refundedAmountCents !== 1200) throw new Error('Payment/refund status projection is inconsistent')

  const racePayment = (await gql('record refund-race payment', `mutation($data:PatientPaymentWorkflowInput!){recordPatientPayment(data:$data){${controlled}}}`, { data: {
    operationKey: key('payment-race'), facilityId: facility.id, patientId: patient.id, claimId: claim.id, installationId: paymentInstall.id,
    amountCents: 3000, currency: 'USD', method: 'card_external', externalReference: `${prefix}-payment-race-request`,
  } }, adminCookie)).recordPatientPayment
  const racePaymentWebhook = await signedWebhook(appBase.toString().replace(/\/$/, ''), paymentInstall.installationKey, paymentCredential.credential, paymentInstall.signingSecret, {
    eventId: `${prefix}-payment-race-succeeded`, eventType: 'payment.succeeded', aggregateId: racePayment.id, externalReference: `${prefix}-payment-race-provider`,
  })
  if (racePaymentWebhook.status !== 200) throw new Error('Refund-race payment setup webhook failed')
  const raceRefund = (await gql('request concurrent refund', `mutation($data:PatientRefundWorkflowInput!){requestPatientRefund(data:$data){${controlled}}}`, { data: {
    operationKey: key('refund-race'), paymentId: racePayment.id, amountCents: 900, reasonCode: 'concurrency_proof',
  } }, adminCookie)).requestPatientRefund
  const refundRaceResponses = await Promise.all(['a', 'b'].map(suffix => signedWebhook(
    appBase.toString().replace(/\/$/, ''), paymentInstall.installationKey, paymentCredential.credential, paymentInstall.signingSecret,
    { eventId: `${prefix}-refund-race-${suffix}`, eventType: 'refund.succeeded', aggregateId: raceRefund.id, externalReference: `${prefix}-refund-race-${suffix}` },
  )))
  if (refundRaceResponses.some(response => response.status !== 200)) throw new Error('Concurrent distinct refund callbacks were not normalized')
  const [racePaymentRow, raceRefundRow, raceTransitions] = await Promise.all([
    prisma.patientPayment.findUnique({ where: { id: racePayment.id } }),
    prisma.patientRefund.findUnique({ where: { id: raceRefund.id } }),
    prisma.workflowTransition.count({ where: { aggregateType: 'refund', aggregateId: raceRefund.id } }),
  ])
  if (raceRefundRow?.status !== 'succeeded' || racePaymentRow?.refundedAmountCents !== 900 || raceTransitions !== 1) {
    throw new Error('Concurrent distinct refund callbacks changed monetary state more than once')
  }

  const inventoryInput = { operationKey: key('inventory'), facilityId: facility.id, sku: `${prefix}-GAUZE`, name: 'Local sterile gauze', unit: 'box', initialQuantity: 10, reorderPoint: 2 }
  const inventory = (await gql('register inventory', `mutation($data:InventoryItemWorkflowInput!){registerInventoryItem(data:$data){id status transitionVersion quantityOnHand quantityReserved replayed}}`, { data: inventoryInput }, adminCookie)).registerInventoryItem
  const inventoryReplay = (await gql('replay inventory', `mutation($data:InventoryItemWorkflowInput!){registerInventoryItem(data:$data){id replayed}}`, { data: inventoryInput }, adminCookie)).registerInventoryItem
  if (inventoryReplay.id !== inventory.id || !inventoryReplay.replayed) throw new Error('Inventory item replay failed')
  const movementQuery = `mutation($data:InventoryMovementWorkflowInput!){moveInventory(data:$data){id transitionVersion quantityOnHand quantityReserved replayed}}`
  const movementRace = await Promise.all([
    raw(movementQuery, { data: { operationKey: key('inventory-reserve-a'), itemId: inventory.id, expectedVersion: 1, movementType: 'reserve', quantityDelta: 0, reservedDelta: 3, reasonCode: 'procedure_hold' } }, adminCookie),
    raw(movementQuery, { data: { operationKey: key('inventory-reserve-b'), itemId: inventory.id, expectedVersion: 1, movementType: 'reserve', quantityDelta: 0, reservedDelta: 4, reasonCode: 'procedure_hold' } }, adminCookie),
  ])
  if (movementRace.filter(payload => !payload.errors?.length).length !== 1 || movementRace.filter(payload => payload.errors?.length).length !== 1) throw new Error('Inventory concurrency did not reject one stale movement')
  await denied('negative inventory', movementQuery, { data: { operationKey: key('inventory-negative'), itemId: inventory.id, expectedVersion: 2, movementType: 'consume', quantityDelta: -20, reservedDelta: 0, reasonCode: 'invalid' } }, adminCookie, 'invalid or negative')

  const order = (await gql('place lab order', `mutation($data:MedicalOrderWorkflowInput!){placeMedicalOrder(data:$data){${controlled}}}`, { data: { operationKey: key('lab-order'), facilityId: facility.id, patientId: patient.id, encounterId: encounter.id, orderingProviderId: provider.id, orderType: 'lab', summary: 'Local specimen proof' } }, adminCookie)).placeMedicalOrder
  await gql('order lab', `mutation($operationKey:String!,$id:ID!){transitionMedicalOrder(operationKey:$operationKey,orderId:$id,toStatus:"ordered",expectedVersion:1){${controlled}}}`, { operationKey: key('lab-order-ordered'), id: order.id }, adminCookie)
  const specimen = (await gql('collect specimen', `mutation($data:SpecimenWorkflowInput!){collectSpecimen(data:$data){${controlled}}}`, { data: { operationKey: key('specimen'), facilityId: facility.id, patientId: patient.id, encounterId: encounter.id, medicalOrderId: order.id, specimenType: 'whole_blood' } }, adminCookie)).collectSpecimen
  await gql('receive specimen', `mutation($operationKey:String!,$id:ID!){transitionSpecimen(operationKey:$operationKey,specimenId:$id,toStatus:"received",expectedVersion:1){${controlled}}}`, { operationKey: key('specimen-received'), id: specimen.id }, adminCookie)
  const document = (await gql('draft document', `mutation($data:ClinicalDocumentWorkflowInput!){draftClinicalDocument(data:$data){${controlled}}}`, { data: { operationKey: key('document'), facilityId: facility.id, patientId: patient.id, encounterId: encounter.id, providerId: provider.id, documentType: 'progress_note', title: 'Local progress note', content: 'Local-only progress note content.' } }, adminCookie)).draftClinicalDocument
  await denied('clinical document signing without qualified authority', `mutation($operationKey:String!,$id:ID!){transitionClinicalDocument(operationKey:$operationKey,documentId:$id,toStatus:"signed",expectedVersion:1){${controlled}}}`, { operationKey: key('document-signed'), id: document.id }, adminCookie, 'not available in this bounded patient-operations release')
  await denied('clinical document amendment without qualified authority', `mutation($data:ClinicalDocumentAmendmentInput!){amendClinicalDocument(data:$data){${controlled}}}`, { data: { operationKey: key('document-amend'), documentId: document.id, content: 'Amended local-only progress note content.', reason: 'Corrected local fixture wording' } }, adminCookie, 'qualified signing authority')
  if ((await prisma.clinicalDocument.findUnique({ where: { id: document.id } }))?.status !== 'draft') throw new Error('Denied document authority operations changed the draft')
  const vital = (await gql('record vital', `mutation($data:VitalSignWorkflowInput!){recordVitalSign(data:$data){id recordedAt replayed}}`, { data: { operationKey: key('vital'), facilityId: facility.id, patientId: patient.id, encounterId: encounter.id, clinicianId: clinician.id, temperatureC: 37, systolicBp: 118, diastolicBp: 76, heartRate: 72, oxygenSaturation: 98 } }, adminCookie)).recordVitalSign
  const vitalReplay = (await gql('replay vital', `mutation($data:VitalSignWorkflowInput!){recordVitalSign(data:$data){id replayed}}`, { data: { operationKey: key('vital'), facilityId: facility.id, patientId: patient.id, encounterId: encounter.id, clinicianId: clinician.id, temperatureC: 37, systolicBp: 118, diastolicBp: 76, heartRate: 72, oxygenSaturation: 98 } }, adminCookie)).recordVitalSign
  if (vital.id !== vitalReplay.id || !vitalReplay.replayed) throw new Error('Vital sign replay failed')

  const bed = await prisma.bed.create({ data: { bedNumber: `${prefix}-BED`, roomId: room.id, facilityId: facility.id, status: 'available', transitionVersion: 1 } })
  const reservationInput = { operationKey: key('bed-hold'), facilityId: facility.id, patientId: patient.id, bedId: bed.id, expectedBedVersion: 1, expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(), reasonCode: 'planned_admission' }
  const reservation = (await gql('reserve bed', `mutation($data:BedReservationWorkflowInput!){reserveBed(data:$data){${controlled}}}`, { data: reservationInput }, adminCookie)).reserveBed
  const reservationReplay = (await gql('replay bed reserve', `mutation($data:BedReservationWorkflowInput!){reserveBed(data:$data){${controlled}}}`, { data: reservationInput }, adminCookie)).reserveBed
  if (reservation.id !== reservationReplay.id || !reservationReplay.replayed) throw new Error('Bed reservation replay failed')
  const releaseRace = await Promise.all([
    raw(`mutation($operationKey:String!,$id:ID!){releaseBedReservation(operationKey:$operationKey,reservationId:$id,expectedVersion:1,reasonCode:"patient_plan_changed"){${controlled}}}`, { operationKey: key('bed-release-a'), id: reservation.id }, adminCookie),
    raw(`mutation($operationKey:String!,$id:ID!){releaseBedReservation(operationKey:$operationKey,reservationId:$id,expectedVersion:1,reasonCode:"patient_plan_changed"){${controlled}}}`, { operationKey: key('bed-release-b'), id: reservation.id }, adminCookie),
  ])
  if (releaseRace.filter(payload => !payload.errors?.length).length !== 1) throw new Error('Bed reservation release was not exactly once')

  const canonicalEncounter = await prisma.encounter.findUnique({ where: { id: encounter.id } })
  if (!canonicalEncounter) throw new Error('No facility encounter is available for retention proof')
  const policy = (await gql('establish retention policy', `mutation($data:RetentionPolicyWorkflowInput!){establishRetentionPolicy(data:$data){${controlled}}}`, { data: { operationKey: key('policy'), facilityId: facility.id, recordType: 'encounter', retentionDays: 1 } }, adminCookie)).establishRetentionPolicy
  const hold = (await gql('place record hold', `mutation($data:RecordHoldWorkflowInput!){placeRecordHold(data:$data){${controlled}}}`, { data: { operationKey: key('hold'), facilityId: facility.id, aggregateType: 'encounter', aggregateId: canonicalEncounter.id, reasonCode: 'records_review', notes: 'Local hold proof' } }, adminCookie)).placeRecordHold
  const blockedDisposition = (await gql('blocked disposition', `mutation($data:RetentionDispositionWorkflowInput!){recordRetentionDisposition(data:$data){id decision replayed}}`, { data: { operationKey: key('disposition-blocked'), facilityId: facility.id, policyId: policy.id, aggregateType: 'encounter', aggregateId: canonicalEncounter.id, decision: 'review', reasonCode: 'scheduled_review' } }, adminCookie)).recordRetentionDisposition
  if (blockedDisposition.decision !== 'blocked_by_hold') throw new Error('Active record hold did not block disposition review')
  await gql('release hold', `mutation($operationKey:String!,$id:ID!){releaseRecordHold(operationKey:$operationKey,holdId:$id,expectedVersion:1,reasonCode:"review_complete"){${controlled}}}`, { operationKey: key('hold-release'), id: hold.id }, adminCookie)
  const reviewedDisposition = (await gql('eligible disposition', `mutation($data:RetentionDispositionWorkflowInput!){recordRetentionDisposition(data:$data){id decision replayed}}`, { data: { operationKey: key('disposition-review'), facilityId: facility.id, policyId: policy.id, aggregateType: 'encounter', aggregateId: canonicalEncounter.id, decision: 'review', reasonCode: 'scheduled_review' } }, adminCookie)).recordRetentionDisposition
  if (!['eligible_for_review', 'retained'].includes(reviewedDisposition.decision)) throw new Error('Retention disposition decision is invalid')

  const badPreview = (await gql('invalid import preview', `mutation($data:InventoryImportPreviewInput!){previewInventoryImport(data:$data){id rowCount errorCount status transitionVersion replayed}}`, { data: { operationKey: key('import-bad'), facilityId: facility.id, csv: 'sku,name,unit,quantity,reorderPoint\nBAD,=FORMULA,each,1,0' } }, adminCookie)).previewInventoryImport
  if (badPreview.errorCount !== 1) throw new Error('Import row error attribution failed')
  const importPreview = (await gql('valid import preview', `mutation($data:InventoryImportPreviewInput!){previewInventoryImport(data:$data){id rowCount errorCount status transitionVersion replayed}}`, { data: { operationKey: key('import'), facilityId: facility.id, csv: `sku,name,unit,quantity,reorderPoint\n${prefix}-MASK,Local masks,box,5,1` } }, adminCookie)).previewInventoryImport
  const appliedImport = (await gql('apply import', `mutation($operationKey:String!,$id:ID!,$version:Int!){applyInventoryImport(operationKey:$operationKey,batchId:$id,expectedVersion:$version){${controlled}}}`, { operationKey: key('import-apply'), id: importPreview.id, version: 1 }, adminCookie)).applyInventoryImport
  const rolledBack = (await gql('rollback import', `mutation($operationKey:String!,$id:ID!,$version:Int!){rollbackInventoryImport(operationKey:$operationKey,batchId:$id,expectedVersion:$version,reasonCode:"validation_complete"){${controlled}}}`, { operationKey: key('import-rollback'), id: importPreview.id, version: appliedImport.transitionVersion }, adminCookie)).rollbackInventoryImport
  if (rolledBack.status !== 'rolled_back') throw new Error('Import rollback did not complete')

  const exportJob = (await gql('request export', `mutation($data:ExportJobWorkflowInput!){requestExportJob(data:$data){id status transitionVersion accessToken expiresAt replayed}}`, { data: { operationKey: key('export'), facilityId: facility.id, exportType: 'inventory', format: 'json' } }, adminCookie)).requestExportJob
  if (!exportJob.accessToken) throw new Error('Export access token was not returned once')
  await gql('process export', `mutation($operationKey:String!,$id:ID!){processExportJob(operationKey:$operationKey,jobId:$id,expectedVersion:1){${controlled}}}`, { operationKey: key('export-process'), id: exportJob.id }, adminCookie)
  const anonymousDownload = await fetch(`${appBase.toString().replace(/\/$/, '')}/api/exports/${exportJob.id}`, { headers: { authorization: `Bearer ${exportJob.accessToken}` } })
  if (anonymousDownload.status !== 401) throw new Error('Export bearer was accepted without an authorized facility operator session')
  const download = await fetch(`${appBase.toString().replace(/\/$/, '')}/api/exports/${exportJob.id}`, { headers: { authorization: `Bearer ${exportJob.accessToken}`, cookie: adminCookie } })
  const artifact = await download.text()
  if (download.status !== 200 || !artifact.includes(`${prefix}-GAUZE`.toUpperCase())) throw new Error('Encrypted export download failed')
  const secondDownload = await fetch(`${appBase.toString().replace(/\/$/, '')}/api/exports/${exportJob.id}`, { headers: { authorization: `Bearer ${exportJob.accessToken}`, cookie: adminCookie } })
  if (secondDownload.status !== 401) throw new Error('Export bearer was not one-time')

  const linkInput = { operationKey: key('external-link'), facilityId: facility.id, system: 'urn:local:partner', resourceType: 'Patient', externalId: `${prefix}-external-patient`, localType: 'patient', localId: patient.id }
  const link = (await gql('link identity', `mutation($data:ExternalIdentityWorkflowInput!){linkExternalIdentity(data:$data){id status replayed}}`, { data: linkInput }, adminCookie)).linkExternalIdentity
  const linkReplay = (await gql('replay identity link', `mutation($data:ExternalIdentityWorkflowInput!){linkExternalIdentity(data:$data){id status replayed}}`, { data: linkInput }, adminCookie)).linkExternalIdentity
  if (link.id !== linkReplay.id || !linkReplay.replayed) throw new Error('External identity link replay failed')

  const retryMessage = (await gql('queue retry message', `mutation($key:String!,$facility:ID!,$patient:ID!,$installation:ID!){sendSecurePatientMessage(operationKey:$key,facilityId:$facility,patientId:$patient,installationId:$installation,channel:"email",purpose:"care_operations",body:"Retry proof"){id}}`, { key: key('retry-message'), facility: facility.id, patient: patient.id, installation: communicationInstall.id }, adminCookie)).sendSecurePatientMessage
  const retryEvent = await prisma.clinicalOutboxEvent.findUnique({ where: { eventKey: `patient_message:${retryMessage.id}:v1:queued` } })
  failingEventIds.add(retryEvent.id)
  await prisma.clinicalOutboxEvent.update({ where: { id: retryEvent.id }, data: { status: 'processing', attempts: 8, nextAttemptAt: new Date(Date.now() - 1000) } })
  const recovered = (await gql('recover expired lease', `mutation{dispatchIntegrationOutbox(limit:10){claimed delivered retried deadLettered}}`, {}, adminCookie)).dispatchIntegrationOutbox
  if (recovered.retried < 1) throw new Error('Expired worker lease was not recovered into retry')
  await prisma.clinicalOutboxEvent.update({ where: { id: retryEvent.id }, data: { attempts: 9, nextAttemptAt: new Date(Date.now() - 1000) } })
  const dead = (await gql('dead letter maximum attempts', `mutation{dispatchIntegrationOutbox(limit:10){claimed delivered retried deadLettered}}`, {}, adminCookie)).dispatchIntegrationOutbox
  if (dead.deadLettered < 1 || (await prisma.clinicalOutboxEvent.findUnique({ where: { id: retryEvent.id } }))?.status !== 'dead_letter') throw new Error('Maximum integration attempts did not dead-letter')
  const attempt = await prisma.integrationDeliveryAttempt.findFirst({ where: { outboxEventId: retryEvent.id }, orderBy: { attemptNumber: 'asc' } })
  let immutableAttempt = false
  try { await prisma.integrationDeliveryAttempt.update({ where: { id: attempt.id }, data: { errorCode: 'rewritten' } }) } catch { immutableAttempt = true }
  if (!immutableAttempt) throw new Error('Integration delivery attempt was mutable')

  const fencedEvent = await prisma.clinicalOutboxEvent.create({ data: {
    eventKey: `${prefix}-claimed-before-pause`, eventType: 'message.queued', aggregateType: 'patient_message', aggregateId: retryMessage.id,
    contractVersion: 'hospital.webhook.v1', deliveryMode: 'external', installationId: communicationInstall.id,
    installationVersion: communicationInstall.transitionVersion, status: 'processing', attempts: 1,
    nextAttemptAt: new Date(Date.now() - 11 * 60_000), facilityId: facility.id, patientId: patient.id,
    payload: { source: 'runtime_generation_fence', aggregateId: retryMessage.id },
  } })
  await gql('pause integration generation', `mutation($key:String!,$id:ID!){transitionIntegrationInstallation(operationKey:$key,installationId:$id,toStatus:"paused",expectedVersion:1){id status transitionVersion}}`, {
    key: key('integration-pause'), id: communicationInstall.id,
  }, adminCookie)
  await gql('recover revoked claimed event', `mutation{dispatchIntegrationOutbox(limit:10){claimed delivered retried deadLettered}}`, {}, adminCookie)
  const fencedAfterPause = await prisma.clinicalOutboxEvent.findUnique({ where: { id: fencedEvent.id } })
  if (fencedAfterPause?.status !== 'dead_letter' || fencedAfterPause.lastError !== 'integration_generation_revoked' || received.some(item => item.payload?.eventId === fencedEvent.id)) {
    throw new Error('Claimed outbound event crossed an integration generation revocation')
  }
  const revokedInbound = await signedWebhook(appBase.toString().replace(/\/$/, ''), communicationInstall.installationKey, communicationCredential.credential, communicationInstall.signingSecret, {
    eventId: `${prefix}-revoked-inbound`, eventType: 'message.queued', occurredAt: new Date().toISOString(), data: {},
  })
  if (revokedInbound.status !== 401) throw new Error('Paused integration accepted a previously issued inbound credential')

  const omitted = ['createVitalSign', 'updateVitalSign', 'deleteVitalSign', 'createPatientPayment', 'updatePatientPayment', 'createIntegrationInstallation', 'createMachineCredential', 'createRetentionPolicy', 'createImportBatch', 'createExportJob']
  const mutationType = await gql('mutation introspection', `{__schema{mutationType{fields{name}}}}`, {}, adminCookie)
  const exposed = omitted.filter(name => mutationType.__schema.mutationType.fields.some(field => field.name === name))
  if (exposed.length) throw new Error(`Raw operational mutations remain exposed: ${exposed.join(', ')}`)

  console.log(JSON.stringify({
    result: 'operational-fabric-runtime-passed', database: guard.name, crossFacilityDenied: true,
    coverageReplayAndConcurrency: true, consentGrantReplayWithdrawalAndScope: true, claimVersions: 3, paymentRefundWebhook: true, unsignedExternalSuccessDenied: true, distinctRefundCallbacksExactlyOnce: true,
    inventoryReplayConcurrencyAndFloor: true, communicationPreferenceAndTemplate: true,
    publicBookingIntakeLinkDeliveredWithoutStoredBearer: true, signedOutboundAndInboundReplay: true, leaseRecoveryRetryDeadLetter: true,
    integrationGenerationRevocationFence: true,
    documentSigningAndAmendmentWithoutQualifiedAuthorityDenied: true, documentsSpecimensVitals: true, bedReservationConcurrency: true,
    retentionHoldDisposition: true, importPreviewApplyRollback: true,
    encryptedOneTimeExport: true, externalIdentityReplay: true, rawCrudOmitted: true,
  }))
} finally {
  await prisma.$disconnect()
  await new Promise(resolve => receiver.close(resolve))
}
