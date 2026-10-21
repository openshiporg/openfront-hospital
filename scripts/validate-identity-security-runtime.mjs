import 'dotenv/config'
import assert from 'node:assert/strict'
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto'
import { createServer } from 'node:net'
import { readFile } from 'node:fs/promises'
import { PrismaClient } from '@prisma/client'

import { assertLocalGraphqlEndpoint, assertSafeRuntimeDatabase } from './lib/runtime-guard.mjs'

const endpoint = process.env.OPENFRONT_GRAPHQL_URL || process.env.GRAPHQL_URL
const databaseUrl = process.env.DATABASE_URL
const credentialsPath = process.env.OPENFRONT_RUNTIME_ADMIN_PATH
if (!credentialsPath) throw new Error('OPENFRONT_RUNTIME_ADMIN_PATH is required')
assertLocalGraphqlEndpoint(endpoint, 'identity security proof')
const guard = assertSafeRuntimeDatabase(databaseUrl, 'identity security proof')
if (!guard.disposable) throw new Error('Identity security proof requires a disposable Hospital database')

const prisma = new PrismaClient()
const runId = randomUUID().replaceAll('-', '').slice(0, 12)
const email = `runtime-identity-${runId}@example.test`
const oldPassword = `Old-Runtime-Identity-${runId}!`
const newPassword = `New-Runtime-Identity-${runId}-Rotated!`
let userId
let roleId

async function raw(query, variables = {}, cookie) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30_000),
  })
  return response.json()
}
async function gql(name, query, variables = {}, cookie) {
  const payload = await raw(query, variables, cookie)
  if (payload.errors?.length) throw new Error(`${name}: ${payload.errors.map(error => error.message).join('; ')}`)
  return payload.data
}
async function authenticate(identity, password) {
  const data = await gql('authenticate', `mutation($email:String!,$password:String!){authenticateUserWithPassword(email:$email,password:$password){... on UserAuthenticationWithPasswordSuccess{sessionToken item{id}} ... on UserAuthenticationWithPasswordFailure{message}}}`, { email: identity, password })
  const token = data.authenticateUserWithPassword?.sessionToken
  return token ? `keystonejs-session=${token}` : null
}

function smtpCaptureServer() {
  const commands = []
  let resolveMessage
  const message = new Promise(resolve => { resolveMessage = resolve })
  const server = createServer(socket => {
    socket.setEncoding('utf8')
    socket.write('220 runtime-mail.local ESMTP\r\n')
    let buffer = ''
    let dataMode = false
    let data = ''
    socket.on('data', chunk => {
      buffer += chunk
      while (buffer.includes('\n')) {
        const index = buffer.indexOf('\n')
        const line = buffer.slice(0, index + 1)
        buffer = buffer.slice(index + 1)
        const value = line.replace(/\r?\n$/, '')
        if (!dataMode) commands.push(value.split(/\s+/)[0]?.toUpperCase() || '')
        if (dataMode) {
          if (value === '.') {
            dataMode = false
            resolveMessage(data)
            socket.write('250 2.0.0 queued\r\n')
          } else data += `${value}\n`
          continue
        }
        if (/^(EHLO|HELO)\b/i.test(value)) socket.write('250-runtime-mail.local\r\n250 PIPELINING\r\n')
        else if (/^DATA\b/i.test(value)) { dataMode = true; socket.write('354 End data with <CR><LF>.<CR><LF>\r\n') }
        else if (/^QUIT\b/i.test(value)) { socket.write('221 2.0.0 bye\r\n'); socket.end() }
        else socket.write('250 2.0.0 ok\r\n')
      }
    })
  })
  return { server, message, commands }
}

const capture = smtpCaptureServer()
await new Promise(resolve => capture.server.listen(0, '127.0.0.1', resolve))
const smtpPort = capture.server.address().port
process.env.SMTP_HOST = '127.0.0.1'
process.env.SMTP_PORT = String(smtpPort)
process.env.SMTP_FROM = 'no-reply@example.test'
process.env.SMTP_STORE_LINK = 'http://127.0.0.1:3211'
delete process.env.SMTP_USER
delete process.env.SMTP_PASSWORD

