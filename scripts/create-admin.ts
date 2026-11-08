import { parseArgs } from "node:util";

import { drizzle } from "drizzle-orm/node-postgres";

import * as schema from "../db/schema";
import { parseServerEnv } from "../src/lib/env";
import { ROLE_NAME_HELP, parseStaffRole } from "../src/lib/permissions/roles";
import { createStaffAccount, grantRoleToExistingAccount } from "../src/server/auth/bootstrap";
import { createAuth } from "../src/server/auth/config";

import { makePool, redact, resolveDatabaseUrl } from "./db/_shared";

function usage(): never {
  console.error(
    "Usage: npx tsx scripts/create-admin.ts --email <email> --name <name> [--role <role>] [--password <pw>] [--test]\n" +
      `Roles: ${ROLE_NAME_HELP}\nPassword: set ADMIN_PASSWORD (preferred) or pass --password.`,
  );
  process.exit(2);
}

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      name: { type: "string" },
      role: { type: "string", default: "super_admin" },
      password: { type: "string" },
      test: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    strict: true,
  });
  if (values.help || !values.email) usage();

  const assignment = parseStaffRole(values.role);
  if (!assignment) usage();
  const password = process.env.ADMIN_PASSWORD ?? values.password;

  const { url, label } = resolveDatabaseUrl(values.test ? ["--test"] : []);
  const env = parseServerEnv({ ...process.env, DATABASE_URL: url });
  const pool = makePool(url);
  try {
    const db = drizzle(pool, { schema, casing: "snake_case" });
    const result = password
      ? await createStaffAccount(createAuth({ db, secret: env.BETTER_AUTH_SECRET, baseURL: env.BETTER_AUTH_URL, rateLimit: false }), db, {
          email: values.email,
          name: values.name ?? values.email.split("@")[0] ?? "Administrator",
          password,
          ...assignment,
        })
      : await grantRoleToExistingAccount(db, values.email, assignment);
    if (!result) throw new Error(`no account for ${values.email}: sign in once with Google (it waits at Awaiting Access), or pass a password to create an email account`);
    console.log(
      `[create-admin] ${label} db ${redact(url)}\n` +
        `  user ${result.email} (${result.userId}) ${result.created ? "created" : "already existed (password unchanged)"}\n` +
        `  role ${values.role} ${result.roleGranted ? "set" : "already held"}; now: ${result.roles.join(", ")}`,
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
