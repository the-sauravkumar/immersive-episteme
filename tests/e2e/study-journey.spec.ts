import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect as baseExpect, newContext, test, type Browser, type Page } from "./fixtures";
import { hardwareGpu } from "./gpu-mode";
import { batteryDriftFromGenerated, closeDb, db, ensureDemoStudy, JOURNEY_STUDY, CAP_STUDY, missingBatteryImages, sessionByCode } from "./study-fixtures";
import { answerAssessment, enrol, linkConceptMap, shot, SHOTS, throughConsentToAllocation, throughPracticeToLearning, watch, type Journey } from "./study-steps";

test.describe.configure({ mode: "serial", timeout: 2_400_000 });
test.use({ actionTimeout: 60_000 });
const expect = baseExpect.configure({ timeout: 90_000 });

const STOPS_PER_TRADITION = 10;
const TRADITIONS = 1;
const REQUIRED_STOPS = STOPS_PER_TRADITION * TRADITIONS;
const STUDY_TRADITIONS = ["ajrakh", "machilipatnam-kalamkari", "sanganeri"];

async function assertOtherDoorShut(page: Page, door: Journey["door"]): Promise<void> {
  const other = door === "2d" ? "/learn/immersive" : "/learn/2d";
  await page.goto(other);
  await page.waitForLoadState("domcontentloaded");
  await expect.poll(() => new URL(page.url()).pathname).not.toBe(other);
  await page.waitForLoadState("networkidle");
  await page.goto(`${other}/practice`);
  await expect.poll(() => new URL(page.url()).pathname).not.toBe(`${other}/practice`);
  await page.waitForLoadState("networkidle");
}

async function stopsRefusedAhead(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const response = await fetch("/api/study/learning-progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "stage_entered", stage: { traditionKey: "ajrakh", stageKey: "products", stageNumber: 10 } }),
    });
    return response.status;
  });
}

async function walkCourse(page: Page, journey: Journey): Promise<void> {
  const root = page.locator("[data-course-root]:visible");
  await expect(root).toBeVisible();
  await expect(page.locator("button.segment[data-state=ahead]:visible")).toHaveCount(0);
  for (let tradition = 0; tradition < TRADITIONS; tradition++) {
    for (let panel = 1; panel <= STOPS_PER_TRADITION - 1; panel++) {
      await expect(root).toHaveAttribute("data-panel", String(panel));
      if (tradition === 0) await shot(page, journey, `door1-stage-${panel}`);
      if (tradition === 0 && panel === 2) {
        await page.locator(".step-button:not(.step-next):visible").click();
        await expect(root).toHaveAttribute("data-panel", "1");
        await page.locator(".step-next:visible").click();
        await expect(root).toHaveAttribute("data-panel", "2");
      }
      await expect(page.locator(".step-next:visible")).toBeEnabled();
      await page.locator(".step-next:visible").click();
    }
    await expect(root).toHaveAttribute("data-panel", "product");
    await shot(page, journey, `door1-product-${tradition}`);
    await expect(page.locator(".step-next:visible")).toBeEnabled();
    await page.locator(".step-next:visible").click();
  }
}

