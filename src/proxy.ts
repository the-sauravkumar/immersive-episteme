/**
 * Next.js 16 Proxy (formerly middleware). CHEAP CHECKS ONLY: it looks for the presence of the
 * relevant cookie and redirects early so an anonymous visitor never waits on a render. It never
 * decides authorisation: cookies are not verified here. Real checks run server-side in the
 * layouts AND pages (src/components/shell/gates.tsx -> src/server/auth/staff.ts,
 * learning-access.ts) and in route handlers.
 *
 * It also forbids framing of the staff sign-in surfaces (clickjacking of the credential form),
 * matching what next.config.ts sends for /admin, /research and /cms, and on its own redirects
 * to /sign-in.
 *
 * On /api/auth/* it removes client-supplied forwarding headers unless a reverse proxy is
 * configured (src/lib/client-ip.ts): otherwise a client could choose its own sign-in
 * rate-limit bucket by sending a fresh `X-Forwarded-For` on every attempt. With the header
 * gone, Next.js fills `x-forwarded-for` from the socket address.
 */
import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

import { clientIpPolicy, stripClientIpHeaders } from "@/lib/client-ip";
import { contentSecurityPolicy, isDevBuild } from "@/lib/security/csp";
import { AUTH_COOKIE_PREFIX, DEMO_COOKIE, PARTICIPANT_COOKIE } from "@/server/auth/cookie-names";

const STAFF_PREFIXES = ["/cms", "/research", "/admin"];
const NO_FRAME_PAGES = ["/sign-in", "/sign-out", "/forbidden"];
const PUBLIC_STUDY_PAGES = ["/study/consent", "/study/complete", "/study/exit"];

function startsWithSegment(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function noFraming(response: NextResponse): NextResponse {
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Content-Security-Policy", contentSecurityPolicy({ frameAncestors: "none", dev: isDevBuild() }));
  return response;
}

/**
 * /api/auth/* and the study entry form (POST /study, Server Action enterStudy): pass through,
 * minus spoofable client-IP headers when no proxy is trusted. Both key a rate limit on the client
 * address (sign-in; enrolment, src/server/study/enrolment-throttle.ts, final review security-04).
 */
function authApi(request: NextRequest): NextResponse {
  if (clientIpPolicy().trustForwardedHeaders) return NextResponse.next();
  const headers = new Headers(request.headers);
  if (!stripClientIpHeaders(headers)) return NextResponse.next();
  return NextResponse.next({ request: { headers } });
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (startsWithSegment(pathname, "/api/auth")) return authApi(request);
  if (pathname === "/study" && request.method === "POST") return authApi(request);

  if (NO_FRAME_PAGES.includes(pathname)) return noFraming(NextResponse.next());

  const hasStaffCookie = getSessionCookie(request, { cookiePrefix: AUTH_COOKIE_PREFIX }) !== null;

  if (STAFF_PREFIXES.some((p) => startsWithSegment(pathname, p))) {
    if (!hasStaffCookie) {
      const url = new URL("/sign-in", request.url);
      url.searchParams.set("next", `${pathname}${search}`);
      return noFraming(NextResponse.redirect(url));
    }
    return NextResponse.next();
  }

  if (startsWithSegment(pathname, "/learn")) {
    const any =
      request.cookies.has(PARTICIPANT_COOKIE) || request.cookies.has(DEMO_COOKIE) || hasStaffCookie;
    if (!any) return NextResponse.redirect(new URL("/study", request.url));
    return NextResponse.next();
  }

  // /study/<step>: everything below /study except the public entry pages.
  if (pathname.startsWith("/study/") && !PUBLIC_STUDY_PAGES.some((p) => startsWithSegment(pathname, p))) {
    if (!request.cookies.has(PARTICIPANT_COOKIE)) return NextResponse.redirect(new URL("/study", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/api/auth/:path*",
    "/cms/:path*",
    "/research/:path*",
    "/admin/:path*",
    "/learn/:path*",
    "/study",
    "/study/:path+",
    "/sign-in",
    "/sign-out",
    "/forbidden",
  ],
};
