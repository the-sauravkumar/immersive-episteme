import "server-only";

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "@db/schema";
import { serverEnv } from "@/lib/env";

import { pgConnectionConfig } from "./connection-config";

export type Database = NodePgDatabase<typeof schema>;

type DbGlobal = typeof globalThis & {
  __episteme_pool?: Pool;
  __episteme_db?: Database;
};

const g = globalThis as DbGlobal;

function createPool(): Pool {
  const env = serverEnv();
  const pool = new Pool({
    ...pgConnectionConfig(env.DATABASE_URL, env.DATABASE_CA_PEM),
    max: env.DB_POOL_MAX,
    idleTimeoutMillis: process.env.VERCEL ? 5_000 : 30_000,
    connectionTimeoutMillis: 10_000,
    application_name: `immersive-episteme@${env.APP_BUILD_VERSION}`,
  });
  pool.on("error", (err) => {
    console.error("[db] idle client error", err);
  });
  return pool;
}

export function getPool(): Pool {
  g.__episteme_pool ??= createPool();
  return g.__episteme_pool;
}

export function getDb(): Database {
  g.__episteme_db ??= drizzle(getPool(), { schema, casing: "snake_case" });
  return g.__episteme_db;
}