async function walkYards(page: Page, journey: Journey): Promise<void> {
  const session = page.locator("[data-slot=walkthrough-session]:visible");
  await expect(session).toBeVisible();
  const label = page.locator(".walkthrough-route p span");
  for (let tradition = 0; tradition < TRADITIONS; tradition++) {
    await expect(session.locator("canvas")).toHaveCount(1, { timeout: 180_000 });
    await expect(page.locator(".walkthrough-cover")).toHaveCount(0, { timeout: 180_000 });
    for (let station = 1; station <= STOPS_PER_TRADITION - 1; station++) {
      await expect(label).toHaveText(`Station ${station} Of ${STOPS_PER_TRADITION - 1}`, { timeout: 180_000 });
      if (tradition === 0 && (station === 1 || station === 2)) await shot(page, journey, `door2-station-${station}`, [1366]);
      if (tradition === 0 && station === 2) {
        await page.waitForTimeout(15_000);
        await page.getByRole("button", { name: "Back", exact: true }).click();
        await expect(label).toHaveText("Station 1 Of 9", { timeout: 180_000 });
        await page.waitForTimeout(25_000);
        await page.getByRole("button", { name: "Walk On" }).click();
        await expect(label).toHaveText("Station 2 Of 9", { timeout: 180_000 });
        await page.waitForTimeout(15_000);
      }
      await page.getByRole("button", { name: "Walk On" }).click();
    }
    await expect(page.getByRole("button", { name: /Questions/ })).toBeVisible({ timeout: 180_000 });
    await expect(page.getByRole("button", { name: /Next Tradition/ })).toHaveCount(0);
    await shot(page, journey, `door2-hall-${tradition}`, [1366]);
    await page.getByRole("button", { name: /Next Tradition|Questions/ }).click();
  }
}

async function runJourney(browser: Browser, door: Journey["door"]): Promise<{ code: string; sessionId: string; journey: Journey } | null> {
  const { page, code, journey: partial } = await enrol(browser, JOURNEY_STUDY);
  const assigned = await throughConsentToAllocation(page, { ...partial, label: door === "2d" ? "door1" : "door2" });
  if (assigned !== door) {
    await page.context().close();
    return null;
  }
  const journey: Journey = { ...partial, door, label: door === "2d" ? "door1" : "door2" };
  watch(page, journey);
  const practice = door === "2d" ? /\/learn\/2d\/practice/ : /\/learn\/immersive\/practice/;
  await expect(page).toHaveURL(practice);
  const session = await sessionByCode(code, JOURNEY_STUDY);
  await assertOtherDoorShut(page, door);
  await page.goto(door === "2d" ? "/learn/2d/practice" : "/learn/immersive/practice");
  if (door === "2d") {
    await expect(page.locator("[data-panel=practice]")).toBeVisible();
    await shot(page, journey, "practice-door1");
    await page.locator(".step-next:visible").click();
    await page.locator(".step-next:visible").click();
    await page.locator(".step-next:visible").click();
  } else {
    await expect(page.locator("[data-slot=walkthrough-practice] canvas")).toHaveCount(1, { timeout: 180_000 });
    await expect(page.locator(".walkthrough-cover")).toHaveCount(0, { timeout: 180_000 });
    await page.waitForTimeout(1500);
    await shot(page, journey, "practice-door2", [1366]);
    await page.getByRole("button", { name: "Finish Practice" }).click();
  }
  await expect(page).toHaveURL(/\/study\/task/);
  await shot(page, journey, "introduction");
  await page.getByRole("button", { name: "Start the learning task" }).click();
  await expect(page).toHaveURL(door === "2d" ? /\/learn\/2d$/ : /\/learn\/immersive$/);
  expect(await stopsRefusedAhead(page)).toBe(409);
  const started = Date.now();
  if (door === "2d") await walkCourse(page, journey);
  else await walkYards(page, journey);
  const learningMinutes = (Date.now() - started) / 60_000;
  await expect(page).toHaveURL(/questionnaire\/after-learning/, { timeout: 120_000 });
  process.stdout.write(`[journey] ${door} learning walk took ${learningMinutes.toFixed(1)} min\n`);

  const title = page.locator("#assessment-title");
  const map = page.getByRole("form", { name: "Add a relationship" });
  const away = page.getByRole("heading", { name: /^Come Back In \d+ Days?$/ });
  for (;;) {
    await expect(title.or(map).or(away).first()).toBeVisible();
    if (await away.isVisible()) break;
    if (await map.isVisible()) await linkConceptMap(page, journey);
    else await answerAssessment(page, journey, new URL(page.url()).pathname.split("/").pop() ?? "step");
  }
  await expect(away).toBeVisible();
  await shot(page, journey, "delayed-return-screen");

  const opened = await db().query("UPDATE delayed_test_schedule SET opens_at = now() - interval '1 hour', due_at = now() WHERE session_id = $1", [session.sessionId]);
  expect(opened.rowCount).toBe(1);
  const later = await newContext(browser, { viewport: { width: 1366, height: 768 } });
  const back = await later.newPage();
  watch(back, journey);
  await back.goto(`/study/return?study=${encodeURIComponent(JOURNEY_STUDY)}&code=${encodeURIComponent(code)}`);
  await shot(back, journey, "return-form");
  await back.getByRole("button", { name: "Continue" }).click();
  await expect(back).toHaveURL(/delayed-test/);
  const finish = back.getByRole("button", { name: "Finish and submit" });
  const delayedTitle = back.locator("#assessment-title");
  for (;;) {
    await expect(delayedTitle.or(finish).first()).toBeVisible();
    if (await finish.isVisible()) break;
    await answerAssessment(back, journey, "delayed");
  }
  await shot(back, journey, "finish");
  await finish.click();
  await expect(back).toHaveURL(/\/study\/complete/);
  await shot(back, journey, "complete");
  await page.context().close();
  await later.close();
  return { code, sessionId: session.sessionId, journey };
}

