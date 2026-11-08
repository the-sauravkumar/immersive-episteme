import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { auditLog } from "@db/schema/audit";

import { loadStaffAssignment, setRole } from "./roles-repository";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any Drizzle pg database works
type AnyPgDatabase = NodePgDatabase<any>;

export type SignedInUser = { id: string; email: string; emailVerified: boolean };

export function isListedSuperAdmin(user: Pick<SignedInUser, "email" | "emailVerified">, listed: readonly string[]): boolean {
  return user.emailVerified && listed.includes(user.email.trim().toLowerCase());
}

export async function grantListedSuperAdmin(db: AnyPgDatabase, user: SignedInUser, listed: readonly string[]): Promise<boolean> {
  if (!isListedSuperAdmin(user, listed)) return false;
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('admin.super_admin_holders'))`);
    const before = await loadStaffAssignment(tx, user.id);
    if (before?.role === "super_admin") return false;
    await setRole(tx, user.id, { role: "super_admin", principalInvestigator: false });
    await tx.insert(auditLog).values({
      actorKind: "system",
      actorId: null,
      action: "admin.super_admin_granted",
      entity: "user_roles",
      entityId: user.id,
      before,
      after: { role: "super_admin", principalInvestigator: false },
      reason: "signed in with an email listed in SUPER_ADMIN_EMAILS",
    });
    return true;
  });
}
