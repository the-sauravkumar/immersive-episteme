import { and, eq, isNull, ne } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";

import { userRoles, users } from "@db/schema/auth";
import { STAFF_ROLES, type StaffAssignment, type StaffGrant } from "@/lib/permissions/roles";

import { MIN_PASSWORD_LENGTH, type Auth } from "./config";
import { loadStaffAssignment, loadUserRoles, setRole } from "./roles-repository";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any Drizzle pg database works
type AnyPgDatabase = NodePgDatabase<any>;

const staffAccountInput = z.object({
  email: z.email().transform((e) => e.toLowerCase()),
  password: z.string().min(MIN_PASSWORD_LENGTH, `must be at least ${MIN_PASSWORD_LENGTH} characters`).max(256),
  name: z.string().trim().min(1).max(120),
  role: z.enum(STAFF_ROLES),
  principalInvestigator: z.boolean().default(false),
});

export type StaffAccountInput = z.input<typeof staffAccountInput>;

export type StaffAccountResult = {
  userId: string;
  email: string;
  created: boolean;
  roleGranted: boolean;
  roles: StaffGrant[];
};

export class LastSuperAdminError extends Error {
  constructor() {
    super("This is the last active Super Admin. Make another person Super Admin first, then change this account's role.");
  }
}

async function assignRole(db: AnyPgDatabase, userId: string, assignment: StaffAssignment, grantedBy: string | null): Promise<boolean> {
  const current = await loadStaffAssignment(db, userId);
  if (current?.role === "super_admin" && assignment.role !== "super_admin") {
    const others = await db
      .select({ id: users.id })
      .from(userRoles)
      .innerJoin(users, eq(users.id, userRoles.userId))
      .where(and(eq(userRoles.role, "super_admin"), ne(users.id, userId), isNull(users.disabledAt)))
      .limit(1);
    if (others.length === 0) throw new LastSuperAdminError();
  }
  return setRole(db, userId, assignment, grantedBy);
}

export async function createStaffAccount(
  auth: Auth,
  db: AnyPgDatabase,
  input: StaffAccountInput,
  grantedBy: string | null = null,
): Promise<StaffAccountResult> {
  const data = staffAccountInput.parse(input);
  const ctx = await auth.$context;

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, data.email)).limit(1);

  let userId: string;
  let created = false;
  if (existing) {
    userId = existing.id;
  } else {
    const hash = await ctx.password.hash(data.password);
    const user = await ctx.internalAdapter.createUser(
      { email: data.email, name: data.name, emailVerified: true },
      { method: "admin" },
    );
    await ctx.internalAdapter.linkAccount({
      userId: user.id,
      providerId: "credential",
      accountId: user.id,
      password: hash,
    });
    userId = user.id;
    created = true;
  }

  const roleGranted = await assignRole(db, userId, { role: data.role, principalInvestigator: data.principalInvestigator }, grantedBy);
  return { userId, email: data.email, created, roleGranted, roles: await loadUserRoles(db, userId) };
}

export async function grantRoleToExistingAccount(db: AnyPgDatabase, email: string, assignment: StaffAssignment): Promise<StaffAccountResult | null> {
  const normalised = z.email().parse(email).toLowerCase();
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, normalised)).limit(1);
  if (!existing) return null;
  const roleGranted = await assignRole(db, existing.id, assignment, null);
  return { userId: existing.id, email: normalised, created: false, roleGranted, roles: await loadUserRoles(db, existing.id) };
}
