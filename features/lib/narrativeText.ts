/** Narrative text only. Never use for identifiers, SMTP headers or credentials. */
export function narrativeText(value: unknown, label: string, maximumBytes: number, required = false): string {
  if (value !== undefined && value !== null && typeof value !== 'string') throw new Error(`${label} is invalid`)
  const text = String(value ?? '').replace(/\r\n?/g, '\n').trim()
  if ((required && !text) || new TextEncoder().encode(text).length > maximumBytes || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) throw new Error(`${label} is invalid`)
  return text
}
