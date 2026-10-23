import Link from 'next/link';

import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';
import { BoundedDataNotice } from '@/features/platform/components/BoundedDataNotice';
import { WorkspaceLoadError } from '@/features/platform/components/WorkspaceLoadError';
import {
  Actions,
  Board,
  BoardRow,
  Code,
  EmptyBoard,
  Pill,
  Readout,
  ReadoutStrip,
  StatusTag,
  WardBody,
  WardHeader,
  WardSection,
  Wristband,
  toneForStatus,
  statusLabel,
} from '@/features/platform/components/ward';

type ClinicalOperationsData = {
  encounters: Array<{ id: string; encounterNumber: string; status: string; chiefComplaint?: string | null; patient?: { displayName: string } | null; provider?: { displayName: string } | null; department?: { name: string } | null }>;
  admissions: Array<{ id: string; admissionNumber: string; status: string; dischargeDisposition?: string | null; patient?: { displayName: string } | null; room?: { roomNumber: string } | null; bed?: { bedNumber: string } | null }>;
  departments: Array<{ id: string; name: string; code?: string | null; status: string; phone?: string | null; email?: string | null; images: Array<{ imagePath?: string | null; altText?: string | null }> }>;
  facilities: Array<{ id: string; name: string; slug: string; facilityType: string; status: string; city?: string | null; departments: Array<{ name: string }>; images: Array<{ imagePath?: string | null; altText?: string | null }> }>;
  wards: Array<{ id: string; name: string; floor?: string | null; status: string; capacity?: number | null; department?: { name: string } | null }>;
  rooms: Array<{ id: string; roomNumber: string; roomType: string; status: string; ward?: { name: string } | null }>;
  beds: Array<{ id: string; bedNumber: string; status: string; room?: { roomNumber: string } | null; currentPatient?: { displayName: string } | null }>; 
  clinicians: Array<{ id: string; displayName: string; clinicianType: string; licenseNumber?: string | null; active: boolean; department?: { name: string } | null; images: Array<{ imagePath?: string | null; altText?: string | null }> }>; 
  vitalSigns: Array<{ id: string; recordedAt?: string | null; temperatureC?: number | null; temperatureTenthsC?: number | null; systolicBp?: number | null; diastolicBp?: number | null; heartRate?: number | null; oxygenSaturation?: number | null; patient?: { displayName: string } | null; encounter?: { encounterNumber: string } | null }>;
  medicalOrders: Array<{ id: string; orderNumber: string; orderType: string; status: string; summary?: string | null; patient?: { displayName: string } | null }>;
  prescriptions: Array<{ id: string; prescriptionNumber: string; medicationName: string; dosage?: string | null; frequency?: string | null; status: string; patient?: { displayName: string } | null }>;
  labTests: Array<{ id: string; name: string; code?: string | null; category?: string | null; specimenType?: string | null; turnaroundHours?: number | null; active: boolean }>;
  labResults: Array<{ id: string; resultNumber: string; status: string; resultValue?: string | null; abnormalFlag: string; patient?: { displayName: string } | null; labTest?: { name: string } | null }>;
  procedures: Array<{ id: string; procedureNumber: string; procedureName: string; status: string; patient?: { displayName: string } | null; provider?: { displayName: string } | null }>;
  insuranceClaims: Array<{ id: string; claimNumber: string; payerName?: string | null; status: string; billedAmountCents?: number | null; paidAmountCents?: number | null; patient?: { displayName: string } | null }>;
  carePlans: Array<{ id: string; title: string; status: string; goals?: string | null; patient?: { displayName: string } | null; provider?: { displayName: string } | null }>;
  encountersCount: number; admissionsCount: number; departmentsCount: number; facilitiesCount: number;
  wardsCount: number; roomsCount: number; bedsCount: number; cliniciansCount: number;
  vitalSignsCount: number; medicalOrdersCount: number; prescriptionsCount: number; labTestsCount: number;
  labResultsCount: number; proceduresCount: number; insuranceClaimsCount: number; carePlansCount: number;
};