try {
  const admin = JSON.parse(await readFile(credentialsPath, 'utf8'))
  let adminCookie = await authenticate(admin.email || admin.identity, admin.password)
  if (!adminCookie) throw new Error('Runtime administrator authentication failed')

  const role = await prisma.role.create({ data: { name: `runtime identity ${runId}`, canAccessDashboard: true } })
  roleId = role.id
  const created = await gql('create identity test user', `mutation($data:UserCreateInput!){createUser(data:$data){id}}`, { data: {
    name: 'Runtime Identity User', email, password: oldPassword, role: { connect: { id: role.id } },
  } }, adminCookie)
  userId = created.createUser.id
  const oldCookie = await authenticate(email, oldPassword)
  if (!oldCookie) throw new Error('Identity test user authentication failed')

  const sessionQuery = `{authenticatedItem{... on User{id securityVersion role{canAccessDashboard}}}}`
  const beforeRoleChange = await gql('session before role change', sessionQuery, {}, oldCookie)
  assert.equal(beforeRoleChange.authenticatedItem?.role?.canAccessDashboard, true)
  await prisma.role.update({ where: { id: role.id }, data: { canAccessDashboard: false } })
  const afterRoleChange = await gql('session after role change', sessionQuery, {}, oldCookie)
  assert.equal(afterRoleChange.authenticatedItem?.role?.canAccessDashboard, false)
  await prisma.role.update({ where: { id: role.id }, data: { canAccessDashboard: true } })

  const globalRole = await prisma.role.findFirstOrThrow({ where: { canAccessAllClinicalData: true } })
  const globalUser = await prisma.user.findFirstOrThrow({ where: { roleId: globalRole.id } })
  const { requestPasswordReset, redeemPasswordReset } = await import('../features/keystone/security/passwordReset.ts')
  await assert.rejects(
    prisma.user.update({ where: { id: userId }, data: { roleId: globalRole.id } }),
    /Only one user may hold global clinical access/,
  )
  await assert.rejects(
    prisma.role.create({ data: { name: `second global ${runId}`, canAccessAllClinicalData: true } }),
    /Only one dedicated global clinical role is permitted/,
  )
  await assert.rejects(prisma.role.update({ where: { id: globalRole.id }, data: { canAccessAllClinicalData: false } }), /cannot be demoted/)
  await assert.rejects(prisma.user.update({ where: { id: globalUser.id }, data: { roleId: role.id } }), /assignee cannot be changed/)
  await assert.rejects(prisma.user.delete({ where: { id: globalUser.id } }), /assignee cannot be deleted/)
  await assert.rejects(prisma.role.delete({ where: { id: globalRole.id } }), /role cannot be deleted/)

  const globalResetToken = `reset_${randomBytes(32).toString('base64url')}`
  const globalReset = await prisma.passwordResetRequest.create({ data: {
    tokenDigest: createHash('sha256').update(globalResetToken).digest('hex'),
    accountDigest: createHmac('sha256', String(process.env.PASSWORD_RESET_PEPPER)).update(`password-reset-account:${globalUser.email.toLowerCase()}`).digest('hex'),
    status: 'pending', userId: globalUser.id, expiresAt: new Date(Date.now() + 30 * 60_000),
  } })
  const rotatedEmail = `GLOBAL-${runId}@EXAMPLE.TEST`
  const globalEmailUpdate = await raw(
    `mutation($id:ID!,$email:String!){updateUser(where:{id:$id},data:{email:$email}){id email securityVersion}}`,
    { id: globalUser.id, email: rotatedEmail },
    adminCookie,
  )
  assert.equal(globalEmailUpdate.errors, undefined)
  const rotatedGlobal = await prisma.user.findUniqueOrThrow({ where: { id: globalUser.id } })
  assert.equal(rotatedGlobal.email, rotatedEmail.toLowerCase())
  assert.equal(rotatedGlobal.securityVersion, globalUser.securityVersion + 1)
  assert.equal((await prisma.passwordResetRequest.findUniqueOrThrow({ where: { id: globalReset.id } })).status, 'superseded')
  assert.equal(await redeemPasswordReset({ email: globalUser.email, token: globalResetToken, password: newPassword }, 'identity-global-old-reset'), false)
  assert.equal((await gql('stale global session after email rotation', sessionQuery, {}, adminCookie)).authenticatedItem, null)
  adminCookie = await authenticate(rotatedEmail.toLowerCase(), admin.password)
  if (!adminCookie) throw new Error('Global administrator could not authenticate after normalized email rotation')
  await gql(
    'restore global administrator email',
    `mutation($id:ID!,$email:String!){updateUser(where:{id:$id},data:{email:$email}){id}}`,
    { id: globalUser.id, email: globalUser.email },
    adminCookie,
  )
  adminCookie = await authenticate(globalUser.email, admin.password)
  if (!adminCookie) throw new Error('Global administrator email restoration failed')
  await prisma.passwordResetRequest.delete({ where: { id: globalReset.id } })

  await prisma.role.update({ where: { id: role.id }, data: { canSeeOtherPeople: true, canEditOtherPeople: true } })
  const delegatedEmailAttempt = await raw(
    `mutation($id:ID!,$email:String!){updateUser(where:{id:$id},data:{email:$email}){id}}`,
    { id: globalUser.id, email: `takeover-${runId}@example.test` },
    oldCookie,
  )
  assert.ok(delegatedEmailAttempt.errors?.length, 'Delegated people editor changed the global email')
  await prisma.role.update({ where: { id: role.id }, data: { canManagePeople: true } })
  const delegatedPasswordAttempt = await raw(
    `mutation($id:ID!,$password:String!){updateUser(where:{id:$id},data:{password:$password}){id}}`,
    { id: globalUser.id, password: `Takeover-${runId}-Password!` },
    oldCookie,
  )
  assert.ok(delegatedPasswordAttempt.errors?.length, 'Delegated people manager changed the global password')
  const unchangedGlobal = await prisma.user.findUniqueOrThrow({ where: { id: globalUser.id } })
  assert.equal(unchangedGlobal.email, globalUser.email)

  const unknownBefore = await prisma.passwordResetRequest.count()
  await requestPasswordReset(`missing-${runId}@example.test`, 'identity-proof-network')
  assert.equal(await prisma.passwordResetRequest.count(), unknownBefore)

  await requestPasswordReset(email, 'identity-proof-network')
  const issuedRows = await prisma.passwordResetRequest.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } })
  if (!issuedRows.length || issuedRows[0].status !== 'pending') {
    throw new Error(`Password-reset issuance failed with status ${issuedRows[0]?.status || 'missing'}`)
  }
  const rawMail = await Promise.race([
    capture.message,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Password-reset email was not captured; SMTP commands: ${capture.commands.join(',')}`)), 10_000)),
  ])
  const decodedMail = String(rawMail).replace(/=\r?\n/g, '').replace(/=3D/g, '=')
  assert.doesNotMatch(decodedMail, /\/dashboard\/reset\?[^\s"']*token=/i)
  const tokenMatch = decodedMail.match(/\/dashboard\/reset#token=(reset_[A-Za-z0-9_-]{43})/)
  if (!tokenMatch) throw new Error('Password-reset email did not contain a fragment-only token')
  const token = tokenMatch[1]
  const requestRow = await prisma.passwordResetRequest.findUniqueOrThrow({ where: { tokenDigest: createHash('sha256').update(token).digest('hex') } })
  assert.equal(requestRow.status, 'pending')
  assert.equal(JSON.stringify(requestRow).includes(token), false)
  const userBeforeReset = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
  assert.ok(userBeforeReset.securityVersion >= 1)
  assert.ok(!userBeforeReset.passwordResetToken)

  const redeemed = await Promise.all([
    redeemPasswordReset({ email, token, password: newPassword }, 'identity-proof-redeem'),
    redeemPasswordReset({ email, token, password: newPassword }, 'identity-proof-redeem'),
  ])
  assert.equal(redeemed.filter(Boolean).length, 1)
  assert.equal(await redeemPasswordReset({ email, token, password: newPassword }, 'identity-proof-redeem'), false)
  assert.equal((await prisma.passwordResetRequest.findUniqueOrThrow({ where: { id: requestRow.id } })).status, 'redeemed')
  const userAfterReset = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
  assert.equal(userAfterReset.securityVersion, userBeforeReset.securityVersion + 1)

  const staleSession = await gql('stale session after password rotation', sessionQuery, {}, oldCookie)
  assert.equal(staleSession.authenticatedItem, null)
  assert.equal(await authenticate(email, oldPassword), null)
  assert.ok(await authenticate(email, newPassword))

  console.log(JSON.stringify({
    result: 'identity-security-runtime-passed',
    liveRoleRehydration: true,
    globalRoleAndAssigneeFences: true,
    globalAuthorityRetentionFences: true,
    globalCredentialTakeoverDenied: true,
    globalEmailRotationAndResetSupersession: true,
    fragmentOnlyResetLink: true,
    resetTokenHashOnly: true,
    concurrentResetExactlyOnce: true,
    passwordRotationInvalidatedSession: true,
    normalizedUnknownAccountResponseState: true,
  }))
} finally {
  if (userId) {
    await prisma.passwordResetRequest.deleteMany({ where: { userId } })
    await prisma.user.deleteMany({ where: { id: userId } })
  }
  if (roleId) await prisma.role.deleteMany({ where: { id: roleId } })
  await prisma.$disconnect()
  await new Promise(resolve => capture.server.close(resolve))
}
