/**
 * Deploy preflight: everything that can be checked BEFORE a production deploy, read-only.
 *
 *   npx tsx scripts/deploy/preflight.ts --env-file <path> [--mode production|local]
 *        [--skip-db] [--skip-s3] [--skip-source] [--build]
 *
 * Sections (each row PASS / FAIL / WARN / SKIP / INFO; exit code 1 when any row FAILs):
 *  1. env      the file against the app's own schemas (src/lib/env.ts serverEnvSchema with
 *              NODE_ENV=production, src/server/cms/media/storage.ts parseMediaEnv) plus the
 *              production rules from docs/deploy/RESEARCH.md (TLS, region, client-IP header,
 *              pool size, 64 KB limit, forbidden variables, secret reuse).
 *  2. source   whether the source changes the deploy depends on are in place (text checks of
 *              the files; they flip to PASS when the other workflow lands them) and the repo
 *              config (vercel.json, .gitignore, .vercelignore, lockfile, git state).
 *  3. db       connects with the same TLS settings production needs, inside a READ ONLY
 *              transaction: TLS in use, server and extension versions, non-superuser role,
 *              migrations current (same hashes drizzle's migrator computes), max_connections.
 *  4. s3       HeadBucket with the file's explicit keys (never the ambient AWS chain), expected
 *              bucket owner = the account in docs/deploy/aws-resources.md, the bucket refuses
 *              anonymous listing, and a CORS preflight from the production origin succeeds.
 *  5. build    only with --build: `npm run build` with the file's variables. It overwrites
 *              .next, so run it only when no other heavy job is running.
 *
 * Mode: `production` (default) applies every production rule. `local` validates a development
 * file (for example the repo's .env) and reports production-only rules as INFO instead of FAIL.
 * Never prints secret values: only names, lengths and redacted URLs.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { X509Certificate } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { CATALOG, FORBIDDEN, envBytes, isVercelSystemName, readEnvFile, redactUrl, VERCEL_ENV_LIMIT_BYTES } from "./lib/env-catalog";
import { Report, type Status } from "./lib/report";
import { serverEnvSchema } from "../../src/lib/env";
import { clientIpPolicy } from "../../src/lib/client-ip";
import { mediaUploadOrigin } from "../../src/lib/security/csp";
import { parseMediaEnv } from "../../src/server/cms/media/storage";

// Snapshot before anything (scripts/db/_shared.ts, imported lazily below) loads the repo .env.
const PARENT_ENV: NodeJS.ProcessEnv = { ...process.env };
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const { values: args } = parseArgs({
  options: {
    "env-file": { type: "string" },
    mode: { type: "string", default: "production" },
    "skip-db": { type: "boolean", default: false },
    "skip-s3": { type: "boolean", default: false },
    "skip-source": { type: "boolean", default: false },
    build: { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});

if (args.help || !args["env-file"]) {
  console.log("Usage: npx tsx scripts/deploy/preflight.ts --env-file <path> [--mode production|local] [--skip-db] [--skip-s3] [--skip-source] [--build]");
  process.exit(args.help ? 0 : 2);
}
if (args.mode !== "production" && args.mode !== "local") {
  console.error("--mode must be production or local");
  process.exit(2);
}
const PROD = args.mode === "production";
const envPath = resolve(args["env-file"]);
const report = new Report();
/** A production rule: FAIL in production mode, INFO in local mode. */
const rule = (ok: boolean): Status => (ok ? "PASS" : PROD ? "FAIL" : "INFO");