const clinicalOperationsQuery = `
  query ClinicalOperationsPage {
    encounters(orderBy: [{ createdAt: desc }], take: 8) { id encounterNumber status chiefComplaint patient { displayName } provider { displayName } department { name } }
    admissions(orderBy: [{ createdAt: desc }], take: 8) { id admissionNumber status dischargeDisposition patient { displayName } room { roomNumber } bed { bedNumber } }
    departments(orderBy: [{ createdAt: desc }], take: 8) { id name code status phone email images(orderBy: [{ order: asc }], take: 1) { imagePath altText } }
    facilities(orderBy: [{ createdAt: desc }], take: 8) { id name slug facilityType status city departments(take: 8) { name } images(orderBy: [{ order: asc }], take: 1) { imagePath altText } }
    wards(orderBy: [{ createdAt: desc }], take: 8) { id name floor status capacity department { name } }
    rooms(orderBy: [{ createdAt: desc }], take: 8) { id roomNumber roomType status ward { name } }
    beds(orderBy: [{ createdAt: desc }], take: 8) { id bedNumber status room { roomNumber } currentPatient { displayName } }
    clinicians(orderBy: [{ createdAt: desc }], take: 8) { id displayName clinicianType licenseNumber active department { name } images(orderBy: [{ order: asc }], take: 1) { imagePath altText } }
    vitalSigns(orderBy: [{ recordedAt: desc }], take: 8) { id recordedAt temperatureC temperatureTenthsC systolicBp diastolicBp heartRate oxygenSaturation patient { displayName } encounter { encounterNumber } }
    medicalOrders(orderBy: [{ createdAt: desc }], take: 8) { id orderNumber orderType status summary patient { displayName } }
    prescriptions(orderBy: [{ createdAt: desc }], take: 8) { id prescriptionNumber medicationName dosage frequency status patient { displayName } }
    labTests(orderBy: [{ createdAt: desc }], take: 8) { id name code category specimenType turnaroundHours active }
    labResults(orderBy: [{ createdAt: desc }], take: 8) { id resultNumber status resultValue abnormalFlag patient { displayName } labTest { name } }
    procedures(orderBy: [{ createdAt: desc }], take: 8) { id procedureNumber procedureName status patient { displayName } provider { displayName } }
    insuranceClaims(orderBy: [{ createdAt: desc }], take: 8) { id claimNumber payerName status billedAmountCents paidAmountCents patient { displayName } }
    carePlans(orderBy: [{ createdAt: desc }], take: 8) { id title status goals patient { displayName } provider { displayName } }
    encountersCount admissionsCount departmentsCount facilitiesCount wardsCount roomsCount bedsCount cliniciansCount
    vitalSignsCount medicalOrdersCount prescriptionsCount labTestsCount labResultsCount proceduresCount insuranceClaimsCount carePlansCount
  }
`;

function money(cents?: number | null) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format((cents ?? 0) / 100);
}

