import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";

import { users } from "@db/schema/auth";
import { STAFF_ROLES, type StaffRole } from "@/lib/permissions/roles";

import { MIN_PASSWORD_LENGTH, type Auth } from "./config";
import { grantRole, loadUserRoles } from "./roles-repository";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any Drizzle pg database works
type AnyPgDatabase = NodePgDatabase<any>;

const staffAccountInput = z.object({
  email: z.email().transform((e) => e.toLowerCase()),
  password: z.string().min(MIN_PASSWORD_LENGTH, `must be at least ${MIN_PASSWORD_LENGTH} characters`).max(256),
  name: z.string().trim().min(1).max(120),
  role: z.enum(STAFF_ROLES),
});

export type StaffAccountInput = z.input<typeof staffAccountInput>;

export type StaffAccountResult = {
  userId: string;
  email: string;
  created: boolean;
  roleGranted: boolean;
  roles: StaffRole[];
};

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

  const roleGranted = await grantRole(db, userId, data.role, grantedBy);
  return { userId, email: data.email, created, roleGranted, roles: await loadUserRoles(db, userId) };
}