async function provePersisted(sessionId: string, door: Journey["door"]): Promise<void> {
  const visits = await db().query<{ tradition_key: string; stage_key: string; visits: number; active: number | null }>(
    "SELECT tradition_key, stage_key, count(*)::int AS visits, sum(active_ms)::int AS active FROM stage_visits WHERE session_id = $1 GROUP BY 1, 2",
    [sessionId],
  );
  expect(visits.rows.length).toBe(REQUIRED_STOPS);
  expect(visits.rows.filter((row) => row.stage_key === "products").length).toBe(TRADITIONS);
  const assigned = await db().query<{ tradition: string; task_code: string }>("SELECT ss.tradition, a.task_code FROM study_sessions ss JOIN allocations a ON a.id = ss.allocation_id WHERE ss.id = $1", [sessionId]);
  expect(STUDY_TRADITIONS).toContain(assigned.rows[0]!.tradition);
  expect(assigned.rows[0]!.task_code).toBe(assigned.rows[0]!.tradition);
  expect(new Set(visits.rows.map((row) => row.tradition_key))).toEqual(new Set([assigned.rows[0]!.tradition]));
  const offered = await db().query<{ tradition: string | null }>(
    `SELECT DISTINCT i.config->'target'->>'tradition' AS tradition FROM responses r JOIN assessment_items i ON i.id = r.item_id
      WHERE r.session_id = $1 AND i.config->'target'->>'tradition' = ANY($2::text[])`,
    [sessionId, STUDY_TRADITIONS],
  );
  expect(offered.rows.map((row) => row.tradition)).toEqual([assigned.rows[0]!.tradition]);
  expect(visits.rows.some((row) => row.visits > 1)).toBe(true);
  expect(visits.rows.filter((row) => row.active === null)).toEqual([]);
  const budget = await db().query<{ learning_budget_seconds: number; ended: boolean }>("SELECT learning_budget_seconds, learning_ended_at IS NOT NULL AS ended FROM study_sessions WHERE id = $1", [sessionId]);
  expect(budget.rows[0]).toEqual({ learning_budget_seconds: 1800, ended: true });
  const events = await db().query<{ code: string; n: number }>("SELECT event_type_code AS code, count(*)::int AS n FROM telemetry_events WHERE session_id = $1 GROUP BY 1 ORDER BY 1", [sessionId]);
  const counts = Object.fromEntries(events.rows.map((row) => [row.code, row.n]));
  process.stdout.write(`[journey] ${door} telemetry ${JSON.stringify(counts)}\n`);
  expect(counts.stage_entered).toBeGreaterThanOrEqual(REQUIRED_STOPS);
  expect(counts.stage_left).toBeGreaterThanOrEqual(REQUIRED_STOPS);
  if (door === "immersive") {
    expect(counts.path_sampled ?? 0).toBeGreaterThan(0);
    expect(counts.movement_summary ?? 0).toBeGreaterThan(0);
  }
  const quarantined = await db().query<{ n: number }>("SELECT count(*)::int AS n FROM telemetry_quarantine WHERE session_id = $1", [sessionId]);
  expect(quarantined.rows[0]!.n).toBe(0);
}

