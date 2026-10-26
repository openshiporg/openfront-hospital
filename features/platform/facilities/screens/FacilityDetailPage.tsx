import Link from 'next/link'
import { notFound } from 'next/navigation'

import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { BoundedDataNotice } from '@/features/platform/components/BoundedDataNotice'
import { WorkspaceLoadError } from '@/features/platform/components/WorkspaceLoadError'
import {
  Code,
  EmptyBoard,
  Facts,
  Panel,
  Pill,
  Readout,
  ReadoutStrip,
  StatusDot,
  StatusTag,
  TitleLine,
  Track,
  WardBody,
  WardHeader,
  WardSection,
  statusLabel,
  toneForStatus,
} from '@/features/platform/components/ward'
import { STRUCTURE_LIMITS, getFacilityStructure } from '../actions/facilityQueries'
import { setStructureStatus } from '../actions/structureMutations'
import { ActionGroup } from '../components/FormSheet'
import { BedSheet, DepartmentSheet, FacilitySheet, RoomSheet, WardSheet } from '../components/StructureSheets'
import {
  FACILITY_TYPES,
  ROOM_TYPES,
  optionLabel,
  type BedRecord,
  type DepartmentRecord,
  type RoomRecord,
  type WardRecord,
} from '../lib/structure'

type Params = Promise<{ id: string }>

const INPATIENT = '/dashboard/platform/inpatient'

function groupBy<T>(items: T[], key: (item: T) => string | undefined) {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const id = key(item)
    if (!id) continue
    map.set(id, [...(map.get(id) ?? []), item])
  }
  return map
}

function BedChip({ bed }: { bed: BedRecord }) {
  return (
    <Link
      href={INPATIENT}
      className="inline-flex items-baseline gap-1.5 rounded-[4px] border bg-background px-2.5 py-0.5 text-xs hover:bg-muted"
      title={`Bed ${bed.bedNumber}: ${statusLabel(bed.status)}`}
    >
      <StatusDot tone={toneForStatus(bed.status)} className="size-1.5 -translate-y-[0.1em] shadow-none" />
      <span className="tabular-nums  text-foreground">{bed.bedNumber}</span>
      <span className="text-muted-foreground">{statusLabel(bed.status)}</span>
    </Link>
  )
}

function RoomRow({ room, beds, facilityId, roomOptions, canManage }: { room: RoomRecord; beds: BedRecord[]; facilityId: string; roomOptions: { value: string; label: string }[]; canManage: boolean }) {
  const inService = room.status !== 'maintenance'
  return (
    <div className="flex min-w-0 flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        <TitleLine as="h4" tone={room.status === 'maintenance' ? 'warn' : toneForStatus(room.status)} status={room.status ?? undefined} className="text-sm font-medium text-foreground">
          Room <span className="tabular-nums ">{room.roomNumber}</span>
        </TitleLine>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 pl-4 text-xs text-muted-foreground">
          <span>{optionLabel(ROOM_TYPES, room.roomType)}</span>
          <span>{statusLabel(room.status)}</span>
          <span className="tabular-nums">{beds.length} bed{beds.length === 1 ? '' : 's'}</span>
        </div>
        {beds.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5 pl-4">
            {beds.map(bed => <BedChip key={bed.id} bed={bed} />)}
          </div>
        )}
      </div>
      {canManage && (
        <div className="pl-4 sm:pl-0">
          <ActionGroup
            actions={[inService
              ? { label: 'Maintenance', action: setStructureStatus.bind(null, 'room', room.id, 'maintenance') }
              : { label: 'Return to service', action: setStructureStatus.bind(null, 'room', room.id, 'available') }]}
          >
            <BedSheet bare facilityId={facilityId} rooms={roomOptions} roomId={room.id} />
          </ActionGroup>
        </div>
      )}
    </div>
  )
}

