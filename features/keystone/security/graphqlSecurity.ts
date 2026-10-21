import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { Prisma } from '@prisma/client'
import {
  GraphQLError,
  Kind,
  getNamedType,
  isCompositeType,
  isListType,
  isNonNullType,
  type ASTVisitor,
  type DocumentNode,
  type FragmentDefinitionNode,
  type GraphQLCompositeType,
  type OperationDefinitionNode,
  type SelectionSetNode,
  type ValidationContext,
} from 'graphql'

const MAX_DEPTH = 10
const MAX_FIELDS = 500
const MAX_ALIASES = 50
const MAX_QUERY_COST = 30_000
const DEFAULT_LIST_CARDINALITY = 100
const MAX_LIST_SKIP = 1_000
const MAX_REQUESTS = 120

// Custom resolvers do not expose a `take` argument, so charge both their
// enforced result cardinality and their eager internal database work.
const CUSTOM_LIST_CARDINALITY: Record<string, number> = {
  'Query.bookableAppointmentTypes': 25,
  'BookableAppointmentType.providers': 25,
  'BookableProvider.facilities': 10,
  'Query.bookableProviders': 50,
  'BookableProviderEntry.appointmentTypes': 25,
  'Query.availableAppointmentSlots': 96,
  'PatientRegistrationResult.candidates': 50,
  // Keystone admin metadata is a static, build-bounded schema projection rather
  // than a caller-sized data list. Response bytes and execution time remain
  // capped globally; model its nested metadata lists as one bounded unit.
  'KeystoneAdminMeta.lists': 1,
  'KeystoneAdminUIListMeta.fields': 1,
  'KeystoneAdminUIListMeta.groups': 1,
  'KeystoneAdminUIListMeta.initialColumns': 1,
  'KeystoneAdminUIListMeta.initialSearchFields': 1,
  'KeystoneAdminUIFieldMeta.isNonNull': 1,
  'KeystoneAdminUIFieldGroupMeta.fields': 1,
}
const CUSTOM_FIELD_BASE_COST: Record<string, number> = {
  // Charge one full static metadata materialization heavily so aliases cannot
  // multiply it, while allowing Keystone's own dashboard metadata document.
  'Query.keystone': 5_000,
  'KeystoneAdminMeta.lists': 6_000,
  'KeystoneAdminUIListMeta.fields': 5_000,
  'KeystoneAdminUIListMeta.groups': 2_000,
  'KeystoneAdminUIFieldGroupMeta.fields': 1_000,
  'Query.bookableAppointmentTypes': 5_000,
  'Query.bookableProviders': 5_000,
  'Query.availableAppointmentSlots': 12_000,
  'Query.appointmentScheduleConflicts': 8_000,
  'Query.intakeFormByAccessCode': 500,
}

type SelectionSetOwner = { selectionSet?: { selections: readonly any[] } }

function measureSelection(
  owner: SelectionSetOwner,
  fragments: Map<string, FragmentDefinitionNode>,
  depth: number,
  path: Set<string>,
): { depth: number; fields: number; aliases: number } {
  let deepest = depth
  let fields = 0
  let aliases = 0
  for (const selection of owner.selectionSet?.selections || []) {
    if (selection.kind === Kind.FIELD) {
      fields += 1
      if (selection.alias) aliases += 1
      const nested = measureSelection(selection, fragments, depth + 1, path)
      deepest = Math.max(deepest, nested.depth)
      fields += nested.fields
      aliases += nested.aliases
    } else if (selection.kind === Kind.INLINE_FRAGMENT) {
      const nested = measureSelection(selection, fragments, depth, path)
      deepest = Math.max(deepest, nested.depth)
      fields += nested.fields
      aliases += nested.aliases
    } else if (selection.kind === Kind.FRAGMENT_SPREAD && !path.has(selection.name.value)) {
      const fragment = fragments.get(selection.name.value)
      if (!fragment) continue
      const nextPath = new Set(path).add(selection.name.value)
      const nested = measureSelection(fragment, fragments, depth, nextPath)
      deepest = Math.max(deepest, nested.depth)
      fields += nested.fields
      aliases += nested.aliases
    }
  }
  return { depth: deepest, fields, aliases }
}

