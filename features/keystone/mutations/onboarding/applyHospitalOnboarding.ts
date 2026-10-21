import { publicPhoneHref } from '../../../lib/publicPhone'
import { validateSetupShape } from '../../../lib/hospitalSetupShape'
import { parseDepartmentStatus } from '../../../lib/departmentStatus'
import { sanitizeStoreLogoSvg } from '../../utils/storeLogo'
import { DEFAULT_STORE_LOGO_ICON, DEFAULT_STORE_LOGO_COLOR, normalizeStoreLogoColor } from '../../../platform/store-settings/lib/store-logo'
import { Prisma } from '@prisma/client'
import type { Context } from '.keystone/types'

import { addCalendarDays, assertIanaTimeZone, calendarDateInTimeZone, localDateTimeToUtc } from '../scheduling/facilityTime'
import registerPatient from '../registration/registerPatient'
import { hashRegistrationIdempotencyKey } from '../registration/registrationPolicy'
import sendSecurePatientMessage from '../communications/sendSecurePatientMessage'
import { createOnboardingAppointment, issueIntakeForm } from './onboardingWorkflows'
import {
  onboardingRegistrationReplayFields,
  selectDeterministicOnboardingDuplicate,
} from './onboardingRegistrationPolicy'

const MAX_ITEMS = 100

function requireOnboarding(context: Context) {
  const role = context.session?.data.role
  if (!role?.canAccessAllClinicalData || !role?.canManageOnboarding) {
    throw new Error('Global onboarding authority is required to apply hospital setup')
  }
}

function bounded(value: unknown, label: string, maximum: number, required = false) {
  const text = String(value ?? '').trim()
  if ((required && !text) || text.length > maximum || /[\u0000-\u001f\u007f]/.test(text)) throw new Error(`${label} is invalid`)
  return text
}

function rows(configuration: any, key: string) {
  const value = configuration?.[key]
  if (!Array.isArray(value) || value.length > MAX_ITEMS) throw new Error(`${key} must be a bounded array`)
  return value
}

function references(value: unknown, label: string) {
  if (!Array.isArray(value) || value.length > MAX_ITEMS) throw new Error(`${label} must be a bounded array`)
  return value
}

function boundedJson(value: unknown, label: string, maximum = 50_000) {
  const serialized = JSON.stringify(value ?? {})
  if (!serialized || serialized.length > maximum) throw new Error(`${label} is too large`)
  return value ?? {}
}

function uniqueValues(values: unknown[], label: string, normalize = (value: unknown) => String(value || '').trim().toLowerCase()) {
  const normalized = values.map(normalize)
  if (normalized.some(value => !value) || new Set(normalized).size !== normalized.length) {
    throw new Error(`${label} values must be present and unique`)
  }
}

function canonicalImagePath(value: unknown, label: string) {
  const path = bounded(value, `${label} image`, 500)
  if (!path) return ''
  if (!path.startsWith('/images/') || path.includes('..')) throw new Error(`${label} image must be a canonical /images/ path`)
  return path
}

function key(value: unknown, label: string) {
  const result = bounded(value, label, 120, true).toLowerCase()
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(result)) throw new Error(`${label} is invalid`)
  return result
}

function profileMediaKey(value: unknown) {
  const result = bounded(value, 'Media key', 40, true)
  if (!['hero', 'primaryCare', 'behavioralHealth', 'telehealth', 'clinic'].includes(result)) {
    throw new Error('Profile media key is invalid')
  }
  return result
}

async function reconcileImage(
  delegate: any,
  parentField: string,
  parentId: string,
  imagePath: string,
  altText: string,
) {
  const parentWhere = { [`${parentField}Id`]: parentId }
  const existing = await delegate.findFirst({
    where: parentWhere,
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
  })
  if (!imagePath) {
    await delegate.deleteMany({ where: parentWhere })
    return
  }
  if (existing) {
    await delegate.update({ where: { id: existing.id }, data: { imagePath, altText, order: 0 } })
    await delegate.deleteMany({ where: { ...parentWhere, id: { not: existing.id } } })
  } else {
    await delegate.create({ data: { ...parentWhere, imagePath, altText, order: 0 } })
  }
}

