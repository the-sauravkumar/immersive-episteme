import { randomBytes } from "node:crypto";
import { rmSync, writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { parseArgs } from "node:util";

import { drizzle } from "drizzle-orm/node-postgres";

import * as schema from "../../db/schema";
import { parseServerEnv } from "../../src/lib/env";
import { STAFF_ROLES, type StaffRole } from "../../src/lib/permissions/roles";
import { createStaffAccount } from "../../src/server/auth/bootstrap";
import { createAuth } from "../../src/server/auth/config";
import { isLocalHost, makePool, redact, resolveDatabaseUrl } from "../db/_shared";

import { REPO_ROOT } from "./_shared";

export function generatePassword(): string {
  return randomBytes(24).toString("base64url");
}

export function passwordFileProblem(target: string | undefined, repoRoot: string = REPO_ROOT): string | null {
  if (!target || !target.trim()) return "give --password-file <path outside the repository>";
  const abs = resolve(target);
  const fold = (p: string) => (process.platform === "win32" ? p.toLowerCase() : p);
  const rel = relative(fold(resolve(repoRoot)), fold(abs));
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) return "the password file must be outside the repository";
  return null;
}

export function parseRole(role: string): StaffRole {
  if (!(STAFF_ROLES as readonly string[]).includes(role)) throw new Error(`unknown role ${role}; roles: ${STAFF_ROLES.join(", ")}`);
  return role as StaffRole;
}

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      name: { type: "string" },
      role: { type: "string", default: "curator" },
      "password-file": { type: "string" },
      test: { type: "boolean", default: false },
    },
    strict: true,
  });
  if (!values.email) throw new Error("give --email <email>");
  const role = parseRole(values.role);
  const fileProblem = passwordFileProblem(values["password-file"]);
  if (fileProblem) throw new Error(fileProblem);
  const file = resolve(values["password-file"]!);

  const { url, label } = resolveDatabaseUrl(values.test ? ["--test"] : []);
  if (!isLocalHost(url)) throw new Error(`refusing a non-local database (${redact(url)}); this script is for local accounts only`);
  const env = parseServerEnv({ ...process.env, DATABASE_URL: url });

  const password = generatePassword();
  writeFileSync(file, `${password}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });

  const pool = makePool(url);
  try {
    const db = drizzle(pool, { schema, casing: "snake_case" });
    const auth = createAuth({ db, secret: env.BETTER_AUTH_SECRET, baseURL: env.BETTER_AUTH_URL, rateLimit: false });
    const result = await createStaffAccount(auth, db, {
      email: values.email,
      name: values.name ?? values.email.split("@")[0] ?? "Curator",
      password,
      role,
    });
    if (!result.created) rmSync(file, { force: true });
    console.log(
      `[create-curator] ${label} db ${redact(url)}\n` +
        `  user ${result.email} (${result.userId}) ${result.created ? `created; password written to ${file}` : "already existed (password unchanged; no file kept)"}\n` +
        `  role ${role} ${result.roleGranted ? "granted" : "already held"}; roles now: ${result.roles.join(", ")}`,
    );
  } catch (err) {
    console.error(`[create-curator] the password file is kept at ${file} in case the account was created; delete it if not`);
    throw err;
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && /create-curator\.ts$/.test(process.argv[1])) {
  main().catch((err: unknown) => {
    if (err && typeof err === "object" && "issues" in err) {
      console.error("[create-curator] invalid input:", (err as { issues: { path: unknown[]; message: string }[] }).issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    } else {
      console.error("[create-curator] failed:", err instanceof Error ? err.message : err);
    }
    process.exit(1);
  });
}
