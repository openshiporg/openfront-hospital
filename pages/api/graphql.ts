import { randomUUID } from 'node:crypto'
import { GraphQLError } from 'graphql'
import { createYoga } from 'graphql-yoga'
import type { NextApiRequest, NextApiResponse } from 'next'

import { keystoneContext } from '../../features/keystone/context'
import {
  authenticationAttempts,
  boundedGraphqlDocumentRule,
  consumeSharedRateLimit,
  graphqlNetworkBucketNamespace,
  hasSafeGraphqlOrigin,
  hasUnsafeGraphqlPagination,
  requestIdentity,
} from '../../features/keystone/security/graphqlSecurity'
import { phiReadAuditDescriptor, recordPhiReadAudit } from '../../features/keystone/security/phiReadAudit'

export const config = {
  api: {
    bodyParser: false,
  },
}

const MAX_BODY_BYTES = 1_000_000
const production = process.env.NODE_ENV === 'production'
const ANONYMOUS_LIMIT = production ? 120 : 2_000
const AUTHENTICATED_LIMIT = production ? 600 : 2_000
const NETWORK_LIMIT = production ? 1_200 : 4_000
const GLOBAL_INGRESS_LIMIT = production ? 10_000 : 20_000
const AUTH_ACCOUNT_LIMIT = production ? 10 : 100
const AUTH_NETWORK_LIMIT = production ? 30 : 500
const AUTH_GLOBAL_LIMIT = production ? 1_000 : 5_000
const AUTH_WINDOW_SECONDS = 15 * 60
const MAX_RESPONSE_BYTES = 2_000_000
const EXECUTION_TIMEOUT_MS = 15_000

function hasSessionCookie(headers: NextApiRequest['headers']) {
  return /(?:^|;\s*)keystonejs-session=[^;]{20,}/.test(String(headers.cookie || ''))
}

const yoga = createYoga({
  graphqlEndpoint: '/api/graphql',
  schema: keystoneContext.graphql.schema,
  context: async ({ req, res }: { req: any; res: any }) => {
    const requestContext = req.openfrontKeystoneContext || await keystoneContext.withRequest(req, res)
    requestContext.openfrontNetworkIdentity = req.openfrontNetworkIdentity || 'unknown-graphql-client'
    requestContext.openfrontCorrelationReference = req.openfrontCorrelationReference || randomUUID()
    requestContext.openfrontPurpose = 'platform_operations'
    return requestContext
  },
  multipart: false,
  graphiql: process.env.NODE_ENV !== 'production',
  maskedErrors: process.env.NODE_ENV === 'production',
  plugins: [{
    onValidate({ addValidationRule }: { addValidationRule: (rule: typeof boundedGraphqlDocumentRule) => void }) {
      addValidationRule(boundedGraphqlDocumentRule)
    },
    async onExecute({ args, executeFn, setExecuteFn, setResultAndStopExecution }: any) {
      if (hasUnsafeGraphqlPagination(args.document, args.variableValues || {}, args.operationName)) {
        setResultAndStopExecution({ errors: [new GraphQLError('GraphQL pagination arguments are outside allowed bounds.')] })
        return
      }
      const attempts = authenticationAttempts(args.document, args.variableValues || {}, args.operationName)
      const networkIdentity = args.contextValue?.openfrontNetworkIdentity || 'unknown-graphql-client'
      for (const attempt of attempts) {
        const now = new Date()
        const globalAllowed = await consumeSharedRateLimit(
          keystoneContext.prisma, 'authentication-global', 'all-accounts', AUTH_GLOBAL_LIMIT, now, AUTH_WINDOW_SECONDS,
        )
        const networkAllowed = globalAllowed && await consumeSharedRateLimit(
          keystoneContext.prisma, 'authentication-network', networkIdentity, AUTH_NETWORK_LIMIT, now, AUTH_WINDOW_SECONDS,
        )
        const accountAllowed = networkAllowed && await consumeSharedRateLimit(
          keystoneContext.prisma, 'authentication-account', attempt.accountIdentity, AUTH_ACCOUNT_LIMIT, now, AUTH_WINDOW_SECONDS,
        )
        if (!globalAllowed || !networkAllowed || !accountAllowed) {
          await new Promise(resolve => setTimeout(resolve, 250))
          setResultAndStopExecution({ errors: [new GraphQLError('Authentication failed.')] })
          return
        }
      }
      if (attempts.length) {
        const snapshots = new Map<string, number>()
        for (const account of new Set(attempts.map(attempt => attempt.normalizedAccount))) {
          if (account === 'invalid-account') continue
          const user = await keystoneContext.prisma.user.findUnique({
            where: { email: account },
            select: { id: true, securityVersion: true },
          })
          if (user) snapshots.set(user.id, Number(user.securityVersion || 1))
        }
        args.contextValue.openfrontAuthenticationVersionSnapshot = snapshots
        await new Promise(resolve => setTimeout(resolve, 150))
      }

      setExecuteFn(async (executionArgs: any) => {
        let timeout: ReturnType<typeof setTimeout> | undefined
        try {
          return await Promise.race([
            Promise.resolve(executeFn(executionArgs)),
            new Promise((_, reject) => {
              timeout = setTimeout(() => reject(new GraphQLError('GraphQL execution timed out.')), EXECUTION_TIMEOUT_MS)
            }),
          ]) as any
        } finally {
          if (timeout) clearTimeout(timeout)
        }
      })
      return {
        async onExecuteDone({ result, setResult }: any) {
          if (result && typeof result === 'object' && Symbol.asyncIterator in result) return
          let auditResult = result
          try {
            if (Buffer.byteLength(JSON.stringify(result)) > MAX_RESPONSE_BYTES) {
              const error = new GraphQLError('GraphQL response exceeds the maximum size.')
              setResult({ errors: [error] })
              auditResult = { ...result, errors: [...(result?.errors || []), error] }
            }
          } catch {
            const error = new GraphQLError('GraphQL response could not be bounded.')
            setResult({ errors: [error] })
            auditResult = { ...result, errors: [...(result?.errors || []), error] }
          }

          const session = args.contextValue?.session
          const actorReference = session?.itemId
          if (!actorReference) return
          const role = session?.data?.role || {}
          const capabilityNames = [
            'canManageAppointments', 'canManageScheduling', 'canManagePatients', 'canManageProviders',
            'canManageIntake', 'canManageCommunications', 'canManageBilling', 'canManageInventory',
            'canManageIntegrations', 'canManageDataPortability', 'canManageRetention', 'canViewReports',
            'canManageOnboarding', 'canAccessAllClinicalData',
          ].filter(name => role[name] === true)
          try {
            const descriptor = phiReadAuditDescriptor(args.document, args.operationName, auditResult, {
              schema: keystoneContext.graphql.schema,
              referenceSecret: process.env.SESSION_SECRET || process.env.NEXTAUTH_SECRET || '',
              variables: args.variableValues || {},
              authority: {
                roleReference: typeof role.id === 'string' ? role.id : null,
                roleName: typeof role.name === 'string' ? role.name.slice(0, 120) : null,
                capabilities: capabilityNames,
              },
              purpose: args.contextValue?.openfrontPurpose || 'platform_operations',
              correlationReference: args.contextValue?.openfrontCorrelationReference || 'unavailable',
            })
            if (descriptor) {
              // This is request-execution infrastructure, not application CRUD:
              // write bounded, value-free typed-reference evidence only.
              await recordPhiReadAudit(keystoneContext.prisma as any, actorReference, descriptor)
            }
          } catch {
            // Do not disclose protected results when a descriptor cannot be
            // created or its append-only evidence cannot be persisted.
            setResult({ errors: [new GraphQLError('Protected data auditing is unavailable.')] })
          }
        },
      }
    },
  }],
})

