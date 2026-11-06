import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { invitePath } from "@/lib/access/invite-paths";
import { serverEnv } from "@/lib/env";
import { isStaffRole } from "@/lib/permissions/roles";
import { getStaffPrincipal } from "@/server/auth/staff";
import { getPool } from "@/server/db/client";

import { INVITE_COOKIE, verifyInviteAccess } from "./invite-cookie";
import { inviteNotRevoked } from "./invites";

export const hasSiteAccess = cache(async (): Promise<boolean> => {
  const token = (await cookies()).get(INVITE_COOKIE)?.value;
  if (token !== undefined) {
    const verified = await verifyInviteAccess(token, serverEnv().BETTER_AUTH_SECRET);
    if (verified.ok && (await inviteNotRevoked(getPool(), verified.claims.inviteId))) return true;
  }
  const principal = await getStaffPrincipal();
  return principal !== null && principal.roles.some(isStaffRole);
});

export async function requireSiteAccess(next: string): Promise<void> {
  if (!(await hasSiteAccess())) redirect(invitePath(next));
}
