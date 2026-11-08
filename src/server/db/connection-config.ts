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
