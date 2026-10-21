const DASHBOARD_ORIGIN = 'https://dashboard.local'

export function safeDashboardPath(value: unknown) {
  const candidate = String(value ?? '').trim()
  if (
    !candidate ||
    candidate.startsWith('//') ||
    candidate.includes('\\') ||
    /[\u0000-\u001f\u007f]/.test(candidate)
  ) {
    return '/dashboard'
  }

  try {
    const parsed = new URL(candidate, DASHBOARD_ORIGIN)
    const dashboardRoute = parsed.pathname === '/dashboard' || parsed.pathname.startsWith('/dashboard/')
    if (parsed.origin !== DASHBOARD_ORIGIN || !dashboardRoute) return '/dashboard'
    return `${parsed.pathname}${parsed.search}`
  } catch {
    return '/dashboard'
  }
}
