import type { BookableAppointmentType } from './data/booking'

export type CareServiceLine = {
  key: 'primary-care' | 'behavioral-health' | 'other-care'
  title: string
  description: string
  appointmentTypes: BookableAppointmentType[]
}

export function careServiceLines(appointmentTypes: BookableAppointmentType[]): CareServiceLine[] {
  const behavioral: BookableAppointmentType[] = []
  const primary: BookableAppointmentType[] = []
  const other: BookableAppointmentType[] = []

  for (const appointmentType of appointmentTypes) {
    const searchable = [
      appointmentType.name,
      appointmentType.slug,
      ...appointmentType.providers.map(provider => provider.specialty || ''),
    ].join(' ').toLowerCase()
    if (/behavioral|mental health|counsel|therapy/.test(searchable)) behavioral.push(appointmentType)
    else if (/primary|family medicine|preventive|new patient|follow-up/.test(searchable)) primary.push(appointmentType)
    else other.push(appointmentType)
  }

  return [
    primary.length ? {
      key: 'primary-care' as const,
      title: 'Primary care',
      description: 'New-patient, preventive, and follow-up visits currently available through this online front door.',
      appointmentTypes: primary,
    } : null,
    behavioral.length ? {
      key: 'behavioral-health' as const,
      title: 'Behavioral health',
      description: 'Private behavioral-health consultations currently available through this online front door.',
      appointmentTypes: behavioral,
    } : null,
    other.length ? {
      key: 'other-care' as const,
      title: 'Other available care',
      description: 'Additional visit types currently available through this online front door. Contact scheduling if the service you need is not listed.',
      appointmentTypes: other,
    } : null,
  ].filter((line): line is CareServiceLine => Boolean(line))
}
