import { spawnSync } from "node:child_process";

import { config as loadEnv } from "dotenv";
import { Pool } from "pg";

loadEnv({ quiet: true });

export const JOURNEY_STUDY = "demo-walking-v2";
export const CAP_STUDY = "demo-walking-cap-v2";

let pool: Pool | null = null;
export function db(): Pool {
  pool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  return pool;
}

export async function closeDb(): Promise<void> {
  await pool?.end();
  pool = null;
}

export async function retireE2eStaff(client: Pick<Pool, "query"> = db(), own: readonly string[] = []): Promise<void> {
  const mine = "SELECT id FROM users WHERE email LIKE 'e2e-%@example.test' AND (email = ANY($1::text[]) OR created_at < now() - interval '1 hour')";
  await client.query(`UPDATE users SET disabled_at = now() WHERE id IN (${mine}) AND disabled_at IS NULL`, [own]);
  await client.query(`DELETE FROM user_roles WHERE user_id IN (${mine})`, [own]);
  await client.query(`DELETE FROM auth_sessions WHERE user_id IN (${mine})`, [own]);
}

export function ensureDemoStudy(slug: string, capMinutes: number): void {
  const run = spawnSync("npx", ["tsx", "scripts/content/seed-demo-study.ts", `--slug=${slug}`, `--cap-minutes=${capMinutes}`, "--battery-version=2"], { encoding: "utf8", shell: true });
  if (run.status !== 0) throw new Error(`Demo study ${slug} could not be seeded: ${run.stderr}`);
}

export async function sessionByCode(code: string, slug: string): Promise<{ sessionId: string; condition: string }> {
  const found = await db().query<{ id: string; interface: string }>(
    `SELECT ss.id, sc.interface FROM study_sessions ss
       JOIN participants p ON p.id = ss.participant_id
       JOIN studies st ON st.id = ss.study_id AND st.slug = $2
       JOIN study_conditions sc ON sc.id = ss.condition_id
      WHERE p.code = $1 ORDER BY ss.period DESC LIMIT 1`,
    [code, slug],
  );
  const row = found.rows[0];
  if (!row) throw new Error(`No session for ${code} in ${slug}`);
  return { sessionId: row.id, condition: row.interface };
}
