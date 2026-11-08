import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { invitePath } from "@/lib/access/invite-paths";
import { serverEnv } from "@/lib/env";
import { isStaffRole } from "@/lib/permissions/roles";
import { SECURE_COOKIES } from "@/server/auth/cookie-names";
import { getStaffPrincipal } from "@/server/auth/staff";

import { inviteIsLive } from "./gate-lookups";
import { INVITE_ACCESS_TTL_SECONDS, INVITE_COOKIE, signInviteAccess, verifyInviteAccess } from "./invite-cookie";

export const admittingInviteId = cache(async (): Promise<string | null> => {
  const token = (await cookies()).get(INVITE_COOKIE)?.value;
  if (token === undefined) return null;
  const verified = await verifyInviteAccess(token, serverEnv().BETTER_AUTH_SECRET);
  return verified.ok && (await inviteIsLive(verified.claims.inviteId)) ? verified.claims.inviteId : null;
});

export const hasSiteAccess = cache(async (): Promise<boolean> => {
  if ((await admittingInviteId()) !== null) return true;
  const principal = await getStaffPrincipal();
  return principal !== null && principal.roles.some(isStaffRole);
});

export async function requireSiteAccess(next: string): Promise<void> {
  if (!(await hasSiteAccess())) redirect(invitePath(next));
}

export async function grantSiteAccess(inviteId: string): Promise<void> {
  const token = await signInviteAccess(inviteId, serverEnv().BETTER_AUTH_SECRET);
  (await cookies()).set(INVITE_COOKIE, token, { httpOnly: true, secure: SECURE_COOKIES, sameSite: "lax", path: "/", maxAge: INVITE_ACCESS_TTL_SECONDS });
}
