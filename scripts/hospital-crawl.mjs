// Release proof: load every dashboard and storefront page as each role and print PASS/FAIL per page.
// Usage: CRAWL_BASE=https://host CRAWL_LOGINS=/path/logins.json node scripts/r6-crawl.mjs [roles...]
// CRAWL_LOGINS is { "<role>": { "email", "password" } } (or a single { email, password }) kept outside the repo.
import fs from 'node:fs'
import { chromium } from '/Users/junaid/Code/vibeghost/vibeghost/node_modules/playwright/index.mjs'

const BASE = process.env.CRAWL_BASE
const raw = JSON.parse(fs.readFileSync(process.env.CRAWL_LOGINS, 'utf8'))
const people = raw.email ? { owner: raw } : raw
const roles = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(people)

async function gql(query, cookie, variables) {
  const r = await fetch(BASE + '/api/graphql', { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify({ query, variables }) })
  return r.json()
}
async function token(who) {
  const p = people[who]
  const r = await gql('mutation($e:String!,$p:String!){authenticateUserWithPassword(email:$e,password:$p){... on UserAuthenticationWithPasswordSuccess{sessionToken}}}', undefined, { e: p.email, p: p.password })
  return r.data?.authenticateUserWithPassword?.sessionToken
}
const cookie = 'keystonejs-session=' + (await token(roles[0]))
const dr = await gql(`{patients(take:1){id} providers(take:1){id} facilities(take:1){id} appointmentTypes(take:1){id slug} users(take:1){id} appointments(take:1){id}}`, cookie)
if (!dr.data) { console.log('CHECK crawl id lookup: FAIL ' + JSON.stringify(dr.errors?.[0]?.message)); process.exit(1) }
const d = dr.data
const one = (a) => a?.[0]
const platform = ['patients', 'registration', 'appointments', 'appointments?view=all', 'inpatient', 'operational-fabric', 'providers', 'store-settings', 'clinical-operations', 'lab-tests', 'schedules', 'intake', 'audit', 'clinical-fulfillment', 'encounters', 'staff', 'visit-types', 'care-queue', 'facilities', 'communications', 'reports', 'claims']
const dash = platform.map((p) => '/dashboard/platform' + (p ? '/' + p : ''))
if (one(d.patients)) dash.push('/dashboard/platform/patients/' + one(d.patients).id)
if (one(d.providers)) dash.push('/dashboard/platform/providers/' + one(d.providers).id)
if (one(d.facilities)) dash.push('/dashboard/platform/facilities/' + one(d.facilities).id)
if (one(d.appointmentTypes)) dash.push('/dashboard/platform/visit-types/' + one(d.appointmentTypes).id)
dash.push('/dashboard', ...['patients', 'facilities', 'appointments', 'beds', 'bed-reservations', 'patient-payments', 'users'].map((k) => '/dashboard/' + k))
const store = ['/', '/care', '/providers', '/locations', '/visit', '/book', '/pay', '/intake', '/account']
if (one(d.providers)) store.push('/providers/' + one(d.providers).id)
if (one(d.appointmentTypes)) store.push('/book/' + one(d.appointmentTypes).slug)
const notFound = ['/dashboard/platform/patients/nope123', '/dashboard/platform/providers/nope123', '/dashboard/platform/facilities/nope123', '/dashboard/platform/visit-types/nope123', '/providers/nope123', '/book/nope123']
const paths = [...dash, ...store, ...notFound].filter((x) => !process.env.CRAWL_ONLY || process.env.CRAWL_ONLY.split(',').includes(x))

if (process.env.CRAWL_MODE === 'fetch') {
  // Low-memory mode: no browser. Loads each page with the session cookie and checks status and rendered text.
  let bad = 0, total = 0
  for (const role of roles) {
    const ck = 'keystonejs-session=' + (await token(role))
    for (const path of paths) {
      let res = null, err = ''
      for (let attempt = 0; attempt < 3 && !res; attempt++) res = await fetch(BASE + path, { headers: { cookie: ck }, redirect: 'manual', signal: AbortSignal.timeout(120000) }).catch((e) => { err = String(e.message); return null })
      const http = res?.status ?? 0
      const txt = res ? await res.text().catch(() => '') : ''
      const expect404 = notFound.includes(path)
      const broken = /this page could not be loaded|something went wrong|application error|internal server error/i.test(txt)
      const soft404 = /could not be found|not found|not visible to this session|NEXT_HTTP_ERROR_FALLBACK;404/i.test(txt)
      const ok = expect404 ? http === 404 || soft404 : http > 0 && http < 400 && !broken
      total++; if (!ok) bad++
      console.log(`CHECK ${role} ${path}: ${ok ? 'PASS' : 'FAIL'} (${http}${expect404 ? ' expected 404' : ''}${broken ? ' broken text' : ''}${!res ? ' ' + err : ''})`)
    }
  }
  console.log(`CHECK all pages: ${bad ? 'FAIL' : 'PASS'} (${total} loads, ${bad} failed)`)
  process.exit(bad ? 1 : 0)
}
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-mac-arm64/chrome-headless-shell' })
let bad = 0, total = 0
for (const role of roles) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true })
  const p = await ctx.newPage()
  await p.goto(BASE + '/dashboard/signin')
  await p.fill('input[name=email]', people[role].email)
  await p.fill('input[name=password]', people[role].password)
  await Promise.all([p.waitForURL((u) => !u.pathname.includes('signin'), { timeout: 30000 }), p.click('button[type=submit]')])
  for (const path of paths) {
    // A load that never answers (status 0) is retried twice before it counts; a real 500 is never retried.
    let r = null, lastErr = ''
    for (let attempt = 0; attempt < 3 && !r; attempt++) r = await p.goto(BASE + path, { waitUntil: 'networkidle', timeout: 120000 }).catch((e) => { lastErr = String(e.message).split('\n')[0].slice(0, 120); return null })
    const txt = await p.evaluate(() => document.body.innerText).catch(() => '')
    const http = r?.status() ?? 0
    const expect404 = notFound.includes(path)
    const broken = /this page could not be loaded|something went wrong|application error|internal server error/i.test(txt)
    // A streamed page may already have sent 200 when notFound() fires; the rendered not-found page (or a rendered not-found message) counts as 404.
    const soft404 = await p.evaluate(() => /could not be found|not found|not visible to this session|404/i.test(document.body.innerText)).catch(() => false)
    const ok = expect404 ? http === 404 || soft404 : http > 0 && http < 400 && !broken
    total++; if (!ok) bad++
    console.log(`CHECK ${role} ${path}: ${ok ? 'PASS' : 'FAIL'} (${http}${expect404 ? ' expected 404' : ''}${broken ? ' broken text' : ''}${!r ? ' ' + lastErr : ''})`)
  }
  await ctx.close()
}
await b.close()
console.log(`CHECK all pages: ${bad ? 'FAIL' : 'PASS'} (${total} loads, ${bad} failed)`)
