import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'

export type BookableProviderVisitType = {
  id: string
  name: string | null
  slug: string | null
  durationMinutes: number | null
  formattedPrice?: string | null
}

export type BookableProviderEntry = {
  id: string
  displayName: string
  firstName?: string | null
  lastName?: string | null
  credentials?: string | null
  specialty?: string | null
  bio?: string | null
  locationName?: string | null
  imagePath?: string | null
  imageAltText?: string | null
  appointmentTypes: BookableProviderVisitType[]
}

export async function getBookableProviders() {
  const query = `
    query BookableProviders {
      bookableProviders {
        id
        displayName
        firstName
        lastName
        credentials
        specialty
        bio
        locationName
        imagePath
        imageAltText
        appointmentTypes {
          id
          name
          slug
          durationMinutes
          formattedPrice
        }
      }
    }
  `

  const response = await keystoneClient<{ bookableProviders: BookableProviderEntry[] }>(query)
  if (!response.success) throw new Error('Bookable providers are unavailable')
  return response.data.bookableProviders
}
