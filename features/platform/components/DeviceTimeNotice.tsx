 'use client'
import { useEffect, useState } from 'react'
export function DeviceTimeNotice() {
  const [zone, setZone] = useState('')
  useEffect(() => { setZone(Intl.DateTimeFormat().resolvedOptions().timeZone) }, [])
  return <p role="note" className="text-xs text-muted-foreground md:col-span-2">Date/time entry uses your device time zone: {zone || 'checking device zone…'}. Facility displays may use a different zone. Clock-change gaps and ambiguous times are rejected.</p>
}
