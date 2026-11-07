import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { invitePath } from "@/lib/access/invite-paths";
import { serverEnv } from "@/lib/env";
import { isStaffRole } from "@/lib/permissions/roles";
import { getStaffPrincipal } from "@/server/auth/staff";

import { inviteIsLive } from "./gate-lookups";
import { INVITE_COOKIE, verifyInviteAccess } from "./invite-cookie";

export const hasSiteAccess = cache(async (): Promise<boolean> => {
  const token = (await cookies()).get(INVITE_COOKIE)?.value;
  if (token !== undefined) {
    const verified = await verifyInviteAccess(token, serverEnv().BETTER_AUTH_SECRET);
    if (verified.ok && (await inviteIsLive(verified.claims.inviteId))) return true;
  }
  const principal = await getStaffPrincipal();
  return principal !== null && principal.roles.some(isStaffRole);
});

export async function requireSiteAccess(next: string): Promise<void> {
  if (!(await hasSiteAccess())) redirect(invitePath(next));
}