function WardBlock({
  ward,
  rooms,
  bedsByRoom,
  facilityId,
  wardOptions,
  roomOptions,
  canManage,
}: {
  ward: WardRecord
  rooms: RoomRecord[]
  bedsByRoom: Map<string, BedRecord[]>
  facilityId: string
  wardOptions: { value: string; label: string }[]
  roomOptions: { value: string; label: string }[]
  canManage: boolean
}) {
  const open = ward.status !== 'closed'
  const bedTotal = rooms.reduce((sum, room) => sum + (bedsByRoom.get(room.id)?.length ?? 0), 0)
  return (
    <div className="min-w-0 rounded-[4px] border bg-background px-3 py-3 md:px-4">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <TitleLine as="h4" tone={toneForStatus(ward.status)} status={ward.status ?? undefined} className="text-sm font-semibold text-foreground">{ward.name}</TitleLine>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 pl-4 text-xs text-muted-foreground">
            <StatusTag status={ward.status} />
            <span>{ward.floor ? `Floor ${ward.floor}` : 'Floor not set'}</span>
            <span className="tabular-nums">Capacity {ward.capacity ?? 0}</span>
            <span className="tabular-nums">{rooms.length} room{rooms.length === 1 ? '' : 's'}</span>
            <span className="tabular-nums">{bedTotal} bed{bedTotal === 1 ? '' : 's'}</span>
          </div>
        </div>
        {canManage && (
          <div className="pl-4 sm:pl-0">
            <ActionGroup
              actions={[open
                ? { label: 'Close', action: setStructureStatus.bind(null, 'ward', ward.id, 'closed') }
                : { label: 'Open', action: setStructureStatus.bind(null, 'ward', ward.id, 'open') }]}
            >
              <RoomSheet bare wards={wardOptions} wardId={ward.id} />
            </ActionGroup>
          </div>
        )}
      </div>
      {rooms.length > 0 ? (
        <div className="mt-2 divide-y border-t pl-4">
          {rooms.map(room => (
            <RoomRow key={room.id} room={room} beds={bedsByRoom.get(room.id) ?? []} facilityId={facilityId} roomOptions={roomOptions} canManage={canManage} />
          ))}
        </div>
      ) : (
        <p className="mt-2 pl-4 text-xs text-muted-foreground">No rooms</p>
      )}
    </div>
  )
}

function DepartmentBlock({
  department,
  wards,
  roomsByWard,
  bedsByRoom,
  facilityId,
  departmentOptions,
  wardOptions,
  roomOptions,
  canManage,
}: {
  department: DepartmentRecord
  wards: WardRecord[]
  roomsByWard: Map<string, RoomRecord[]>
  bedsByRoom: Map<string, BedRecord[]>
  facilityId: string
  departmentOptions: { value: string; label: string }[]
  wardOptions: { value: string; label: string }[]
  roomOptions: { value: string; label: string }[]
  canManage: boolean
}) {
  const active = department.status !== 'closed'
  return (
    <Panel className="px-4 py-4 md:px-5">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <TitleLine as="h3" tone={toneForStatus(department.status)} status={department.status ?? undefined} className="text-base font-semibold text-foreground">
            {department.name}
            {department.code && <Code className="ml-2">{department.code}</Code>}
          </TitleLine>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 pl-4 text-xs text-muted-foreground">
            <StatusTag status={department.status} />
            {department.phone && <span>{department.phone}</span>}
            {department.email && <span className="break-all">{department.email}</span>}
            <span className="tabular-nums">{wards.length} ward{wards.length === 1 ? '' : 's'}</span>
          </div>
          {department.description && <p className="mt-2 pl-4 text-sm text-muted-foreground">{department.description}</p>}
        </div>
        {canManage && (
          <div className="pl-4 sm:pl-0">
            <ActionGroup
              actions={[active
                ? { label: 'Close', action: setStructureStatus.bind(null, 'department', department.id, 'closed') }
                : { label: 'Reopen', action: setStructureStatus.bind(null, 'department', department.id, 'active') }]}
            >
              <WardSheet bare departments={departmentOptions} departmentId={department.id} />
            </ActionGroup>
          </div>
        )}
      </div>
      {wards.length > 0 ? (
        <div className="mt-3 grid gap-2 pl-4">
          {wards.map(ward => (
            <WardBlock
              key={ward.id}
              ward={ward}
              rooms={roomsByWard.get(ward.id) ?? []}
              bedsByRoom={bedsByRoom}
              facilityId={facilityId}
              wardOptions={wardOptions}
              roomOptions={roomOptions}
              canManage={canManage}
            />
          ))}
        </div>
      ) : (
        <p className="mt-3 pl-4 text-xs text-muted-foreground">No wards</p>
      )}
    </Panel>
  )
}

