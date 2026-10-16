/**
 * Shared helpers for the tsx-run database scripts. These run in plain Node (not in a React
 * Server environment), so they must not import modules marked `server-only`.
 */
import "dotenv/config";

import { fileURLToPath } from "node:url";
import { Pool } from "pg";

export const MIGRATIONS_FOLDER = fileURLToPath(new URL("../../db/migrations", import.meta.url));

/**
 * `--test` targets TEST_DATABASE_URL; otherwise DATABASE_URL_UNPOOLED when set (the direct
 * connection on Neon: "Schema migrations | Direct | Tools may not support transaction pooling",
 * https://neon.com/docs/connect/connection-pooling), else DATABASE_URL.
 */
export function resolveDatabaseUrl(argv: readonly string[] = process.argv): {
  url: string;
  label: "test" | "main";
} {
  const useTest = argv.includes("--test");
  const direct = process.env.DATABASE_URL_UNPOOLED?.trim() ? process.env.DATABASE_URL_UNPOOLED : undefined;
  const url = useTest ? process.env.TEST_DATABASE_URL : (direct ?? process.env.DATABASE_URL);
  const name = useTest ? "TEST_DATABASE_URL" : "DATABASE_URL";
  if (!url) {
    throw new Error(`${name} is not set. Copy .env.example to .env (see README).`);
  }
  return { url, label: useTest ? "test" : "main" };
}

/** Redacts the password in a connection string for logging. */
export function redact(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = "***";
    return u.toString();
  } catch {
    return "<unparseable url>";
  }
}

/**
 * The host node-postgres will actually connect to. pg (pg-connection-string `parse`) lets a `host`
 * query parameter (when not empty) override the URL's host name, so `postgres://u:p@localhost/db?host=remote.example`
 * connects to remote.example: every local/remote decision must use this, not `URL.hostname`.
 * IPv6 brackets are removed, as pg does.
 */
export function connectionHost(url: string): string {
  const u = new URL(url);
  const fromQuery = u.searchParams.get("host");
  return (fromQuery || u.hostname).replace(/^\[(.+)\]$/, "$1").toLowerCase();
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "db"]);

export function isLocalHost(url: string): boolean {
  return LOCAL_HOSTS.has(connectionHost(url));
}

export function makePool(url: string): Pool {
  return new Pool({ connectionString: url, max: 2, application_name: "immersive-episteme-scripts" });
}

/**
 * Database versions the migrations are written and tested against (docker-compose.yml and CI
 * pin the image by digest). Generated columns hash `jsonb::text` (ie_jsonb_sha256) and the
 * schema relies on PostgreSQL 18 `uuidv7()`, so a different server major or extension version
 * must be a deliberate upgrade: update these together with the image digest.
 *
 * vector accepts 0.8.6 as well: Neon's PostgreSQL 18 ships pgvector 0.8.6
 * (https://neon.com/docs/extensions/pg-extensions), and the schema only installs the extension
 * (0000_enable_extensions.sql) with no vector column or index (DR "Neon", docs/research/design-process/decisions.md).
 */
export const EXPECTED_DB = {
  serverMajor: 18,
  extensions: { vector: ["0.8.7", "0.8.6"], pg_trgm: ["1.6"], pgcrypto: ["1.4"] } as Record<string, readonly string[]>,
} as const;

/** Throws when the connected server or extensions differ from EXPECTED_DB. */
export function assertDbVersions(serverVersionNum: number, extensions: Record<string, string>): void {
  const problems: string[] = [];
  const major = Math.floor(serverVersionNum / 10000);
  if (major !== EXPECTED_DB.serverMajor) problems.push(`PostgreSQL ${major} (expected ${EXPECTED_DB.serverMajor})`);
  for (const [name, versions] of Object.entries(EXPECTED_DB.extensions)) {
    const got = extensions[name];
    if (got === undefined || !versions.includes(got)) problems.push(`${name} ${got ?? "missing"} (expected ${versions.join(" or ")})`);
  }
  if (problems.length > 0) {
    throw new Error(
      `Database version mismatch: ${problems.join(", ")}. Use the pinned image from docker-compose.yml, ` +
        "or upgrade deliberately (EXPECTED_DB in scripts/db/_shared.ts).",
    );
  }
}

/** Applies all pending migrations, checks the database versions and returns a one-line summary. */
export async function runMigrations(pool: Pool): Promise<string> {
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  await migrate(drizzle(pool), {
    migrationsFolder: MIGRATIONS_FOLDER,
    migrationsTable: "__drizzle_migrations",
    migrationsSchema: "drizzle",
  });
  const ext = await pool.query<{ extname: string; extversion: string }>(
    "select extname, extversion from pg_extension where extname in ('pg_trgm','vector','pgcrypto') order by extname",
  );
  const applied = await pool.query<{ n: string }>(
    "select count(*)::text as n from drizzle.__drizzle_migrations",
  );
  const server = await pool.query<{ num: string; version: string }>(
    "select current_setting('server_version_num') as num, current_setting('server_version') as version",
  );
  assertDbVersions(Number(server.rows[0]?.num), Object.fromEntries(ext.rows.map((r) => [r.extname, r.extversion])));
  return `${applied.rows[0]?.n ?? "?"} migration(s) recorded; PostgreSQL ${server.rows[0]?.version}; extensions: ${ext.rows
    .map((r) => `${r.extname}@${r.extversion}`)
    .join(", ")}`;
}
