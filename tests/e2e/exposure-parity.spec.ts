/**
 * Exposure parity (DR-050; final review equivalence-exposure-rule): the SAME scripted sequence on
 * the SAME concept in both conditions gives the same content-exposure and navigation intervals.
 *
 * Script, identical in both: open the concept's sheet; read its top for 3 s; scroll to the end of
 * the sheet (the reference list and Related Concepts) and stay 3 s; open the navigation overlay
 * (2D: Search; 3D: the full Plan) for 2 s; close it with Escape and read 2 s more; close the sheet
 * (Close in the sheet's action slot) and wait 2 s. The concept is the first station of the Ajrakh
 * process room (the parity suite's kind of concept), found from the museum probe.
 *
 * Expected in both, from the first exposure on: exposure (the concept) -> navigation (overlay) ->
 * exposure (the same concept) -> navigation (after Close); the first exposure interval covers the
 * reading AND the scrolled-to-the-end part, and the two conditions' interval lengths agree within
 * 1.5 s (the script's waits are the same; the tolerance covers the walk-free open and the
 * overlays' animation).
 *
 * Machine limits: one worker, one browser; run against the production server on :3300 on the
 * "chromium" project (full Chromium on the NVIDIA GPU, playwright.config.ts, DR-056; the museum
 * refuses software rendering in study mode, and the demo opts in with allowSoftware=1 otherwise).
 */
import { expect, newContext, test, type Page } from "./fixtures";

const MUSEUM = "/learn/immersive?allowSoftware=1&probe=1";

interface Ev {
  eventId?: string;
  type: string;
  conceptId?: string;
  occurredAt?: string;
  metadata?: Record<string, unknown>;
}

function captureTelemetry(page: Page): Ev[] {
  const events: Ev[] = [];
  const seen = new Set<string>();
  page.on("request", (req) => {
    if (!req.url().includes("/api/telemetry/batch") || req.method() !== "POST") return;
    try {
      const body = req.postDataJSON() as { events?: Ev[] };
      for (const e of body.events ?? []) {
        // A retried batch carries the same event ids: one event, not two.
        if (e.eventId && seen.has(e.eventId)) continue;
        if (e.eventId) seen.add(e.eventId);
        events.push(e);
      }
    } catch {
      /* not JSON */
    }
  });
  return events;
}

async function startDemo(page: Page) {
  await page.goto("/explore");
  await page.getByRole("button", { name: /museum/i }).click();
  await page.waitForURL(/\/learn\/immersive/, { waitUntil: "commit" });
}

async function ready(page: Page) {
  await page.waitForFunction(() => (window as unknown as { __museumInfo?: () => { ready: boolean } }).__museumInfo?.().ready === true, null, { timeout: 180_000 });
}

/** Scrolls the open sheet to its end (its reference list and Related Concepts), in its own scroll container. */
async function scrollSheetToEnd(page: Page, sheet: string) {
  await page.locator(sheet).evaluate((el) => {
    const last = el.lastElementChild ?? el;
    last.scrollIntoView({ block: "end" });
  });
}

/** The exposure / navigation intervals from the first exposure of `conceptId` on. */
function intervals(events: readonly Ev[], conceptId: string) {
  const timing = events.filter((e) => /^(exposure|navigation)_(started|ended)$/.test(e.type));
  const from = timing.findIndex((e) => e.type === "exposure_started" && e.conceptId === conceptId);
  return from < 0 ? [] : timing.slice(from);
}
const shape = (es: readonly Ev[]) => es.map((e) => (e.type.startsWith("exposure") ? `${e.type}:${e.conceptId === undefined ? "?" : "concept"}` : e.type));
const activeMs = (es: readonly Ev[]) => es.filter((e) => e.type === "exposure_ended").map((e) => Number(e.metadata?.activeMs ?? NaN));

const EXPECTED = [
  "exposure_started:concept",
  "exposure_ended:concept",
  "navigation_started",
  "navigation_ended",
  "exposure_started:concept",
  "exposure_ended:concept",
  "navigation_started",
];

test.describe.configure({ mode: "serial" });
test.setTimeout(15 * 60_000);

