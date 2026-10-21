import { publicEstimateText } from './publicEstimate'
import type { Context } from '.keystone/types'

const MAX_PUBLIC_PROVIDERS = 50
const MAX_PUBLIC_VISIT_TYPES_PER_PROVIDER = 25
const providerCatalogCache = new WeakMap<object, Promise<any[]>>()

type ProviderRecord = {
  id: string
  firstName: string | null
  lastName: string | null
  credentials: string | null
  specialty: string | null
  bio: string | null
  locationName: string | null
  status: string | null
}

type ClinicianImageRecord = {
  imagePath: string | null
  altText: string | null
}

type AppointmentTypeRecord = {
  id: string
  name: string | null
  slug: string | null
  durationMinutes: number | null
  priceCents: number | null
  status: string | null
}

function providerDisplayName(provider: {
  firstName?: string | null
  lastName?: string | null
  credentials?: string | null
}) {
  const credentials = provider.credentials ? `, ${provider.credentials}` : ''
  return `${provider.firstName || ''} ${provider.lastName || ''}${credentials}`.trim()
}


function canonicalImagePath(imagePath?: string | null) {
  if (!imagePath?.startsWith('/images/') || imagePath.includes('..')) return null
  return imagePath
}

/**
 * Public catalog of active providers and the visit types they offer.
 * Uses context.sudo() to read non-PHI provider directory fields (name,
 * credentials, specialty, bio, location) and their bookable appointment types.
 * Mirrors the bookableAppointmentTypes access boundary.
 */
async function loadBookableProviders(context: Context) {
  const sudo = context.sudo()
  const prisma = sudo.prisma as any
  const providers = (await prisma.provider.findMany({
    where: {
      status: 'active',
      facilities: { some: { status: 'active' } },
      appointmentTypes: { some: { status: 'bookable' } },
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    take: MAX_PUBLIC_PROVIDERS + 1,
    include: {
      appointmentTypes: {
        where: { status: 'bookable' },
        orderBy: { name: 'asc' },
        take: MAX_PUBLIC_VISIT_TYPES_PER_PROVIDER + 1,
      },
      clinicians: {
        where: { active: true },
        orderBy: { createdAt: 'asc' },
        take: 1,
        include: {
          images: {
            orderBy: { order: 'asc' },
            take: 1,
          },
        },
      },
    },
  })) as Array<
    ProviderRecord & {
      appointmentTypes: AppointmentTypeRecord[]
      clinicians: Array<{ images: ClinicianImageRecord[] }>
    }
  >

  if (
    providers.length > MAX_PUBLIC_PROVIDERS ||
    providers.some(provider => provider.appointmentTypes.length > MAX_PUBLIC_VISIT_TYPES_PER_PROVIDER)
  ) throw new Error('Public provider catalog exceeds its configured capacity')

  return providers.map((provider) => ({
    id: provider.id,
    displayName: providerDisplayName(provider),
    firstName: provider.firstName,
    lastName: provider.lastName,
    credentials: provider.credentials,
    specialty: provider.specialty,
    bio: provider.bio,
    locationName: provider.locationName,
    imagePath: canonicalImagePath(provider.clinicians[0]?.images[0]?.imagePath),
    imageAltText: provider.clinicians[0]?.images[0]?.altText || null,
    appointmentTypes: provider.appointmentTypes.map((appointmentType) => ({
      id: appointmentType.id,
      name: appointmentType.name,
      slug: appointmentType.slug,
      durationMinutes: appointmentType.durationMinutes,
      formattedPrice: publicEstimateText(appointmentType.priceCents),
    })),
  }))
}

export default function getBookableProviders(_root: unknown, _args: unknown, context: Context) {
  const key = context as unknown as object
  const existing = providerCatalogCache.get(key)
  if (existing) return existing
  const pending = loadBookableProviders(context)
  providerCatalogCache.set(key, pending)
  void pending.catch(() => providerCatalogCache.delete(key))
  return pending
}
