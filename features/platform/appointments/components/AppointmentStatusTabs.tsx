'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'

const tabs = [
  { id: 'all', label: 'All' },
  { id: 'requested', label: 'Requested' },
  { id: 'confirmed', label: 'Confirmed' },
  { id: 'checked_in', label: 'Checked in' },
  { id: 'in_visit', label: 'In visit' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
  { id: 'no_show', label: 'No show' },
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
    <div className="flex gap-2 overflow-x-auto border-b bg-background px-4 py-3 md:px-6">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          aria-pressed={activeStatus === tab.id}
          onClick={() => setStatus(tab.id)}
          className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-ring ${
            activeStatus === tab.id
              ? 'border-foreground bg-foreground text-background'
              : 'border-border bg-background text-muted-foreground hover:border-zinc-400 hover:text-foreground'
          }`}
        >
          {tab.label}
          <span className="ml-1 opacity-70">{statusCounts[tab.id] || 0}</span>
        </button>
      ))}
    </div>
  )
}