function listCardinality(parentType: GraphQLCompositeType, fieldNode: any, field: any) {
  const custom = CUSTOM_LIST_CARDINALITY[`${parentType.name}.${fieldNode.name.value}`]
  if (custom) return custom
  const takeNode = fieldNode.arguments?.find((argument: any) => argument.name.value === 'take')?.value
  const literalTake = takeNode?.kind === Kind.INT ? Number(takeNode.value) : null
  if (literalTake !== null && (!Number.isInteger(literalTake) || literalTake < 1 || literalTake > DEFAULT_LIST_CARDINALITY)) {
    return MAX_QUERY_COST + 1
  }
  const takeDefinition = field.args?.find((argument: any) => argument.name === 'take')
  const cardinality = literalTake ?? (Number.isInteger(takeDefinition?.defaultValue)
    ? Number(takeDefinition.defaultValue)
    : DEFAULT_LIST_CARDINALITY)

  const skipNode = fieldNode.arguments?.find((argument: any) => argument.name.value === 'skip')?.value
  const literalSkip = skipNode?.kind === Kind.INT ? Number(skipNode.value) : null
  if (literalSkip !== null && (!Number.isInteger(literalSkip) || literalSkip < 0 || literalSkip > MAX_LIST_SKIP)) {
    return MAX_QUERY_COST + 1
  }
  // A variable skip is charged at its runtime ceiling. Offset work is treated
  // as cardinality so nested selections are conservatively multiplied too.
  const skip = skipNode?.kind === Kind.VARIABLE ? MAX_LIST_SKIP : literalSkip || 0
  return cardinality + Math.ceil(skip / 10)
}

function isKeystoneAdminMetadataField(parentType: GraphQLCompositeType, fieldName: string) {
  return (parentType.name === 'Query' && fieldName === 'keystone') ||
    (parentType.name === 'KeystoneMeta' && fieldName === 'adminMeta') ||
    parentType.name.startsWith('KeystoneAdmin')
}

function selectionCost(
  context: ValidationContext,
  selectionSet: SelectionSetNode | undefined,
  parentType: GraphQLCompositeType,
  fragments: Map<string, FragmentDefinitionNode>,
  path: Set<string>,
): number {
  let total = 0
  for (const selection of selectionSet?.selections || []) {
    if (selection.kind === Kind.FIELD) {
      // Admin metadata is a static schema projection. Repeated unaliased fields
      // merge during GraphQL execution, while aliases create distinct response
      // work. Keystone's own document uses no aliases, so reject aliases at
      // every coordinate in this subtree rather than undercharging descendants.
      if (selection.alias && isKeystoneAdminMetadataField(parentType, selection.name.value)) {
        return MAX_QUERY_COST + 1
      }
      // GraphQL's introspection meta-fields are not returned by getFields().
      // Charge the fixed but large schema materialization explicitly so aliases
      // cannot multiply a full introspection response below the normal budget.
      if (selection.name.value === '__schema') {
        total += process.env.NODE_ENV === 'production' ? MAX_QUERY_COST + 1 : 20_000
        continue
      }
      if (selection.name.value === '__type') {
        total += process.env.NODE_ENV === 'production' ? MAX_QUERY_COST + 1 : 2_000
        continue
      }
      if (selection.name.value === '__typename') { total += 1; continue }
      const field = (parentType as any).getFields?.()[selection.name.value]
      if (!field) { total += 1; continue }
      const fieldKey = `${parentType.name}.${selection.name.value}`
      const baseCost = CUSTOM_FIELD_BASE_COST[fieldKey] || 0
      const named = getNamedType(field.type)
      const nested = selection.selectionSet && isCompositeType(named)
        ? selectionCost(context, selection.selectionSet, named, fragments, path)
        : 1
      let output = field.type
      while (isNonNullType(output)) output = output.ofType
      total += baseCost + (isListType(output)
        ? 1 + listCardinality(parentType, selection, field) * nested
        : 1 + (selection.selectionSet ? nested : 0))
    } else if (selection.kind === Kind.INLINE_FRAGMENT) {
      const conditional = selection.typeCondition
        ? context.getSchema().getType(selection.typeCondition.name.value)
        : parentType
      total += isCompositeType(conditional)
        ? selectionCost(context, selection.selectionSet, conditional, fragments, path)
        : 0
    } else if (selection.kind === Kind.FRAGMENT_SPREAD) {
      if (path.has(selection.name.value)) return MAX_QUERY_COST + 1
      const fragment = fragments.get(selection.name.value)
      const conditional = fragment && context.getSchema().getType(fragment.typeCondition.name.value)
      if (fragment && isCompositeType(conditional)) {
        total += selectionCost(context, fragment.selectionSet, conditional, fragments, new Set(path).add(selection.name.value))
      }
    }
    if (total > MAX_QUERY_COST) return total
  }
  return total
}

