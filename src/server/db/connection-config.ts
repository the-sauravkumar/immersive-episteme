/**
 * node-postgres connection settings for DATABASE_URL, with optional TLS pinned to a given CA
 * (deployment source change S3; docs/deploy/RESEARCH.md s8, RUNBOOK step 1).
 *
 * Why the URL is rewritten: node-postgres applies the parsed connection string AFTER the explicit
 * config (pg/lib/connection-parameters.js), and any `sslmode` in the URL resets `ssl` to an object
 * built from the URL alone (pg-connection-string), which would drop the CA passed here. So when a
 * CA is given, the TLS parameters are removed from the URL and TLS is configured only through
 * `ssl: { ca, rejectUnauthorized: true }` (hostname checked by Node's default checkServerIdentity,
 * i.e. verify-full).
 *
 * Without a CA nothing changes: the URL is used as written (local Docker, CI).
 *
 * Pure and not `server-only`: the pool (src/server/db/client.ts), the dashboard LISTEN connection
 * (src/server/research/dashboard-service.ts) and unit tests share it.
 */

/** URL query parameters that carry TLS settings for node-postgres / libpq. */
const TLS_PARAMS = ["sslmode", "sslrootcert", "sslcert", "sslkey", "ssl", "uselibpqcompat"] as const;

export interface PgConnectionConfig {
  connectionString: string;
  ssl?: { ca: string; rejectUnauthorized: true };
}

export function pgConnectionConfig(databaseUrl: string, caPem?: string): PgConnectionConfig {
  if (!caPem) return { connectionString: databaseUrl };
  const url = new URL(databaseUrl);
  const mode = url.searchParams.get("sslmode");
  if (mode === "disable") {
    throw new Error("DATABASE_URL has sslmode=disable but DATABASE_CA_PEM is set: remove one of them");
  }
  for (const p of TLS_PARAMS) url.searchParams.delete(p);
  return { connectionString: url.toString(), ssl: { ca: caPem, rejectUnauthorized: true } };
}
