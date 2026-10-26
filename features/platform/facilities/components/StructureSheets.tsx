'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Plus } from 'lucide-react'
import {
  DEPARTMENT_STATUSES,
  FACILITY_STATUSES,
  FACILITY_TYPES,
  ROOM_STATUSES,
  ROOM_TYPES,
  WARD_STATUSES,
  validateBed,
  validateDepartment,
  validateFacility,
  validateRoom,
  validateWard,
  type FacilityRecord,
} from '../lib/structure'
import { createBed, createDepartment, createFacility, createRoom, createWard, updateFacility } from '../actions/structureMutations'
import { FormSheet, SheetField, SheetInput, SheetSelect, SheetTextarea } from './FormSheet'

function useTimeZones() {
  return useMemo(() => {
    try {
      return (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('timeZone') ?? []
    } catch {
      return []
    }
  }, [])
}

export function FacilitySheet({ facility }: { facility?: FacilityRecord }) {
  const router = useRouter()
  const zones = useTimeZones()
  const editing = Boolean(facility)
  return (
    <FormSheet
      trigger={editing ? <><Pencil aria-hidden />Edit</> : <><Plus aria-hidden />Add facility</>}
      triggerVariant={editing ? 'raised' : 'primary'}
      title={editing ? 'Edit facility' : 'New facility'}
      submitLabel={editing ? 'Save facility' : 'Create facility'}
      validate={values => validateFacility(values).fieldErrors}
      action={values => (facility ? updateFacility(facility.id, values) : createFacility(values))}
      onSuccess={result => {
        const id = (result.success && (result.data as { id?: string } | undefined)?.id) || null
        if (!editing && id) router.push(`/dashboard/platform/facilities/${id}`)
      }}
    >
      <SheetField label="Name" name="name"><SheetInput name="name" required defaultValue={facility?.name ?? ''} autoComplete="off" /></SheetField>
      <SheetField label="Slug" name="slug"><SheetInput name="slug" required defaultValue={facility?.slug ?? ''} autoComplete="off" className="tabular-nums" placeholder="main-campus" /></SheetField>
      <div className="grid grid-cols-2 gap-3">
        <SheetField label="Type" name="facilityType"><SheetSelect name="facilityType" options={FACILITY_TYPES} defaultValue={facility?.facilityType ?? 'clinic'} /></SheetField>
        <SheetField label="Status" name="status"><SheetSelect name="status" options={FACILITY_STATUSES} defaultValue={facility?.status ?? 'active'} /></SheetField>
      </div>
      <SheetField label="Time zone" name="timeZone">
        <SheetInput name="timeZone" required list="facility-time-zones" defaultValue={facility?.timeZone ?? 'UTC'} autoComplete="off" className="tabular-nums" />
        <datalist id="facility-time-zones">{zones.map(zone => <option key={zone} value={zone} />)}</datalist>
      </SheetField>
      <SheetField label="Phone" name="phone"><SheetInput name="phone" type="tel" defaultValue={facility?.phone ?? ''} /></SheetField>
      <SheetField label="City" name="city"><SheetInput name="city" defaultValue={facility?.city ?? ''} /></SheetField>
      <div className="grid grid-cols-2 gap-3">
        <SheetField label="Region" name="region"><SheetInput name="region" defaultValue={facility?.region ?? ''} /></SheetField>
        <SheetField label="Postal code" name="postalCode"><SheetInput name="postalCode" defaultValue={facility?.postalCode ?? ''} /></SheetField>
      </div>
    </FormSheet>
  )
}

export function DepartmentSheet({ facilityId, bare }: { facilityId: string; bare?: boolean }) {
  return (
    <FormSheet
      bare={bare}
      trigger={<><Plus aria-hidden />Department</>}
      triggerSize="sm"
      title="New department"
      submitLabel="Create department"
      validate={values => validateDepartment(values).fieldErrors}
      action={values => createDepartment(facilityId, values)}
    >
      <SheetField label="Name" name="name"><SheetInput name="name" required autoComplete="off" /></SheetField>
      <div className="grid grid-cols-2 gap-3">
        <SheetField label="Code" name="code"><SheetInput name="code" autoComplete="off" className="tabular-nums uppercase" /></SheetField>
        <SheetField label="Status" name="status"><SheetSelect name="status" options={DEPARTMENT_STATUSES} defaultValue="active" /></SheetField>
      </div>
      <SheetField label="Description" name="description"><SheetTextarea name="description" /></SheetField>
      <SheetField label="Phone" name="phone"><SheetInput name="phone" type="tel" /></SheetField>
      <SheetField label="Email" name="email"><SheetInput name="email" type="email" /></SheetField>
    </FormSheet>
  )
}

type Option = { value: string; label: string }

export function WardSheet({ departments, departmentId, bare }: { departments: Option[]; departmentId?: string; bare?: boolean }) {
  return (
    <FormSheet
      bare={bare}
      trigger={<><Plus aria-hidden />Ward</>}
      triggerSize="sm"
      title="New ward"
      submitLabel="Create ward"
      validate={values => validateWard(values).fieldErrors}
      action={createWard}
    >
      <SheetField label="Name" name="name"><SheetInput name="name" required autoComplete="off" /></SheetField>
      <SheetField label="Department" name="departmentId"><SheetSelect name="departmentId" options={[{ value: '', label: 'Select department' }, ...departments]} defaultValue={departmentId ?? ''} /></SheetField>
      <div className="grid grid-cols-2 gap-3">
        <SheetField label="Floor" name="floor"><SheetInput name="floor" /></SheetField>
        <SheetField label="Capacity" name="capacity"><SheetInput name="capacity" type="number" min={0} step={1} inputMode="numeric" defaultValue="0" /></SheetField>
      </div>
      <SheetField label="Status" name="status"><SheetSelect name="status" options={WARD_STATUSES} defaultValue="open" /></SheetField>
    </FormSheet>
  )
}

export function RoomSheet({ wards, wardId, bare }: { wards: Option[]; wardId?: string; bare?: boolean }) {
  return (
    <FormSheet
      bare={bare}
      trigger={<><Plus aria-hidden />Room</>}
      triggerSize="sm"
      title="New room"
      submitLabel="Create room"
      validate={values => validateRoom(values).fieldErrors}
      action={createRoom}
    >
      <SheetField label="Room number" name="roomNumber"><SheetInput name="roomNumber" required autoComplete="off" className="tabular-nums" /></SheetField>
      <SheetField label="Ward" name="wardId"><SheetSelect name="wardId" options={[{ value: '', label: 'Select ward' }, ...wards]} defaultValue={wardId ?? ''} /></SheetField>
      <div className="grid grid-cols-2 gap-3">
        <SheetField label="Type" name="roomType"><SheetSelect name="roomType" options={ROOM_TYPES} defaultValue="private" /></SheetField>
        <SheetField label="Status" name="status"><SheetSelect name="status" options={ROOM_STATUSES} defaultValue="available" /></SheetField>
      </div>
    </FormSheet>
  )
}

export function BedSheet({ facilityId, rooms, roomId, bare }: { facilityId: string; rooms: Option[]; roomId?: string; bare?: boolean }) {
  return (
    <FormSheet
      bare={bare}
      trigger={<><Plus aria-hidden />Bed</>}
      triggerSize="sm"
      title="New bed"
      submitLabel="Create bed"
      validate={values => validateBed(values).fieldErrors}
      action={createBed}
    >
      <input type="hidden" name="facilityId" value={facilityId} />
      <SheetField label="Bed number" name="bedNumber"><SheetInput name="bedNumber" required autoComplete="off" className="tabular-nums" /></SheetField>
      <SheetField label="Room" name="roomId"><SheetSelect name="roomId" options={[{ value: '', label: 'Select room' }, ...rooms]} defaultValue={roomId ?? ''} /></SheetField>
    </FormSheet>
  )
}
