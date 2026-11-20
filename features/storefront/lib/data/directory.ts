import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import { cachedPublicRead, publicReadOrThrow } from '@/features/storefront/lib/data/public-read-cache'

export type PublicFacility = {
  id: string
  name: string
  facilityType?: string | null
  addressLine1?: string | null
  addressLine2?: string | null
  city?: string | null
  region?: string | null
  postalCode?: string | null
  phone?: string | null
  timeZone?: string | null
  photoUrl?: string | null
  photoAltText?: string | null
  departments: Array<{ id: string; name: string }>
}

export type PublicDepartment = {
  id: string
  name: string
  description?: string | null
  phone?: string | null
  photoUrl?: string | null
  photoAltText?: string | null
}

export type PublicCareDirectory = { facilities: PublicFacility[]; departments: PublicDepartment[] }

/** Active locations and departments with their address, phone and photo. Photo addresses are signed and expire, so
 * this read is shared for the same short window as the other public reads and never longer. */
export async function getPublicCareDirectory(): Promise<PublicCareDirectory> {
  const query = `
    query PublicCareDirectory {
      publicCareDirectory {
        facilities { id name facilityType addressLine1 addressLine2 city region postalCode phone timeZone photoUrl photoAltText departments { id name } }
        departments { id name description phone photoUrl photoAltText }
      }
    }
  `
  const response = await cachedPublicRead('publicCareDirectory', () => keystoneClient<{ publicCareDirectory: PublicCareDirectory }>(query).then(publicReadOrThrow))
  if (!response.success) throw new Error('The care directory is unavailable')
  return response.data.publicCareDirectory
}

export function facilityAddress(facility: PublicFacility) {
  const street = [facility.addressLine1, facility.addressLine2].filter(Boolean).join(', ')
  const town = [facility.city, [facility.region, facility.postalCode].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  return [street, town].filter(Boolean)
}

export function facilityKind(facility: PublicFacility) {
  if (facility.facilityType === 'telehealth') return 'Video visits'
  if (facility.facilityType === 'hospital') return 'Hospital'
  return 'Clinic'
}
