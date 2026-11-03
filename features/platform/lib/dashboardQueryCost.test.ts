import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import { buildSchema, parse, validate } from 'graphql'

import { boundedGraphqlDocumentRule } from '../../keystone/security/graphqlSecurity'

const schema = buildSchema(readFileSync(join(process.cwd(), 'schema.graphql'), 'utf8'))
const LIMIT = 30_000
const PROBE_STEP = 2_000 // each aliased __type costs a fixed 2000 outside production

function passes(query: string, probes = 0) {
  const extra = Array.from({ length: probes }, (_, i) => `p${i}: __type(name: "User") { name }`).join(' ')
  const doc = parse(probes ? query.replace(/\}\s*$/, `${extra} }`) : query)
  return validate(schema, doc, [boundedGraphqlDocumentRule]).length === 0
}

/** Upper bound of the real estimator's cost, to within one probe step, found by adding fixed-cost probes. */
function costUpperBound(query: string) {
  if (!passes(query)) return Infinity
  let probes = 0
  while (probes < 15 && passes(query, probes + 1)) probes += 1
  return LIMIT - PROBE_STEP * probes
}

async function load() {
  const labs = await import('../lab-tests/actions/labTestQueryDocs')
  const providers = await import('../providers/actions/queryDocs')
  return {
    'lab page + counts': labs.labTestCatalogQuery(0),
    'lab page (max skip)': labs.labTestCatalogQuery(975),
    'lab categories chunk': labs.labTestCategoriesQuery(1000),
    'provider page + counts': providers.providerPageQuery(0),
    'provider page (max skip)': providers.providerPageQuery(975),
    'provider facilities': providers.PROVIDER_FACILITY_OPTIONS_QUERY,
    'provider visit types': providers.PROVIDER_VISIT_TYPE_OPTIONS_QUERY,
    'provider specialties chunk': providers.providerSpecialtiesQuery(1000),
  } as Record<string, string>
}

test('the previous monolithic queries were over the limit (estimator sanity)', () => {
  const old = `{ labTests(take: 200) { id } }`
  assert.equal(passes(old), false)
  const oldProviders = `{ providers(take: 100) { id appointmentTypesCount facilities(take: 5) { id } } specialties: providers(take: 200) { specialty } }`
  assert.equal(passes(oldProviders), false)
})

test('every trimmed dashboard operation is under MAX_QUERY_COST with 10k headroom', async () => {
  const queries = await load()
  for (const [name, query] of Object.entries(queries)) {
    assert.ok(passes(query), `${name} exceeds the cost limit`)
    // 5 probes = 10000 extra cost must still pass => real cost <= 20000
    assert.ok(passes(query, 5), `${name} has less than 10000 headroom`)
    console.log(`${name}: cost <= ${costUpperBound(query)}`)
  }
})