export function boundedGraphqlDocumentRule(context: ValidationContext): ASTVisitor {
  return {
    Document(node: DocumentNode) {
      const fragments = new Map(
        node.definitions
          .filter((definition): definition is FragmentDefinitionNode => definition.kind === Kind.FRAGMENT_DEFINITION)
          .map(definition => [definition.name.value, definition]),
      )
      for (const definition of node.definitions) {
        if (definition.kind !== Kind.OPERATION_DEFINITION) continue
        const measured = measureSelection(definition, fragments, 0, new Set())
        if (measured.depth > MAX_DEPTH) {
          context.reportError(new GraphQLError(`GraphQL operation exceeds maximum depth of ${MAX_DEPTH}`, { nodes: definition }))
        }
        if (measured.fields > MAX_FIELDS) {
          context.reportError(new GraphQLError(`GraphQL operation exceeds maximum field count of ${MAX_FIELDS}`, { nodes: definition }))
        }
        if (measured.aliases > MAX_ALIASES) {
          context.reportError(new GraphQLError(`GraphQL operation exceeds maximum alias count of ${MAX_ALIASES}`, { nodes: definition }))
        }
        const schema = context.getSchema()
        const rootType = definition.operation === 'query'
          ? schema.getQueryType()
          : definition.operation === 'mutation'
            ? schema.getMutationType()
            : schema.getSubscriptionType()
        const cost = rootType ? selectionCost(context, definition.selectionSet, rootType, fragments, new Set()) : 0
        if (cost > MAX_QUERY_COST) {
          context.reportError(new GraphQLError(`GraphQL operation exceeds maximum cost of ${MAX_QUERY_COST}`, { nodes: definition }))
        }
      }
    },
  }
}

function selectedOperation(
  document: DocumentNode,
  operationName?: string | null,
) {
  const operations = document.definitions.filter(
    (definition): definition is OperationDefinitionNode => definition.kind === Kind.OPERATION_DEFINITION,
  )
  return operationName
    ? operations.find(definition => definition.name?.value === operationName)
    : operations.length === 1 ? operations[0] : undefined
}

export function hasUnsafeGraphqlPagination(
  document: DocumentNode,
  variables: Record<string, unknown> = {},
  operationName?: string | null,
) {
  const operation = selectedOperation(document, operationName)
  if (!operation) return false
  const fragments = new Map(
    document.definitions
      .filter((definition): definition is FragmentDefinitionNode => definition.kind === Kind.FRAGMENT_DEFINITION)
      .map(definition => [definition.name.value, definition]),
  )
  const value = (node: any): unknown => {
    if (!node) return undefined
    if (node.kind === Kind.INT) return Number(node.value)
    if (node.kind !== Kind.VARIABLE) return Number.NaN
    const name = node.name.value
    if (Object.prototype.hasOwnProperty.call(variables, name)) return variables[name]
    const fallback = operation.variableDefinitions?.find(
      definition => definition.variable.name.value === name,
    )?.defaultValue
    return fallback?.kind === Kind.INT ? Number(fallback.value) : undefined
  }
  let unsafe = false
  const inspect = (selectionSet: SelectionSetNode, path: Set<string>) => {
    for (const selection of selectionSet.selections) {
      if (unsafe) return
      if (selection.kind === Kind.FIELD) {
        for (const argument of selection.arguments || []) {
          if (argument.name.value !== 'take' && argument.name.value !== 'skip') continue
          const resolved = value(argument.value)
          if (resolved === undefined) continue
          if (!Number.isInteger(resolved) ||
            (argument.name.value === 'take' && (Number(resolved) < 1 || Number(resolved) > DEFAULT_LIST_CARDINALITY)) ||
            (argument.name.value === 'skip' && (Number(resolved) < 0 || Number(resolved) > MAX_LIST_SKIP))) {
            unsafe = true
            return
          }
        }
        if (selection.selectionSet) inspect(selection.selectionSet, path)
      } else if (selection.kind === Kind.INLINE_FRAGMENT) inspect(selection.selectionSet, path)
      else if (selection.kind === Kind.FRAGMENT_SPREAD && !path.has(selection.name.value)) {
        const fragment = fragments.get(selection.name.value)
        if (fragment) inspect(fragment.selectionSet, new Set(path).add(selection.name.value))
      }
    }
  }
  inspect(operation.selectionSet, new Set())
  return unsafe
}

