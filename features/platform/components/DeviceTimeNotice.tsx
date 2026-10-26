'use client'
import { useEffect, useState } from 'react'
export function DeviceTimeNotice() {
  const [zone, setZone] = useState('')
  useEffect(() => { setZone(Intl.DateTimeFormat().resolvedOptions().timeZone) }, [])
  return <p role="note" className="tabular-nums text-[11px] text-muted-foreground md:col-span-2">Device time zone: {zone || 'checking…'}</p>
}