export default async function ClinicalOperationsPage() {
  const breadcrumbs = [{ type: 'link' as const, label: 'Dashboard', href: '/dashboard' }, { type: 'page' as const, label: 'Clinical Operations' }];
  const response = await keystoneClient<ClinicalOperationsData>(clinicalOperationsQuery);
  if (!response.success) {
    return <WorkspaceLoadError title="Clinical operations" description="Operational clinical records may be incomplete." breadcrumbs={breadcrumbs} />;
  }
  const data = response.data;

  const encounters = data.encounters;
  const admissions = data.admissions;
  const departments = data.departments;
  const facilities = data.facilities;
  const wards = data.wards;
  const rooms = data.rooms;
  const beds = data.beds;
  const clinicians = data.clinicians;
  const vitalSigns = data.vitalSigns;
  const medicalOrders = data.medicalOrders;
  const prescriptions = data.prescriptions;
  const labTests = data.labTests;
  const labResults = data.labResults;
  const procedures = data.procedures;
  const insuranceClaims = data.insuranceClaims;
  const carePlans = data.carePlans;

  const facilityRows = data.facilitiesCount + data.departmentsCount + data.wardsCount + data.roomsCount + data.bedsCount;
  const careRows = data.encountersCount + data.admissionsCount + data.carePlansCount + data.cliniciansCount;
  const clinicalRows = data.vitalSignsCount + data.medicalOrdersCount + data.prescriptionsCount + data.proceduresCount;
  const diagnosticsRows = data.labTestsCount + data.labResultsCount + data.insuranceClaimsCount;
  const boundedSamples = [
    ['encounters', encounters.length, data.encountersCount], ['admissions', admissions.length, data.admissionsCount],
    ['departments', departments.length, data.departmentsCount], ['facilities', facilities.length, data.facilitiesCount],
    ['wards', wards.length, data.wardsCount], ['rooms', rooms.length, data.roomsCount], ['beds', beds.length, data.bedsCount],
    ['clinicians', clinicians.length, data.cliniciansCount], ['vital signs', vitalSigns.length, data.vitalSignsCount],
    ['order coordination items', medicalOrders.length, data.medicalOrdersCount], ['prescription evidence', prescriptions.length, data.prescriptionsCount],
    ['lab tests', labTests.length, data.labTestsCount], ['lab result evidence', labResults.length, data.labResultsCount],
    ['procedure evidence', procedures.length, data.proceduresCount], ['claim evidence', insuranceClaims.length, data.insuranceClaimsCount],
    ['care plans', carePlans.length, data.carePlansCount],
  ] as const;
  const sampleNotices = boundedSamples.filter(([, loaded, total]) => total > loaded).map(([label, loaded, total]) => `Recent ${label}: showing ${loaded} of ${total} accessible records.`);

  const occupiedBeds = beds.filter((bed) => /occupied/i.test(bed.status)).length;
  const activeEncounters = encounters.filter((encounter) => ['open', 'in_progress'].includes(encounter.status)).length;

  return (
    <PageContainer
      title="Clinical Operations"
      header={
        <WardHeader
          title="Clinical operations"
          meta={<span className="font-mono text-xs tabular-nums">{data.facilitiesCount} facilities · {data.cliniciansCount} clinicians</span>}
          actions={
            <Actions>
              <Pill asChild><Link href="/dashboard/platform/patients">Patients</Link></Pill>
              <Pill asChild variant="primary"><Link href="/dashboard/platform/encounters">Manage encounters</Link></Pill>
            </Actions>
          }
        />
      }
      breadcrumbs={breadcrumbs}
    >
      <WardBody>
        <ReadoutStrip>
          <Readout label="Facility map" value={facilityRows} sub={`${data.facilitiesCount} facilities · ${data.bedsCount} beds`} />
          <Readout label="Care coordination" value={careRows} sub={`${data.encountersCount} encounters · ${data.admissionsCount} admissions`} tone="info" />
          <Readout label="Operational records" value={clinicalRows} sub={`${data.medicalOrdersCount} orders · ${data.prescriptionsCount} Rx`} />
          <Readout label="External records" value={diagnosticsRows} sub={`${data.labResultsCount} results · ${data.insuranceClaimsCount} claims`} />
        </ReadoutStrip>

        <BoundedDataNotice messages={sampleNotices} />

        <WardSection title="Facilities" count={data.facilitiesCount} id="clinical-facilities">
          {facilities.length ? (
            <Board>
              {facilities.map((facility) => (
                <BoardRow
                  key={facility.id}
                  tone={toneForStatus(facility.status)}
                  status={statusLabel(facility.status)}
                  title={facility.name}
                  meta={<>
                    <span>{statusLabel(facility.facilityType)}</span>
                    <span>{facility.city || 'No city'}</span>
                    <span>{facility.departments.length ? facility.departments.map((department) => department.name).join(', ') : 'No departments'}</span>
                  </>}
                  aside={facility.images[0]?.imagePath ? <img src={facility.images[0].imagePath} alt={facility.images[0].altText || facility.name} className="h-12 w-20 rounded-md border object-cover" /> : undefined}
                />
              ))}
            </Board>
          ) : <EmptyBoard title="No facilities found." />}
        </WardSection>

        <div className="grid min-w-0 gap-6 xl:grid-cols-2">
          <WardSection title="Encounters" count={data.encountersCount} id="clinical-encounters">
            {encounters.length ? (
              <Board>
                {encounters.map((encounter) => (
                  <BoardRow
                    key={encounter.id}
                    tone={toneForStatus(encounter.status)}
                    status={statusLabel(encounter.status)}
                    title={<Wristband name={encounter.patient?.displayName ?? 'No patient'} identifier={encounter.encounterNumber} />}
                    meta={<>
                      <span>{encounter.provider?.displayName ?? 'No provider'}</span>
                      {encounter.department?.name && <span>{encounter.department.name}</span>}
                      <span>{encounter.chiefComplaint || 'No complaint'}</span>
                    </>}
                    aside={<StatusTag status={encounter.status} />}
                  />
                ))}
              </Board>
            ) : <EmptyBoard title="No encounters found." />}
            {activeEncounters > 0 && <p className="mt-2 text-xs text-muted-foreground">{activeEncounters} of {encounters.length} recent still active</p>}
          </WardSection>

          <WardSection title="Admissions and care plans" count={data.admissionsCount + data.carePlansCount} id="clinical-admissions">
            {admissions.length || carePlans.length ? (
              <Board>
                {admissions.map((admission) => (
                  <BoardRow
                    key={admission.id}
                    tone={toneForStatus(admission.status)}
                    status={statusLabel(admission.status)}
                    title={<Wristband name={admission.patient?.displayName ?? 'No patient'} identifier={admission.admissionNumber} />}
                    meta={<><span>Room {admission.room?.roomNumber ?? '—'}</span><span>Bed {admission.bed?.bedNumber ?? '—'}</span></>}
                    aside={<StatusTag status={admission.status} />}
                  />
                ))}
                {carePlans.map((plan) => (
                  <BoardRow
                    key={plan.id}
                    tone={toneForStatus(plan.status)}
                    status={statusLabel(plan.status)}
                    title={plan.title}
                    meta={<><span>Care plan</span><span>{plan.patient?.displayName ?? 'No patient'}</span><span>{plan.provider?.displayName ?? 'No provider'}</span></>}
                    aside={<StatusTag status={plan.status} />}
                  />
                ))}
              </Board>
            ) : <EmptyBoard title="No admissions or care plans found." />}
          </WardSection>
        </div>

        <div className="grid min-w-0 gap-6 xl:grid-cols-2">
          <WardSection title="Wards, rooms and beds" count={data.wardsCount + data.roomsCount + data.bedsCount} id="clinical-capacity">
            {beds.length > 0 && <p className="mb-2 text-xs text-muted-foreground"><span className="font-mono tabular-nums text-foreground">{occupiedBeds}</span> of {beds.length} recent beds occupied</p>}
            {wards.length || rooms.length || beds.length ? (
              <Board>
                {wards.map((ward) => (
                  <BoardRow key={ward.id} tone={toneForStatus(ward.status)} status={statusLabel(ward.status)} title={ward.name}
                    meta={<><span>Ward</span><span>Floor {ward.floor || '—'}</span><span>Capacity {ward.capacity ?? 0}</span><span>{ward.department?.name ?? 'No department'}</span></>} />
                ))}
                {rooms.map((room) => (
                  <BoardRow key={room.id} tone={toneForStatus(room.status)} status={statusLabel(room.status)} title={`Room ${room.roomNumber}`}
                    meta={<><span>{statusLabel(room.roomType)}</span><span>{room.ward?.name ?? 'No ward'}</span></>} aside={<StatusTag status={room.status} />} />
                ))}
                {beds.map((bed) => (
                  <BoardRow key={bed.id} tone={toneForStatus(bed.status)} status={statusLabel(bed.status)} title={`Bed ${bed.bedNumber}`}
                    meta={<><span>Room {bed.room?.roomNumber ?? '—'}</span><span>{bed.currentPatient?.displayName ?? 'No patient'}</span></>} aside={<StatusTag status={bed.status} />} />
                ))}
              </Board>
            ) : <EmptyBoard title="No wards, rooms or beds found." />}
          </WardSection>

          <WardSection title="Departments and clinicians" count={data.departmentsCount + data.cliniciansCount} id="clinical-staff">
            {departments.length || clinicians.length ? (
              <Board>
                {departments.map((department) => (
                  <BoardRow key={department.id} tone={toneForStatus(department.status)} status={statusLabel(department.status)} title={department.name}
                    meta={<><span>Department</span><Code>{department.code || 'No code'}</Code>{department.phone && <span>{department.phone}</span>}</>}
                    aside={department.images[0]?.imagePath ? <img src={department.images[0].imagePath} alt={department.images[0].altText || department.name} className="h-10 w-16 rounded-md border object-cover" /> : undefined} />
                ))}
                {clinicians.map((clinician) => (
                  <BoardRow key={clinician.id} tone={clinician.active ? 'ok' : 'idle'} status={clinician.active ? 'Active' : 'Inactive'} title={clinician.displayName}
                    meta={<><span>{statusLabel(clinician.clinicianType)}</span><span>{clinician.department?.name ?? 'No department'}</span><span>{clinician.active ? 'Active' : 'Inactive'}</span></>}
                    aside={clinician.images[0]?.imagePath ? <img src={clinician.images[0].imagePath} alt={clinician.images[0].altText || clinician.displayName} className="size-10 rounded-full border object-cover" /> : undefined} />
                ))}
              </Board>
            ) : <EmptyBoard title="No departments or clinicians found." />}
          </WardSection>
        </div>

        <div className="grid min-w-0 gap-6 xl:grid-cols-2">
          <WardSection title="Vitals, orders and procedures" count={clinicalRows} id="clinical-records">
            {vitalSigns.length || medicalOrders.length || prescriptions.length || procedures.length ? (
              <Board>
                {vitalSigns.map((vital) => (
                  <BoardRow key={vital.id} title={vital.patient?.displayName ?? 'No patient'}
                    meta={<>
                      <span>Vitals</span>
                      <span className="font-mono tabular-nums">Temp {vital.temperatureTenthsC != null ? `${(vital.temperatureTenthsC / 10).toFixed(1)}°C` : vital.temperatureC != null ? `${vital.temperatureC}°C` : '—'}</span>
                      <span className="font-mono tabular-nums">BP {vital.systolicBp ?? '—'}/{vital.diastolicBp ?? '—'}</span>
                      <span className="font-mono tabular-nums">HR {vital.heartRate ?? '—'}</span>
                      <span className="font-mono tabular-nums">O₂ {vital.oxygenSaturation ?? '—'}%</span>
                      {vital.encounter?.encounterNumber && <Code>{vital.encounter.encounterNumber}</Code>}
                    </>} />
                ))}
                {medicalOrders.map((order) => (
                  <BoardRow key={order.id} tone={toneForStatus(order.status)} status={statusLabel(order.status)} title={<Code className="text-[13px] text-foreground">{order.orderNumber}</Code>}
                    meta={<><span>{statusLabel(order.orderType)}</span><span>{order.patient?.displayName ?? 'No patient'}</span></>} aside={<StatusTag status={order.status} />} />
                ))}
                {prescriptions.map((rx) => (
                  <BoardRow key={rx.id} tone={toneForStatus(rx.status)} status={statusLabel(rx.status)} title={rx.medicationName}
                    meta={<><Code>{rx.prescriptionNumber}</Code><span>{rx.dosage || 'No dose'}</span><span>{rx.frequency || 'No frequency'}</span></>} aside={<StatusTag status={rx.status} />} />
                ))}
                {procedures.map((procedure) => (
                  <BoardRow key={procedure.id} tone={toneForStatus(procedure.status)} status={statusLabel(procedure.status)} title={procedure.procedureName}
                    meta={<><Code>{procedure.procedureNumber}</Code><span>{procedure.patient?.displayName ?? 'No patient'}</span></>} aside={<StatusTag status={procedure.status} />} />
                ))}
              </Board>
            ) : <EmptyBoard title="No operational records found." />}
          </WardSection>

          <WardSection title="Labs and claims" count={diagnosticsRows} id="clinical-external">
            <div className="min-w-0 overflow-x-auto rounded-xl border bg-card">
              <table className="w-full min-w-[30rem] text-sm">
                <thead>
                  <tr className="border-b text-left font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Lab test</th>
                    <th className="px-4 py-2 font-medium">Specimen</th>
                    <th className="px-4 py-2 font-medium">Turnaround</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {labTests.length ? labTests.map((test) => (
                    <tr key={test.id}>
                      <td className="px-4 py-2.5"><div className="font-medium">{test.name}</div><div className="text-xs text-muted-foreground">{test.code || 'No code'} · {test.category || 'No category'}</div></td>
                      <td className="px-4 py-2.5">{test.specimenType || '—'}</td>
                      <td className="px-4 py-2.5 font-mono tabular-nums">{test.turnaroundHours ?? 0}h</td>
                      <td className="px-4 py-2.5"><StatusTag status={test.active ? 'Active' : 'Inactive'} tone={test.active ? 'ok' : 'idle'} /></td>
                    </tr>
                  )) : <tr><td colSpan={4} className="py-8 text-center text-sm text-muted-foreground">No lab tests found.</td></tr>}
                </tbody>
              </table>
            </div>
            {(labResults.length > 0 || insuranceClaims.length > 0) && (
              <Board className="mt-3">
                {labResults.map((result) => (
                  <BoardRow key={result.id} tone={/critical/i.test(String(result.abnormalFlag)) ? 'bad' : /low|high/i.test(String(result.abnormalFlag)) ? 'warn' : toneForStatus(result.status)} status={statusLabel(result.status)} title={<Code className="text-[13px] text-foreground">{result.resultNumber}</Code>}
                    meta={<><span>{result.labTest?.name ?? 'No test'}</span><span>{statusLabel(result.abnormalFlag)}</span>{result.patient?.displayName && <span>{result.patient.displayName}</span>}</>} aside={<StatusTag status={result.status} />} />
                ))}
                {insuranceClaims.map((claim) => (
                  <BoardRow key={claim.id} tone={toneForStatus(claim.status)} status={statusLabel(claim.status)} title={<Code className="text-[13px] text-foreground">{claim.claimNumber}</Code>}
                    meta={<><span>{claim.payerName || 'No payer'}</span><span className="font-mono tabular-nums">Billed {money(claim.billedAmountCents)}</span><span className="font-mono tabular-nums">Paid {money(claim.paidAmountCents)}</span></>} aside={<StatusTag status={claim.status} />} />
                ))}
              </Board>
            )}
          </WardSection>
        </div>
      </WardBody>
    </PageContainer>
  );
}
