import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { getServerGraphQLTarget } from "@/features/dashboard/lib/getBaseUrl";
import { GraphQLClient } from 'graphql-request';
import { safeErrorSummary, sanitizeDashboardRedirect } from './lib/security';
import { isDashboardRoute, publicSignUpsAllowed } from './lib/authFlow';

const basePath = "/dashboard";

// Create a GraphQL client for middleware with explicit headers
async function createMiddlewareGraphQLClient(
  headers: Record<string, string>,
  sourceHeaders?: { get(name: string): string | null },
): Promise<GraphQLClient> {
  const { endpoint, fetch: internalFetch } = await getServerGraphQLTarget(sourceHeaders);
  return new GraphQLClient(endpoint, {
    credentials: 'include',
    redirect: 'error',
    ...(internalFetch ? { fetch: internalFetch } : {}),
    headers,
  });
}

// Lightweight check for redirectToInit status only
export async function checkInitStatus(request: NextRequest) {
  const query = `
    query redirectToInit {
      redirectToInit
    }
  `;

  const headers = {
    cookie: request.headers.get("cookie") || "",
  };

  try {
    const client = await createMiddlewareGraphQLClient(headers, request.headers);
    const data = await client.request(query) as { redirectToInit: boolean };
    return data.redirectToInit;
  } catch (error) {
    console.error("Error checking init status:", safeErrorSummary(error));
    return false;
  }
}

// Get authenticated user from the request (adapted for dashboard)
export async function getAuthenticatedUser(request: NextRequest) {
  const query = `
    query authenticatedItem {
      authenticatedItem {
        ... on User {
          id
          role {
            canAccessDashboard
          }
        }
      }
      redirectToInit
    }
  `;

  const headers = {
    cookie: request.headers.get("cookie") || "",
  };

  try {
    const client = await createMiddlewareGraphQLClient(headers, request.headers);
    const data = await client.request(query) as { 
      authenticatedItem: any; 
      redirectToInit: boolean 
    };
    
    return {
      user: data.authenticatedItem,
      redirectToInit: data.redirectToInit
    };
  } catch (error) {
    // Over the per-user GraphQL budget is not signed out: say so instead of sending the user to sign in.
    if ((error as { response?: { status?: number } })?.response?.status === 429) return { user: null, redirectToInit: false, rateLimited: true };
    console.error("Auth check failed:", safeErrorSummary(error));
    
    return { user: null, redirectToInit: false };
  }
}

/** The answer while the user is over the GraphQL request budget: a plain "try again" page, never the sign-in redirect. */
export function tooManyRequestsResponse(request: NextRequest) {
  const again = sanitizeDashboardRedirect(request.nextUrl.pathname + request.nextUrl.search);
  const href = again.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="60"><title>Too many requests</title></head>
<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1.5rem;line-height:1.5;color:#111">
<h1 style="font-size:1.5rem;margin:0 0 .5rem">Too many requests</h1>
<p style="margin:0 0 1.25rem">You are still signed in, but this account has made a lot of requests in the last minute. Wait a moment and try again; this page reloads itself in a minute.</p>
<a href="${href}" style="display:inline-block;padding:.6rem 1.1rem;border-radius:.5rem;background:#111;color:#fff;text-decoration:none">Try again</a>
</body></html>`;
  return new NextResponse(html, { status: 429, headers: { "content-type": "text/html; charset=utf-8", "retry-after": "60", "cache-control": "no-store" } });
}

// Handles authentication and access control for dashboard routes
export async function handleDashboardRoutes(
  request: NextRequest, 
  user: any,
  redirectToInit: boolean
) {
  const pathname = request.nextUrl.pathname;
  
  // Only handle dashboard routes
  if (!pathname.startsWith(basePath)) {
    return null;
  }
  
  const isInitRoute = isDashboardRoute(pathname, 'init');
  const isSigninRoute = isDashboardRoute(pathname, 'signin');
  const isSignupRoute = isDashboardRoute(pathname, 'signup') && publicSignUpsAllowed();
  const isNoAccessRoute = isDashboardRoute(pathname, 'no-access');
  const isResetRoute = isDashboardRoute(pathname, 'reset');
  const fromPath = request.nextUrl.searchParams.get("from");

  // Handle redirectToInit for dashboard routes
  if (redirectToInit) {
    if (!isInitRoute) {
      return NextResponse.redirect(new URL(`${basePath}/init`, request.url));
    }
    return NextResponse.next();
  }

  // Prevent access to init page if not needed (when redirectToInit is false)
  if (isInitRoute && !redirectToInit) {
    return NextResponse.redirect(new URL(basePath, request.url));
  }

  // Handle unauthenticated users
  if (!user && !isSigninRoute && !isSignupRoute && !isResetRoute) {
    const signinUrl = new URL(`${basePath}/signin`, request.url);
    if (!isNoAccessRoute) {
      signinUrl.searchParams.set("from", request.nextUrl.pathname);
    }
    return NextResponse.redirect(signinUrl);
  }

  // Handle authenticated users trying to access signin
  if (user && (isSigninRoute || isSignupRoute || isResetRoute)) {
    if (fromPath && !fromPath.includes("no-access")) {
      return NextResponse.redirect(new URL(sanitizeDashboardRedirect(fromPath), request.url));
    }
    return NextResponse.redirect(new URL(basePath, request.url));
  }

  // Check role permissions
  if (user && !isNoAccessRoute && !user.role?.canAccessDashboard) {
    return NextResponse.redirect(new URL(`${basePath}/no-access`, request.url));
  }

  return NextResponse.next();
}