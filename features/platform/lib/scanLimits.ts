/** Largest literal `take` the GraphQL security rule accepts. */
export const SCAN_CHUNK = 100
/** Literal skip is capped at 1000, so 11 chunks reach 1100 rows. */
export const SCAN_MAX_CHUNKS = 11
