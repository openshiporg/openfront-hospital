import { AlertTriangle } from 'lucide-react'

export function BoundedDataNotice({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null
  return (
    <div role="status" className="flex gap-3 rounded-lg border border-amber-300/60 bg-amber-50 p-4 text-sm text-amber-950">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>
        <p className="font-medium">Bounded workspace view</p>
        <ul className="mt-1 list-disc space-y-1 pl-4">
          {messages.map(message => <li key={message}>{message}</li>)}
        </ul>
      </div>
    </div>
  )
}
