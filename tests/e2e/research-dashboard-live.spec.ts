/**
 * Research dashboard live updates (docs/research/design-process/modules/research-dashboard.md):
 * a telemetry event inserted AFTER the page has loaded appears without a manual reload, pushed
 * through NOTIFY → SSE → router.refresh(), in under 2 s (measured three times; the times are
 * printed), and the dashboard's responses (page, probe, stream, CSV) carry no-store.
 *
 * Runs against the dev server and database (PLAYWRIGHT_BASE_URL). Demo data only: the demo
 * fixture study of ./study-fixtures.ts, a throwaway researcher account (scripts/create-admin.ts),
 * and the inserted event is purged afterwards with a recorded purge reason.
 */
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { closeDb, db, ensureE2eStudy, retireE2eStaff } from "./study-fixtures";

test.describe.configure({ timeout: 300_000 });
test.use({ navigationTimeout: 180_000 });

const PASSWORD = `e2e-${randomBytes(12).toString("hex")}`;
const STAFF = `e2e-dashboard-${randomBytes(3).toString("hex")}@example.test`;
const TARGET_MS = 2_000;
const inserted: string[] = [];

test.beforeAll(() => {
  execFileSync(process.execPath, ["--import", "tsx", "scripts/create-admin.ts", "--email", STAFF, "--name", "E2E Dashboard", "--role", "researcher"], {
    env: { ...process.env, ADMIN_PASSWORD: PASSWORD },
    stdio: "pipe",
  });
});

test.afterAll(async () => {
  if (inserted.length) {
    const c = await db().connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT set_config('app.telemetry_purge_reason', 'e2e dashboard live-update check (demo data)', true)");
      await c.query("DELETE FROM telemetry_events WHERE event_id = ANY($1::uuid[])", [inserted]);
      await c.query("COMMIT");
    } finally {
      c.release();
    }
  }
  await retireE2eStaff();
  await closeDb();
});

test("new telemetry appears without a reload, and nothing is cached", async ({ page }) => {
  const studyId = await ensureE2eStudy();
  const s = await db().query<{ id: string; participant_id: string; condition_id: string; code: string; next_seq: number; events: number }>(
    `SELECT ss.id, ss.participant_id, ss.condition_id, p.code,
            coalesce((SELECT max(seq) + 1 FROM telemetry_events te WHERE te.session_id = ss.id), 0) AS next_seq,
            (SELECT count(*)::int FROM telemetry_events te WHERE te.session_id = ss.id) AS events
       FROM study_sessions ss JOIN participants p ON p.id = ss.participant_id
      WHERE ss.study_id = $1 AND ss.condition_id IS NOT NULL AND ss.status = 'in_progress' AND NOT ss.excluded AND NOT ss.withdrawn
      ORDER BY p.code LIMIT 1`,
    [studyId],
  );
  const session = s.rows[0];
  test.skip(!session, "the demo fixture study has no allocated in-progress session (run the study-journey e2e first)");

  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(STAFF);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"), { timeout: 120_000 });

  const response = await page.goto(`/research/dashboard?study=${studyId}`);
  expect(response?.headers()["cache-control"] ?? "").toMatch(/no-store|private|no-cache/);
  await expect(page.getByTestId("dashboard-updated")).toHaveAttribute("data-mode", "live", { timeout: 60_000 });
  const eventsCell = page.getByRole("row", { name: new RegExp(`^${session!.code}\\b`) }).getByRole("cell").nth(3);
  await expect(eventsCell).toHaveText(String(session!.events));

  // The live probe and the CSV: same permission check, never cached.
  const probe = await page.request.get(`/api/research/dashboard?study=${studyId}`);
  expect(probe.status()).toBe(200);
  expect(probe.headers()["cache-control"]).toBe("no-store");
  const csv = await page.request.get(`/research/dashboard/csv?study=${studyId}&table=dashboard_telemetry_sessions`);
  expect(csv.status()).toBe(200);
  expect(csv.headers()["cache-control"]).toBe("no-store");
  // The stream: event-stream, no-store (read the headers, then abort).
  const stream = await page.evaluate(async (url) => {
    const ac = new AbortController();
    const r = await fetch(url, { signal: ac.signal });
    const out = { status: r.status, type: r.headers.get("content-type"), cache: r.headers.get("cache-control") };
    ac.abort();
    return out;
  }, `/api/research/dashboard/stream?study=${studyId}`);
  expect(stream).toEqual({ status: 200, type: "text/event-stream; charset=utf-8", cache: "no-store" });

  const latencies: number[] = [];
  for (let i = 0; i < 3; i++) {
    const eventId = randomUUID();
    await db().query(
      `INSERT INTO telemetry_events (event_id, schema_version, study_id, participant_id, session_id, condition_id, client_ts, seq, event_type_code, metadata, app_build, content_version)
       VALUES ($1, 1, $2, $3, $4, $5, now(), $6, 'guidance_cue_used', '{"action": "dismissed"}', 'e2e', 'demo-snapshot-v1')`,
      [eventId, studyId, session!.participant_id, session!.id, session!.condition_id, session!.next_seq + i],
    );
    inserted.push(eventId);
    const t0 = Date.now();
    await expect(eventsCell).toHaveText(String(session!.events + i + 1), { timeout: 15_000 });
    latencies.push(Date.now() - t0);
    await page.waitForTimeout(1_500);
  }
  console.log(`insert-to-UI latency (ms): ${latencies.join(", ")}`);
  expect([...latencies].sort((a, b) => a - b)[1]!).toBeLessThan(TARGET_MS);

  // Fallback: with the stream unreachable the page switches to polling the fingerprint.
  await page.route("**/api/research/dashboard/stream**", (route) => route.abort());
  await page.reload();
  await expect(page.getByTestId("dashboard-updated")).toHaveAttribute("data-mode", "polling", { timeout: 30_000 });
  await expect(page.getByTestId("dashboard-updated")).not.toContainText("Stale");
});
