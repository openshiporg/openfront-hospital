'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Segmented, type WardTone } from '@/features/platform/components/ward'

const tabs: Array<{ id: string; label: string; tone?: WardTone }> = [
  { id: 'all', label: 'All' },
  { id: 'not_sent', label: 'Access active', tone: 'idle' },
  { id: 'sent', label: 'Legacy sent', tone: 'info' },
  { id: 'in_progress', label: 'Legacy in progress', tone: 'info' },
  { id: 'submitted', label: 'Submitted', tone: 'warn' },
  { id: 'needs_review', label: 'Needs review', tone: 'warn' },
  { id: 'reviewed', label: 'Reviewed', tone: 'ok' },
]

export function IntakeStatusTabs({ statusCounts }: { statusCounts: Record<string, number> }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const safeSearchParams = searchParams ?? new URLSearchParams()
  const activeStatus = safeSearchParams.get('status') || 'all'

  const setStatus = (status: string) => {
    const params = new URLSearchParams(safeSearchParams.toString())
    params.delete('cursor')
    if (status === 'all') params.delete('status')
    else params.set('status', status)
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <Segmented
      label="Intake status"
      size="sm"
      value={activeStatus}
      onChange={setStatus}
      options={tabs.map(tab => ({ value: tab.id, label: tab.label, tone: tab.tone, count: statusCounts[tab.id] || 0 }))}
    />
  )
}
