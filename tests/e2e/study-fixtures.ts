import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

import type { Page } from "@playwright/test";
import { config as loadEnv } from "dotenv";
import { Pool } from "pg";

loadEnv({ quiet: true });

const BATTERY_VERSION = 6;
export const JOURNEY_STUDY = `demo-walking-v${BATTERY_VERSION}`;
export const CAP_STUDY = `demo-walking-cap-v${BATTERY_VERSION}`;

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

export function createE2eStaff(email: string, name: string, role: string, password: string): void {
  execFileSync(process.execPath, ["--import", "tsx", "scripts/create-admin.ts", "--email", email, "--name", name, "--role", role], { env: { ...process.env, ADMIN_PASSWORD: password }, stdio: "pipe" });
}

const SIGN_IN_WINDOW_MS = 61_000;

export async function signInStaff(page: Page, email: string, password: string, attempts = 3): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    const refusal = page.getByRole("alert").filter({ hasText: "Could Not Sign In" });
    const outcome = await Promise.race([
      page.waitForURL((url) => !url.pathname.startsWith("/sign-in"), { timeout: 60_000 }).then(() => "in" as const, () => "timeout" as const),
      refusal.waitFor({ timeout: 60_000 }).then(() => "refused" as const, () => "timeout" as const),
    ]);
    if (outcome === "in") return;
    if (outcome === "timeout") throw new Error(`Sign-in for ${email} neither left /sign-in nor showed a refusal within 60 s`);
    const message = (await refusal.textContent())?.trim() ?? "";
    if (!message.includes("Too many sign-in attempts") || attempt >= attempts) throw new Error(`Sign-in refused for ${email}: ${message}`);
    await page.waitForTimeout(SIGN_IN_WINDOW_MS);
  }
}

export function ensureDemoStudy(slug: string, capMinutes: number): void {
  const run = spawnSync("npx", ["tsx", "scripts/content/seed-demo-study.ts", `--slug=${slug}`, `--cap-minutes=${capMinutes}`, `--battery-version=${BATTERY_VERSION}`], { encoding: "utf8", shell: true });
  if (run.status !== 0) throw new Error(`Demo study ${slug} could not be seeded: ${run.stderr}`);
}

export async function missingBatteryImages(slug: string): Promise<string[]> {
  const found = await db().query<{ path: string }>(
    `SELECT DISTINCT found #>> '{}' AS path FROM assessment_items ai
       JOIN study_assessments sa ON sa.assessment_id = ai.assessment_id
       JOIN studies st ON st.id = sa.study_id AND st.slug = $1
       CROSS JOIN LATERAL jsonb_path_query(ai.config, 'strict $.**.path') AS found
      WHERE jsonb_typeof(found) = 'string' AND found #>> '{}' LIKE '/%'`,
    [slug],
  );
  return found.rows.map((row) => row.path).filter((path) => !existsSync(`public${path}`));
}

export async function batteryDriftFromGenerated(slug: string): Promise<string[]> {
  const generated = JSON.parse(readFileSync("db/seeds/study-test-items.generated.json", "utf8")) as { code: string; items: { itemKey: string; prompt: string }[] }[];
  const expected = generated.flatMap((assessment) => assessment.items.map((item) => `${assessment.code} ${item.itemKey} ${item.prompt}`)).sort();
  const found = await db().query<{ line: string }>(
    `SELECT a.code || ' ' || ai.item_key || ' ' || ai.prompt AS line FROM assessment_items ai
       JOIN assessments a ON a.id = ai.assessment_id
       JOIN study_assessments sa ON sa.assessment_id = a.id
       JOIN studies st ON st.id = sa.study_id AND st.slug = $1
      WHERE a.version = $2 AND a.config ? 'generatedFrom'`,
    [slug, BATTERY_VERSION],
  );
  const seeded = found.rows.map((row) => row.line).sort();
  return [...expected.filter((line) => !seeded.includes(line)).map((line) => `missing: ${line}`), ...seeded.filter((line) => !expected.includes(line)).map((line) => `extra: ${line}`)];
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