function normalizedAuthenticationAccount(value: unknown) {
  const email = String(value || '').trim().toLowerCase()
  return /^\S+@\S+\.\S+$/.test(email) && email.length <= 254 ? email : 'invalid-account'
}

export function authenticationAccountRateIdentity(
  value: unknown,
  secret = String(process.env.AUTH_RATE_LIMIT_PEPPER || (process.env.NODE_ENV !== 'production' ? process.env.SESSION_SECRET : '') || ''),
) {
  if (secret.length < 48) throw new Error('Authentication rate-limit pepper is not configured')
  return createHmac('sha256', secret).update(`authentication-account:${normalizedAuthenticationAccount(value)}`).digest('hex')
}

export function authenticationAttempts(
  document: DocumentNode,
  variables: Record<string, unknown> = {},
  operationName?: string | null,
) {
  const fragments = new Map(
    document.definitions
      .filter((definition): definition is FragmentDefinitionNode => definition.kind === Kind.FRAGMENT_DEFINITION)
      .map(definition => [definition.name.value, definition]),
  )
  const operation = selectedOperation(document, operationName)
  if (!operation) return []
  const attempts: Array<{ responseKey: string; accountIdentity: string; normalizedAccount: string }> = []
  const inspect = (selectionSet: SelectionSetNode, path: Set<string>) => {
    for (const selection of selectionSet.selections) {
      if (selection.kind === Kind.FIELD) {
        if (selection.name.value === 'authenticateUserWithPassword') {
          const emailNode = selection.arguments?.find(argument => argument.name.value === 'email')?.value
          let email: unknown = emailNode?.kind === Kind.STRING ? emailNode.value : ''
          if (emailNode?.kind === Kind.VARIABLE) {
            const variableName = emailNode.name.value
            const variableDefault = operation.variableDefinitions?.find(
              definition => definition.variable.name.value === variableName,
            )?.defaultValue
            email = Object.prototype.hasOwnProperty.call(variables, variableName)
              ? variables[variableName]
              : variableDefault?.kind === Kind.STRING ? variableDefault.value : ''
          }
          attempts.push({
            responseKey: selection.alias?.value || selection.name.value,
            accountIdentity: authenticationAccountRateIdentity(email),
            normalizedAccount: normalizedAuthenticationAccount(email),
          })
        }
        if (selection.selectionSet) inspect(selection.selectionSet, path)
      } else if (selection.kind === Kind.INLINE_FRAGMENT) inspect(selection.selectionSet, path)
      else if (selection.kind === Kind.FRAGMENT_SPREAD && !path.has(selection.name.value)) {
        const fragment = fragments.get(selection.name.value)
        if (fragment) inspect(fragment.selectionSet, new Set(path).add(selection.name.value))
      }
    }
  }
  inspect(operation.selectionSet, new Set())
  return attempts
}

type RateLimitPrisma = {
  $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T>
}

