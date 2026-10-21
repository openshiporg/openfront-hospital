const endpoint = process.env.OPENFRONT_GRAPHQL_URL || process.env.GRAPHQL_URL

if (!endpoint) {
  console.error('Missing OPENFRONT_GRAPHQL_URL (or GRAPHQL_URL). Point it at a safe local /api/graphql endpoint.')
  process.exit(2)
}

if (!/^https?:\/\/(localhost|127\.0\.0\.1|.+\.local)(:|\/|$)/.test(endpoint)) {
  console.error(`Refusing to run against non-local endpoint: ${endpoint}`)
  console.error('Use a safe local/runtime-lab URL such as http://localhost:3000/api/graphql or https://<app>.local/api/graphql.')
  process.exit(2)
}

async function requestGraphQL(name, query, variables = {}) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })

  if (!response.ok) throw new Error(`${name} HTTP ${response.status}`)

  const payload = await response.json()
  if (payload.errors?.length) {
    const messages = payload.errors.map((error) => error.message).join('; ')
    throw new Error(`${name} GraphQL errors: ${messages}`)
  }

  return payload.data
}

const schemaData = await requestGraphQL(
  'query-root smoke',
  /* GraphQL */ `query RuntimeQueryRootSmoke { __typename }`,
)
const mutationData = await requestGraphQL(
  'mutation-root smoke',
  /* GraphQL */ `mutation RuntimeMutationRootSmoke { __typename }`,
)

if (schemaData.__typename !== 'Query') throw new Error('Schema query type is not Query')
if (mutationData.__typename !== 'Mutation') throw new Error('Schema mutation type is not Mutation')

const bookingData = await requestGraphQL(
  'bookable appointment types smoke',
  /* GraphQL */ `
    query RuntimeBookableAppointmentTypesSmoke {
      bookableAppointmentTypes {
        id
        name
        slug
        durationMinutes
      }
    }
  `
)

if (!Array.isArray(bookingData.bookableAppointmentTypes)) {
  throw new Error('bookableAppointmentTypes did not return a list')
}

const providerData = await requestGraphQL(
  'bookable providers media smoke',
  /* GraphQL */ `
    query RuntimeBookableProvidersMediaSmoke {
      bookableProviders {
        id
        displayName
        imagePath
        imageAltText
      }
    }
  `
)

if (!Array.isArray(providerData.bookableProviders)) {
  throw new Error('bookableProviders did not return a list')
}
for (const provider of providerData.bookableProviders) {
  if (provider.imagePath && (!provider.imagePath.startsWith('/images/') || provider.imagePath.includes('..'))) {
    throw new Error(`bookable provider ${provider.displayName || provider.id} returned a non-canonical image path`)
  }
}

const accessCode = process.env.OPENFRONT_INTAKE_ACCESS_CODE
if (accessCode) {
  await requestGraphQL(
    'intake access-code smoke',
    /* GraphQL */ `
      query RuntimeIntakeSmoke($accessCode: String!) {
        intakeFormByAccessCode(accessCode: $accessCode) {
          id
          title
          status
          accessCode
        }
      }
    `,
    { accessCode }
  )
}

console.log(`Runtime GraphQL smoke passed against ${endpoint}: ${bookingData.bookableAppointmentTypes.length} bookable appointment types and ${providerData.bookableProviders.length} provider image paths.`)
