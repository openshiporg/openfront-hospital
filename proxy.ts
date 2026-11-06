import type { NextRequest } from "next/server";
import { handleDashboardRoutes, getAuthenticatedUser, checkInitStatus } from "@/features/dashboard/middleware";
import { handleStorefrontRoutes } from "@/features/storefront/middleware";
import { NextResponse } from "next/server";
import { isDashboardRoute } from "@/features/dashboard/lib/authFlow";

const dashboardPath = "/dashboard";

// Main middleware function that handles all routes
// Once the first admin exists, setup is never required again, so storefront requests stop asking.
let setupComplete = false

export async function proxy(request: NextRequest) {
  // Storefront pages don't use the signed-in user. Skipping the per-request auth query keeps page views and
  // <Link> prefetches from spending the visitor's anonymous GraphQL budget ("Page could not load" after ~12 pages).
  if (!request.nextUrl.pathname.startsWith(dashboardPath)) {
    if (!setupComplete) {
      const needsInit = await checkInitStatus(request);
      if (needsInit) return NextResponse.redirect(new URL(`${dashboardPath}/init`, request.url));
      setupComplete = true;
    }
    return handleStorefrontRoutes(request, null);
  }

  // Get authenticated user once
  const { user, redirectToInit } = await getAuthenticatedUser(request);

  // If redirectToInit is true (no users exist) and user is on storefront, redirect to dashboard init
  if (redirectToInit && !isDashboardRoute(request.nextUrl.pathname, "init")) {
    return NextResponse.redirect(new URL(`${dashboardPath}/init`, request.url));
  }

  // Let each handler manage its own routes and logic
  const response = await handleDashboardRoutes(request, user, redirectToInit);
  
  // If dashboard handler didn't handle the route, pass to storefront
  if (!response) {
    return handleStorefrontRoutes(request, user);
  }
  
  return response;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.svg|images|assets|png|svg|jpg|jpeg|gif|webp).*)",
  ],
};