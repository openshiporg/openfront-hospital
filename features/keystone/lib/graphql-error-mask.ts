import { randomUUID } from 'node:crypto'
import { GraphQLError } from 'graphql'
import { maskError } from 'graphql-yoga'

import { constraintRefusal } from './constraint-errors'

/**
 * Yoga mask. A database rule that refused a write is named in words with a stable code; deliberate GraphQL
 * errors (Keystone validation/access, HospitalRefusal) pass through; anything else is hidden behind a
 * logged correlation ID, never its text, because unknown messages can carry PHI or request variables.
 */
export function maskGraphqlError(error: unknown, message: string, isDev?: boolean) {
  const refusal = constraintRefusal(error)
  if (refusal) {
    const source = error instanceof GraphQLError ? error : null
    return new GraphQLError(refusal.message, { nodes: source?.nodes, source: source?.source, positions: source?.positions, path: source?.path, extensions: { code: refusal.code } })
  }
  const masked = maskError(error, message, isDev)
  if (masked === error || !(masked instanceof GraphQLError)) return masked
  const correlationId = randomUUID()
  console.error(JSON.stringify({ event: 'graphql.unexpected_error', correlationId }))
  return new GraphQLError(masked.message, { nodes: masked.nodes, source: masked.source, positions: masked.positions, path: masked.path, extensions: { ...masked.extensions, code: 'INTERNAL_SERVER_ERROR', correlationId } })
}
