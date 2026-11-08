import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { canAny, type Subject } from "@/lib/permissions/can";
import { refusalPath } from "@/lib/permissions/console-routes";
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

export async function requirePermission(
  permission: Permission | readonly Permission[],
  opts: { next?: string } = {},
): Promise<StaffPrincipal> {
  const principal = await requireStaff(opts);
  const anyOf: readonly Permission[] = typeof permission === "string" ? [permission] : permission;
  if (!canAny(principal, anyOf)) redirect(refusalPath(principal));
  return principal;
}

export type AuthorizeResult =
  | { ok: true; principal: StaffPrincipal }
  | { ok: false; response: Response };

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
