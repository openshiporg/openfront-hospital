import type { Metadata } from 'next'
import BookingPage from '@/features/storefront/screens/booking/BookingPage'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Request an appointment',
  description: 'Review bookable visit types, providers, duration, and clinic estimates.',
}

export default BookingPage