/** Atomically consume a fixed-window counter shared by every application replica. */
export async function consumeSharedRateLimit(
  prisma: RateLimitPrisma,
  namespace: string,
  identity: string,
  maximum = MAX_REQUESTS,
  now = new Date(),
  windowSeconds = 60,
) {
  if (!Number.isInteger(maximum) || maximum < 1) throw new Error('Invalid rate-limit maximum')
  if (!Number.isInteger(windowSeconds) || windowSeconds < 1 || windowSeconds > 86_400) throw new Error('Invalid rate-limit window')
  const id = createHash('sha256').update(`${namespace}\0${identity}`).digest('hex')
  const staleBefore = new Date(now.getTime() - 24 * 60 * 60_000)
  const rows = await prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
    WITH pruned AS (
      DELETE FROM "RequestRateLimitBucket"
      WHERE "updatedAt" < ${staleBefore} AND left("id", 2) = left(${id}, 2)
    )
    INSERT INTO "RequestRateLimitBucket" ("id", "startedAt", "count", "updatedAt")
    VALUES (${id}, ${now}, 1, ${now})
    ON CONFLICT ("id") DO UPDATE SET
      "startedAt" = CASE
        WHEN "RequestRateLimitBucket"."startedAt" <= EXCLUDED."startedAt" - (${windowSeconds} * INTERVAL '1 second')
          THEN EXCLUDED."startedAt"
        ELSE "RequestRateLimitBucket"."startedAt"
      END,
      "count" = CASE
        WHEN "RequestRateLimitBucket"."startedAt" <= EXCLUDED."startedAt" - (${windowSeconds} * INTERVAL '1 second')
          THEN 1
        ELSE "RequestRateLimitBucket"."count" + 1
      END,
      "updatedAt" = EXCLUDED."updatedAt"
    RETURNING "count"
  `)
  return Number(rows[0]?.count || maximum + 1) <= maximum
}

const INTERNAL_IDENTITY_MAX_AGE_MS = 90_000

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

export function signInternalClientIdentity(source: string, secret: string, now = Date.now()) {
  if (!source || secret.length < 32) return null
  const identity = createHash('sha256').update(source).digest('hex')
  const timestamp = String(Math.floor(now / 1_000))
  const signature = createHmac('sha256', secret).update(`${timestamp}:${identity}`).digest('hex')
  return { identity, timestamp, signature }
}

function verifiedInternalIdentity(
  headers: Record<string, string | string[] | undefined>,
  socketAddress: string | null | undefined,
  secret: string,
  now: number,
) {
  const loopback = /^(?:127\.|::1$|::ffff:127\.)/.test(String(socketAddress || ''))
  if (!loopback || secret.length < 32) return null
  const identity = String(headers['x-openfront-client-identity'] || '')
  const timestamp = String(headers['x-openfront-client-timestamp'] || '')
  const signature = String(headers['x-openfront-client-signature'] || '')
  if (!/^[a-f0-9]{64}$/.test(identity) || !/^\d{10}$/.test(timestamp) || !/^[a-f0-9]{64}$/.test(signature)) return null
  const age = Math.abs(now - Number(timestamp) * 1_000)
  if (!Number.isFinite(age) || age > INTERNAL_IDENTITY_MAX_AGE_MS) return null
  const expected = createHmac('sha256', secret).update(`${timestamp}:${identity}`).digest('hex')
  return safeEqual(signature, expected) ? `forwarded:${identity}` : null
}

export function graphqlNetworkBucketNamespace(hasCandidateSession: boolean) {
  return hasCandidateSession ? 'graphql-network-session-candidate' : 'graphql-network-anonymous'
}

export function requestIdentity(
  headers: Record<string, string | string[] | undefined>,
  socketAddress?: string | null,
  secret = String(process.env.SESSION_SECRET || ''),
  now = Date.now(),
) {
  const internal = verifiedInternalIdentity(headers, socketAddress, secret, now)
  if (internal) return internal

  if (process.env.RAILWAY_ENVIRONMENT) {
    // Railway supplies X-Real-IP at the edge. Prefer it over a client-extendable
    // forwarding chain and retain a separate global ingress bucket at callers.
    const realIp = String(headers['x-real-ip'] || '').split(',')[0]?.trim()
    if (realIp) return realIp
  } else if (process.env.TRUST_PROXY === '1') {
    const chain = String(headers['x-forwarded-for'] || '').split(',').map(value => value.trim()).filter(Boolean)
    const configuredHops = Number(process.env.TRUST_PROXY_HOPS || 1)
    const hops = Number.isInteger(configuredHops) && configuredHops > 0 ? configuredHops : 1
    const vouched = chain[chain.length - hops]
    if (vouched) return vouched
    const realIp = String(headers['x-real-ip'] || '').split(',')[0]?.trim()
    if (realIp) return realIp
  }
  return socketAddress || 'unknown-local-client'
}

export function hasSafeGraphqlOrigin(method: string | undefined, headers: Record<string, string | string[] | undefined>) {
  if (String(method || 'POST').toUpperCase() !== 'POST') return true
  const contentType = String(headers['content-type'] || '').toLowerCase()
  if (!contentType.startsWith('application/json')) return false
  const origin = String(headers.origin || '').trim()
  if (!origin) return true
  const trustProxy = process.env.TRUST_PROXY === '1' || Boolean(process.env.RAILWAY_ENVIRONMENT)
  const host = String((trustProxy ? headers['x-forwarded-host'] : '') || headers.host || '').split(',')[0]?.trim().toLowerCase()
  try {
    return new URL(origin).host.toLowerCase() === host
  } catch {
    return false
  }
}
