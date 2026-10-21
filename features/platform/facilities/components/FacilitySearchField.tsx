'use client'

import { useEffect, useState } from 'react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { searchAccessibleFacilities } from '../actions/searchFacilities'
import type { FacilitySearchResult } from '../actions/searchFacilities'

const selectClassName = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring'

type FacilityOption = FacilitySearchResult['facilities'][number]

export function FacilitySearchField({
  id,
  name = 'facilityId',
  label = 'Facility',
  required = true,
  disabled = false,
  initialOption,
  accessibleFacilityCount,
  onSelect,
}: {
  id: string
  name?: string
  label?: string
  required?: boolean
  disabled?: boolean
  initialOption?: FacilityOption | null
  accessibleFacilityCount?: number
  onSelect?: (value: string) => void
}) {
  const [search, setSearch] = useState('')
  const [options, setOptions] = useState<FacilityOption[]>([])
  const [count, setCount] = useState(0)
  const [selected, setSelected] = useState<FacilityOption | null>(initialOption || null)
  const [pending, setPending] = useState(false)
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    let cancelled = false
    const normalized = search.trim()
    if (disabled || normalized.length < 2) {
      setOptions([])
      setCount(0)
      setPending(false)
      setUnavailable(false)
      return
    }

    const timer = setTimeout(() => {
      setPending(true)
      setUnavailable(false)
      setOptions([])
      setCount(0)
      void searchAccessibleFacilities(normalized).then(response => {
        if (cancelled) return
        if (!response.success) {
          setUnavailable(true)
          return
        }
        setOptions(response.data.facilities)
        setCount(response.data.facilitiesCount)
      }).catch(() => {
        if (!cancelled) setUnavailable(true)
      }).finally(() => {
        if (!cancelled) setPending(false)
      })
    }, 250)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [disabled, search])

  const visibleOptions = selected && !options.some(option => option.id === selected.id)
    ? [selected, ...options]
    : options
  const noMatches = !disabled && !pending && !unavailable && search.trim().length >= 2 && options.length === 0
  const status = disabled
    ? 'No accessible active facility is available for this session.'
    : unavailable
      ? 'Facility search is unavailable for this session. Access could not be verified; no empty result is being inferred.'
      : pending
        ? 'Searching accessible facilities…'
        : search.trim().length < 2
          ? 'Enter at least 2 characters to search accessible active facilities.'
          : noMatches
            ? 'No matching accessible active facilities were found.'
            : ''

  return (
    <div className="space-y-2">
      <Label htmlFor={`${id}-search`}>{label}</Label>
      <Input
        id={`${id}-search`}
        type="search"
        value={search}
        onChange={event => {
          setSearch(event.target.value)
          if (selected) {
            setSelected(null)
            onSelect?.('')
          }
        }}
        placeholder="Search facility name or location"
        aria-label={`Search ${label.toLowerCase()} name or location`}
        maxLength={100}
        disabled={disabled || accessibleFacilityCount === 0}
      />
      <select
        id={id}
        name={name}
        required={required}
        className={selectClassName}
        value={selected?.id || ''}
        aria-label={label}
        disabled={disabled || accessibleFacilityCount === 0}
        onChange={event => {
          const next = visibleOptions.find(option => option.id === event.target.value) || null
          setSelected(next)
          onSelect?.(next?.id || '')
        }}
      >
        <option value="">{selected ? 'Change facility' : 'Select a searched facility'}</option>
        {visibleOptions.map(option => {
          const location = [option.city, option.region].filter(Boolean).join(', ')
          return <option key={option.id} value={option.id}>{[option.name || 'Facility', location].filter(Boolean).join(' · ')}</option>
        })}
      </select>
      {count > options.length && <p className="text-xs text-muted-foreground">Showing {options.length} of {count} matching accessible facilities. Add more characters to narrow results.</p>}
      {status && <p role="status" className="text-xs text-muted-foreground">{status}</p>}
    </div>
  )
}
