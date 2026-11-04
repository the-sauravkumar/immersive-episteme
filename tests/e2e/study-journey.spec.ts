import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect as baseExpect, newContext, test, type Browser, type Page } from "./fixtures";
import { closeDb, db, ensureDemoStudy, JOURNEY_STUDY, CAP_STUDY, sessionByCode } from "./study-fixtures";

test.describe.configure({ mode: "serial", timeout: 2_400_000 });
test.use({ actionTimeout: 60_000 });
const expect = baseExpect.configure({ timeout: 90_000 });

const SHOTS = process.env.JOURNEY_SHOTS ?? null;
const STOPS_PER_TRADITION = 10;
const TRADITIONS = 3;
const REQUIRED_STOPS = STOPS_PER_TRADITION * TRADITIONS;

interface Journey {
  readonly door: "2d" | "immersive";
  readonly label: string;
  readonly problems: string[];
  readonly seen: Set<string>;
}

async function shot(page: Page, journey: Journey, name: string, widths: readonly number[] = [1366, 400]): Promise<void> {
  const key = `${journey.label}-${name}`;
  if (journey.seen.has(key)) return;
  journey.seen.add(key);
  for (const width of widths) {
    await page.setViewportSize({ width, height: width === 400 ? 800 : 768 });
    await page.waitForTimeout(250);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 1) journey.problems.push(`${key} at ${width}: horizontal scroll ${overflow} px`);
    if (SHOTS) {
      mkdirSync(SHOTS, { recursive: true });
      await page.screenshot({ path: join(SHOTS, `${key}-${width}.png`) });
    }
  }
  await page.setViewportSize({ width: 1366, height: 768 });
}

function watch(page: Page, journey: Journey): void {
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("409")) journey.problems.push(`console: ${message.text().slice(0, 300)}`);
  });
  page.on("pageerror", (error) => journey.problems.push(`pageerror: ${error.message.slice(0, 300)}`));
  page.on("response", (response) => {
    if (response.status() >= 400 && !response.url().includes("/api/study/learning-progress")) journey.problems.push(`${response.status()} ${response.url()}`);
  });
}

async function enrol(browser: Browser, slug: string): Promise<{ page: Page; code: string; journey: Omit<Journey, "door"> }> {
  const context = await newContext(browser, { viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();
  const journey = { label: "", problems: [] as string[], seen: new Set<string>() };
  await page.goto("/study");
  await page.getByLabel("Study code").fill(slug);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/study\/consent$/);
  await expect(page.getByText(/CXA\/ETH\/01/).first()).toBeVisible();
  const code = (await page.locator("span.text-id").first().textContent())?.trim() ?? "";
  expect(code).toMatch(/^P-[0-9A-Z]{10}$/);
  return { page, code, journey };
}

async function answerVisibleQuestions(page: Page): Promise<void> {
  const fieldsets = page.locator("form fieldset:visible");
  const count = await fieldsets.count();
  for (let index = 0; index < count; index++) {
    const fieldset = fieldsets.nth(index);
    const radios = fieldset.locator("input[type=radio]");
    if ((await radios.count()) > 0) await fieldset.locator("label").first().click();
    const selects = fieldset.locator("select");
    for (let at = 0; at < (await selects.count()); at++) await selects.nth(at).selectOption({ index: at + 1 });
    const down = fieldset.getByRole("button", { name: /^Move .* down$/ }).first();
    if ((await fieldset.getByRole("button", { name: /^Move .* down$/ }).count()) > 0) await down.click();
    const canvas = fieldset.locator("canvas");
    if ((await canvas.count()) > 0) {
      await canvas.first().scrollIntoViewIfNeeded();
      const box = (await canvas.first().boundingBox())!;
      await page.mouse.move(box.x + 20, box.y + 20);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 });
      await page.mouse.up();
      await expect(fieldset.getByRole("button", { name: "Undo" })).toBeEnabled();
    }
  }
}

async function answerAssessment(page: Page, journey: Journey | Omit<Journey, "door">, step: string): Promise<void> {
  await expect(page.locator("#assessment-title")).toBeVisible();
  const title = (await page.locator("#assessment-title").textContent())?.trim().replace(/\W+/g, "-") ?? "form";
  await shot(page, journey as Journey, `${step}-${title}`);
  const submit = page.getByRole("button", { name: "Submit answers" });
  const next = page.getByRole("button", { name: "Next", exact: true });
  const legend = () => page.locator("form fieldset:visible legend").first().textContent();
  for (;;) {
    await expect(submit.or(next).first()).toBeVisible();
    await answerVisibleQuestions(page);
    if (await submit.isVisible()) break;
    const shown = await legend();
    await next.click();
    await expect
      .poll(legend, { timeout: 4000 })
      .not.toBe(shown)
      .catch(() => next.click());
  }
  const shownTitle = await page.locator("#assessment-title").textContent();
  await submit.click();
  await expect
    .poll(async () => {
      if ((await page.locator("form [role=alert]").count()) > 0) return true;
      const heading = await page.locator("#assessment-title").textContent({ timeout: 500 }).catch(() => null);
      return heading !== shownTitle;
    })
    .toBe(true);
  const alert = page.locator("form [role=alert]");
  if ((await alert.count()) > 0) throw new Error(`Form refused: ${await alert.first().textContent()}`);
}

