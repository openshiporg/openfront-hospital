export const WORKLIST_PAGE_SIZE = 25
export const MAX_WORKLIST_SKIP = 1_000
export const MAX_WORKLIST_PAGE = Math.floor(MAX_WORKLIST_SKIP / WORKLIST_PAGE_SIZE) + 1
export const MAX_REACHABLE_WORKLIST_ROWS = MAX_WORKLIST_SKIP + WORKLIST_PAGE_SIZE

export function parseWorklistPage(value: string | string[] | undefined) {
  const candidate = Array.isArray(value) ? value[0] : value
  if (!candidate || !/^\d+$/.test(candidate)) return 1
  const page = Number(candidate)
  if (!Number.isSafeInteger(page) || page < 1) return 1
  return Math.min(page, MAX_WORKLIST_PAGE)
}

export function worklistPageSkip(page: number) {
  const boundedPage = Number.isSafeInteger(page) ? Math.min(Math.max(page, 1), MAX_WORKLIST_PAGE) : 1
  return (boundedPage - 1) * WORKLIST_PAGE_SIZE
}

export function worklistPageCount(totalCount: number) {
  return Math.ceil(Math.max(0, totalCount) / WORKLIST_PAGE_SIZE)
}

export function worklistPageHref(
  href: string,
  pageKey: string,
  pageParams: Record<string, number>,
  targetPage: number,
  preservedParams: Record<string, string | string[] | undefined> = {},
) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(pageParams)) {
    if (key !== pageKey && value > 1) params.set(key, String(value))
  }
  if (targetPage > 1) params.set(pageKey, String(targetPage))
  for (const [key, rawValue] of Object.entries(preservedParams)) {
    if (key === pageKey || key in pageParams) continue
    const values = Array.isArray(rawValue) ? rawValue.slice(0, 4) : [rawValue]
    for (const value of values) {
      if (typeof value === 'string' && value.length > 0 && value.length <= 200) params.append(key, value)
    }
  }
  const query = params.toString()
  return query ? `${href}?${query}` : href
}
