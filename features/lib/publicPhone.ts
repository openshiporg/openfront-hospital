/** Syntax admission only; this is never verification of the number or identity. */
export function publicPhoneHref(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 40) return ''
  const match = /^(\+?[0-9() .-]+?)(?:\s*(?:ext\.?|x)\s*([0-9]{1,6}))?$/i.exec(value.trim())
  if (!match) return ''
  const number = match[1].replace(/[() .-]/g, '')
  if (!/^\+?[0-9]{7,15}$/.test(number)) return ''
  return `tel:${number}${match[2] ? `;ext=${match[2]}` : ''}`
}
