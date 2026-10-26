'use client'

import Link from 'next/link'
import { useActionState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { bootstrapInitialHospital, type BootstrapState } from '../actions/bootstrap'

const initialState: BootstrapState = { status: 'idle', message: '' }

export function BootstrapPage() {
  const [state, action, pending] = useActionState(bootstrapInitialHospital, initialState)
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg items-center px-6 py-12">
      <section className="w-full rounded-[4px] border bg-card p-6">
        <p className="text-sm font-medium uppercase tracking-[.2em] text-muted-foreground">Private initialization</p>
        <h1 className="mt-2 text-2xl font-semibold">Create the first administrator</h1>
        <p className="mt-2 text-sm text-muted-foreground">Use the deployment-controlled bootstrap secret exactly once. No patient record is created here.</p>
        {state.status === 'created' ? (
          <div className="mt-6 space-y-4">
            <p role="status" className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">{state.message}</p>
            <Button asChild><Link href="/dashboard/signin">Continue to sign in</Link></Button>
          </div>
        ) : (
          <form action={action} className="mt-6 space-y-4">
            <div className="space-y-2"><Label htmlFor="name">Administrator name</Label><Input id="name" name="name" required maxLength={150} autoComplete="name" /></div>
            <div className="space-y-2"><Label htmlFor="email">Administrator email</Label><Input id="email" name="email" type="email" required maxLength={254} autoComplete="username" /></div>
            <div className="space-y-2"><Label htmlFor="password">Password</Label><Input id="password" name="password" type="password" required minLength={16} maxLength={200} autoComplete="new-password" /></div>
            <div className="space-y-2"><Label htmlFor="bootstrapSecret">Deployment bootstrap secret</Label><Input id="bootstrapSecret" name="bootstrapSecret" type="password" required minLength={48} autoComplete="off" /></div>
            {state.message && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{state.message}</p>}
            <Button type="submit" disabled={pending}>{pending ? 'Initializing…' : 'Initialize hospital'}</Button>
          </form>
        )}
      </section>
    </main>
  )
}

export default BootstrapPage
