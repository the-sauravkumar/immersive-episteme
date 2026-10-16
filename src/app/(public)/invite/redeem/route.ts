/**
 * GET /invite/redeem?code=<code>&next=<path>: redeems an invite code from a link (S11).
 *
 * src/proxy.ts rewrites `<any gated URL>?invite=<code>` here, so the visitor's first response is
 * either the invite cookie plus a redirect to the same URL without the code, or a redirect to
 * /invite?error=invalid with no cookie at all (unknown, revoked, expired or used-up codes are
 * refused alike, so the answer does not reveal which). A Route Handler, because only handlers and
 * Server Actions can set cookies. `Cache-Control: no-store`: the answer depends on the code.
 */
import { NextResponse, type NextRequest } from "next/server";

import { INVITE_PARAM, inviteNextPath, invitePath } from "@/lib/access/invite-paths";
import { serverEnv } from "@/lib/env";
import { INVITE_ACCESS_TTL_SECONDS, INVITE_COOKIE, signInviteAccess } from "@/server/access/invite-cookie";
import { redeemInvite } from "@/server/access/invites";
import { SECURE_COOKIES } from "@/server/auth/cookie-names";
import { getPool } from "@/server/db/client";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const params = request.nextUrl.searchParams;
  const code = params.get("code") ?? params.get(INVITE_PARAM);
  const next = inviteNextPath(params.get("next"));
  const redirectTo = (path: string) => {
    const res = NextResponse.redirect(new URL(path, request.url), 303);
    res.headers.set("Cache-Control", "no-store");
    res.headers.set("Referrer-Policy", "no-referrer");
    return res;
  };

  const result = code ? await redeemInvite(getPool(), code) : ({ ok: false, reason: "malformed" } as const);
  if (!result.ok) return redirectTo(invitePath(next, "invalid"));

  const token = await signInviteAccess(result.inviteId, serverEnv().BETTER_AUTH_SECRET);
  const res = redirectTo(next);
  res.cookies.set(INVITE_COOKIE, token, { httpOnly: true, secure: SECURE_COOKIES, sameSite: "lax", path: "/", maxAge: INVITE_ACCESS_TTL_SECONDS });
  return res;
}
