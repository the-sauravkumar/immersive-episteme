import { NextResponse, type NextRequest } from "next/server";

import { INVITE_PARAM, INVITE_REDEEM_CODE_HEADER, INVITE_REDEEM_NEXT_HEADER, inviteNextPath, invitePath } from "@/lib/access/invite-paths";
import { serverEnv } from "@/lib/env";
import { INVITE_ACCESS_TTL_SECONDS, INVITE_COOKIE, signInviteAccess } from "@/server/access/invite-cookie";
import { redeemInvite } from "@/server/access/invites";
import { SECURE_COOKIES } from "@/server/auth/cookie-names";
import { getPool } from "@/server/db/client";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const params = request.nextUrl.searchParams;
  const code = fromHeader(request, INVITE_REDEEM_CODE_HEADER) ?? params.get("code") ?? params.get(INVITE_PARAM);
  const next = inviteNextPath(fromHeader(request, INVITE_REDEEM_NEXT_HEADER) ?? params.get("next"));
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

function fromHeader(request: NextRequest, name: string): string | null {
  const raw = request.headers.get(name);
  if (raw === null) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}
