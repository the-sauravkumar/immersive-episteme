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
import { inviteIsLive, sessionHoldsStaffRole } from "@/server/access/gate-lookups";
import { verifyInviteAccess } from "@/server/access/invite-cookie";
import { AUTH_COOKIE_PREFIX, DEMO_COOKIE, INVITE_COOKIE, PARTICIPANT_COOKIE } from "@/server/auth/cookie-names";

const STAFF_PREFIXES = ["/cms", "/research", "/admin"];
const NO_FRAME_PAGES = ["/sign-in", "/sign-out", "/forbidden", "/awaiting-access"];
const PUBLIC_STUDY_PAGES = ["/study/consent", "/study/complete", "/study/exit", "/study/return"];

function startsWithSegment(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function noFraming(response: NextResponse): NextResponse {
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Content-Security-Policy", contentSecurityPolicy({ frameAncestors: "none", dev: isDevBuild() }));
  return response;
}

function authApi(request: NextRequest): NextResponse {
  if (clientIpPolicy().trustForwardedHeaders) return NextResponse.next();
  const headers = new Headers(request.headers);
  if (!stripClientIpHeaders(headers)) return NextResponse.next();
  return NextResponse.next({ request: { headers } });
}

async function hasInviteCookie(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get(INVITE_COOKIE)?.value;
  if (!token) return false;
  const verified = await verifyInviteAccess(token, process.env.BETTER_AUTH_SECRET ?? "");
  return verified.ok && (await inviteIsLive(verified.claims.inviteId));
}

type SiteAccess = "admitted" | "refused" | "unavailable";

async function siteAccess(request: NextRequest, hasStaffCookie: boolean): Promise<SiteAccess> {
  try {
    if (await hasInviteCookie(request)) return "admitted";
    return hasStaffCookie && (await sessionHoldsStaffRole(request.headers)) ? "admitted" : "refused";
  } catch (error) {
    console.error("[proxy] site access check failed", error);
    return "unavailable";
  }
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

  const access = await siteAccess(request, hasStaffCookie);
  if (access === "unavailable") {
    return new NextResponse("The site is temporarily unavailable. Try again in a few minutes.", {
      status: 503,
      headers: { ...NO_STORE, "Content-Type": "text/plain; charset=utf-8", "Retry-After": "60" },
    });
  }
  const invited = access === "admitted";
  const readOnly = request.method === "GET" || request.method === "HEAD";
  const code = request.nextUrl.searchParams.get(INVITE_PARAM);
  if (code !== null && readOnly) {
    const target = withoutInviteParam(request.nextUrl);
    if (invited) return NextResponse.redirect(new URL(target, request.url));
    const redeem = new URL(INVITE_REDEEM_PATH, request.url);
    redeem.searchParams.set("code", code);
    redeem.searchParams.set("next", target);
    const headers = new Headers(request.headers);
    headers.set(INVITE_REDEEM_CODE_HEADER, encodeURIComponent(code));
    headers.set(INVITE_REDEEM_NEXT_HEADER, encodeURIComponent(target));
    return NextResponse.rewrite(redeem, { request: { headers } });
  }
  if (!invited) {
    if (readOnly) return NextResponse.redirect(new URL(invitePath(`${pathname}${search}`), request.url));
    return new NextResponse("An invite is required.", { status: 403, headers: { ...NO_STORE, "Content-Type": "text/plain; charset=utf-8" } });
  }

  if (pathname === "/study" && request.method === "POST") return authApi(request);

  if (startsWithSegment(pathname, "/learn")) {
    const any =
      request.cookies.has(PARTICIPANT_COOKIE) || request.cookies.has(DEMO_COOKIE) || hasStaffCookie;
    if (!any) return NextResponse.redirect(new URL("/study", request.url));
    return NextResponse.next();
  }

  if (pathname.startsWith("/study/") && !PUBLIC_STUDY_PAGES.some((p) => startsWithSegment(pathname, p))) {
    if (!request.cookies.has(PARTICIPANT_COOKIE)) return NextResponse.redirect(new URL("/study", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/auth/:path*", "/((?!api/|_next/static/|_next/image|favicon.ico|robots.txt).*)"],
};
