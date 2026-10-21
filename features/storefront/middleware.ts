import { NextResponse, type NextRequest } from "next/server";

// The vertical's storefront hook for the shared proxy (as in Openfront Restaurant). This storefront needs no
// region, cart-cookie or redirect handling, so every request passes through.
export async function handleStorefrontRoutes(_request: NextRequest, _user: unknown) {
  return NextResponse.next();
}
