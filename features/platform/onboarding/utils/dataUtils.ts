import { HEALTHCARE_TEMPLATES } from '../config/templates'

export function providerDisplayName(provider: any) {
  return `${provider.firstName || ''} ${provider.lastName || ''}${provider.credentials ? `, ${provider.credentials}` : ''}`.trim()
}

export function getItemsFromJsonData(jsonData: any, sectionType: string): string[] {
  if (!jsonData) return []

  switch (sectionType) {
    case 'practiceInfo':
      return jsonData.practiceInfo ? [jsonData.practiceInfo.name || 'Practice Settings'] : ['Practice Settings']
    case 'departments':
      return (jsonData.departments || []).map((item: any) => item.name || 'Department')
    case 'facilities':
      return (jsonData.facilities || []).map((item: any) => item.name || 'Facility')
    case 'providers':
      return (jsonData.providers || []).map(providerDisplayName)
    case 'clinicians':
      return (jsonData.clinicians || []).map((item: any) => item.displayName || 'Clinician')
    case 'appointmentTypes':
      return (jsonData.appointmentTypes || []).map((item: any) => item.name || 'Appointment Type')
    case 'scheduleBlocks':
      return (jsonData.scheduleBlocks || []).map((item: any) => `${item.providerLastName || 'Provider'} ${item.startHour || 9}:00-${item.endHour || 17}:00`)
    case 'patients':
      return (jsonData.patients || []).map((item: any) => `${item.firstName || ''} ${item.lastName || ''}`.trim())
    case 'appointments':
      return (jsonData.appointments || []).map((item: any) => item.appointmentNumber || 'Appointment')
    case 'intakeForms':
      return (jsonData.intakeForms || []).map((item: any) => item.title || 'Intake Form')
    case 'messages':
      return (jsonData.messages || []).map((item: any) => item.subject || 'Patient Message')
    default:
      return []
  }
}

export function getSeedForTemplate(template: 'full' | 'minimal' | 'custom', seedData: any) {
  const templateToUse = template === 'custom' ? 'minimal' : template
  const tpl = HEALTHCARE_TEMPLATES[templateToUse]

  const allowedProviderLastNames = new Set(
    (seedData.providers || [])
      .filter((provider: any) => tpl.displayNames.providers.includes(providerDisplayName(provider)))
      .map((provider: any) => provider.lastName)
  )
  const allowedDepartmentCodes = new Set(
    (seedData.departments || [])
      .filter((department: any) => tpl.displayNames.departments.includes(department.name))
      .map((department: any) => department.code)
  )
  const allowedFacilitySlugs = new Set(
    (seedData.facilities || [])
      .filter((facility: any) => tpl.displayNames.facilities.includes(facility.name))
      .map((facility: any) => facility.slug)
  )
  const allowedAppointmentSlugs = new Set(
    (seedData.appointmentTypes || [])
      .filter((item: any) => tpl.displayNames.appointmentTypes.includes(item.name))
      .map((item: any) => item.slug)
  )
  const allowedPatientLastNames = new Set(
    (seedData.patients || [])
      .filter((patient: any) => tpl.displayNames.patients.includes(`${patient.firstName} ${patient.lastName}`))
      .map((patient: any) => patient.lastName)
  )
  const allowedAppointmentNumbers = new Set(tpl.displayNames.appointments)

  return {
    practiceInfo: seedData.practiceInfo,
    departments: (seedData.departments || []).filter((department: any) => allowedDepartmentCodes.has(department.code)),
    facilities: (seedData.facilities || []).filter((facility: any) => allowedFacilitySlugs.has(facility.slug)),
    providers: (seedData.providers || []).filter((provider: any) => allowedProviderLastNames.has(provider.lastName)),
    clinicians: (seedData.clinicians || []).filter(
      (clinician: any) => allowedProviderLastNames.has(clinician.providerLastName) && allowedDepartmentCodes.has(clinician.departmentCode)
    ),
    appointmentTypes: (seedData.appointmentTypes || []).filter((item: any) => allowedAppointmentSlugs.has(item.slug)),
    scheduleBlocks: (seedData.scheduleBlocks || []).filter((item: any) => allowedProviderLastNames.has(item.providerLastName)),
    patients: (seedData.patients || []).filter((patient: any) => allowedPatientLastNames.has(patient.lastName)),
    appointments: (seedData.appointments || []).filter((item: any) => allowedAppointmentNumbers.has(item.appointmentNumber)),
    intakeForms: (seedData.intakeForms || []).filter((item: any) => allowedAppointmentNumbers.has(item.appointmentNumber)),
    messages: (seedData.messages || []).filter((item: any) => allowedAppointmentNumbers.has(item.appointmentNumber)),
  }
}
