import type { Metadata } from 'next'
import { AppointmentTypeBookingPage } from '@/features/storefront/screens/booking/AppointmentTypeBookingPage'

export const metadata: Metadata = {
  title: 'Choose a visit time',
  description: 'Choose a provider and available time, then send an appointment request.',
}

export default AppointmentTypeBookingPage
