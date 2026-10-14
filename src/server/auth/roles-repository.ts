/**
 * Staff role assignments (`user_roles`). Not `server-only` so the admin bootstrap script can
 * use it; app code reaches it through ./staff.ts.
 */
import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { userRoles } from "@db/schema/auth";
import { isStaffRole, type StaffRole } from "@/lib/permissions/roles";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any Drizzle pg database works
type AnyPgDatabase = NodePgDatabase<any>;

/** Roles held by a user, filtered to the known catalogue (unknown values are ignored). */
export async function loadUserRoles(db: AnyPgDatabase, userId: string): Promise<StaffRole[]> {
  const rows = await db.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId));
  return rows.map((r) => r.role).filter(isStaffRole);
}

/** Idempotent grant. Returns true if the role was newly granted. */
export async function grantRole(
  db: AnyPgDatabase,
  userId: string,
  role: StaffRole,
  grantedBy: string | null = null,
): Promise<boolean> {
  const inserted = await db
    .insert(userRoles)
    .values({ userId, role, grantedBy })
    .onConflictDoNothing()
    .returning({ role: userRoles.role });
  return inserted.length > 0;
}

/** Returns true if a role was removed. */
export async function revokeRole(db: AnyPgDatabase, userId: string, role: StaffRole): Promise<boolean> {
  const removed = await db
    .delete(userRoles)
    .where(and(eq(userRoles.userId, userId), eq(userRoles.role, role)))
    .returning({ role: userRoles.role });
  return removed.length > 0;
}