test.beforeAll(async () => {
  ensureDemoStudy(JOURNEY_STUDY, 30);
  ensureDemoStudy(CAP_STUDY, 2);
  for (const slug of [JOURNEY_STUDY, CAP_STUDY]) {
    expect(await missingBatteryImages(slug), `images the pinned test battery of ${slug} shows but public/ lacks`).toEqual([]);
    expect(await batteryDriftFromGenerated(slug), `items of ${slug} that differ from db/seeds/study-test-items.generated.json`).toEqual([]);
  }
});

test.afterAll(async () => {
  await closeDb();
});

for (const door of ["2d", "immersive"] as const) {
  test(`whole journey through ${door === "2d" ? "Door 1" : "Door 2"}`, async ({ browser }) => {
    test.skip(door === "immersive" && !hardwareGpu(), "Door 2 draws the walk only on a hardware GPU; this runner renders WebGL in software");
    let result: Awaited<ReturnType<typeof runJourney>> = null;
    for (let attempt = 0; attempt < 6 && !result; attempt++) result = await runJourney(browser, door);
    expect(result, "no participant was allocated this door").not.toBeNull();
    const { sessionId, journey } = result!;
    await provePersisted(sessionId, door);
    if (SHOTS) writeFileSync(join(SHOTS, `${journey.label}-problems.json`), JSON.stringify(journey.problems, null, 2));
    expect(journey.problems).toEqual([]);
  });
}

test("the server ends learning at the cap whatever the page does", async ({ browser }) => {
  const { page, code, journey } = await enrol(browser, CAP_STUDY);
  const door = await throughConsentToAllocation(page, { ...journey, label: "cap" });
  await throughPracticeToLearning(page, door);
  const { sessionId } = await sessionByCode(code, CAP_STUDY);
  const clock = await db().query<{ learning_budget_seconds: number; learning_ends_at: Date }>("SELECT learning_budget_seconds, learning_ends_at FROM study_sessions WHERE id = $1", [sessionId]);
  expect(clock.rows[0]!.learning_budget_seconds).toBe(120);
  const context = page.context();
  const ajax = await context.newPage();
  await ajax.goto("/favicon.ico");
  await page.close();
  await ajax.waitForTimeout(Math.max(0, clock.rows[0]!.learning_ends_at.getTime() - Date.now()) + 2000);
  const late = await ajax.evaluate(async () => {
    const response = await fetch("/api/study/learning-progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "finish" }),
    });
    return { status: response.status, body: (await response.json()) as { ok: boolean; next?: string } };
  });
  expect(late).toEqual({ status: 200, body: { ok: true, next: "/study/session" } });
  const ended = await db().query<{ learning_ended_at: Date | null; visits: number }>(
    "SELECT learning_ended_at, (SELECT count(*)::int FROM stage_visits v WHERE v.session_id = s.id) AS visits FROM study_sessions s WHERE id = $1",
    [sessionId],
  );
  expect(ended.rows[0]!.learning_ended_at).not.toBeNull();
  expect(ended.rows[0]!.visits).toBeLessThan(REQUIRED_STOPS);
  const refused = await ajax.evaluate(async () => {
    const response = await fetch("/api/study/learning-progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "stage_entered", stage: { traditionKey: "ajrakh", stageKey: "ajrakh.s1", stageNumber: 1 } }),
    });
    return response.status;
  });
  expect(refused).toBe(409);
  await ajax.goto("/learn/2d");
  await expect.poll(() => new URL(ajax.url()).pathname).not.toBe("/learn/2d");
  await context.close();
});
