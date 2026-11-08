import { randomBytes, randomUUID } from "node:crypto";

import { expect, test } from "./fixtures";

import { closeDb, createE2eStaff, db, ensureDemoStudy, JOURNEY_STUDY, retireE2eStaff, signInStaff } from "./study-fixtures";
import { enrol, throughConsentToAllocation } from "./study-steps";

test.describe.configure({ timeout: 600_000 });
test.use({ navigationTimeout: 180_000 });

const PASSWORD = `e2e-${randomBytes(12).toString("hex")}`;
const STAFF = `e2e-dashboard-${randomBytes(3).toString("hex")}@example.test`;
const TARGET_MS = 2_000;
const inserted: string[] = [];

test.beforeAll(() => {
  createE2eStaff(STAFF, "E2E Dashboard", "researcher", PASSWORD);
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
  await retireE2eStaff(undefined, [STAFF]);
  await closeDb();
});

async function inProgressSession(studyId: string, code: string) {
  const s = await db().query<{ id: string; participant_id: string; condition_id: string; code: string; next_seq: number; events: number }>(
    `SELECT ss.id, ss.participant_id, ss.condition_id, p.code,
            coalesce((SELECT max(seq) + 1 FROM telemetry_events te WHERE te.session_id = ss.id), 0) AS next_seq,
            (SELECT count(*)::int FROM telemetry_events te WHERE te.session_id = ss.id) AS events
       FROM study_sessions ss JOIN participants p ON p.id = ss.participant_id
      WHERE ss.study_id = $1 AND ss.condition_id IS NOT NULL AND ss.status = 'in_progress' AND NOT ss.excluded AND NOT ss.withdrawn AND p.code = $2`,
    [studyId, code],
  );
  return s.rows[0];
}

test("new telemetry appears without a reload, and nothing is cached", async ({ page, browser }) => {
  ensureDemoStudy(JOURNEY_STUDY, 30);
  const studyId = (await db().query<{ id: string }>("SELECT id FROM studies WHERE slug = $1", [JOURNEY_STUDY])).rows[0]!.id;
  const enrolled = await enrol(browser, JOURNEY_STUDY);
  await throughConsentToAllocation(enrolled.page, { ...enrolled.journey, label: "dashboard" });
  await enrolled.page.context().close();
  const session = await inProgressSession(studyId, enrolled.code);
  expect(session, "the allocated in-progress demo session this test enrolled").toBeDefined();

  await signInStaff(page, STAFF, PASSWORD);

  const response = await page.goto(`/research/dashboard?study=${studyId}`);
  expect(response?.headers()["cache-control"] ?? "").toMatch(/no-store|private|no-cache/);
  await expect(page.getByTestId("dashboard-updated")).toHaveAttribute("data-mode", "live", { timeout: 60_000 });
  const eventsCell = page.getByRole("table", { name: /Per-Session Telemetry/ }).getByRole("row", { name: new RegExp(`^${session!.code}\\b`) }).getByRole("cell").nth(3);
  await expect(eventsCell).toHaveText(String(session!.events));

  const probe = await page.request.get(`/api/research/dashboard?study=${studyId}`);
  expect(probe.status()).toBe(200);
  expect(probe.headers()["cache-control"]).toBe("no-store");
  const csv = await page.request.get(`/research/dashboard/csv?study=${studyId}&table=dashboard_telemetry_sessions`);
  expect(csv.status()).toBe(200);
  expect(csv.headers()["cache-control"]).toBe("no-store");
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
    await page.evaluate(
      ([code, want]) => {
        (window as unknown as { __shownAt: Promise<number> }).__shownAt = new Promise<number>((resolve) => {
          const shows = () => [...document.querySelectorAll("tr")].some((tr) => tr.cells[0]?.textContent?.trim() === code && tr.cells[3]?.textContent?.trim() === want);
          const obs = new MutationObserver(() => {
            if (shows()) {
              obs.disconnect();
              resolve(Date.now());
            }
          });
          obs.observe(document.body, { subtree: true, childList: true, characterData: true });
          setTimeout(() => {
            obs.disconnect();
            resolve(Number.POSITIVE_INFINITY);
          }, 15_000);
        });
      },
      [session!.code, String(session!.events + i + 1)] as const,
    );
    await db().query(
      `INSERT INTO telemetry_events (event_id, schema_version, study_id, participant_id, session_id, condition_id, client_ts, seq, event_type_code, metadata, app_build, content_version)
       VALUES ($1, 1, $2, $3, $4, $5, now(), $6, 'guidance_cue_used', '{"action": "dismissed"}', 'e2e', 'demo-snapshot-v1')`,
      [eventId, studyId, session!.participant_id, session!.id, session!.condition_id, session!.next_seq + i],
    );
    inserted.push(eventId);
    const t0 = Date.now();
    const shownAt = await page.evaluate(() => (window as unknown as { __shownAt: Promise<number> }).__shownAt);
    await expect(eventsCell).toHaveText(String(session!.events + i + 1), { timeout: 15_000 });
    latencies.push(Math.max(0, shownAt - t0));
    await page.waitForTimeout(1_500);
  }
  console.log(`insert-to-UI latency (ms): ${latencies.join(", ")}`);
  expect([...latencies].sort((a, b) => a - b)[1]!).toBeLessThan(TARGET_MS);

  await page.route("**/api/research/dashboard/stream**", (route) => route.abort());
  await page.reload();
  await expect(page.getByTestId("dashboard-updated")).toHaveAttribute("data-mode", "polling", { timeout: 30_000 });
  await expect(page.getByTestId("dashboard-updated")).not.toContainText("Stale");
});
