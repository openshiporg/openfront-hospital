'use client'

import { useEffect, useState } from 'react'

import { fieldClass } from '@/features/platform/components/ward'
import { searchAccessibleFacilities } from '../actions/searchFacilities'
import type { FacilitySearchResult } from '../actions/searchFacilities'


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
    ? 'No active facility available.'
    : unavailable
      ? 'Facility search unavailable.'
      : pending
        ? 'Searching…'
        : search.trim().length < 2
          ? 'Type 2+ characters to search.'
          : noMatches
            ? 'No matching facilities.'
            : ''

  return (
    <div className="grid min-w-0 gap-1.5">
      <label htmlFor={`${id}-search`} className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="grid min-w-0 gap-2 sm:grid-cols-2">
        <input
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
          placeholder="Search facility"
          aria-label={`Search ${label.toLowerCase()} name or location`}
          maxLength={100}
          disabled={disabled || accessibleFacilityCount === 0}
          className={fieldClass}
        />
        <select
          id={id}
          name={name}
          required={required}
          className={fieldClass}
          value={selected?.id || ''}
          aria-label={label}
          disabled={disabled || accessibleFacilityCount === 0}
          onChange={event => {
            const next = visibleOptions.find(option => option.id === event.target.value) || null
            setSelected(next)
            onSelect?.(next?.id || '')
          }}
        >
          <option value="">{selected ? 'Change facility' : 'Select facility'}</option>
          {visibleOptions.map(option => {
            const location = [option.city, option.region].filter(Boolean).join(', ')
            return <option key={option.id} value={option.id}>{[option.name || 'Facility', location].filter(Boolean).join(' · ')}</option>
          })}
        </select>
      </div>
      {count > options.length && <p className="text-xs text-muted-foreground">Showing {options.length} of {count}. Keep typing to narrow.</p>}
      {status && <p role="status" className={`text-xs ${unavailable ? 'text-red-700 dark:text-red-300' : 'text-muted-foreground'}`}>{status}</p>}
    </div>
  )
}
