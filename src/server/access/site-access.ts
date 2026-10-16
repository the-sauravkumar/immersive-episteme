/**
 * Server-side half of the invite gate (deployment source change S11).
 *
 * src/proxy.ts redirects visitors without an invite cookie (or a staff session cookie) before a
 * page renders, but it only verifies the cookie's signature and does not look at the database,
 * and it trusts the mere presence of a staff session cookie. The entry points that create a
 * study or demo session (`enterStudy`, `startPublicDemo`) call `requireSiteAccess` as well, so a
 * forged staff cookie or a revoked code can never start one:
 *  - a verified staff session (Better Auth, via getStaffPrincipal) passes;
 *  - otherwise the invite cookie must verify AND its code must not be revoked.
 */
import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { invitePath } from "@/lib/access/invite-paths";
import { serverEnv } from "@/lib/env";
import { getStaffPrincipal } from "@/server/auth/staff";
import { getPool } from "@/server/db/client";

import { INVITE_COOKIE, verifyInviteAccess } from "./invite-cookie";
import { inviteNotRevoked } from "./invites";

/** Does this request carry valid site access? Memoised per request. */
export const hasSiteAccess = cache(async (): Promise<boolean> => {
  const token = (await cookies()).get(INVITE_COOKIE)?.value;
  if (token !== undefined) {
    const verified = await verifyInviteAccess(token, serverEnv().BETTER_AUTH_SECRET);
    if (verified.ok && (await inviteNotRevoked(getPool(), verified.claims.inviteId))) return true;
  }
  return (await getStaffPrincipal()) !== null;
});

/** Redirects to the invite page (remembering `next`) unless the request has site access. */
export async function requireSiteAccess(next: string): Promise<void> {
  if (!(await hasSiteAccess())) redirect(invitePath(next));
}
