'use client'

import { Pencil, Plus } from 'lucide-react'
import { FormSheet, SheetField, SheetInput } from '@/features/platform/facilities/components/FormSheet'
import { validateLabTest, type LabTestRecord } from '../lib/labTests'
import { saveLabTest } from '../actions/labTestMutations'

export function LabTestSheet({ test, categories, bare }: { test?: LabTestRecord; categories: string[]; bare?: boolean }) {
  const editing = Boolean(test)
  const listId = editing ? `lab-categories-${test!.id}` : 'lab-categories-new'
  return (
    <FormSheet
      bare={bare}
      trigger={editing ? <><Pencil aria-hidden />Edit</> : <><Plus aria-hidden />Add lab test</>}
      triggerVariant={editing ? 'raised' : 'primary'}
      triggerSize={editing ? 'sm' : 'md'}
      title={editing ? 'Edit lab test' : 'New lab test'}
      submitLabel={editing ? 'Save lab test' : 'Create lab test'}
      validate={values => validateLabTest(values).fieldErrors}
      action={values => saveLabTest(test?.id ?? null, values)}
    >
      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3">
        <SheetField label="Code" name="code"><SheetInput name="code" required autoComplete="off" className="tabular-nums uppercase" defaultValue={test?.code ?? ''} /></SheetField>
        <SheetField label="Name" name="name"><SheetInput name="name" required autoComplete="off" defaultValue={test?.name ?? ''} /></SheetField>
      </div>
      <SheetField label="Category" name="category">
        <SheetInput name="category" list={listId} autoComplete="off" defaultValue={test?.category ?? ''} />
        <datalist id={listId}>{categories.map(category => <option key={category} value={category} />)}</datalist>
      </SheetField>
      <SheetField label="Specimen type" name="specimenType"><SheetInput name="specimenType" autoComplete="off" defaultValue={test?.specimenType ?? ''} /></SheetField>
      <SheetField label="Turnaround (hours)" name="turnaroundHours">
        <SheetInput name="turnaroundHours" type="number" min={0} step={1} inputMode="numeric" defaultValue={test?.turnaroundHours ?? ''} />
      </SheetField>
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input type="checkbox" name="active" defaultChecked={test?.active ?? true} className="size-4 accent-teal-700" />
        Active
      </label>
    </FormSheet>
  )
}