const readRepo = (rel: string): string | null => {
  const p = join(REPO, rel);
  return existsSync(p) ? readFileSync(p, "utf8") : null;
};
const git = (...a: string[]): string | null => {
  try {
    return execFileSync("git", a, { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
};
const errText = (e: unknown): string => {
  const err = e as { name?: string; code?: string; message?: string; $metadata?: { httpStatusCode?: number } };
  const status = err.$metadata?.httpStatusCode ? ` HTTP ${err.$metadata.httpStatusCode}` : "";
  return `${err.name ?? "Error"}${err.code ? ` ${err.code}` : ""}${status}: ${(err.message ?? String(e)).split("\n")[0]}`.slice(0, 200);
};

// ---------------------------------------------------------------------------------------------
// 1. Environment file
// ---------------------------------------------------------------------------------------------
if (!existsSync(envPath)) {
  report.add("env", "file exists", "FAIL", envPath);
  report.print("Deploy preflight");
  process.exit(1);
}
const fileEnv = readEnvFile(envPath);
report.add("env", "file parsed", "PASS", `${Object.keys(fileEnv).length} variables in ${envPath}`);

const insideRepo = envPath.toLowerCase().startsWith(REPO.toLowerCase());
if (insideRepo) {
  const tracked = git("ls-files", "--error-unmatch", envPath) !== null;
  const ignored = git("check-ignore", "-q", envPath) !== null;
  report.add("env", "file kept out of git", tracked || !ignored ? "FAIL" : PROD ? "WARN" : "PASS", tracked ? "the env file is TRACKED by git" : ignored ? "inside the repo but gitignored; keep production files outside the repo (RUNBOOK step 5)" : "inside the repo and NOT gitignored");
} else {
  report.add("env", "file kept out of git", "PASS", "outside the repo");
}

// Forbidden and unknown names.
const known = new Set(CATALOG.map((e) => e.name));
for (const name of Object.keys(fileEnv)) {
  if (known.has(name)) continue;
  if (FORBIDDEN[name]) report.add("env", `${name} not set`, rule(false), FORBIDDEN[name]!);
  else if (isVercelSystemName(name)) report.add("env", `${name} not set`, rule(false), "Vercel system variable; set by the platform");
  else report.add("env", `${name} known`, "WARN", "not in scripts/deploy/lib/env-catalog.ts; push-env will refuse it");
}
for (const e of CATALOG.filter((c) => c.need === "required")) {
  if (fileEnv[e.name] === undefined) report.add("env", `${e.name} present`, rule(false), e.source);
}

// The app's own server schema, exactly as production parses it.
const asProduction = { ...fileEnv, NODE_ENV: PROD ? "production" : (fileEnv.NODE_ENV ?? "development") };
const parsed = serverEnvSchema.safeParse(asProduction);
if (parsed.success) report.add("env", "src/lib/env.ts schema", "PASS", `NODE_ENV=${asProduction.NODE_ENV}`);
else for (const i of parsed.error.issues) report.add("env", "src/lib/env.ts schema", "FAIL", `${i.path.join(".") || "(root)"}: ${i.message}`);

// Media storage schema (storage.ts validates it lazily at first use, so check it now).
let media: ReturnType<typeof parseMediaEnv> | null = null;
try {
  media = parseMediaEnv(asProduction);
  report.add("env", "storage.ts media schema", "PASS", media.MEDIA_S3_BUCKET ? `S3 bucket ${media.MEDIA_S3_BUCKET} in ${media.MEDIA_S3_REGION}` : "local-disk mode");
} catch (e) {
  report.add("env", "storage.ts media schema", "FAIL", errText(e));
}

// Production rules (docs/deploy/RESEARCH.md).
const total = envBytes(fileEnv);
report.add("env", "64 KB Vercel limit", total < VERCEL_ENV_LIMIT_BYTES ? "PASS" : "FAIL", `${total} bytes of ${VERCEL_ENV_LIMIT_BYTES} (RESEARCH.md s5)`);

const authUrl = fileEnv.BETTER_AUTH_URL;
let appOrigin: string | null = null;
if (authUrl) {
  try {
    const u = new URL(authUrl);
    appOrigin = u.origin;
    const local = ["localhost", "127.0.0.1", "::1"].includes(u.hostname);
    report.add("env", "BETTER_AUTH_URL https", rule(u.protocol === "https:" && !local), `${u.origin}${u.pathname !== "/" ? " (has a path; use the origin only)" : ""}`);
  } catch {
    report.add("env", "BETTER_AUTH_URL https", "FAIL", "not a URL");
  }
}

const dbUrl = fileEnv.DATABASE_URL;
let dbHost = "";
let sslmode: string | null = null;
if (dbUrl) {
  try {
    const u = new URL(dbUrl);
    dbHost = u.hostname;
    sslmode = u.searchParams.get("sslmode");
    report.add("env", "DATABASE_URL", "INFO", redactUrl(dbUrl));
    report.add("env", "DATABASE_URL remote host", rule(!["localhost", "127.0.0.1", "::1", "db"].includes(dbHost)), dbHost);
    report.add("env", "sslmode=verify-full", rule(sslmode === "verify-full"), `sslmode=${sslmode ?? "(none)"}${sslmode === "no-verify" ? " -- never use no-verify" : ""}`);
    report.add("env", "app role in URL", rule(decodeURIComponent(u.username) === "episteme_app"), `user ${decodeURIComponent(u.username)} (production uses the non-superuser episteme_app)`);
  } catch {
    report.add("env", "DATABASE_URL", "FAIL", "unparseable");
  }
}
const isRds = dbHost.endsWith(".rds.amazonaws.com");

const caPem = fileEnv.DATABASE_CA_PEM;
let caCerts: X509Certificate[] = [];
if (caPem) {
  try {
    caCerts = (caPem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? []).map((b) => new X509Certificate(b));
    const soonest = caCerts.map((c) => new Date(c.validTo)).sort((a, b) => a.getTime() - b.getTime())[0];
    const expired = caCerts.some((c) => new Date(c.validTo) < new Date());
    report.add("env", "DATABASE_CA_PEM parses", caCerts.length > 0 && !expired ? "PASS" : "FAIL", `${caCerts.length} certificate(s), ${Buffer.byteLength(caPem)} bytes, earliest expiry ${soonest?.toISOString().slice(0, 10) ?? "?"}`);
  } catch (e) {
    report.add("env", "DATABASE_CA_PEM parses", "FAIL", errText(e));
  }
} else if (isRds) {
  report.add("env", "DATABASE_CA_PEM present", rule(false), "RDS root CA is not in Node's default store (RESEARCH.md s8); put the ap-south-1 bundle here");
}

const pool = Number(fileEnv.DB_POOL_MAX ?? "10");
report.add("env", "DB_POOL_MAX <= 3", pool <= 3 ? "PASS" : PROD ? "WARN" : "INFO", `${pool} (RESEARCH.md s6)`);

const ip = clientIpPolicy(fileEnv);
report.add(
  "env",
  "client IP header",
  rule(ip.header === "x-forwarded-for" && ip.trustedProxies.length === 0 && fileEnv.AUTH_CLIENT_IP_HEADER !== undefined),
  `AUTH_CLIENT_IP_HEADER=${fileEnv.AUTH_CLIENT_IP_HEADER ?? "(unset)"}, AUTH_TRUSTED_PROXIES ${ip.trustedProxies.length ? "set" : "unset"} (RESEARCH.md s11)`,
);

if (media?.MEDIA_S3_BUCKET || PROD) {
  report.add("env", "MEDIA_S3_REGION ap-south-1", rule(media?.MEDIA_S3_REGION === "ap-south-1"), media?.MEDIA_S3_REGION ?? "(unset)");
  const keys = Boolean(fileEnv.MEDIA_S3_ACCESS_KEY_ID && fileEnv.MEDIA_S3_SECRET_ACCESS_KEY);
  const oidcInCode = (readRepo("src/server/cms/media/storage.ts") ?? "").includes("AWS_ROLE_ARN");
  const oidc = oidcInCode && Boolean(fileEnv.AWS_ROLE_ARN);
  report.add(
    "env",
    "S3 credentials explicit",
    rule(keys || oidc),
    keys ? "MEDIA_S3_* keys set (Option B)" : oidc ? "AWS_ROLE_ARN (OIDC, Option A)" : "without them the SDK picks up Vercel's placeholder AWS_* values (RESEARCH.md s9)",
  );
  if (fileEnv.AWS_ROLE_ARN && !oidcInCode) report.add("env", "AWS_ROLE_ARN usable", "WARN", "storage.ts does not read AWS_ROLE_ARN yet (source change S5)");
  if (fileEnv.AWS_ROLE_ARN) report.add("env", "AWS_REGION with OIDC", rule(fileEnv.AWS_REGION === "ap-south-1"), "Vercel sets AWS_REGION to the execution region unless set (RESEARCH.md s9)");
}
const cspOrigin = mediaUploadOrigin(asProduction);
report.add("env", "CSP connect-src origin", cspOrigin ? "INFO" : rule(false), cspOrigin ? `${cspOrigin} (next.config headers read it at build time: set env vars BEFORE the build)` : "no S3 origin: CMS uploads would be blocked by the CSP");

const buildVersion = fileEnv.APP_BUILD_VERSION;
const head = git("rev-parse", "--short", "HEAD");
if (buildVersion !== undefined) {
  report.add("env", "APP_BUILD_VERSION = HEAD", buildVersion === head ? "PASS" : PROD ? "WARN" : "INFO", `${buildVersion} vs HEAD ${head ?? "?"} (push-env -BuildVersionFromGit sets it)`);
}

// The production secret must not be the developer's local one.
const localEnvPath = join(REPO, ".env");
if (PROD && existsSync(localEnvPath) && resolve(localEnvPath) !== envPath && fileEnv.BETTER_AUTH_SECRET) {
  const localSecret = readEnvFile(localEnvPath).BETTER_AUTH_SECRET;
  report.add("env", "secret differs from .env", localSecret === fileEnv.BETTER_AUTH_SECRET ? "FAIL" : "PASS", "BETTER_AUTH_SECRET compared with the local development value (not printed)");
}

// ---------------------------------------------------------------------------------------------
// 2. Source readiness and repo config
// ---------------------------------------------------------------------------------------------
if (args["skip-source"]) {
  report.add("source", "source readiness", "SKIP", "--skip-source");
} else {
  const has = (rel: string, needle: RegExp) => needle.test(readRepo(rel) ?? "");
  const pending = (ok: boolean, status: Status, id: string, what: string) =>
    report.add("source", `${id} ${what}`, ok ? "PASS" : status, ok ? "" : "pending (docs/deploy/RESEARCH.md s13; RUNBOOK 'Source changes')");

  pending(has("src/proxy.ts", /invite/i), PROD ? "FAIL" : "WARN", "S11", "invite-only gate");
  const caInCode = has("src/server/db/client.ts", /DATABASE_CA_PEM/) && has("src/lib/env.ts", /DATABASE_CA_PEM/);
  pending(caInCode, isRds && PROD ? "FAIL" : "WARN", "S3", "DATABASE_CA_PEM in pool");
  pending(has("src/app/api/research/dashboard/stream/route.ts", /export const maxDuration/), "WARN", "S1", "stream maxDuration");
  pending(has("src/app/(research)/research/dashboard/_components/live-status.tsx", /visibilitychange/), "WARN", "S2", "stream only when visible");
  pending(!has("src/server/db/client.ts", /idleTimeoutMillis:\s*30_?000/), "WARN", "S4", "short pool idle timeout");
  pending(has("src/server/cms/media/storage.ts", /AWS_ROLE_ARN|VERCEL/), "WARN", "S5", "no fallback to AWS_* chain");
  pending(has("next.config.ts", /localPatterns/), "WARN", "S6", "images.localPatterns");
  pending(has("src/components/knowledge/knowledge-figure.tsx", /unoptimized/), "WARN", "S7", "licence-limited figures");
  pending(git("check-ignore", "-q", ".env.production.example") === null, "WARN", "S8", ".env.production.example committable");
  const vi = readRepo(".vercelignore");
  pending(vi !== null && /^\/?\.env\s*$/m.test(vi), "WARN", "S9", ".vercelignore excludes .env");

  let vj: { regions?: string[]; installCommand?: string; framework?: string; ignoreCommand?: string } | null = null;
  try {
    vj = JSON.parse(readRepo("vercel.json") ?? "null");
  } catch {
    vj = null;
  }
  report.add("source", "vercel.json bom1 + npm ci", vj?.regions?.join(",") === "bom1" && vj.installCommand === "npm ci" ? "PASS" : "FAIL", vj ? `regions=${vj.regions?.join(",")}, install=${vj.installCommand}` : "missing or invalid");
  report.add("source", "vercel.json invite guard", /invite/i.test(vj?.ignoreCommand ?? "") && /VERCEL_ENV/.test(vj?.ignoreCommand ?? "") ? "PASS" : "FAIL", "ignoreCommand cancels production builds until src/proxy.ts has the invite gate");
  report.add("source", "lockfile tracked", git("ls-files", "--error-unmatch", "package-lock.json") !== null ? "PASS" : "FAIL", "npm ci needs package-lock.json in git");
  const dirty = git("status", "--porcelain");
  report.add("source", "working tree clean", dirty === "" ? "PASS" : "WARN", dirty ? `${dirty.split("\n").length} changed path(s): Git deploys build the pushed commit only` : `HEAD ${head}`);
  const upstream = git("rev-parse", "--abbrev-ref", "@{u}");
  report.add("source", "branch has upstream", upstream ? "PASS" : "INFO", upstream ?? "no remote yet (github-repo skill); Git-based deploys need it");
}

// ---------------------------------------------------------------------------------------------
// 3. Database (read-only)
// ---------------------------------------------------------------------------------------------
if (args["skip-db"]) {
  report.add("db", "database", "SKIP", "--skip-db");
} else if (!dbUrl) {
  report.add("db", "database", "SKIP", "no DATABASE_URL");
} else {
  await checkDatabase(dbUrl);
}

async function checkDatabase(url: string): Promise<void> {
  const { Pool } = await import("pg");
  const shared = await import("../db/_shared"); // loads .env into process.env: restore after
  for (const k of Object.keys(process.env)) if (!(k in PARENT_ENV)) delete process.env[k];
  const { readMigrationFiles } = await import("drizzle-orm/migrator");

  // pg lets URL parameters override an explicit `ssl` object, so strip sslmode/sslrootcert and
  // pass TLS settings explicitly (the same shape source change S3 needs in src/server/db/client.ts).
  const u = new URL(url);
  const mode = u.searchParams.get("sslmode");
  const rootCertPath = u.searchParams.get("sslrootcert");
  u.searchParams.delete("sslmode");
  u.searchParams.delete("sslrootcert");
  const wantTls = PROD || (mode !== null && mode !== "disable");
  const ca = caPem ?? (rootCertPath && existsSync(rootCertPath) ? readFileSync(rootCertPath, "utf8") : undefined);
  const ssl = wantTls ? { rejectUnauthorized: mode !== "no-verify", ...(ca ? { ca } : {}) } : false;
  const db = new Pool({ connectionString: u.toString(), ssl, max: 1, connectionTimeoutMillis: 10_000, application_name: "immersive-episteme-preflight" });

  let client;
  try {
    client = await db.connect();
    report.add("db", "connect", "PASS", `${dbHost}${wantTls ? `, TLS with ${ca ? "the given CA" : "Node's default CAs"}` : ", no TLS requested"}`);
  } catch (e) {
    const tlsHint = /self.signed|certificate|CERT/i.test(String((e as Error).message)) ? " (certificate chain: set DATABASE_CA_PEM to the ap-south-1 bundle)" : "";
    report.add("db", "connect", "FAIL", `${errText(e)}${tlsHint}`);
    await db.end();
    return;
  }
  try {
    await client.query("BEGIN READ ONLY");
    const tls = await client.query<{ ssl: boolean; version: string | null }>("select ssl, version from pg_stat_ssl where pid = pg_backend_pid()");
    const t = tls.rows[0];
    report.add("db", "TLS in use", t?.ssl ? "PASS" : rule(false), t?.ssl ? `${t.version}` : "plain TCP");
    if (isRds) {
      const force = await client.query<{ v: string | null }>("select current_setting('rds.force_ssl', true) as v");
      report.add("db", "rds.force_ssl = 1", rule(force.rows[0]?.v === "1"), `rds.force_ssl=${force.rows[0]?.v ?? "?"}`);
    }

    const server = await client.query<{ num: string; version: string }>("select current_setting('server_version_num') as num, current_setting('server_version') as version");
    const ext = await client.query<{ extname: string; extversion: string }>("select extname, extversion from pg_extension where extname in ('pg_trgm','vector','pgcrypto')");
    try {
      shared.assertDbVersions(Number(server.rows[0]?.num), Object.fromEntries(ext.rows.map((r) => [r.extname, r.extversion])));
      report.add("db", "server + extensions", "PASS", `PostgreSQL ${server.rows[0]?.version}; ${ext.rows.map((r) => `${r.extname}@${r.extversion}`).join(", ")}`);
    } catch (e) {
      report.add("db", "server + extensions", "FAIL", errText(e));
    }

    const role = await client.query<{ rolsuper: boolean; name: string }>("select rolsuper, current_user as name from pg_roles where rolname = current_user");
    report.add("db", "role not superuser", rule(role.rows[0]?.rolsuper === false), `${role.rows[0]?.name} superuser=${role.rows[0]?.rolsuper}`);

    const files = readMigrationFiles({ migrationsFolder: shared.MIGRATIONS_FOLDER });
    const table = await client.query<{ t: string | null }>("select to_regclass('drizzle.__drizzle_migrations')::text as t");
    if (!table.rows[0]?.t) {
      report.add("db", "migrations current", "FAIL", `no drizzle.__drizzle_migrations table; ${files.length} migration(s) pending: run npm run db:migrate`);
    } else {
      const rows = (await client.query<{ hash: string; created_at: string }>("select hash, created_at::text from drizzle.__drizzle_migrations")).rows;
      const last = rows.reduce((m, r) => Math.max(m, Number(r.created_at)), 0);
      const pendingCount = files.filter((f) => f.folderMillis > last).length; // drizzle's own rule
      const byWhen = new Map(rows.map((r) => [Number(r.created_at), r.hash]));
      const changed = files.filter((f) => byWhen.has(f.folderMillis) && byWhen.get(f.folderMillis) !== f.hash).length;
      report.add("db", "migrations current", pendingCount === 0 ? "PASS" : "FAIL", `${rows.length} applied, ${files.length} in db/migrations, ${pendingCount} pending`);
      if (changed > 0) report.add("db", "migration files unchanged", "WARN", `${changed} applied migration file(s) differ from what was applied (line endings or edits)`);
    }

    const maxConn = await client.query<{ v: string }>("select current_setting('max_connections') as v");
    report.add("db", "max_connections", "INFO", `${maxConn.rows[0]?.v}; each Vercel instance uses up to DB_POOL_MAX=${pool} + 1 LISTEN (RESEARCH.md s6)`);
  } catch (e) {
    report.add("db", "read-only checks", "FAIL", errText(e));
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
    await db.end();
  }
}

// ---------------------------------------------------------------------------------------------
// 4. S3 (read-only)
// ---------------------------------------------------------------------------------------------
if (args["skip-s3"]) {
  report.add("s3", "bucket", "SKIP", "--skip-s3");
} else if (!media?.MEDIA_S3_BUCKET) {
  report.add("s3", "bucket", PROD ? "FAIL" : "SKIP", "no MEDIA_S3_BUCKET in the file");
} else if (!(fileEnv.MEDIA_S3_ACCESS_KEY_ID && fileEnv.MEDIA_S3_SECRET_ACCESS_KEY)) {
  report.add("s3", "HeadBucket", "SKIP", "no explicit MEDIA_S3_* keys; the ambient AWS chain is deliberately not used");
} else {
  await checkS3(media.MEDIA_S3_BUCKET, media.MEDIA_S3_REGION);
}

async function checkS3(bucket: string, region: string): Promise<void> {
  const { S3Client, HeadBucketCommand } = await import("@aws-sdk/client-s3");
  const account = /\| Account ID \| (\d{12}) \|/.exec(readRepo("docs/deploy/aws-resources.md") ?? "")?.[1];
  const s3 = new S3Client({
    region,
    endpoint: media?.MEDIA_S3_ENDPOINT,
    forcePathStyle: media?.MEDIA_S3_FORCE_PATH_STYLE === "true",
    credentials: { accessKeyId: fileEnv.MEDIA_S3_ACCESS_KEY_ID!, secretAccessKey: fileEnv.MEDIA_S3_SECRET_ACCESS_KEY! },
  });
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket, ...(account && PROD ? { ExpectedBucketOwner: account } : {}) }));
    report.add("s3", "HeadBucket with app keys", "PASS", `${bucket}${account && PROD ? `, owner ${account}` : ""}`);
  } catch (e) {
    report.add("s3", "HeadBucket with app keys", "FAIL", `${errText(e)}${account ? ` (expected owner ${account})` : ""}`);
  }
  const origin = mediaUploadOrigin(asProduction);
  if (!origin) return;
  try {
    const anon = await fetch(`${origin}/?list-type=2&max-keys=1`, { method: "GET", signal: AbortSignal.timeout(10_000) });
    report.add("s3", "anonymous listing refused", anon.status === 403 ? "PASS" : "FAIL", anon.status === 404 ? "HTTP 404: the bucket does not exist" : `HTTP ${anon.status} (Block Public Access must answer 403)`);
  } catch (e) {
    report.add("s3", "anonymous listing refused", "WARN", errText(e));
  }
  if (!appOrigin) return;
  try {
    const pre = await fetch(`${origin}/preflight-probe`, {
      method: "OPTIONS",
      headers: { Origin: appOrigin, "Access-Control-Request-Method": "PUT", "Access-Control-Request-Headers": "content-type,x-amz-checksum-sha256" },
      signal: AbortSignal.timeout(10_000),
    });
    const allow = pre.headers.get("access-control-allow-origin");
    report.add("s3", "CORS allows app origin", pre.ok && (allow === appOrigin || allow === "*") ? (allow === "*" ? "WARN" : "PASS") : rule(false), `HTTP ${pre.status}, allow-origin ${allow ?? "(none)"} for ${appOrigin}`);
  } catch (e) {
    report.add("s3", "CORS allows app origin", "WARN", errText(e));
  }
}

