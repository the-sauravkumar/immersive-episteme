import { eq, sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";

import { userRoles } from "@db/schema/auth";
import { grantsOf, isStaffRole, type StaffAssignment, type StaffGrant } from "@/lib/permissions/roles";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any Drizzle pg database or transaction works
type AnyPgDatabase = PgDatabase<any, any, any>;

export async function loadStaffAssignment(db: AnyPgDatabase, userId: string): Promise<StaffAssignment | null> {
  const [row] = await db
    .select({ role: userRoles.role, principalInvestigator: userRoles.principalInvestigator })
    .from(userRoles)
    .where(eq(userRoles.userId, userId))
    .limit(1);
  return row && isStaffRole(row.role) ? { role: row.role, principalInvestigator: row.principalInvestigator } : null;
}

export async function loadUserRoles(db: AnyPgDatabase, userId: string): Promise<StaffGrant[]> {
  return grantsOf(await loadStaffAssignment(db, userId));
}

export async function setRole(db: AnyPgDatabase, userId: string, assignment: StaffAssignment, grantedBy: string | null = null): Promise<boolean> {
  const principalInvestigator = assignment.role === "researcher" && assignment.principalInvestigator;
  const changed = await db
    .insert(userRoles)
    .values({ userId, role: assignment.role, principalInvestigator, grantedBy })
    .onConflictDoUpdate({
      target: userRoles.userId,
      set: { role: assignment.role, principalInvestigator, grantedBy, grantedAt: new Date() },
      setWhere: sql`(${userRoles.role}, ${userRoles.principalInvestigator}) IS DISTINCT FROM (excluded.role, excluded.principal_investigator)`,
    })
    .returning({ role: userRoles.role });
  return changed.length > 0;
}

export async function revokeRole(db: AnyPgDatabase, userId: string): Promise<boolean> {
  const removed = await db.delete(userRoles).where(eq(userRoles.userId, userId)).returning({ role: userRoles.role });
  return removed.length > 0;
}
