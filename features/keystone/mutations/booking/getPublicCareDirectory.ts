import type { Context } from '.keystone/types'
import { publicPhotoUrls } from './publicPhotos'

const MAX_PUBLIC_FACILITIES = 25
const MAX_PUBLIC_DEPARTMENTS = 25
const MAX_DEPARTMENTS_PER_FACILITY = 10

type ImageRow = { id: string; image_id: string | null; imagePath: string | null; altText: string | null }

/**
 * Public directory of the practice's active locations and departments: name, address, phone and photo.
 * Reads with context.sudo() and returns only these directory fields; no staff, patient or schedule data.
 */
export default async function getPublicCareDirectory(_root: unknown, _args: unknown, context: Context) {
  const prisma = context.sudo().prisma as any
  const [facilities, departments] = await Promise.all([
    prisma.facility.findMany({
      where: { status: 'active' },
      orderBy: { name: 'asc' },
      take: MAX_PUBLIC_FACILITIES,
      include: {
        images: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }], take: 1 },
        departments: { where: { status: 'active' }, orderBy: { name: 'asc' }, take: MAX_DEPARTMENTS_PER_FACILITY },
      },
    }),
    prisma.department.findMany({
      where: { status: 'active', facilities: { some: { status: 'active' } } },
      orderBy: { name: 'asc' },
      take: MAX_PUBLIC_DEPARTMENTS,
      include: { images: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }], take: 1 } },
    }),
  ]) as [Array<any>, Array<any>]

  const [facilityPhotos, departmentPhotos] = await Promise.all([
    publicPhotoUrls(context, 'FacilityImage', facilities.map(facility => facility.images[0] as ImageRow | undefined)),
    publicPhotoUrls(context, 'DepartmentImage', departments.map(department => department.images[0] as ImageRow | undefined)),
  ])

  return {
    facilities: facilities.map(facility => ({
      id: facility.id,
      name: facility.name,
      facilityType: facility.facilityType,
      addressLine1: facility.addressLine1 || null,
      addressLine2: facility.addressLine2 || null,
      city: facility.city || null,
      region: facility.region || null,
      postalCode: facility.postalCode || null,
      phone: facility.phone || null,
      timeZone: facility.timeZone,
      photoUrl: facility.images[0] ? facilityPhotos.get(facility.images[0].id) || null : null,
      photoAltText: facility.images[0]?.altText || null,
      departments: facility.departments.map((department: { id: string; name: string }) => ({ id: department.id, name: department.name })),
    })),
    departments: departments.map(department => ({
      id: department.id,
      name: department.name,
      description: department.description || null,
      phone: department.phone || null,
      photoUrl: department.images[0] ? departmentPhotos.get(department.images[0].id) || null : null,
      photoAltText: department.images[0]?.altText || null,
    })),
  }
}