async function linkConceptMap(page: Page, journey: Journey): Promise<void> {
  const form = page.getByRole("form", { name: "Add a relationship" });
  await expect(form).toBeVisible();
  await shot(page, journey, `reconstruction-${journey.seen.size}`);
  const selects = form.locator("select");
  await selects.nth(0).selectOption({ index: 1 });
  await selects.nth(1).selectOption({ index: 2 });
  await form.getByRole("button", { name: "Add relationship" }).click();
  await page.getByRole("button", { name: "Submit map" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Submit map" }).click();
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(800);
}

async function throughConsentToAllocation(page: Page, journey: Omit<Journey, "door">): Promise<"2d" | "immersive"> {
  await shot(page, journey as Journey, "consent");
  await page.getByLabel(/I have read the information above/).check();
  await page.getByRole("button", { name: "I agree to take part" }).click();
  await expect(page).toHaveURL(/questionnaire\/before/);
  const title = page.locator("#assessment-title");
  const check = page.getByRole("button", { name: "Check and continue" });
  const entrance = page.locator("img.walking-entrance");
  for (;;) {
    await expect(title.or(check).or(entrance).first()).toBeVisible();
    if (!(await title.isVisible())) break;
    await answerAssessment(page, journey, new URL(page.url()).pathname.includes("pre-test") ? "pre-test" : "background");
  }
  if (await check.isVisible()) {
    await shot(page, journey as Journey, "device-check");
    await check.click();
  }
  await expect(page).toHaveURL(/\/study\/entrance/);
  const image = page.locator("img.walking-entrance");
  await expect(image).toHaveAttribute("src", /entrance-closed/);
  await expect(page.getByRole("status").getByText("Both doors are shut.")).toBeVisible();
  await shot(page, journey as Journey, "entrance-shut", [1366]);
  await expect(image).toHaveAttribute("src", /entrance-open[12]/);
  const src = await image.getAttribute("src");
  return src?.includes("open1") ? "2d" : "immersive";
}

async function assertOtherDoorShut(page: Page, door: Journey["door"]): Promise<void> {
  const other = door === "2d" ? "/learn/immersive" : "/learn/2d";
  await page.goto(other);
  await page.waitForLoadState("domcontentloaded");
  await expect.poll(() => new URL(page.url()).pathname).not.toBe(other);
  await page.goto(`${other}/practice`);
  await expect.poll(() => new URL(page.url()).pathname).not.toBe(`${other}/practice`);
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
    await expect(page.getByRole("button", { name: /Next Tradition|Questions/ })).toBeVisible({ timeout: 180_000 });
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
  await shot(page, journey, "entrance-open", [1366, 400]);
  await page.getByRole("button", { name: "Continue" }).click();
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
  const away = page.getByRole("heading", { name: "Come Back In About A Week" });
  for (;;) {
    await expect(title.or(map).or(away).first()).toBeVisible();
    if (await away.isVisible()) break;
    if (await map.isVisible()) await linkConceptMap(page, journey);
    else await answerAssessment(page, journey, new URL(page.url()).pathname.split("/").pop() ?? "step");
  }
  await expect(page.getByRole("heading", { name: "Come Back In About A Week" })).toBeVisible();
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

test.beforeAll(() => {
  ensureDemoStudy(JOURNEY_STUDY, 30);
  ensureDemoStudy(CAP_STUDY, 2);
});

test.afterAll(async () => {
  await closeDb();
});

for (const door of ["2d", "immersive"] as const) {
  test(`whole journey through ${door === "2d" ? "Door 1" : "Door 2"}`, async ({ browser }) => {
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
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/practice/);
  if (door === "2d") {
    for (let i = 0; i < 3; i++) await page.locator(".step-next:visible").click();
  } else {
    await expect(page.locator(".walkthrough-cover")).toHaveCount(0, { timeout: 180_000 });
    await page.getByRole("button", { name: "Finish Practice" }).click();
  }
  await page.getByRole("button", { name: "Start the learning task" }).click();
  await expect(page).toHaveURL(/\/learn\/(2d|immersive)$/);
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
