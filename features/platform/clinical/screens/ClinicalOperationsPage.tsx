import Link from 'next/link';
import { Activity, Bed as BedIcon, ClipboardList, FileText, FlaskConical, HeartPulse, Hospital, Pill, Stethoscope } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';
import { BoundedDataNotice } from '@/features/platform/components/BoundedDataNotice';
import { WorkspaceLoadError } from '@/features/platform/components/WorkspaceLoadError';

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

function StatCard({ icon: Icon, label, value, description }: { icon: any; label: string; value: string; description: string }) {
  return <Card><CardContent className="p-5"><div className="flex items-start justify-between gap-4"><div><p className="text-sm text-muted-foreground">{label}</p><div className="mt-2 text-3xl font-semibold tracking-tight">{value}</div><p className="mt-2 text-xs leading-5 text-muted-foreground">{description}</p></div><div className="rounded-2xl bg-muted p-3 text-muted-foreground"><Icon className="size-5" /></div></div></CardContent></Card>;
}

function EmptyRow({ colSpan, label }: { colSpan: number; label: string }) {
  return <TableRow><TableCell colSpan={colSpan} className="py-8 text-center text-sm text-muted-foreground">{label}</TableCell></TableRow>;
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

  return (
    <PageContainer
      title="Clinical Operations"
      header={
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-muted-foreground">Patient-operations records</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">Clinical Operations</h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Inspect bounded operational records. External clinical, pharmacy, laboratory, payer, and financial systems remain the source of truth.</p>
          </div>
          <div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link href="/dashboard/platform/patients">Patients</Link></Button><Button asChild><Link href="/dashboard/platform/encounters">Manage encounters</Link></Button></div>
        </div>
      }
      breadcrumbs={breadcrumbs}
    >
      <div className="space-y-6 px-4 pb-8 md:px-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={Hospital} label="Facility map" value={String(facilityRows)} description="Exact accessible count: facilities, departments, wards, rooms, and beds." />
          <StatCard icon={Stethoscope} label="Care coordination" value={String(careRows)} description="Exact accessible count: encounters, admissions, clinicians, and care-plan evidence." />
          <StatCard icon={HeartPulse} label="Operational evidence" value={String(clinicalRows)} description="Exact accessible count: vitals and externally governed coordination records." />
          <StatCard icon={FlaskConical} label="External evidence" value={String(diagnosticsRows)} description="Exact accessible count: lab and claim-shaped operational evidence." />
        </div>

        <BoundedDataNotice messages={sampleNotices} />

        <div className="grid gap-4 xl:grid-cols-2">
          <Card className="min-w-0"><CardHeader><CardTitle>Care timeline</CardTitle><CardDescription>Encounters, admissions, and care plans connected to patients and providers.</CardDescription></CardHeader><CardContent className="space-y-4">
            <div className="rounded-lg border"><Table><TableHeader><TableRow><TableHead>Encounter</TableHead><TableHead>Patient</TableHead><TableHead>Provider</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{encounters.length ? encounters.map((encounter) => <TableRow key={encounter.id}><TableCell><div className="font-mono text-xs">{encounter.encounterNumber}</div><div className="text-xs text-muted-foreground">{encounter.chiefComplaint || 'No complaint'}</div></TableCell><TableCell>{encounter.patient?.displayName ?? 'No patient'}</TableCell><TableCell>{encounter.provider?.displayName ?? 'No provider'}</TableCell><TableCell><Badge variant={encounter.status === 'closed' ? 'default' : 'secondary'}>{encounter.status}</Badge></TableCell></TableRow>) : <EmptyRow colSpan={4} label="No encounters found." />}</TableBody></Table></div>
            <div className="grid gap-3 md:grid-cols-2">{admissions.map((admission) => <div key={admission.id} className="rounded-lg border p-4"><BedIcon className="mb-2 size-4 text-muted-foreground" /><div className="font-mono text-sm">{admission.admissionNumber}</div><p className="text-sm text-muted-foreground">{admission.status} · {admission.patient?.displayName ?? 'No patient'} · room {admission.room?.roomNumber ?? '—'} bed {admission.bed?.bedNumber ?? '—'}</p></div>)}{carePlans.map((plan) => <div key={plan.id} className="rounded-lg border p-4"><ClipboardList className="mb-2 size-4 text-muted-foreground" /><div className="font-medium">{plan.title}</div><p className="text-sm text-muted-foreground">{plan.status} · {plan.patient?.displayName ?? 'No patient'} · {plan.provider?.displayName ?? 'No provider'}</p></div>)}</div>
          </CardContent></Card>

          <Card className="min-w-0"><CardHeader><CardTitle>Facility, beds, and clinicians</CardTitle><CardDescription>Facilities, departments, wards, rooms, beds, and clinicians for capacity and staffing.</CardDescription></CardHeader><CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">{facilities.map((facility) => <div key={facility.id} className="overflow-hidden rounded-lg border">{facility.images[0]?.imagePath && <img src={facility.images[0].imagePath} alt={facility.images[0].altText || facility.name} className="h-32 w-full object-cover" />}<div className="p-4"><Hospital className="mb-2 size-4 text-muted-foreground" /><div className="font-medium">{facility.name}</div><p className="text-sm text-muted-foreground">{facility.facilityType} · {facility.status} · {facility.city || 'No city'}</p></div></div>)}{departments.map((department) => <div key={department.id} className="overflow-hidden rounded-lg border">{department.images[0]?.imagePath && <img src={department.images[0].imagePath} alt={department.images[0].altText || department.name} className="h-32 w-full object-cover" />}<div className="p-4"><Hospital className="mb-2 size-4 text-muted-foreground" /><div className="font-medium">{department.name}</div><p className="text-sm text-muted-foreground">{department.code || 'No code'} · {department.status}</p></div></div>)}{wards.map((ward) => <div key={ward.id} className="rounded-lg border p-4"><Hospital className="mb-2 size-4 text-muted-foreground" /><div className="font-medium">{ward.name}</div><p className="text-sm text-muted-foreground">floor {ward.floor || '—'} · cap {ward.capacity ?? 0} · {ward.department?.name ?? 'No department'}</p></div>)}{rooms.map((room) => <div key={room.id} className="rounded-lg border p-4"><BedIcon className="mb-2 size-4 text-muted-foreground" /><div className="font-medium">Room {room.roomNumber}</div><p className="text-sm text-muted-foreground">{room.roomType} · {room.status} · {room.ward?.name ?? 'No ward'}</p></div>)}{beds.map((bed) => <div key={bed.id} className="rounded-lg border p-4"><BedIcon className="mb-2 size-4 text-muted-foreground" /><div className="font-medium">Bed {bed.bedNumber}</div><p className="text-sm text-muted-foreground">{bed.status} · room {bed.room?.roomNumber ?? '—'} · {bed.currentPatient?.displayName ?? 'No patient'}</p></div>)}{clinicians.map((clinician) => <div key={clinician.id} className="overflow-hidden rounded-lg border">{clinician.images[0]?.imagePath && <img src={clinician.images[0].imagePath} alt={clinician.images[0].altText || clinician.displayName} className="h-32 w-full object-cover" />}<div className="p-4"><Stethoscope className="mb-2 size-4 text-muted-foreground" /><div className="font-medium">{clinician.displayName}</div><p className="text-sm text-muted-foreground">{clinician.clinicianType} · {clinician.department?.name ?? 'No department'}</p><Badge className="mt-2" variant={clinician.active ? 'default' : 'secondary'}>{clinician.active ? 'Active' : 'Inactive'}</Badge></div></div>)}</div>
          </CardContent></Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card className="min-w-0"><CardHeader><CardTitle>Operational clinical records</CardTitle><CardDescription>Recent manually recorded status evidence. This does not prescribe, transmit orders, perform procedures, or provide medical advice.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 md:grid-cols-2">{vitalSigns.map((vital) => <div key={vital.id} className="rounded-lg border p-4"><Activity className="mb-2 size-4 text-muted-foreground" /><div className="font-medium">{vital.patient?.displayName ?? 'No patient'}</div><p className="text-sm text-muted-foreground">Temp {vital.temperatureTenthsC != null ? `${(vital.temperatureTenthsC / 10).toFixed(1)}°C` : vital.temperatureC != null ? `${vital.temperatureC}°C` : '—'} · BP {vital.systolicBp ?? '—'}/{vital.diastolicBp ?? '—'} · HR {vital.heartRate ?? '—'} · O₂ {vital.oxygenSaturation ?? '—'}%</p></div>)}{medicalOrders.map((order) => <div key={order.id} className="rounded-lg border p-4"><ClipboardList className="mb-2 size-4 text-muted-foreground" /><div className="font-mono text-sm">{order.orderNumber}</div><p className="text-sm text-muted-foreground">{order.orderType} · {order.status} · {order.patient?.displayName ?? 'No patient'}</p></div>)}{prescriptions.map((rx) => <div key={rx.id} className="rounded-lg border p-4"><Pill className="mb-2 size-4 text-muted-foreground" /><div className="font-medium">{rx.medicationName}</div><p className="text-sm text-muted-foreground">{rx.prescriptionNumber} · {rx.dosage || 'No dose'} · {rx.frequency || 'No frequency'}</p></div>)}{procedures.map((procedure) => <div key={procedure.id} className="rounded-lg border p-4"><Stethoscope className="mb-2 size-4 text-muted-foreground" /><div className="font-medium">{procedure.procedureName}</div><p className="text-sm text-muted-foreground">{procedure.procedureNumber} · {procedure.status} · {procedure.patient?.displayName ?? 'No patient'}</p></div>)}</div></CardContent></Card>

          <Card className="min-w-0"><CardHeader><CardTitle>External lab and claim records</CardTitle><CardDescription>Recorded operational status only; this does not validate laboratory truth, payer acceptance, adjudication, or payment.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="rounded-lg border"><Table><TableHeader><TableRow><TableHead>LabTest</TableHead><TableHead>Specimen</TableHead><TableHead>Turnaround</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{labTests.length ? labTests.map((test) => <TableRow key={test.id}><TableCell><div className="font-medium">{test.name}</div><div className="text-xs text-muted-foreground">{test.code || 'No code'} · {test.category || 'No category'}</div></TableCell><TableCell>{test.specimenType || '—'}</TableCell><TableCell>{test.turnaroundHours ?? 0}h</TableCell><TableCell><Badge variant={test.active ? 'default' : 'secondary'}>{test.active ? 'Active' : 'Inactive'}</Badge></TableCell></TableRow>) : <EmptyRow colSpan={4} label="No lab tests found." />}</TableBody></Table></div><div className="grid gap-3 md:grid-cols-2">{labResults.map((result) => <div key={result.id} className="rounded-lg border p-4"><FlaskConical className="mb-2 size-4 text-muted-foreground" /><div className="font-mono text-sm">{result.resultNumber}</div><p className="text-sm text-muted-foreground">{result.status} · {result.abnormalFlag} · {result.labTest?.name ?? 'No test'}</p></div>)}{insuranceClaims.map((claim) => <div key={claim.id} className="rounded-lg border p-4"><FileText className="mb-2 size-4 text-muted-foreground" /><div className="font-mono text-sm">{claim.claimNumber}</div><p className="text-sm text-muted-foreground">{claim.status} · {claim.payerName || 'No payer'} · billed {money(claim.billedAmountCents)} / paid {money(claim.paidAmountCents)}</p></div>)}</div></CardContent></Card>
        </div>
      </div>
    </PageContainer>
  );
}
