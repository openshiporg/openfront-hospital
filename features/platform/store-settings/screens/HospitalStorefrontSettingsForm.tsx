'use client'

import { FormEvent, useState, useTransition } from 'react'
import { useDraftExitGuard } from '@/features/platform/lib/useDraftExitGuard'
import { HUE_PRESETS, LOGO_ICONS } from '../lib/icon-registry'
import { Check, Save } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Notice, Panel, Pill, Segmented, Track, fieldClass, labelClass } from '@/features/platform/components/ward'
import { HOSPITAL_BRAND_THEME_OPTIONS } from '@/features/lib/hospitalBrandTheme'
import { saveHospitalStorefrontSettings } from '@/features/platform/store-settings/actions/storefrontSettings'
import type { HospitalStorefrontSettingsInput } from '@/features/platform/store-settings/lib/storefrontSettings'

function TextField({
  id,
  label,
  value,
  onChange,
  required = false,
  type = 'text',
  description,
  className,
}: {
  id: keyof HospitalStorefrontSettingsInput
  label: string
  value: string
  onChange: (value: string) => void
  required?: boolean
  type?: 'text' | 'email' | 'tel'
  description?: string
  className?: string
}) {
  return (
    <div className={cn('grid min-w-0 gap-1.5', className)}>
      <label htmlFor={id} className={labelClass}>{label}{required ? <span aria-hidden className="text-teal-700 dark:text-teal-400"> *</span> : null}</label>
      <input id={id} name={id} type={type} value={value} required={required} className={fieldClass} onChange={event => onChange(event.target.value)} />
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
    </div>
  )
}

function FormSection({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <Panel>
      <h2 className="border-b px-4 py-3 text-sm font-semibold md:px-5">{title}</h2>
      <div className={cn('grid min-w-0 gap-4 p-4 md:p-5', className)}>{children}</div>
    </Panel>
  )
}

/** The logo exactly as the storefront renders it: registry SVG with a hue rotation. */
function LogoMark({ svg, hue, className }: { svg: string; hue: string | number; className?: string }) {
  return <span aria-hidden className={cn('block [&>svg]:h-full [&>svg]:w-full', className)} style={{ filter: `hue-rotate(${Number(hue) || 0}deg)` }} dangerouslySetInnerHTML={{ __html: svg }} />
}

/** Live preview of the patient site header (mirrors StorefrontNav). */
function HeaderPreview({ form }: { form: HospitalStorefrontSettingsInput }) {
  const theme = HOSPITAL_BRAND_THEME_OPTIONS.find(option => option.value === form.brandTheme) ?? HOSPITAL_BRAND_THEME_OPTIONS[0]
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center gap-1.5 border-b bg-muted/50 px-3 py-2">
        <span aria-hidden className="size-2 rounded-full bg-muted-foreground/30" />
        <span aria-hidden className="size-2 rounded-full bg-muted-foreground/30" />
        <span aria-hidden className="size-2 rounded-full bg-muted-foreground/30" />
        <span className="ml-2 truncate font-mono text-[11px] text-muted-foreground">Patient site</span>
      </div>
      {/* The patient site is light-themed; the preview stays light in both dashboard modes. */}
      <div className="bg-white text-zinc-900">
        <div className="flex min-w-0 items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <LogoMark svg={form.logoIcon} hue={form.logoColor} className="size-8 shrink-0" />
            <span className="grid min-w-0 leading-tight">
              <span className="truncate text-sm font-semibold" style={{ color: theme.swatch }}>{form.name || 'Organization name'}</span>
              <small className="truncate text-[11px] text-zinc-500">{form.locationName || 'Primary location'}</small>
            </span>
          </div>
          <span className="shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium text-white" style={{ backgroundColor: theme.swatch }}>Request a visit →</span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-zinc-100 px-4 py-2 text-[11px] text-zinc-600">
          <span>Care services</span>
          <span>Care team</span>
          <span>Locations</span>
          {form.supportPhone && <span className="ml-auto font-medium" style={{ color: theme.swatch }}>Call us</span>}
        </div>
      </div>
      <div className="grid gap-1 border-t px-4 py-3 text-xs">
        <p className="truncate font-medium text-foreground">{form.shortName || 'Short name'}</p>
        {(form.supportPhone || form.supportEmail) && <p className="truncate text-muted-foreground">{[form.supportPhone, form.supportEmail].filter(Boolean).join(' · ')}</p>}
        {[form.addressLine1, form.city, form.region, form.postalCode].some(Boolean) && <p className="truncate text-muted-foreground">{[form.addressLine1, form.city, form.region, form.postalCode].filter(Boolean).join(', ')}</p>}
      </div>
    </div>
  )
}

