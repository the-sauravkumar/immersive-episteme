/**
 * Staff principal + server-side permission enforcement (the Data Access Layer for auth).
 *
 * - `getStaffPrincipal()`  -> the signed-in staff member with roles, or null. Deduped per request.
 * - `requireStaff()`       -> principal, or redirect to /sign-in.
 * - `requirePermission()`  -> principal holding (any of) the permission(s), or redirect to
 *                             /sign-in (anonymous) / /forbidden (signed in, not allowed).
 * - `authorizeRequest()`   -> for Route Handlers / Server Actions: returns a 401/403 Response
 *                             instead of redirecting.
 *
 * These read the request (headers/cookies), so with Cache Components they must run inside a
 * <Suspense> boundary (layouts put the gate inside one).
 */
import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { canAny, type Subject } from "@/lib/permissions/can";
import type { Permission } from "@/lib/permissions/permissions";
import type { StaffRole } from "@/lib/permissions/roles";
import { safeNextPath } from "@/lib/permissions/safe-redirect";
import { getDb } from "@/server/db/client";

import { getAuth } from "./index";
import { loadUserRoles } from "./roles-repository";

export type StaffPrincipal = Subject & {
  readonly kind: "staff";
  readonly userId: string;
  readonly email: string;
  readonly name: string;
  readonly roles: readonly StaffRole[];
  readonly sessionId: string;
};

/** The signed-in, non-disabled staff member (with roles), or null. Cached per request. */
export const getStaffPrincipal = cache(async (): Promise<StaffPrincipal | null> => {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return null;
  if (session.user.disabledAt) return null;
  const roles = await loadUserRoles(getDb(), session.user.id);
  return {
    kind: "staff",
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name,
    roles,
    sessionId: session.session.id,
  };
});

export function signInPath(next?: string): string {
  const target = safeNextPath(next, "");
  return target ? `/sign-in?next=${encodeURIComponent(target)}` : "/sign-in";
}

export async function requireStaff(opts: { next?: string } = {}): Promise<StaffPrincipal> {
  const principal = await getStaffPrincipal();
  if (!principal) redirect(signInPath(opts.next));
  return principal;
}

/**
 * Any-of semantics when given an array. Never renders protected content for a caller without
 * the permission: `redirect()` throws before the caller's JSX is produced.
 */
export async function requirePermission(
  permission: Permission | readonly Permission[],
  opts: { next?: string } = {},
): Promise<StaffPrincipal> {
  const principal = await requireStaff(opts);
  const anyOf: readonly Permission[] = typeof permission === "string" ? [permission] : permission;
  if (!canAny(principal, anyOf)) redirect("/forbidden");
  return principal;
}

export type AuthorizeResult =
  | { ok: true; principal: StaffPrincipal }
  | { ok: false; response: Response };

/** Route Handler / Server Action variant: JSON 401/403 instead of a redirect. */
export async function authorizeRequest(permission: Permission | readonly Permission[]): Promise<AuthorizeResult> {
  const principal = await getStaffPrincipal();
  if (!principal) {
    return { ok: false, response: Response.json({ error: "unauthenticated" }, { status: 401 }) };
  }
  const anyOf: readonly Permission[] = typeof permission === "string" ? [permission] : permission;
  if (!canAny(principal, anyOf)) {
    return { ok: false, response: Response.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { ok: true, principal };
}

/** Throwing variant for server actions/services. */
export class PermissionError extends Error {
  constructor(
    readonly status: 401 | 403,
    message = status === 401 ? "Not signed in" : "Not allowed",
  ) {
    super(message);
    this.name = "PermissionError";
  }
}

export async function assertPermission(permission: Permission | readonly Permission[]): Promise<StaffPrincipal> {
  const principal = await getStaffPrincipal();
  if (!principal) throw new PermissionError(401);
  const anyOf: readonly Permission[] = typeof permission === "string" ? [permission] : permission;
  if (!canAny(principal, anyOf)) throw new PermissionError(403);
  return principal;
}
