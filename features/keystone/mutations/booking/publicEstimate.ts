/** Legacy cents have neither an accepted currency nor a known/free-state proof.
 * Preserve the numeric source for operators; public text must not invent those facts. */
export function publicEstimateText(_legacyPriceCents?: number | null): string {
  return 'Estimate provided by clinic'
}