test("the same script gives the same exposure and navigation intervals in 2D and 3D (DR-050)", async ({ browser }) => {
  const context = await newContext(browser, { viewport: { width: 1280, height: 800 } });

  // ----- 3D -----
  const page3d = await context.newPage();
  const events3d = captureTelemetry(page3d);
  await startDemo(page3d);
  await page3d.goto(MUSEUM);
  await ready(page3d);
  const renderer = await page3d.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl2");
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    return ext && gl ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "unknown";
  });
  console.log(JSON.stringify({ renderer }));
  const exhibitId = await page3d.evaluate(async () => {
    const p = (window as unknown as { __museumProbe: { viewpoints(): { id: string; roomId: string; kind: string }[]; stability(v: unknown, n: number): Promise<unknown> } }).__museumProbe;
    const v = p.viewpoints().find((x) => x.kind === "exhibit" && x.roomId === "room:ajrakh:process_sequence")!;
    await p.stability(v, 1);
    return v.id.replace(/#approach$/, "");
  });
  const railButton = page3d.locator("[data-slot=study-bar] [data-slot=rail-button]");
  if ((await railButton.getAttribute("aria-expanded")) !== "true") await railButton.click();
  await page3d.locator(`#museum-rail li button[data-exhibit-id="${exhibitId}"]`).click();
  const panel = page3d.locator("[data-slot=museum-info-panel]");
  await expect(panel).toBeVisible({ timeout: 180_000 });
  const conceptKey = await panel.locator("[data-slot=panel-concept]").first().getAttribute("data-concept-key");
  const conceptId3d = await panel.locator("[data-slot=panel-concept]").first().getAttribute("data-concept-id");
  expect(conceptKey).toBeTruthy();
  await page3d.waitForTimeout(3000);
  await scrollSheetToEnd(page3d, "[data-slot=museum-info-panel] [data-slot=knowledge-sheet]");
  await page3d.waitForTimeout(3000);
  // The full Plan over the panel: the minimap's Expand (shown beside the docked panel), else the bar's Plan then Expand.
  let expand = page3d.getByRole("button", { name: "Expand plan" });
  if (!(await expand.isVisible())) {
    await page3d.locator("[data-slot=study-bar]").getByRole("button", { name: "Plan" }).click();
    expand = page3d.getByRole("button", { name: "Expand plan" });
  }
  await expand.click();
  await expect(page3d.locator("[data-slot=museum-plan-dialog]")).toBeVisible();
  await page3d.waitForTimeout(2000);
  await page3d.keyboard.press("Escape");
  await expect(page3d.locator("[data-slot=museum-plan-dialog]")).toBeHidden();
  await expect(panel).toBeVisible();
  await page3d.waitForTimeout(2000);
  await panel.locator("[data-slot=sheet-action]").getByRole("button", { name: "Close" }).click();
  await expect(panel).toBeHidden();
  await page3d.waitForTimeout(2000);
  await expect.poll(() => shape(intervals(events3d, conceptId3d!)).length, { timeout: 60_000, intervals: [1000, 2000] }).toBeGreaterThanOrEqual(EXPECTED.length);
  const i3d = intervals(events3d, conceptId3d!).slice(0, EXPECTED.length);
  await page3d.close();

  // ----- 2D -----
  const page2d = await context.newPage();
  const events2d = captureTelemetry(page2d);
  const res = await page2d.goto(`/learn/2d/concepts/${encodeURIComponent(conceptKey!)}`);
  expect(res?.status()).toBe(200);
  const sheet2d = page2d.locator("[data-slot=knowledge-sheet]");
  await expect(sheet2d).toBeVisible();
  const conceptId2d = await page2d.locator("[data-slot=panel-concept]").first().getAttribute("data-concept-id");
  expect(conceptId2d).toBe(conceptId3d);
  await page2d.waitForTimeout(3000);
  await scrollSheetToEnd(page2d, "[data-slot=knowledge-sheet]");
  await page2d.waitForTimeout(3000);
  await page2d.locator("[data-slot=study-bar]").getByRole("button", { name: "Search" }).click();
  await expect(page2d.getByRole("dialog", { name: "Search" })).toBeVisible();
  await page2d.waitForTimeout(2000);
  await page2d.keyboard.press("Escape");
  await expect(page2d.getByRole("dialog", { name: "Search" })).toBeHidden();
  await page2d.waitForTimeout(2000);
  await page2d.locator("[data-slot=sheet-close]").click();
  await page2d.waitForURL((u) => !u.pathname.includes("/concepts/"));
  await page2d.waitForTimeout(2000);
  await expect.poll(() => shape(intervals(events2d, conceptId2d!)).length, { timeout: 60_000, intervals: [1000, 2000] }).toBeGreaterThanOrEqual(EXPECTED.length);
  const i2d = intervals(events2d, conceptId2d!).slice(0, EXPECTED.length);
  await page2d.close();
  await context.close();

  const summary = {
    concept: conceptKey,
    shape2d: shape(i2d),
    shape3d: shape(i3d),
    surfaces2d: i2d.filter((e) => e.type === "navigation_started").map((e) => e.metadata?.surface),
    surfaces3d: i3d.filter((e) => e.type === "navigation_started").map((e) => e.metadata?.surface),
    exposureActiveMs2d: activeMs(i2d),
    exposureActiveMs3d: activeMs(i3d),
  };
  console.log(JSON.stringify(summary));
  expect(summary.shape2d).toEqual(EXPECTED);
  expect(summary.shape3d).toEqual(EXPECTED);
  // The first interval covers reading the top AND the end of the sheet (about 6 s), in both.
  for (const ms of [summary.exposureActiveMs2d[0]!, summary.exposureActiveMs3d[0]!]) expect(ms).toBeGreaterThan(5500);
  for (const k of [0, 1]) expect(Math.abs(summary.exposureActiveMs2d[k]! - summary.exposureActiveMs3d[k]!)).toBeLessThan(1500);
});
