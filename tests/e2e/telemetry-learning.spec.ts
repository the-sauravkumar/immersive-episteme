/**
 * Telemetry from the learning conditions reaches the database intact, in both conditions:
 * a participant spends real time on the learning page, then leaves it with a full page load
 * (the case where the last events are beaconed while the page unloads). The session must end up
 * with learning-page events stored and no event quarantined (in particular no `seq_conflict`,
 * docs/architecture/data-and-telemetry-layer.md §4b).
 */
import { expect as baseExpect, test, type Page } from "@playwright/test";

import { E2E_STUDY_CODE, backdateFamiliarisation, closeDb, db, ensureE2eStudy, participantByCode } from "./study-fixtures";

// The study device check refuses a software renderer for the immersive condition (DR-029,
// gpu-acceptance.ts), so an immersive participant passes it only on a hardware GPU: with PW_GPU set,
// the config's GPU launch (playwright.config.ts) is kept. Without it, headless Chromium exposes WebGL
// only through SwiftShader, which reaches the device check but not the immersive condition.
if (!process.env.PW_GPU) test.use({ launchOptions: { args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] } });
test.describe.configure({ mode: "serial", timeout: 420_000 });
const expect = baseExpect.configure({ timeout: 60_000 });

test.beforeAll(async () => {
  await ensureE2eStudy();
});
test.afterAll(async () => {
  await closeDb();
});

async function answerQuestionnaire(page: Page, path: RegExp) {
  await expect(page).toHaveURL(path);
  await page.getByLabel(/^3/).check();
  await page.getByRole("button", { name: "Submit answers" }).click();
}

/** Enrol, consent, blind steps and allocation, up to the onboarding page. */
async function toOnboarding(page: Page): Promise<string> {
  await page.goto("/study");
  await page.getByLabel("Study code").fill(E2E_STUDY_CODE);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/study\/consent$/);
  const code = (await page.locator("span.text-id").first().textContent())?.trim() ?? "";
  await page.getByLabel(/I have read the information above/).check();
  await page.getByRole("button", { name: "I agree to take part" }).click();
  await answerQuestionnaire(page, /\/study\/questionnaire\/before$/);
  await expect(page).toHaveURL(/\/study\/pre-test$/);
  await page.getByLabel("Demo option A").check();
  await page.getByRole("button", { name: "Submit answers" }).click();
  // Allocation, then the display and device check (WP4), then the familiarisation practice (D5),
  // which cannot be skipped: its minutes are backdated, as in study-journey.spec.ts.
  await expect(page).toHaveURL(/\/study\/device-check$/);
  await page.getByRole("button", { name: "Check and continue" }).click();
  await expect(page).toHaveURL(/\/learn\/(2d|immersive)\/practice$/);
  await backdateFamiliarisation(code);
  await page.goto("/study/session");
  await expect(page).toHaveURL(/\/study\/task$/);
  return code;
}

async function sessionTelemetry(sessionId: string) {
  // Give in-flight uploads (beacons on unload, the next page's resend) time to land.
  await new Promise((r) => setTimeout(r, 4000));
  const events = await db().query<{ room_or_page_id: string | null; event_type_code: string }>(
    "SELECT room_or_page_id, event_type_code FROM telemetry_events WHERE session_id = $1 ORDER BY seq",
    [sessionId],
  );
  const quarantined = await db().query<{ reason: string }>("SELECT reason FROM telemetry_quarantine WHERE session_id = $1", [sessionId]);
  return { events: events.rows, quarantined: quarantined.rows.map((r) => r.reason) };
}

test("learning-page telemetry is stored without conflicts in both conditions", async ({ browser }) => {
  const seen = new Set<string>();
  for (let attempt = 0; attempt < 10 && seen.size < 2; attempt++) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const code = await toOnboarding(page);
    const row = await participantByCode(code);
    const condition = row.condition!;
    if (seen.has(condition)) {
      await context.close();
      continue;
    }
    seen.add(condition);
    const learnPath = condition === "immersive_3d" ? "/learn/immersive" : "/learn/2d";
    await page.getByRole("button", { name: "Start the learning task" }).click();
    await page.waitForURL((u) => u.pathname.startsWith(learnPath), { timeout: 60_000 });
    if (condition === "conventional_2d") {
      // Open a tradition and keep its claims in view.
      await page.locator("main a[href^='/learn/2d/traditions/']").first().click();
      await page.waitForURL(/\/learn\/2d\/traditions\//);
      await page.mouse.wheel(0, 600);
    } else {
      // Headless Chromium without PW_GPU renders in software, which the museum refuses by design (a
      // designed fallback, not a blank page). With a GPU the museum starts, and the fixture study's
      // placeholder manifest has no rooms, so it shows its designed failure screen. Either way the
      // page's telemetry must arrive intact.
      await expect(
        page.getByTestId("museum-root").or(page.getByRole("heading", { name: /Cannot Show the 3D Museum|The Museum Could Not Load/i })),
      ).toBeVisible();
    }
    await page.waitForTimeout(6000);
    await page.screenshot({ path: `test-results/diag-${condition}.png` });
    // Leave with a full page load: the learning page's last events go out as it unloads.
    await page.goto("/study/session");
    await expect(page).toHaveURL(/\/study\/questionnaire\/after-learning$/);

    const t = await sessionTelemetry(row.sessionId!);
    const learningEvents = t.events.filter((e) => !(e.room_or_page_id ?? "").startsWith("study:"));
    expect(learningEvents.length, `${condition}: learning-page events stored`).toBeGreaterThan(0);
    expect(t.quarantined, `${condition}: quarantined events`).toEqual([]);
    test.info().annotations.push({ type: condition, description: `${t.events.length} events stored (${learningEvents.length} from learning pages); types: ${[...new Set(t.events.map((e) => e.event_type_code))].join(", ")}` });
    await context.close();
  }
  expect([...seen].sort()).toEqual(["conventional_2d", "immersive_3d"]);
});