export default async function applyHospitalOnboarding(
  _root: unknown,
  { configuration }: { configuration: any },
  context: Context,
) {
  requireOnboarding(context)
  const shapeError = validateSetupShape(configuration)
  if (shapeError) throw new Error(shapeError)
  for (const department of configuration.departments) parseDepartmentStatus(department.status)
  if (!configuration || typeof configuration !== 'object' || Array.isArray(configuration)) {
    throw new Error('Hospital onboarding configuration is invalid')
  }
  if (JSON.stringify(configuration).length > 500_000) throw new Error('Hospital onboarding configuration is too large')
  const profileInput = configuration.practiceInfo
  if (profileInput.supportPhone && !publicPhoneHref(profileInput.supportPhone)) throw new Error('Scheduling phone must be a dialable number with an optional extension')
  if (profileInput?.logoIcon != null && typeof profileInput.logoIcon !== 'string') throw new Error('Logo must be a valid, safe SVG document')
  const logoIcon = sanitizeStoreLogoSvg(profileInput?.logoIcon ?? DEFAULT_STORE_LOGO_ICON)
  if (!logoIcon) throw new Error('Logo must be a valid, safe SVG document')
  const logoColor = normalizeStoreLogoColor(profileInput?.logoColor ?? DEFAULT_STORE_LOGO_COLOR)
  if (!profileInput || typeof profileInput !== 'object' || Array.isArray(profileInput)) {
    throw new Error('practiceInfo is required')
  }
  const departmentsInput = rows(configuration, 'departments')
  const facilitiesInput = rows(configuration, 'facilities')
  const providersInput = rows(configuration, 'providers')
  const cliniciansInput = rows(configuration, 'clinicians')
  const appointmentTypesInput = rows(configuration, 'appointmentTypes')
  const scheduleBlocksInput = rows(configuration, 'scheduleBlocks')
  const patientsInput = rows(configuration, 'patients')
  const appointmentsInput = rows(configuration, 'appointments')
  const intakeFormsInput = rows(configuration, 'intakeForms')
  const messagesInput = rows(configuration, 'messages')
  if ('portalAccess' in configuration) {
    throw new Error('Patient portal records are not available in this bounded release')
  }
  if (!departmentsInput.length || !facilitiesInput.length || !providersInput.length || !appointmentTypesInput.length) {
    throw new Error('Onboarding requires at least one department, facility, provider, and appointment type')
  }
  uniqueValues(departmentsInput.map((item: any) => item.code), 'Department code')
  uniqueValues(facilitiesInput.map((item: any) => item.slug), 'Facility slug')
  uniqueValues(providersInput.map((item: any) => item.onboardingKey), 'Provider onboarding key')
  uniqueValues(cliniciansInput.map((item: any) => item.onboardingKey), 'Clinician onboarding key')
  uniqueValues(appointmentTypesInput.map((item: any) => item.slug), 'Appointment type slug')
  uniqueValues(scheduleBlocksInput.map((item: any) => item.onboardingKey), 'Schedule onboarding key')
  uniqueValues(patientsInput.map((item: any) => item.patientKey), 'Patient key')
  uniqueValues(patientsInput.map((item: any) => item.medicalRecordNumber), 'Medical record number')
  uniqueValues(appointmentsInput.map((item: any) => item.appointmentNumber), 'Appointment number')
  uniqueValues(intakeFormsInput.map((item: any) => `${item.appointmentNumber || ''}:${item.templateKey || ''}`), 'Intake appointment/template')
  uniqueValues(messagesInput.map((item: any) => item.appointmentNumber), 'Follow-up appointment number')

  const now = new Date()
  const foundation = await context.transaction(async (transactionContext: any) => {
    const prisma = transactionContext.sudo().prisma as any
    await prisma.$queryRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended('hospital-onboarding-primary', 0))::text AS "lock"`,
    )

    const profile = {
      profileKey: 'primary',
      status: 'active',
      name: bounded(profileInput.name, 'Hospital name', 200, true),
      shortName: bounded(profileInput.shortName || profileInput.name, 'Hospital short name', 80, true),
      market: bounded(profileInput.market, 'Hospital market', 300),
      description: bounded(profileInput.description, 'Hospital description', 2_000),
      locationName: bounded(profileInput.locationName, 'Primary location', 300),
      serviceArea: bounded(profileInput.serviceArea, 'Service area', 500),
      addressLine1: bounded(profileInput.addressLine1, 'Profile address', 300),
      city: bounded(profileInput.city, 'Profile city', 150),
      region: bounded(profileInput.region, 'Profile region', 150),
      postalCode: bounded(profileInput.postalCode, 'Profile postal code', 40),
      supportPhone: bounded(profileInput.supportPhone, 'Support phone', 40),
      supportEmail: (() => {
        const email = bounded(profileInput.supportEmail, 'Support email', 254)
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Support email is invalid')
        return email.toLowerCase()
      })(),
      media: (() => {
        const media = profileInput.media || {}
        if (!media || typeof media !== 'object' || Array.isArray(media) || Object.keys(media).length > 20) {
          throw new Error('Profile media must be a bounded object')
        }
        return Object.fromEntries(Object.entries(media).map(([mediaKey, value]) => [
          profileMediaKey(mediaKey),
          canonicalImagePath(value, `Profile ${mediaKey}`),
        ]))
      })(),
    }
    await prisma.hospitalProfile.upsert({ where: { profileKey: 'primary' }, create: { ...profile, logoIcon, logoColor }, update: profile })

    const departments: Record<string, any> = {}
    for (const input of departmentsInput) {
      const code = key(input.code, 'Department code').toUpperCase()
      const data = {
        name: bounded(input.name, 'Department name', 200, true),
        code,
        status: parseDepartmentStatus(input.status),
        description: bounded(input.description, 'Department description', 2_000),
        phone: bounded(input.phone, 'Department phone', 40),
        email: bounded(input.email, 'Department email', 254),
      }
      const department = await prisma.department.upsert({ where: { code }, create: data, update: data })
      departments[code] = department
      await reconcileImage(
        prisma.departmentImage,
        'department',
        department.id,
        canonicalImagePath(input.imagePath, `Department ${code}`),
        bounded(input.imageAltText || input.name, 'Department image alt text', 500),
      )
    }

    const facilities: Record<string, any> = {}
    for (const input of facilitiesInput) {
      const slug = key(input.slug, 'Facility slug')
      const timeZone = assertIanaTimeZone(input.timeZone)
      const departmentIds = references(input.departmentCodes, `Facility ${slug} departmentCodes`).map((code: unknown) => departments[String(code).toUpperCase()]?.id)
      if (departmentIds.some((id: string | undefined) => !id)) throw new Error(`Facility ${slug} references an unknown department`)
      const data = {
        name: bounded(input.name, 'Facility name', 200, true),
        slug,
        facilityType: ['clinic', 'hospital', 'telehealth'].includes(input.facilityType) ? input.facilityType : 'hospital',
        status: ['active', 'inactive'].includes(input.status) ? input.status : 'active',
        addressLine1: bounded(input.addressLine1, 'Facility address', 300),
        addressLine2: bounded(input.addressLine2, 'Facility address', 300),
        city: bounded(input.city, 'Facility city', 150),
        region: bounded(input.region, 'Facility region', 150),
        postalCode: bounded(input.postalCode, 'Facility postal code', 40),
        phone: bounded(input.phone, 'Facility phone', 40),
        timeZone,
      }
      const facility = await prisma.facility.upsert({
        where: { slug },
        create: {
          ...data,
          departments: { connect: departmentIds.map((id: string) => ({ id })) },
          staff: { connect: [{ id: context.session!.itemId }] },
        },
        update: {
          ...data,
          departments: { set: departmentIds.map((id: string) => ({ id })) },
          staff: { connect: [{ id: context.session!.itemId }] },
        },
      })
      facilities[slug] = facility
      await reconcileImage(
        prisma.facilityImage,
        'facility',
        facility.id,
        canonicalImagePath(input.imagePath, `Facility ${slug}`),
        bounded(input.imageAltText || input.name, 'Facility image alt text', 500),
      )
    }

    const providers: Record<string, any> = {}
    for (const input of providersInput) {
      const onboardingKey = key(input.onboardingKey, 'Provider onboarding key')
      const facilitySlug = key(input.facilitySlug, `Provider ${onboardingKey} facility slug`)
      const facility = facilities[facilitySlug]
      if (!facility) throw new Error(`Provider ${onboardingKey} references an unknown facility`)
      const data = {
        onboardingKey,
        firstName: bounded(input.firstName, 'Provider first name', 100, true),
        lastName: bounded(input.lastName, 'Provider last name', 100, true),
        credentials: bounded(input.credentials, 'Provider credentials', 80),
        specialty: bounded(input.specialty, 'Provider specialty', 200),
        status: ['active', 'unavailable', 'inactive'].includes(input.status) ? input.status : 'active',
        bio: bounded(input.bio, 'Provider bio', 3_000),
        locationName: facility.name,
      }
      const provider = await prisma.provider.upsert({
        where: { onboardingKey },
        create: { ...data, facilities: { connect: [{ id: facility.id }] } },
        update: { ...data, facilities: { set: [{ id: facility.id }] } },
      })
      providers[onboardingKey] = provider
    }

    for (const input of cliniciansInput) {
      const onboardingKey = key(input.onboardingKey, 'Clinician onboarding key')
      const provider = providers[key(input.providerKey, `Clinician ${onboardingKey} provider key`)]
      const department = departments[String(input.departmentCode || '').toUpperCase()]
      if (!provider || !department) throw new Error(`Clinician ${onboardingKey} references an unknown provider or department`)
      const data = {
        onboardingKey,
        displayName: bounded(input.displayName, 'Clinician display name', 200, true),
        clinicianType: ['physician', 'nurse', 'therapist', 'technician'].includes(input.clinicianType) ? input.clinicianType : 'physician',
        providerId: provider.id,
        departmentId: department.id,
        licenseNumber: bounded(input.licenseNumber, 'Clinician local credential reference', 200),
        phone: bounded(input.phone, 'Clinician phone', 40),
        email: bounded(input.email, 'Clinician email', 254),
        active: input.active !== false,
      }
      const clinician = await prisma.clinician.upsert({ where: { onboardingKey }, create: data, update: data })
      await reconcileImage(
        prisma.clinicianImage,
        'clinician',
        clinician.id,
        canonicalImagePath(input.imagePath, `Clinician ${onboardingKey}`),
        bounded(input.imageAltText || input.displayName, 'Clinician image alt text', 500),
      )
    }

    const appointmentTypes: Record<string, any> = {}
    for (const input of appointmentTypesInput) {
      const slug = key(input.slug, 'Appointment type slug')
      const providerIds = references(input.providerKeys, `Appointment type ${slug} providerKeys`).map((providerKey: unknown) => providers[key(providerKey, `Appointment type ${slug} provider key`)]?.id)
      if (!providerIds.length || providerIds.some((id: string | undefined) => !id)) throw new Error(`Appointment type ${slug} references an unknown provider`)
      const durationMinutes = Number(input.durationMinutes)
      const bufferBeforeMinutes = Number(input.bufferBeforeMinutes || 0)
      const bufferAfterMinutes = Number(input.bufferAfterMinutes || 0)
      const priceCents = Number(input.priceCents || 0)
      if (!Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 480) throw new Error(`Appointment type ${slug} duration is invalid`)
      if (!Number.isInteger(bufferBeforeMinutes) || bufferBeforeMinutes < 0 || bufferBeforeMinutes > 240 ||
          !Number.isInteger(bufferAfterMinutes) || bufferAfterMinutes < 0 || bufferAfterMinutes > 240) {
        throw new Error(`Appointment type ${slug} buffers are invalid`)
      }
      if (!Number.isSafeInteger(priceCents) || priceCents < 0) throw new Error(`Appointment type ${slug} price is invalid`)
      const data = {
        name: bounded(input.name, 'Appointment type name', 200, true),
        slug,
        description: bounded(input.description, 'Appointment type description', 2_000),
        status: ['bookable', 'internal', 'paused'].includes(input.status) ? input.status : 'bookable',
        durationMinutes,
        bufferBeforeMinutes,
        bufferAfterMinutes,
        priceCents,
        intakeRequirements: boundedJson(input.intakeRequirements, `Appointment type ${slug} intake requirements`),
      }
      const appointmentType = await prisma.appointmentType.upsert({
        where: { slug },
        create: { ...data, providers: { connect: providerIds.map((id: string) => ({ id })) } },
        update: { ...data, providers: { set: providerIds.map((id: string) => ({ id })) } },
      })
      appointmentTypes[slug] = appointmentType
    }

    const referenceDates = new Set<string>()
    for (const input of scheduleBlocksInput) {
      const onboardingKey = key(input.onboardingKey, 'Schedule onboarding key')
      const provider = providers[key(input.providerKey, `Schedule block ${onboardingKey} provider key`)]
      const facility = facilities[key(input.facilitySlug, `Schedule block ${onboardingKey} facility slug`)]
      if (!provider || !facility) throw new Error(`Schedule block ${onboardingKey} has missing scope`)
      const referenceDate = calendarDateInTimeZone(now, facility.timeZone)
      referenceDates.add(referenceDate)
      const dayOffset = Number(input.dayOffset)
      if (!Number.isInteger(dayOffset) || dayOffset < 1 || dayOffset > 180) throw new Error(`Schedule block ${onboardingKey} day offset is invalid`)
      const date = addCalendarDays(referenceDate, dayOffset)
      const startsAt = localDateTimeToUtc(date, Number(input.startHour), Number(input.startMinute || 0), facility.timeZone)
      const endsAt = localDateTimeToUtc(date, Number(input.endHour), Number(input.endMinute || 0), facility.timeZone)
      if (endsAt <= startsAt) throw new Error(`Schedule block ${onboardingKey} window is invalid`)
      const data = {
        onboardingKey,
        providerId: provider.id,
        facilityId: facility.id,
        blockType: ['available', 'unavailable', 'on_call', 'admin_time'].includes(input.blockType) ? input.blockType : 'available',
        startsAt,
        endsAt,
        recurrenceRule: bounded(input.recurrenceRule, 'Schedule recurrence', 500),
        maxAppointments: 1,
        locationName: bounded(input.locationName || facility.name, 'Schedule location', 300),
        notes: bounded(input.notes, 'Schedule notes', 2_000),
      }
      await prisma.providerScheduleBlock.upsert({ where: { onboardingKey }, create: data, update: data })
    }

    return { departments, facilities, providers, appointmentTypes, referenceDates: [...referenceDates].sort() }
  }, { timeout: 60_000 })

  const patients: Record<string, any> = {}
  for (const input of patientsInput) {
    const facility = foundation.facilities[key(input.facilitySlug, 'Patient facility slug')]
    if (!facility) throw new Error('Onboarding patient references an unknown facility')
    const medicalRecordNumber = bounded(input.medicalRecordNumber, 'MRN', 100, true)
    const idempotencyKey = `onboarding-registration-${medicalRecordNumber}`
    const existingRegistration = await context.sudo().prisma.patientRegistration.findFirst({
      where: {
        facilityId: facility.id,
        idempotencyKeyHash: hashRegistrationIdempotencyKey(idempotencyKey),
      },
      select: {
        patientId: true,
        duplicateResolution: true,
        consent: { select: { policyVersion: true, statementKey: true } },
      },
    })
    const replayFields = onboardingRegistrationReplayFields(existingRegistration)
    const registrationData = {
      facilityId: facility.id,
      idempotencyKey,
      medicalRecordNumber,
      firstName: input.firstName,
      lastName: input.lastName,
      dateOfBirth: String(input.dateOfBirth).slice(0, 10),
      email: input.email,
      phone: input.phone,
      preferredContactMethod: input.preferredContactMethod,
      consent: replayFields.consent,
      duplicateResolution: replayFields.duplicateResolution,
      duplicatePatientId: replayFields.duplicatePatientId,
    }
    let result = await registerPatient(null, { data: registrationData }, context) as any
    if (result.status === 'duplicate_review') {
      const duplicatePatientId = selectDeterministicOnboardingDuplicate(result.candidates || [])
      if (!duplicatePatientId) throw new Error('Onboarding patient requires staff duplicate review')
      result = await registerPatient(null, { data: {
        ...registrationData,
        duplicateResolution: 'link_existing',
        duplicatePatientId,
      } }, context) as any
    }
    if (result.status !== 'completed' || !result.patientId) throw new Error('Onboarding patient registration did not complete')
    patients[key(input.patientKey, 'Patient key')] = { id: result.patientId, facilityId: facility.id }
  }

  const appointments: Record<string, any> = {}
  for (const input of appointmentsInput) {
    const patient = patients[key(input.patientKey, 'Appointment patient key')]
    const provider = foundation.providers[key(input.providerKey, 'Appointment provider key')]
    const appointmentType = foundation.appointmentTypes[key(input.appointmentTypeSlug, 'Appointment type slug')]
    const facility = foundation.facilities[key(input.facilitySlug, 'Appointment facility slug')]
    if (!patient || !provider || !appointmentType || !facility) throw new Error('Onboarding appointment has missing scope')
    const referenceDate = calendarDateInTimeZone(now, facility.timeZone)
    const dayOffset = Number(input.dayOffset)
    if (!Number.isInteger(dayOffset) || dayOffset < 1 || dayOffset > 180) throw new Error('Onboarding appointment day offset is invalid')
    const date = addCalendarDays(referenceDate, dayOffset)
    const startsAt = localDateTimeToUtc(date, Number(input.startHour), Number(input.startMinute || 0), facility.timeZone)
    const endsAt = new Date(startsAt.getTime() + Number(appointmentType.durationMinutes) * 60_000)
    const appointmentNumber = bounded(input.appointmentNumber, 'Appointment number', 100, true)
    const appointment = await createOnboardingAppointment(null, { data: {
      operationKey: `onboarding-appointment-${appointmentNumber}`,
      appointmentNumber,
      status: input.status,
      locationName: facility.name,
      reasonForVisit: input.reasonForVisit,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      patientId: patient.id,
      providerId: provider.id,
      facilityId: facility.id,
      appointmentTypeId: appointmentType.id,
      reconcileSchedule: true,
    } }, context) as any
    appointments[appointmentNumber] = { ...appointment, facilityId: facility.id }
  }

  const intakeLinks: Array<{ label: string; href: string; expiresAt: Date }> = []
  for (const input of intakeFormsInput) {
    const patient = patients[key(input.patientKey, 'Intake patient key')]
    const appointmentNumber = bounded(input.appointmentNumber, 'Intake appointment number', 100, true)
    const appointment = appointments[appointmentNumber]
    if (!patient || !appointment) throw new Error('Onboarding intake has missing patient or appointment')
    const result = await issueIntakeForm(null, { data: {
      operationKey: `onboarding-intake-${appointmentNumber}-${key(input.templateKey, 'Intake template key')}`,
      facilityId: appointment.facilityId,
      patientId: patient.id,
      appointmentId: appointment.id,
      title: input.title,
      templateKey: input.templateKey,
      formSchema: boundedJson(input.formSchema || { sections: ['contact', 'reason_for_visit', 'insurance'] }, 'Intake form schema'),
    } }, context) as any
    if (result.accessCode && result.accessExpiresAt) {
      intakeLinks.push({
        label: bounded(input.title || input.templateKey, 'Intake link label', 200, true),
        href: `/intake#accessCode=${encodeURIComponent(result.accessCode)}`,
        expiresAt: new Date(result.accessExpiresAt),
      })
    }
  }

  for (const input of messagesInput) {
    const patient = patients[key(input.patientKey, 'Follow-up patient key')]
    const appointmentNumber = bounded(input.appointmentNumber, 'Follow-up appointment number', 100, true)
    const appointment = appointments[appointmentNumber]
    if (!patient || !appointment) throw new Error('Onboarding follow-up has missing patient or appointment')
    await sendSecurePatientMessage(null, {
      operationKey: `onboarding-follow-up-${appointmentNumber}`,
      facilityId: appointment.facilityId,
      patientId: patient.id,
      appointmentId: appointment.id,
      channel: 'phone',
      purpose: 'care_operations',
      subject: input.subject,
      body: input.body,
    }, context)
  }

  return {
    status: 'completed',
    referenceDate: foundation.referenceDates[0] || now.toISOString().slice(0, 10),
    counts: {
      departments: departmentsInput.length,
      facilities: facilitiesInput.length,
      providers: providersInput.length,
      clinicians: cliniciansInput.length,
      appointmentTypes: appointmentTypesInput.length,
      scheduleBlocks: scheduleBlocksInput.length,
      patients: patientsInput.length,
      appointments: appointmentsInput.length,
      intakeForms: intakeFormsInput.length,
      messages: messagesInput.length,
    },
    intakeLinks,
  }
}
