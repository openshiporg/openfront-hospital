import type { ReactNode } from 'react'
import { Building2, CircleCheck, Package } from 'lucide-react'

export interface HealthcareTemplate {
  name: string
  description: string
  icon: ReactNode
  displayNames: {
    practiceInfo: string[]
    departments: string[]
    facilities: string[]
    providers: string[]
    clinicians: string[]
    appointmentTypes: string[]
    scheduleBlocks: string[]
    patients: string[]
    appointments: string[]
    intakeForms: string[]
    messages: string[]
  }
}

export const HEALTHCARE_TEMPLATES: Record<'full' | 'minimal' | 'custom', HealthcareTemplate> = {
  full: {
    name: 'Complete Practice Setup',
    description: 'Departments, facilities, clinicians, visit types, schedules, fictional patients, one-time intake, and manual follow-up tasks.',
    icon: <Building2 className="h-5 w-5" />,
    displayNames: {
      practiceInfo: ['Northstar Family Care'],
      departments: ['Primary Care', 'Behavioral Health'],
      facilities: ['Northstar Downtown Clinic', 'Northstar Virtual Care'],
      providers: ['Maya Patel, MD', 'Elliot Chen, NP', 'Priya Shah, LCSW'],
      clinicians: ['Maya Patel, MD', 'Elliot Chen, NP', 'Priya Shah, LCSW'],
      appointmentTypes: ['New Patient Visit', 'Follow-up Visit', 'Behavioral Health Consult'],
      scheduleBlocks: ['Patel morning clinic', 'Patel afternoon clinic', 'Chen primary care block', 'Chen morning clinic', 'Shah telehealth block'],
      patients: ['Jordan Rivera', 'Avery Morgan'],
      appointments: ['APT-DEMO-1001', 'APT-DEMO-1002'],
      intakeForms: ['New patient intake', 'Follow-up pre-visit update'],
      messages: ['Appointment confirmation follow-up', 'Appointment request follow-up'],
    },
  },
  minimal: {
    name: 'Basic Booking Setup',
    description: 'Small seed set for testing one department, facility, clinician, visit type, schedule block, and patient.',
    icon: <Package className="h-5 w-5" />,
    displayNames: {
      practiceInfo: ['Northstar Family Care'],
      departments: ['Primary Care'],
      facilities: ['Northstar Downtown Clinic'],
      providers: ['Maya Patel, MD'],
      clinicians: ['Maya Patel, MD'],
      appointmentTypes: ['New Patient Visit'],
      scheduleBlocks: ['Patel morning clinic'],
      patients: ['Jordan Rivera'],
      appointments: ['APT-DEMO-1001'],
      intakeForms: ['New patient intake'],
      messages: ['Appointment confirmation follow-up'],
    },
  },
  custom: {
    name: 'Custom Setup',
    description: 'Customize the healthcare setup JSON before seeding your workspace.',
    icon: <CircleCheck className="h-5 w-5" />,
    displayNames: {
      practiceInfo: ['Northstar Family Care'],
      departments: ['Primary Care'],
      facilities: ['Northstar Downtown Clinic'],
      providers: ['Maya Patel, MD'],
      clinicians: ['Maya Patel, MD'],
      appointmentTypes: ['New Patient Visit'],
      scheduleBlocks: ['Patel morning clinic'],
      patients: ['Jordan Rivera'],
      appointments: ['APT-DEMO-1001'],
      intakeForms: ['New patient intake'],
      messages: ['Appointment confirmation follow-up'],
    },
  },
}

export interface SectionDefinition {
  id: number
  type: string
  label: string
  getItemsFn: (template: 'full' | 'minimal' | 'custom') => string[]
}

export const SECTION_DEFINITIONS: SectionDefinition[] = [
  { id: 1, type: 'practiceInfo', label: 'Practice Information', getItemsFn: (template) => HEALTHCARE_TEMPLATES[template].displayNames.practiceInfo },
  { id: 2, type: 'departments', label: 'Departments', getItemsFn: (template) => HEALTHCARE_TEMPLATES[template].displayNames.departments },
  { id: 3, type: 'facilities', label: 'Facilities', getItemsFn: (template) => HEALTHCARE_TEMPLATES[template].displayNames.facilities },
  { id: 4, type: 'providers', label: 'Providers', getItemsFn: (template) => HEALTHCARE_TEMPLATES[template].displayNames.providers },
  { id: 5, type: 'clinicians', label: 'Clinicians', getItemsFn: (template) => HEALTHCARE_TEMPLATES[template].displayNames.clinicians },
  { id: 6, type: 'appointmentTypes', label: 'Appointment Types', getItemsFn: (template) => HEALTHCARE_TEMPLATES[template].displayNames.appointmentTypes },
  { id: 7, type: 'scheduleBlocks', label: 'Schedule Blocks', getItemsFn: (template) => HEALTHCARE_TEMPLATES[template].displayNames.scheduleBlocks },
  { id: 8, type: 'patients', label: 'Patients', getItemsFn: (template) => HEALTHCARE_TEMPLATES[template].displayNames.patients },
  { id: 9, type: 'appointments', label: 'Appointments', getItemsFn: (template) => HEALTHCARE_TEMPLATES[template].displayNames.appointments },
  { id: 10, type: 'intakeForms', label: 'Intake Forms', getItemsFn: (template) => HEALTHCARE_TEMPLATES[template].displayNames.intakeForms },
  { id: 11, type: 'messages', label: 'Patient Messages', getItemsFn: (template) => HEALTHCARE_TEMPLATES[template].displayNames.messages },
]

export const STORE_TEMPLATES = HEALTHCARE_TEMPLATES
