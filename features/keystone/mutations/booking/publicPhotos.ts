import type { Context } from '.keystone/types'

type ImageRecord = { id: string; image_id?: string | null; imagePath?: string | null; altText?: string | null }
type ImageList = 'ClinicianImage' | 'FacilityImage' | 'DepartmentImage'

function canonicalImagePath(imagePath?: string | null) {
  if (!imagePath?.startsWith('/images/') || imagePath.includes('..')) return null
  return imagePath
}

/**
 * Public photo address for each image record: the file uploaded from the dashboard when there is one (its storage
 * URL is signed by the image field, so it is read through the list), otherwise the record's canonical /images/ path.
 */
export async function publicPhotoUrls(context: Context, list: ImageList, records: Array<ImageRecord | null | undefined>) {
  const found = records.filter((record): record is ImageRecord => Boolean(record))
  const urls = new Map<string, string>()
  for (const record of found) {
    const path = canonicalImagePath(record.imagePath)
    if (path) urls.set(record.id, path)
  }
  const uploaded = found.filter(record => record.image_id).map(record => record.id)
  if (uploaded.length) {
    const rows = await (context.sudo().query as any)[list].findMany({
      where: { id: { in: uploaded } },
      take: uploaded.length,
      query: 'id image { url }',
    }) as Array<{ id: string; image: { url: string } | null }>
    for (const row of rows) if (row.image?.url) urls.set(row.id, row.image.url)
  }
  return urls
}
