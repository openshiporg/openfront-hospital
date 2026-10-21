export type CommunicationFilters = {
  search: string
  status: string
  channel: string
  sort: string
}

const STATUSES = new Set(['open', 'all', 'manual_required', 'queued', 'failed', 'sent', 'delivered', 'completed'])
const CHANNELS = new Set(['all', 'phone', 'sms', 'email'])
const SORTS = new Set(['oldest', 'newest'])

export function normalizeCommunicationFilters(input: Record<string, string | string[] | undefined>): CommunicationFilters {
  const value = (key: string) => typeof input[key] === 'string' ? input[key].trim() : ''
  const status = value('status')
  const channel = value('channel')
  const sort = value('sort')
  return {
    search: value('search').slice(0, 80),
    status: STATUSES.has(status) ? status : 'open',
    channel: CHANNELS.has(channel) ? channel : 'all',
    sort: SORTS.has(sort) ? sort : 'oldest',
  }
}
