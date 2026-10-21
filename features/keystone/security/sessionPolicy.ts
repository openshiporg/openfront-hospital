import { statelessSessions } from '@keystone-6/core/session'

const DEVELOPMENT_SESSION_SECRET = 'local-development-session-secret-change-before-deploying'
const MIN_PRODUCTION_SECRET_LENGTH = 48

export type SessionEnvironment = Partial<Pick<NodeJS.ProcessEnv, 'NODE_ENV' | 'SESSION_SECRET' | 'DATABASE_URL'>>

function hasReasonableEntropy(secret: string) {
  return new Set(secret).size >= 8 && !/^(.)\1+$/.test(secret)
}

export function resolveSessionPolicy(environment: SessionEnvironment = process.env) {
  const production = environment.NODE_ENV === 'production'
  const configuredSecret = environment.SESSION_SECRET?.trim()

  if (production) {
    if (!environment.DATABASE_URL?.startsWith('postgresql://')) {
      throw new Error('DATABASE_URL must be configured with PostgreSQL in production')
    }
    if (
      !configuredSecret ||
      configuredSecret.length < MIN_PRODUCTION_SECRET_LENGTH ||
      configuredSecret === DEVELOPMENT_SESSION_SECRET ||
      !hasReasonableEntropy(configuredSecret)
    ) {
      throw new Error(`SESSION_SECRET must be a high-entropy value of at least ${MIN_PRODUCTION_SECRET_LENGTH} characters in production`)
    }
  }

  return {
    maxAge: 60 * 30,
    secret: configuredSecret || DEVELOPMENT_SESSION_SECRET,
    secure: production,
    sameSite: 'lax' as const,
    cookieName: 'keystonejs-session',
    path: '/',
  }
}

export function createSessionStrategy(environment: SessionEnvironment = process.env) {
  const sealed = statelessSessions<any>(resolveSessionPolicy(environment))
  return {
    async start({ context, data }: { context: any; data: any }) {
      if (data?.itemId && data?.listKey === 'User') {
        const user = await context.prisma.user.findUnique({
          where: { id: data.itemId },
          select: { securityVersion: true },
        })
        if (!user) return ''
        const expectedVersion = context.openfrontAuthenticationVersionSnapshot?.get?.(data.itemId)
        if (!Number.isInteger(expectedVersion) || Number(expectedVersion) !== Number(user.securityVersion || 1)) return ''
        return sealed.start({
          context,
          data: {
            ...data,
            data: { ...(data.data || {}), securityVersion: Number(user.securityVersion || 1) },
          },
        })
      }
      return sealed.start({ context, data })
    },
    end: sealed.end,
    async get({ context }: { context: any }) {
      const issued = await sealed.get({ context })
      if (!issued?.itemId || issued.listKey !== 'User') return undefined
      const user = await context.prisma.user.findUnique({
        where: { id: issued.itemId },
        include: { role: true },
      })
      if (!user || Number(issued.data?.securityVersion || 1) !== Number(user.securityVersion || 1)) return undefined
      return {
        itemId: user.id,
        listKey: 'User',
        data: {
          name: user.name,
          email: user.email,
          securityVersion: user.securityVersion,
          role: user.role,
        },
      }
    },
  }
}
