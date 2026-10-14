/**
 * Integration: migrations apply cleanly to TEST_DATABASE_URL and enable the required
 * extensions. Skipped (not failed) when TEST_DATABASE_URL is absent; CI always sets it.
 */
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runMigrations } from "../../scripts/db/_shared";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("database foundation (TEST_DATABASE_URL)", () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: url, max: 2 });
    await runMigrations(pool);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("enables pg_trgm, vector and pgcrypto", async () => {
    const { rows } = await pool.query<{ extname: string }>(
      "select extname from pg_extension where extname in ('pg_trgm','vector','pgcrypto') order by extname",
    );
    expect(rows.map((r) => r.extname)).toEqual(["pg_trgm", "pgcrypto", "vector"]);
  });

  it("supports vector distance and trigram similarity", async () => {
    const { rows } = await pool.query<{ d: number; s: number; u: string }>(
      "select ('[1,0,0]'::vector <-> '[0,1,0]'::vector) as d, similarity('ajrakh', 'ajrak') as s, gen_random_uuid()::text as u",
    );
    expect(rows[0]?.d).toBeCloseTo(Math.SQRT2, 5);
    expect(rows[0]?.s).toBeGreaterThan(0.3);
    expect(rows[0]?.u).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("runs on PostgreSQL 18", async () => {
    const { rows } = await pool.query<{ v: string }>("select current_setting('server_version_num') as v");
    expect(Number(rows[0]?.v)).toBeGreaterThanOrEqual(180000);
  });
});
