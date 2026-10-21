import { publicEstimateText } from './publicEstimate'
import type { Context } from '.keystone/types'

const MAX_PUBLIC_APPOINTMENT_TYPES = 25
const MAX_PUBLIC_PROVIDERS_PER_TYPE = 25
const MAX_PUBLIC_FACILITIES_PER_PROVIDER = 10
const catalogCache = new WeakMap<object, Promise<any[]>>()

type AppointmentTypeRecord = {
  id: string
  name: string | null
  slug: string | null
  description: string | null
  durationMinutes: number | null
  priceCents: number | null
}

function providerDisplayName(provider: { firstName?: string | null; lastName?: string | null; credentials?: string | null }) {
  const credentials = provider.credentials ? `, ${provider.credentials}` : ''
  return `${provider.firstName || ''} ${provider.lastName || ''}${credentials}`.trim()
}


async function loadBookableAppointmentTypes(context: Context) {
  const sudo = context.sudo()
  const prisma = sudo.prisma as any
  const appointmentTypes = (await prisma.appointmentType.findMany({
    where: { status: 'bookable' },
    orderBy: { name: 'asc' },
    take: MAX_PUBLIC_APPOINTMENT_TYPES + 1,
    include: {
      providers: {
        where: { status: 'active', facilities: { some: { status: 'active' } } },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        take: MAX_PUBLIC_PROVIDERS_PER_TYPE + 1,
        include: {
          facilities: {
            where: { status: 'active' },
            orderBy: { name: 'asc' },
            take: MAX_PUBLIC_FACILITIES_PER_PROVIDER + 1,
          },
        },
      },
    },
  })) as Array<AppointmentTypeRecord & { providers: any[] }>

  if (
    appointmentTypes.length > MAX_PUBLIC_APPOINTMENT_TYPES ||
    appointmentTypes.some(appointmentType =>
      appointmentType.providers.length > MAX_PUBLIC_PROVIDERS_PER_TYPE ||
      appointmentType.providers.some(provider => provider.facilities.length > MAX_PUBLIC_FACILITIES_PER_PROVIDER),
    )
  ) throw new Error('Public appointment catalog exceeds its configured capacity')

  return appointmentTypes
    .filter((appointmentType) => appointmentType.providers.length > 0)
    .map((appointmentType) => ({
      id: appointmentType.id,
      name: appointmentType.name,
      slug: appointmentType.slug,
      description: appointmentType.description,
      durationMinutes: appointmentType.durationMinutes,
      priceCents: appointmentType.priceCents,
      formattedPrice: publicEstimateText(appointmentType.priceCents),
      providers: appointmentType.providers.map((provider) => ({
        id: provider.id,
        displayName: providerDisplayName(provider),
        specialty: provider.specialty,
        bio: provider.bio,
        locationName: provider.locationName,
        facilities: provider.facilities.map((facility: { id: string; name: string; timeZone: string }) => ({
          id: facility.id,
          name: facility.name,
          timeZone: facility.timeZone,
        })),
      })),
    }))
}

export default function getBookableAppointmentTypes(_root: unknown, _args: unknown, context: Context) {
  const key = context as unknown as object
  const existing = catalogCache.get(key)
  if (existing) return existing
  const pending = loadBookableAppointmentTypes(context)
  catalogCache.set(key, pending)
  void pending.catch(() => catalogCache.delete(key))
  return pending
}
