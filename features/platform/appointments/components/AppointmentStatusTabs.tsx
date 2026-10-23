'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Segmented, type WardTone } from '@/features/platform/components/ward'

const tabs: Array<{ id: string; label: string; tone?: WardTone }> = [
  { id: 'all', label: 'All' },
  { id: 'requested', label: 'Requested', tone: 'warn' },
  { id: 'confirmed', label: 'Confirmed', tone: 'info' },
  { id: 'checked_in', label: 'Checked in', tone: 'info' },
  { id: 'in_visit', label: 'In visit', tone: 'accent' },
  { id: 'completed', label: 'Completed', tone: 'ok' },
  { id: 'cancelled', label: 'Cancelled', tone: 'idle' },
  { id: 'no_show', label: 'No show', tone: 'bad' },
]

export function AppointmentStatusTabs({ statusCounts }: { statusCounts: Record<string, number> }) {
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
      label="Appointment status"
      size="sm"
      value={activeStatus}
      onChange={setStatus}
      options={tabs.map(tab => ({ value: tab.id, label: tab.label, tone: tab.tone, count: statusCounts[tab.id] || 0 }))}
    />
  )
}
