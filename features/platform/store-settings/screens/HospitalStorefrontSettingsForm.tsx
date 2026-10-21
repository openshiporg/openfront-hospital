'use client'

import { FormEvent, useState, useTransition } from 'react'
import { useDraftExitGuard } from '@/features/platform/lib/useDraftExitGuard'
import { LOGO_ICONS } from '../lib/icon-registry'
import { Save } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
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
}: {
  id: keyof HospitalStorefrontSettingsInput
  label: string
  value: string
  onChange: (value: string) => void
  required?: boolean
  type?: 'text' | 'email' | 'tel'
  description?: string
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={id} type={type} value={value} required={required} onChange={event => onChange(event.target.value)} />
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
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

  return (
    <form onSubmit={onSubmit} aria-busy={isPending}>
      {exitGuard}
      <fieldset disabled={isPending} className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(18rem,.65fr)]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Public identity</CardTitle>
            <CardDescription>Use the organization and location names patients can verify. Do not enter patient information or unverified service claims.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-2">
            <TextField id="name" label="Organization name" value={form.name} required onChange={value => setField('name', value)} />
            <TextField id="shortName" label="Short name" value={form.shortName} required onChange={value => setField('shortName', value)} />
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="description">Public summary</Label>
              <Textarea id="description" name="description" value={form.description} rows={4} onChange={event => setField('description', event.target.value)} />
              <p className="text-xs text-muted-foreground">Describe this non-emergency front door only. Service availability is sourced from active visit types and providers.</p>
            </div>
            <TextField id="locationName" label="Primary location" value={form.locationName} onChange={value => setField('locationName', value)} />
            <TextField id="serviceArea" label="Service area" value={form.serviceArea} onChange={value => setField('serviceArea', value)} />
            <TextField id="addressLine1" label="Street address" value={form.addressLine1} onChange={value => setField('addressLine1', value)} />
            <TextField id="city" label="City" value={form.city} onChange={value => setField('city', value)} />
            <TextField id="region" label="Region" value={form.region} onChange={value => setField('region', value)} />
            <TextField id="postalCode" label="Postal code" value={form.postalCode} onChange={value => setField('postalCode', value)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Scheduling contact</CardTitle>
            <CardDescription>Public contact details for non-emergency scheduling support.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-2">
            <TextField id="supportPhone" label="Scheduling phone" type="tel" value={form.supportPhone} onChange={value => setField('supportPhone', value)} />
            <TextField id="supportEmail" label="Scheduling email" type="email" value={form.supportEmail} onChange={value => setField('supportEmail', value)} />
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Merchant logo and colour</CardTitle><CardDescription>Select one of the 42 family marks. A saved custom mark is preserved until you select another. Clinical status colours remain fixed.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <label htmlFor="merchant-logo" className="block text-sm">Logo</label>
            <select id="merchant-logo" className="w-full rounded border bg-background p-2" value={LOGO_ICONS.find(icon => icon.lightSvg === form.logoIcon)?.id || 'saved'} onChange={event => { const icon = LOGO_ICONS.find(icon => icon.id === event.target.value); if (icon) setField('logoIcon', icon.lightSvg) }}>
              {!LOGO_ICONS.some(icon => icon.lightSvg === form.logoIcon) && <option value="saved">Saved custom/default mark</option>}
              {LOGO_ICONS.map(icon => <option key={icon.id} value={icon.id}>{icon.name}</option>)}
            </select>
            <label htmlFor="merchant-hue" className="block text-sm">Logo hue rotation: {form.logoColor}°</label>
            <input id="merchant-hue" className="w-full" type="range" min="0" max="359" step="1" value={form.logoColor} onChange={event => setField('logoColor', event.target.value)} />
            <div aria-hidden className="size-16" style={{ filter: `hue-rotate(${Number(form.logoColor)}deg)` }} dangerouslySetInnerHTML={{ __html: form.logoIcon }} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Legacy palette</CardTitle>
            <CardDescription>Theme presets affect storefront brand chrome only. Emergency, warning, error, and success colors remain fixed.</CardDescription>
          </CardHeader>
          <CardContent>
            <RadioGroup value={form.brandTheme} onValueChange={value => setField('brandTheme', value as HospitalStorefrontSettingsInput['brandTheme'])}>
              {HOSPITAL_BRAND_THEME_OPTIONS.map(option => (
                <Label key={option.value} htmlFor={`theme-${option.value}`} className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 hover:bg-muted/40">
                  <RadioGroupItem id={`theme-${option.value}`} value={option.value} />
                  <span className="size-6 rounded-full border" style={{ backgroundColor: option.swatch }} aria-hidden />
                  <span>{option.label}</span>
                </Label>
              ))}
            </RadioGroup>
          </CardContent>
        </Card>

        {message ? (
          <div role={message.kind === 'error' ? 'alert' : 'status'} className={message.kind === 'error' ? 'rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive' : 'rounded-lg border border-emerald-300/60 bg-emerald-50 p-4 text-sm text-emerald-950'}>
            {message.text}
          </div>
        ) : null}

        <Button type="submit" disabled={isPending} className="w-full">
          <Save className="mr-2 size-4" aria-hidden />
          {isPending ? 'Saving…' : 'Save storefront settings'}
        </Button>
      </div>
      </fieldset>
    </form>
  )
}
