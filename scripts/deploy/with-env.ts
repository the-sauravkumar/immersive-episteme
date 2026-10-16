/**
 * Runs one local command against PRODUCTION with the variables of a production env file, for the
 * steps that must run from this machine (migrations, the first admin account, content import).
 *
 *   npx tsx scripts/deploy/with-env.ts --env-file <path> -- npm run db:migrate
 *   ADMIN_PASSWORD=... npx tsx scripts/deploy/with-env.ts --env-file <path> -- npx tsx scripts/create-admin.ts --email <e> --name "<n>"
 *
 * - The file's variables override the shell and the repo .env (scripts/db/_shared.ts loads .env
 *   with dotenv, which never overrides variables that are already set).
 * - Database scripts connect to DATABASE_URL_UNPOOLED when the file sets it (Neon's direct
 *   endpoint; scripts/db/_shared.ts resolveDatabaseUrl), because Neon's pooler runs PgBouncer in
 *   transaction mode, which migration tools may not support.
 * - DATABASE_CA_PEM (RDS only; unset on Neon) is written to a temporary file and passed as NODE_EXTRA_CA_CERTS, so the
 *   repo's scripts verify the RDS certificate (sslmode=verify-full) without code changes. The
 *   file is deleted afterwards (it holds the public CA, not a secret).
 * - Refuses commands that would put demo or reset data into production, or change its schema
 *   outside the migration history (db:seed, db:reset, dev:bootstrap, --test, drizzle-kit push/drop;
 *   lib/command-guard.ts). It lets through the production data path: `npm run db:seed:reference`
 *   (reference data only) and `npm run content:bootstrap:remote -- --i-understand-this-is-remote`
 *   (the public demo museum; no users, no participants, no demo seed).
 * - Before the FIRST `db:migrate`, run preflight: its read-only `server + extensions` row checks
 *   PostgreSQL 18 and the pinned extension versions, while `runMigrations` in
 *   scripts/db/_shared.ts checks them only AFTER applying the migrations.
 * Values are never printed.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { refusalReason } from "./lib/command-guard";
import { FORBIDDEN, readEnvFile, redactUrl } from "./lib/env-catalog";

const argv = process.argv.slice(2);
const sep = argv.indexOf("--");
const fileIdx = argv.indexOf("--env-file");
if (sep < 0 || fileIdx < 0 || fileIdx > sep || !argv[fileIdx + 1]) {
  console.error("Usage: npx tsx scripts/deploy/with-env.ts --env-file <path> -- <command...>");
  process.exit(2);
}
const command = argv.slice(sep + 1);
const joined = command.join(" ");
const refused = refusalReason(command);
if (refused) {
  console.error(`Refused: "${joined}" must never run against production (${refused}).`);
  process.exit(2);
}

const fileEnv = readEnvFile(resolve(argv[fileIdx + 1]!));
const env: Record<string, string | undefined> = { ...process.env };
for (const [k, v] of Object.entries(fileEnv)) if (!(k in FORBIDDEN)) env[k] = v; // ADMIN_PASSWORD comes from the shell, never the file
delete env.TEST_DATABASE_URL;
// The database scripts prefer DATABASE_URL_UNPOOLED (scripts/db/_shared.ts resolveDatabaseUrl). When the
// production file does not set it (RDS), a value left in the shell or in the repo .env (dotenv fills
// only unset variables) would silently send the command to THAT database instead of DATABASE_URL.
if (!fileEnv.DATABASE_URL_UNPOOLED) {
  delete env.DATABASE_URL_UNPOOLED;
  const repoEnv = resolve(".env");
  if (existsSync(repoEnv) && readEnvFile(repoEnv).DATABASE_URL_UNPOOLED) {
    console.error(
      "Refused: the repo .env sets DATABASE_URL_UNPOOLED and the production env file does not, so the database " +
        "scripts would connect to the .env value. Set DATABASE_URL_UNPOOLED in the production file, or remove it from .env.",
    );
    process.exit(2);
  }
}

let caDir: string | null = null;
if (fileEnv.DATABASE_CA_PEM) {
  caDir = mkdtempSync(join(tmpdir(), "episteme-ca-"));
  const caFile = join(caDir, "rds-ca.pem");
  writeFileSync(caFile, `${fileEnv.DATABASE_CA_PEM.trim()}\n`);
  env.NODE_EXTRA_CA_CERTS = caFile;
}

console.log(`[with-env] ${joined}`);
console.log(`[with-env] DATABASE_URL ${fileEnv.DATABASE_URL ? redactUrl(fileEnv.DATABASE_URL) : "(not set)"}${caDir ? " + RDS CA via NODE_EXTRA_CA_CERTS" : ""}`);
if (fileEnv.DATABASE_URL_UNPOOLED) console.log(`[with-env] DATABASE_URL_UNPOOLED ${redactUrl(fileEnv.DATABASE_URL_UNPOOLED)} (used by the database scripts)`);
// Windows: npm/npx are .cmd shims, which Node only starts through a shell; quote each argument
// for cmd.exe so values with spaces (--name "Ada Admin") survive.
const quote = (a: string) => (/[\s"&|<>^()%!]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);
const r =
  process.platform === "win32"
    ? spawnSync(command.map(quote).join(" "), { env: env as NodeJS.ProcessEnv, stdio: "inherit", shell: true })
    : spawnSync(command[0]!, command.slice(1), { env: env as NodeJS.ProcessEnv, stdio: "inherit" });
if (caDir) rmSync(caDir, { recursive: true, force: true });
process.exit(r.status ?? 1);