function reject(res: NextApiResponse, status: number, message: string) {
  res.setHeader('cache-control', 'no-store')
  res.setHeader('x-content-type-options', 'nosniff')
  return res.status(status).json({ errors: [{ message }] })
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST' && !req.headers['content-length']) {
    return reject(res, 411, 'GraphQL request length is required')
  }
  const contentLength = Number(req.headers['content-length'] || 0)
  if (!Number.isFinite(contentLength) || contentLength < 0 || contentLength > MAX_BODY_BYTES) {
    return reject(res, 413, 'GraphQL request body is too large')
  }
  if (String(req.headers['content-type'] || '').toLowerCase().startsWith('multipart/form-data')) {
    return reject(res, 415, 'GraphQL file uploads are not enabled')
  }
  if (!hasSafeGraphqlOrigin(req.method, req.headers)) {
    return reject(res, 403, 'GraphQL request origin is not allowed')
  }
  const identity = requestIdentity(req.headers, req.socket.remoteAddress)
  ;(req as any).openfrontNetworkIdentity = identity
  ;(req as any).openfrontCorrelationReference = randomUUID()
  const hasCandidateSession = hasSessionCookie(req.headers)
  try {
    if (!await consumeSharedRateLimit(keystoneContext.prisma, 'graphql-global-ingress', 'all-clients', GLOBAL_INGRESS_LIMIT)) {
      res.setHeader('retry-after', '60')
      return reject(res, 429, 'GraphQL request rate limit exceeded')
    }
    // A shared network ceiling bounds invalid-cookie/session lookup work before
    // authentication. Anonymous requests use the tighter public ceiling.
    const networkMaximum = hasCandidateSession ? NETWORK_LIMIT : ANONYMOUS_LIMIT
    // Keep public and session-candidate traffic in separate bounded buckets.
    // Otherwise authenticated dashboard reads can raise the shared counter above
    // the lower public ceiling and make the next anonymous storefront render fail.
    const networkNamespace = graphqlNetworkBucketNamespace(hasCandidateSession)
    if (!await consumeSharedRateLimit(keystoneContext.prisma, networkNamespace, identity, networkMaximum)) {
      res.setHeader('retry-after', '60')
      return reject(res, 429, 'GraphQL request rate limit exceeded')
    }

    if (hasCandidateSession) {
      const requestContext = await keystoneContext.withRequest(req, res) as any
      ;(req as any).openfrontKeystoneContext = requestContext
      const userId = requestContext.session?.itemId
      const scopedIdentity = userId ? `user:${userId}` : `anonymous:${identity}`
      const maximum = userId ? AUTHENTICATED_LIMIT : ANONYMOUS_LIMIT
      if (!await consumeSharedRateLimit(keystoneContext.prisma, 'graphql-principal', scopedIdentity, maximum)) {
        res.setHeader('retry-after', '60')
        return reject(res, 429, 'GraphQL request rate limit exceeded')
      }
    }
  } catch {
    return reject(res, 503, 'GraphQL request controls are unavailable')
  }

  res.setHeader('cache-control', 'no-store')
  res.setHeader('x-content-type-options', 'nosniff')
  return yoga(req, res)
}