export function HospitalStorefrontSettingsForm({ initialSettings }: { initialSettings: HospitalStorefrontSettingsInput }) {
  const [form, setForm] = useState(initialSettings)
  const [saved, setSaved] = useState(initialSettings)
  const exitGuard = useDraftExitGuard(JSON.stringify(form) !== JSON.stringify(saved))
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [isPending, startTransition] = useTransition()

  const setField = <Key extends keyof HospitalStorefrontSettingsInput>(key: Key, value: HospitalStorefrontSettingsInput[Key]) => {
    setForm(current => ({ ...current, [key]: value }))
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage(null)
    startTransition(async () => {
      try {
      const result = await saveHospitalStorefrontSettings(form)
      if (!result.success) {
        setMessage({ kind: 'error', text: result.error })
        return
      }
      setForm(current => Object.fromEntries(Object.entries(current).map(([key, value]) => [key, value === form[key as keyof HospitalStorefrontSettingsInput] ? result.data[key as keyof HospitalStorefrontSettingsInput] : value])) as HospitalStorefrontSettingsInput)
      setSaved(result.data)
      setMessage({ kind: 'success', text: 'Submitted storefront settings saved.' })
      } catch { setMessage({ kind: 'error', text: 'The save outcome could not be verified. Your draft is retained. Refresh the saved settings before submitting another change.' }) }
    })
  }

  const selectedLogoId = LOGO_ICONS.find(icon => icon.lightSvg === form.logoIcon)?.id || 'saved'
  const hasSavedCustomMark = !LOGO_ICONS.some(icon => icon.lightSvg === form.logoIcon)
  const dirty = JSON.stringify(form) !== JSON.stringify(saved)

  return (
    <form onSubmit={onSubmit} aria-busy={isPending}>
      {exitGuard}
      <fieldset disabled={isPending} className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]">
      <div className="min-w-0 space-y-6">
        <FormSection title="Identity" className="sm:grid-cols-2">
          <TextField id="name" label="Organization name" value={form.name} required onChange={value => setField('name', value)} />
          <TextField id="shortName" label="Short name" value={form.shortName} required onChange={value => setField('shortName', value)} />
          <div className="grid min-w-0 gap-1.5 sm:col-span-2">
            <label htmlFor="description" className={labelClass}>Public summary</label>
            <textarea id="description" name="description" value={form.description} rows={4} className={cn(fieldClass, 'h-auto py-2')} onChange={event => setField('description', event.target.value)} />
          </div>
        </FormSection>

        <FormSection title="Logo">
          <fieldset id="merchant-logo" className="min-w-0">
            <legend className="sr-only">Logo</legend>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(4.25rem,1fr))] gap-2">
              {hasSavedCustomMark && (
                <label className="group relative grid cursor-pointer place-items-center gap-1 rounded-lg border bg-background p-2 text-center has-[:checked]:border-teal-600 has-[:checked]:ring-2 has-[:checked]:ring-teal-600/30 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring dark:has-[:checked]:border-teal-400">
                  <input type="radio" name="merchant-logo-choice" value="saved" checked={selectedLogoId === 'saved'} readOnly className="sr-only" />
                  <LogoMark svg={form.logoIcon} hue={0} className="size-8" />
                  <span className="w-full truncate text-[10px] text-muted-foreground">Saved</span>
                </label>
              )}
              {LOGO_ICONS.map(icon => (
                <label key={icon.id} title={icon.name} className="relative grid cursor-pointer place-items-center gap-1 rounded-lg border bg-background p-2 text-center transition-colors hover:border-foreground/30 has-[:checked]:border-teal-600 has-[:checked]:ring-2 has-[:checked]:ring-teal-600/30 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring dark:has-[:checked]:border-teal-400">
                  <input type="radio" name="merchant-logo-choice" value={icon.id} checked={selectedLogoId === icon.id} onChange={() => setField('logoIcon', icon.lightSvg)} className="sr-only" aria-label={icon.name} />
                  <LogoMark svg={icon.lightSvg} hue={0} className="size-8 dark:hidden" />
                  <LogoMark svg={icon.darkSvg} hue={0} className="hidden size-8 dark:block" />
                  <span className="w-full truncate text-[10px] text-muted-foreground">{icon.name}</span>
                  {selectedLogoId === icon.id && <Check aria-hidden className="absolute right-1 top-1 size-3 text-teal-700 dark:text-teal-400" />}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid min-w-0 gap-2">
            <label htmlFor="merchant-hue" className={cn(labelClass, 'flex items-center justify-between')}>
              <span>Hue</span>
              <span className="font-mono tabular-nums text-foreground">{form.logoColor}°</span>
            </label>
            <input id="merchant-hue" className="w-full accent-teal-700 dark:accent-teal-400" type="range" min="0" max="359" step="1" value={form.logoColor} onChange={event => setField('logoColor', event.target.value)} />
            <Segmented
              label="Hue presets"
              size="sm"
              value={String(Number(form.logoColor) || 0)}
              onChange={value => setField('logoColor', value)}
              options={HUE_PRESETS.map(preset => ({ value: String(preset.value), label: preset.name }))}
            />
          </div>
        </FormSection>

        <FormSection title="Theme">
          <fieldset className="min-w-0">
            <legend className="sr-only">Brand theme</legend>
            <div role="radiogroup" aria-label="Brand theme" className="grid grid-cols-3 gap-2">
              {HOSPITAL_BRAND_THEME_OPTIONS.map(option => (
                <label key={option.value} htmlFor={`theme-${option.value}`} className="flex min-w-0 cursor-pointer flex-col gap-2 rounded-lg border bg-background p-2.5 has-[:checked]:border-teal-600 has-[:checked]:ring-2 has-[:checked]:ring-teal-600/30 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring dark:has-[:checked]:border-teal-400">
                  <input id={`theme-${option.value}`} type="radio" name="brandTheme" value={option.value} checked={form.brandTheme === option.value} onChange={() => setField('brandTheme', option.value as HospitalStorefrontSettingsInput['brandTheme'])} className="sr-only" />
                  <span aria-hidden className="h-8 rounded-md" style={{ backgroundColor: option.swatch }} />
                  <span className="flex items-center justify-between gap-1 text-sm font-medium">
                    <span className="truncate">{option.label}</span>
                    {form.brandTheme === option.value && <Check aria-hidden className="size-3.5 shrink-0 text-teal-700 dark:text-teal-400" />}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </FormSection>

        <FormSection title="Location" className="sm:grid-cols-2">
          <TextField id="locationName" label="Primary location" value={form.locationName} onChange={value => setField('locationName', value)} />
          <TextField id="serviceArea" label="Service area" value={form.serviceArea} onChange={value => setField('serviceArea', value)} />
          <TextField id="addressLine1" label="Street address" value={form.addressLine1} onChange={value => setField('addressLine1', value)} className="sm:col-span-2" />
          <TextField id="city" label="City" value={form.city} onChange={value => setField('city', value)} />
          <TextField id="region" label="Region" value={form.region} onChange={value => setField('region', value)} />
          <TextField id="postalCode" label="Postal code" value={form.postalCode} onChange={value => setField('postalCode', value)} />
        </FormSection>

        <FormSection title="Scheduling contact" className="sm:grid-cols-2">
          <TextField id="supportPhone" label="Scheduling phone" type="tel" value={form.supportPhone} onChange={value => setField('supportPhone', value)} />
          <TextField id="supportEmail" label="Scheduling email" type="email" value={form.supportEmail} onChange={value => setField('supportEmail', value)} />
        </FormSection>
      </div>

      <div className="min-w-0 space-y-4 lg:sticky lg:top-4 lg:self-start">
        <div className="space-y-2">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">Preview</p>
          <HeaderPreview form={form} />
        </div>

        {message ? (
          <Notice role={message.kind === 'error' ? 'alert' : 'status'} tone={message.kind === 'error' ? 'bad' : 'ok'}>
            {message.text}
          </Notice>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">{dirty ? 'Unsaved changes' : 'Saved'}</span>
          <Track>
            <Pill type="submit" variant="primary" disabled={isPending}>
              <Save aria-hidden />
              {isPending ? 'Saving…' : 'Save storefront settings'}
            </Pill>
          </Track>
        </div>
      </div>
      </fieldset>
    </form>
  )
}
