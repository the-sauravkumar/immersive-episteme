/**
 * Integration: the server Drizzle client connects through the validated env.
 * Points DATABASE_URL at TEST_DATABASE_URL so the main database is never touched.
 */
import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

const testUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!testUrl)("server db client", () => {
  afterAll(async () => {
    const { getPool } = await import("@/server/db/client");
    await getPool().end();
  });

  it("runs a query via getDb()", async () => {
    process.env.DATABASE_URL = testUrl;
    const { resetServerEnvCache } = await import("@/lib/env");
    resetServerEnvCache();
    const { getDb } = await import("@/server/db/client");
    const result = await getDb().execute<{ db: string }>(sql`select current_database() as db`);
    expect(result.rows[0]?.db).toBe(new URL(testUrl!).pathname.slice(1));
  });
});