// ---------------------------------------------------------------------------------------------
// 5. Production build (opt-in)
// ---------------------------------------------------------------------------------------------
if (!args.build) {
  report.add("build", "npm run build", "SKIP", "pass --build (overwrites .next; one heavy job at a time); Vercel builds again from Git");
} else {
  // NODE_ENV is in FORBIDDEN, so neither the parent's nor the file's value reaches the build.
  const drop = new Set([...CATALOG.map((c) => c.name), ...Object.keys(FORBIDDEN)]);
  const env: Record<string, string | undefined> = Object.fromEntries(Object.entries(PARENT_ENV).filter(([k]) => !drop.has(k)));
  for (const [k, v] of Object.entries(fileEnv)) if (!(k in FORBIDDEN)) env[k] = v;
  env.NODE_OPTIONS = [env.NODE_OPTIONS, "--max-old-space-size=6144"].filter(Boolean).join(" ");
  console.log("\n[preflight] npm run build with the env file's variables (values not printed)...");
  if (existsSync(join(REPO, ".env"))) console.log("[preflight] note: Next also reads the repo .env for any variable the file leaves unset");
  const started = Date.now();
  const r = spawnSync("npm", ["run", "build"], { cwd: REPO, env: env as NodeJS.ProcessEnv, stdio: "inherit", shell: process.platform === "win32" });
  report.add("build", "npm run build", r.status === 0 ? "PASS" : "FAIL", `exit ${r.status} in ${Math.round((Date.now() - started) / 1000)} s`);
}

report.print(`Deploy preflight (${args.mode}) for ${envPath}`);
process.exit(report.failed === 0 ? 0 : 1);