export async function FacilityDetailPage({ params }: { params: Params }) {
  const { id } = await params
  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: '/dashboard' },
    { type: 'page' as const, label: 'Platform' },
    { type: 'link' as const, label: 'Facilities', href: '/dashboard/platform/facilities' },
  ]
  const response = await getFacilityStructure(id)
  if (!response.success) {
    return <WorkspaceLoadError title="Facility" description="Facility details, departments, wards, rooms or beds may be unavailable for this session." breadcrumbs={breadcrumbs} />
  }
  const data = response.data
  const facility = data.facility
  if (!facility) notFound()

  const canManage = data.authenticatedItem?.role?.canAccessAllClinicalData === true
  const wardsByDepartment = groupBy(data.wards, ward => ward.department?.id)
  const roomsByWard = groupBy(data.rooms, room => room.ward?.id)
  const bedsByRoom = groupBy(data.beds, bed => bed.room?.id)
  const departmentNames = new Map(data.departments.map(department => [department.id, department.name]))
  const wardNames = new Map(data.wards.map(ward => [ward.id, ward.name]))
  const departmentOptions = data.departments.map(department => ({ value: department.id, label: department.name }))
  const wardOptions = data.wards.map(ward => ({ value: ward.id, label: `${ward.name}${ward.department?.id ? ` · ${departmentNames.get(ward.department.id) ?? ''}` : ''}` }))
  const roomOptions = data.rooms.map(room => ({ value: room.id, label: `${room.roomNumber}${room.ward?.id ? ` · ${wardNames.get(room.ward.id) ?? ''}` : ''}` }))
  const availableBeds = data.beds.filter(bed => bed.status === 'available').length
  const occupiedBeds = data.beds.filter(bed => bed.status === 'occupied').length
  const address = [facility.addressLine1, facility.addressLine2].filter(Boolean).join(', ')

  const truncated = [
    data.departmentsCount > data.departments.length && `Showing ${data.departments.length} of ${data.departmentsCount} departments.`,
    data.wardsCount > data.wards.length && `Showing ${data.wards.length} of ${data.wardsCount} wards.`,
    data.roomsCount > data.rooms.length && `Showing ${data.rooms.length} of ${data.roomsCount} rooms.`,
    data.bedsCount > data.beds.length && `Showing ${data.beds.length} of ${data.bedsCount} beds (limit ${STRUCTURE_LIMITS.beds}).`,
  ].filter((message): message is string => Boolean(message))

  return (
    <PageContainer
      title={facility.name}
      breadcrumbs={[...breadcrumbs, { type: 'page' as const, label: facility.name }]}
      header={<WardHeader
        title={facility.name}
        tone={toneForStatus(facility.status)}
        status={facility.status}
        eyebrow={optionLabel(FACILITY_TYPES, facility.facilityType)}
        meta={<span className="inline-flex flex-wrap gap-x-3"><StatusTag status={facility.status} /><Code>{facility.slug}</Code><span className="tabular-nums">{facility.timeZone}</span></span>}
        actions={canManage ? (
          <>
            <FacilitySheet facility={facility} />
            <ActionGroup
              size="md"
              actions={[facility.status === 'active'
                ? { label: 'Deactivate', action: setStructureStatus.bind(null, 'facility', facility.id, 'inactive') }
                : { label: 'Activate', action: setStructureStatus.bind(null, 'facility', facility.id, 'active'), variant: 'primary' }]}
            />
          </>
        ) : undefined}
      />}
    >
      <WardBody>
        <ReadoutStrip>
          <Readout label="Departments" value={data.departmentsCount} />
          <Readout label="Wards" value={data.wardsCount} />
          <Readout label="Rooms" value={data.roomsCount} />
          <Readout label="Beds" value={data.bedsCount} sub={`${availableBeds} available · ${occupiedBeds} occupied`} tone={availableBeds > 0 ? 'ok' : 'idle'} />
          <Readout label="Providers" value={facility.providersCount} />
        </ReadoutStrip>

        <BoundedDataNotice messages={truncated.length ? truncated : undefined} />

        <WardSection title="Details" id="facility-details">
          <Facts
            className="max-w-2xl"
            items={[
              { label: 'Type', value: optionLabel(FACILITY_TYPES, facility.facilityType) },
              { label: 'Status', value: <StatusTag status={facility.status} /> },
              { label: 'Slug', value: facility.slug, mono: true },
              { label: 'Time zone', value: facility.timeZone, mono: true },
              { label: 'Phone', value: facility.phone || 'Not set' },
              Boolean(address) && { label: 'Address', value: address },
              { label: 'City', value: facility.city || 'Not set' },
              { label: 'Region', value: facility.region || 'Not set' },
              { label: 'Postal code', value: facility.postalCode || 'Not set', mono: Boolean(facility.postalCode) },
            ]}
          />
        </WardSection>

        <WardSection
          title="Departments"
          count={data.departmentsCount}
          id="facility-departments"
          actions={
            <Track>
              <Pill asChild size="sm" variant="plain"><Link href={INPATIENT}>Bed board</Link></Pill>
            </Track>
          }
        >
          {canManage && (
            <div className="mb-3 flex flex-wrap gap-2">
              <ActionGroup>
                <DepartmentSheet bare facilityId={facility.id} />
                {departmentOptions.length > 0 && <WardSheet bare departments={departmentOptions} />}
                {wardOptions.length > 0 && <RoomSheet bare wards={wardOptions} />}
                {roomOptions.length > 0 && <BedSheet bare facilityId={facility.id} rooms={roomOptions} />}
              </ActionGroup>
            </div>
          )}
          {!data.departments.length ? <EmptyBoard title="No departments" /> : (
            <div className="grid gap-3">
              {data.departments.map(department => (
                <DepartmentBlock
                  key={department.id}
                  department={department}
                  wards={wardsByDepartment.get(department.id) ?? []}
                  roomsByWard={roomsByWard}
                  bedsByRoom={bedsByRoom}
                  facilityId={facility.id}
                  departmentOptions={departmentOptions}
                  wardOptions={wardOptions}
                  roomOptions={roomOptions}
                  canManage={canManage}
                />
              ))}
            </div>
          )}
        </WardSection>
      </WardBody>
    </PageContainer>
  )
}
