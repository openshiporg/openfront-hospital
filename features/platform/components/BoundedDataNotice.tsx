import { Notice } from './ward'

export function BoundedDataNotice({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null
  return (
    <Notice tone="warn" role="status">
      <p className="font-medium">Partial results</p>
      <ul className="mt-0.5 space-y-0.5">
        {messages.map(message => <li key={message}>{message}</li>)}
      </ul>
    </Notice>
  )
}
