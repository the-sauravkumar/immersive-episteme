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
 *
 * INVITE GATE (deployment source change S11; docs/deploy/RUNBOOK.md "Invite-only access"). The site
 * is always invite-only; there is no open mode. Every page outside the exempt list
 * (src/lib/access/invite-paths.ts: /invite, /sign-in, /sign-out, /forbidden, /console, /api, static
 * assets) needs either an invite cookie whose HMAC signature verifies here (no database round
 * trip) or a staff session cookie (presence only; staff areas redirect to /sign-in as before, so
 * staff never need a code). Without one, GET/HEAD redirect to /invite?next=<path> and other
 * methods get 403. `?invite=<code>` on any gated URL is rewritten to the redeem route
 * (/invite/redeem), which sets the cookie and redirects to the same URL without the code. The
 * server-side half (src/server/access/site-access.ts) re-checks with the database where sessions
 * are created. The gate runs before consent and allocation and is identical in both conditions.
 */
import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

import {
  INVITE_PARAM,
  INVITE_REDEEM_CODE_HEADER,
  INVITE_REDEEM_NEXT_HEADER,
  INVITE_REDEEM_PATH,
  invitePath,
  isInviteExemptPath,
  withoutInviteParam,
} from "@/lib/access/invite-paths";
import { clientIpPolicy, stripClientIpHeaders } from "@/lib/client-ip";
import { contentSecurityPolicy, isDevBuild } from "@/lib/security/csp";
import { verifyInviteAccess } from "@/server/access/invite-cookie";
import { AUTH_COOKIE_PREFIX, DEMO_COOKIE, INVITE_COOKIE, PARTICIPANT_COOKIE } from "@/server/auth/cookie-names";

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

/** A signed, unexpired invite cookie (signature only: revocation is checked server-side). */
async function hasInviteCookie(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get(INVITE_COOKIE)?.value;
  if (!token) return false;
  // Read directly (not serverEnv()): the proxy must not fail on unrelated variables. No secret
  // means no valid cookie (fail closed).
  const verified = await verifyInviteAccess(token, process.env.BETTER_AUTH_SECRET ?? "");
  return verified.ok;
}

const NO_STORE = { "Cache-Control": "no-store" };

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;

  if (startsWithSegment(pathname, "/api/auth")) return authApi(request);

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

  if (isInviteExemptPath(pathname)) return NextResponse.next();

  // ---- Invite gate (S11) -----------------------------------------------------------------------
  const invited = hasStaffCookie || (await hasInviteCookie(request));
  const readOnly = request.method === "GET" || request.method === "HEAD";
  const code = request.nextUrl.searchParams.get(INVITE_PARAM);
  if (code !== null && readOnly) {
    const target = withoutInviteParam(request.nextUrl);
    // Already admitted: drop the code from the address without counting another use.
    if (invited) return NextResponse.redirect(new URL(target, request.url));
    const redeem = new URL(INVITE_REDEEM_PATH, request.url);
    redeem.searchParams.set("code", code);
    redeem.searchParams.set("next", target);
    // The rewrite keeps the original query, so code and target travel as request headers (DR-067).
    const headers = new Headers(request.headers);
    headers.set(INVITE_REDEEM_CODE_HEADER, encodeURIComponent(code));
    headers.set(INVITE_REDEEM_NEXT_HEADER, encodeURIComponent(target));
    return NextResponse.rewrite(redeem, { request: { headers } });
  }
  if (!invited) {
    if (readOnly) return NextResponse.redirect(new URL(invitePath(`${pathname}${search}`), request.url));
    return new NextResponse("An invite is required.", { status: 403, headers: { ...NO_STORE, "Content-Type": "text/plain; charset=utf-8" } });
  }

  // The study entry form (POST /study, Server Action enterStudy): see authApi.
  if (pathname === "/study" && request.method === "POST") return authApi(request);

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

/*
 * Every path except /api (other than /api/auth), Next's static output, the image optimiser, the
 * museum assets and the root files: the invite gate covers every page and route handler outside
 * those (S11). Matcher values must be literals (statically analysed at build time).
 */
export const config = {
  matcher: ["/api/auth/:path*", "/((?!api/|_next/static/|_next/image|museum/|favicon.ico|robots.txt).*)"],
};
