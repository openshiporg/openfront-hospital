const unavailable = () => Response.json(
  { error: 'not_available' },
  { status: 404, headers: { 'cache-control': 'no-store' } },
)

// The starter's generic schema/CRUD MCP bridge is intentionally unavailable in the
// Hospital vertical. Narrow, reviewed operations belong in explicit API contracts.
export async function POST() {
  return unavailable()
}
