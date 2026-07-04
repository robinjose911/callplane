import { type NextRequest, NextResponse } from "next/server";
import { sessionOptions } from "@/lib/session";

const PUBLIC_PATHS = ["/login", "/api/auth"];

/** Redirects unauthenticated users to /login. Only checks cookie presence — session validity
 *  is enforced again in Server Components via getSession(). */
export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  const isPublic =
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon");

  if (isPublic) {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get(sessionOptions.cookieName)?.value;
  if (!sessionCookie) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
