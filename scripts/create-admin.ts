/**
 * Bootstrap a staff account (normally the first platform_admin).
 *
 *   npx tsx scripts/create-admin.ts --email admin@example.org --name "Ada Admin" [--role platform_admin] [--test]
 *
 * The password is read from the ADMIN_PASSWORD environment variable (preferred: keeps it out
 * of shell history and process listings) or from --password. Minimum 12 characters.
 * Idempotent: an existing account keeps its password and just gains the role.
 * --test targets TEST_DATABASE_URL instead of DATABASE_URL.
 * Requires the auth tables to exist (run `npm run db:migrate` first).
 */
import { parseArgs } from "node:util";

import { drizzle } from "drizzle-orm/node-postgres";

import * as schema from "../db/schema";
import { parseServerEnv } from "../src/lib/env";
import { STAFF_ROLES } from "../src/lib/permissions/roles";
import { createStaffAccount } from "../src/server/auth/bootstrap";
import { createAuth } from "../src/server/auth/config";

import { makePool, redact, resolveDatabaseUrl } from "./db/_shared";

function usage(): never {
  console.error(
    "Usage: npx tsx scripts/create-admin.ts --email <email> --name <name> [--role <role>] [--password <pw>] [--test]\n" +
      `Roles: ${STAFF_ROLES.join(", ")}\nPassword: set ADMIN_PASSWORD (preferred) or pass --password.`,
  );
  process.exit(2);
}

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      name: { type: "string" },
      role: { type: "string", default: "platform_admin" },
      password: { type: "string" },
      test: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    strict: true,
  });
  if (values.help || !values.email) usage();

  const password = process.env.ADMIN_PASSWORD ?? values.password;
  if (!password) usage();

  const { url, label } = resolveDatabaseUrl(values.test ? ["--test"] : []);
  const env = parseServerEnv({ ...process.env, DATABASE_URL: url });
  const pool = makePool(url);
  try {
    const db = drizzle(pool, { schema, casing: "snake_case" });
    const auth = createAuth({ db, secret: env.BETTER_AUTH_SECRET, baseURL: env.BETTER_AUTH_URL, rateLimit: false });
    const result = await createStaffAccount(auth, db, {
      email: values.email,
      name: values.name ?? values.email.split("@")[0] ?? "Administrator",
      password,
      role: values.role as (typeof STAFF_ROLES)[number],
    });
    console.log(
      `[create-admin] ${label} db ${redact(url)}\n` +
        `  user ${result.email} (${result.userId}) ${result.created ? "created" : "already existed (password unchanged)"}\n` +
        `  role ${values.role} ${result.roleGranted ? "granted" : "already held"}; roles now: ${result.roles.join(", ")}`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  if (err && typeof err === "object" && "issues" in err) {
    console.error("[create-admin] invalid input:", (err as { issues: { path: unknown[]; message: string }[] }).issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; "));
  } else {
    console.error("[create-admin] failed:", err instanceof Error ? err.message : err);
  }
  process.exit(1);
});
