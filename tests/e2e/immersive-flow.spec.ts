/**
 * /learn/immersive end to end (functional, no timing): the same number of onboarding screens as the
 * 2D condition (P23; today none in either, see CONDITION_ONBOARDING in museum-app.tsx),
 * keyboard-operable exhibit selection, the information panel as a placement of the shared
 * KnowledgeSheet with the same claims-only text as the 2D concept page, opaque `--ground` with no
 * backdrop filter, focus on the sheet h1, the same tab stops from the h1 to the first citation note
 * as on the 2D page (P13), Escape (focus back to the trigger), pause/resume, the §13.1 telemetry
 * vocabulary, and layout at 1280 px and 390 px (nothing overflows, every overlay control at least
 * 44 x 44, the canvas starts under the chrome and the scene reaches the bottom of the viewport).
 *
 * Runs in the default (headless) configuration: the headless shell renders WebGL with
 * SwiftShader, which the museum refuses as software rendering, so this spec opts in with
 * `?allowSoftware=1` (honoured only outside study mode). Timing and image-quality checks live in
 * immersive-rendering.spec.ts (GPU, scripts/museum/playwright.gpu.config.ts).
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import sharp from "sharp";

const MUSEUM = "/learn/immersive?allowSoftware=1&probe=1";

interface Ev {
  eventId?: string;
  type: string;
  metadata?: Record<string, unknown>;
  conceptId?: string;
  target?: string;
}

async function startDemo(page: Page) {
  await page.goto("/explore");
  await page.getByRole("button", { name: /museum/i }).click();
  await page.waitForURL(/\/learn\/immersive/, { waitUntil: "commit" });
}

function captureTelemetry(page: Page): Ev[] {
  const events: Ev[] = [];
  page.on("request", (req) => {
    if (!req.url().includes("/api/telemetry/batch") || req.method() !== "POST") return;
    try {
      const body = req.postDataJSON() as { events?: Ev[] };
      events.push(...(body.events ?? []));
    } catch {
      /* not JSON */
    }
  });
  return events;
}

async function ready(page: Page) {
  await page.waitForFunction(() => (window as unknown as { __museumInfo?: () => { ready: boolean } }).__museumInfo?.().ready === true, null, { timeout: 180_000 });
}

/** Tab presses from the focused sheet h1 until a citation note (CitationNote) has focus (P13). */
async function tabStopsToFirstNote(page: Page): Promise<number> {
  for (let n = 1; n <= 40; n++) {
    await page.keyboard.press("Tab");
    const onNote = await page.evaluate(() => {
      const el = document.activeElement;
      return !!el?.closest('ol[aria-label="Statements"]') && el.getAttribute("aria-expanded") !== null;
    });
    if (onNote) return n;
  }
  return -1;
}

/** Onboarding screens seen on entering a route, once it has settled. */
async function onboardingScreens(page: Page, path: string, settled: (p: Page) => Promise<void>): Promise<number> {
  await page.goto(path);
  await settled(page);
  return page.locator("[data-slot=onboarding]:visible").count();
}

/**
 * Waits until a telemetry batch carrying each event type has been sent. The tracker uploads every
 * 5 s (DEFAULT_FLUSH_INTERVAL_MS), but under SwiftShader a busy main thread delays a batch well
 * past that (a resume batch was seen 9 s after the click), so a fixed wait is not reliable.
 */
async function expectTelemetry(events: readonly Ev[], types: readonly string[]) {
  for (const t of types) {
    await expect.poll(() => events.some((e) => e.type === t), { message: `telemetry ${t}`, timeout: 60_000, intervals: [500, 1_000, 2_000] }).toBe(true);
  }
}

test.describe("immersive museum flow", () => {
  test.setTimeout(10 * 60_000);

  test("onboarding screens: the same count in both conditions (P23)", async ({ page }) => {
    await startDemo(page);
    const settled3d = async (p: Page) => {
      await ready(p);
      await p.waitForTimeout(500);
    };
    const settled2d = async (p: Page) => {
      await p.waitForLoadState("networkidle");
    };
    const practice3d = await onboardingScreens(page, "/learn/immersive/practice?allowSoftware=1&probe=1", settled3d);
    const learning3d = await onboardingScreens(page, MUSEUM, settled3d);
    const practice2d = await onboardingScreens(page, "/learn/2d/practice", settled2d);
    const learning2d = await onboardingScreens(page, "/learn/2d", settled2d);
    expect({ practice: practice3d, learning: learning3d }).toEqual({ practice: practice2d, learning: learning2d });
  });

  test("keyboard selection, panel equals the 2D page, telemetry vocabulary", async ({ page }) => {
    const events = captureTelemetry(page);
    await startDemo(page);
    await page.goto(MUSEUM);
    await ready(page);
    // The room name is the view's h1 in the shared StudyBar while no concept is open.
    await expect(page.locator("[data-slot=study-bar-location] h1")).toBeVisible();

    // Teleport to an exhibit's approach point in a room, then select that exhibit with the keyboard
    // only (a short walk: under SwiftShader a frame takes about 0.7 s, so long walks take minutes).
    const exhibitId = await page.evaluate(async () => {
      const p = (window as unknown as { __museumProbe: { viewpoints(): { id: string; roomId: string; kind: string }[]; stability(v: unknown, n: number): Promise<unknown> } }).__museumProbe;
      const v = p.viewpoints().find((x) => x.kind === "exhibit" && x.roomId.includes(":artisan_decisions"))!;
      await p.stability(v, 1);
      return v.id.replace(/#approach$/, "");
    });
    // The shared PlaceRail ("In This Room") is collapsed by default in 3D (DR-021): open it from
    // the StudyBar with the keyboard, then choose the exhibit's row.
    const list = page.locator("[data-slot=study-bar] [data-slot=rail-button]");
    if ((await list.getAttribute("aria-expanded")) !== "true") {
      await list.focus();
      await page.keyboard.press("Enter");
    }
    const item = page.locator(`#museum-rail li button[data-exhibit-id="${exhibitId}"]`);
    await item.focus();
    await page.keyboard.press("Enter");
    const panel = page.locator("[data-slot=museum-info-panel]");
    // The visitor turns to the exhibit first and the panel opens on arrival.
    await expect(panel).toBeVisible({ timeout: 180_000 });
    // The shared sheet, opaque --ground, no glass, focus on its h1 (P4, P27).
    await expect(panel.locator("[data-slot=knowledge-sheet]")).toHaveCount(1);
    const surface = await panel.evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, filter: getComputedStyle(el).backdropFilter }));
    expect(surface).toEqual({ bg: "rgb(255, 255, 255)", filter: "none" });
    await expect(panel.locator("[data-slot=knowledge-sheet] h1")).toBeFocused();
    // Close sits in the sheet's action slot in 3D as in 2D (DR-021); P13 counts it on both sides.
    await expect(panel.locator("[data-slot=sheet-action]").getByRole("button", { name: "Close" })).toBeVisible();
    const stops3d = await tabStopsToFirstNote(page);

    // Same claims-only text, same order, as the 2D concept page for the same concept.
    const shown = panel.locator("[data-slot=panel-concept]").first();
    const key = await shown.getAttribute("data-concept-key");
    const claimTexts = (root: Locator) => root.locator("li").evaluateAll((lis) => lis.filter((li) => li.parentElement?.matches('ol[aria-label="Statements"]')).map((li) => li.querySelector("p")?.textContent ?? ""));
    const claims3d = await claimTexts(shown);
    expect(claims3d.length).toBeGreaterThan(0);
    const page2d = await page.context().newPage();
    const res = await page2d.goto(`/learn/2d/concepts/${encodeURIComponent(key!)}`);
    expect(res?.status()).toBe(200);
    const claims2d = await claimTexts(page2d.locator("body"));
    expect(claims3d).toEqual(claims2d);
    // Same citation affordance (the shared component), collapsed by default.
    const cites3d = await shown.locator('ol[aria-label="Statements"] button[aria-expanded="false"]').count();
    const cites2d = await page2d.locator('ol[aria-label="Statements"] button[aria-expanded="false"]').count();
    expect(cites3d).toBe(cites2d);
    // P13: the same tab stops from the sheet h1 to the first citation note. The 2D page must have
    // settled first: a focus set while it still streams in lands on an h1 that is then replaced,
    // and the count starts from the document instead.
    await page2d.waitForLoadState("networkidle");
    const h1in2d = page2d.locator("[data-slot=knowledge-sheet] h1");
    await expect(async () => {
      await h1in2d.focus();
      await page2d.waitForTimeout(300);
      await expect(h1in2d).toBeFocused({ timeout: 100 });
    }).toPass({ timeout: 30_000 });
    const stops2d = await tabStopsToFirstNote(page2d);
    expect(stops3d).toBeGreaterThan(0);
    expect(stops3d).toBe(stops2d);
    await page2d.close();
    await page.bringToFront();
    await panel.locator("[data-slot=knowledge-sheet] h1").focus();

    // Escape closes the panel and returns focus to the exhibit's row.
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(item).toBeFocused();

    // Pause and resume, by keyboard. The pause screen is a labelled region, not a modal dialog: it
    // traps no focus, the StudyBar stays reachable, and what it covers is inert. Resume takes focus
    // and shows a focus indicator (WCAG 2.4.7: an outline, not only the ground-coloured halo).
    await page.getByRole("button", { name: "Pause" }).focus();
    await page.keyboard.press("Enter");
    const paused = page.getByRole("region", { name: "Paused" });
    await expect(paused).toBeVisible();
    await expect(page.locator("[aria-modal=true]")).toHaveCount(0);
    const resume = page.getByRole("button", { name: "Resume" });
    await expect(resume).toBeFocused();
    const ring = await resume.evaluate((el) => ({ visible: el.matches(":focus-visible"), style: getComputedStyle(el).outlineStyle, width: parseFloat(getComputedStyle(el).outlineWidth) }));
    expect(ring.visible).toBe(true);
    expect(ring.style).not.toBe("none");
    expect(ring.width).toBeGreaterThanOrEqual(2);
    await expect(page.locator("[data-slot=museum-overlays]")).toHaveAttribute("inert", "");
    await page.keyboard.press("Enter");
    await expect(paused).toBeHidden();

    await expectTelemetry(events, ["room_entered", "exhibit_selected", "information_layer_opened", "information_layer_closed", "concept_encountered", "exposure_started", "exposure_ended", "navigation_started", "timing_paused", "timing_resumed", "render_quality_changed"]);
    // The tier is logged once per session, and exposure is attributed to the concept shown.
    // Counted by event id: a batch the tracker retries (same ids) is one event, not two.
    expect(new Set(events.filter((e) => e.type === "render_quality_changed").map((e) => e.eventId)).size).toBe(1);
    const exposure = events.find((e) => e.type === "exposure_started");
    expect(exposure?.conceptId).toBeTruthy();
    expect(["overview", "artisan", "process", "science", "comparison"]).toContain(exposure?.metadata?.layer);
  });

  for (const width of [1280, 390]) {
    test(`overlays fit and align at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
      await startDemo(page);
      await page.goto(MUSEUM);
      await ready(page);
      const enter = page.getByRole("button", { name: "Start", exact: true });
      if (await enter.isVisible().catch(() => false)) {
        await page.screenshot({ path: `test-results/immersive-onboarding-${width}.png` });
        await enter.click();
      }
      // The canvas starts at the bottom of the chrome, and the rendered scene reaches the bottom of
      // the viewport: no flat --ground band (a canvas under the opaque chrome left one, as tall as
      // the chrome, uncomposited at its bottom in Chromium). Looking down at the floor, so the last
      // rows are floor whatever the room.
      const frame = await page.evaluate(() => {
        const c = document.querySelector("[data-testid=museum-root] canvas")!.getBoundingClientRect();
        const chrome = document.querySelector("[data-slot=museum-chrome]")!.getBoundingClientRect();
        return { canvasTop: c.top, canvasBottom: c.bottom, chromeBottom: chrome.bottom, vh: window.innerHeight };
      });
      expect(Math.abs(frame.canvasTop - frame.chromeBottom)).toBeLessThanOrEqual(1);
      expect(Math.abs(frame.canvasBottom - frame.vh)).toBeLessThanOrEqual(1);
      await page.evaluate(async () => {
        const p = (window as unknown as { __museumProbe: { viewpoints(): { kind: string; pitch: number }[]; stability(v: unknown, n: number): Promise<unknown> } }).__museumProbe;
        const v = p.viewpoints().find((x) => x.kind === "exhibit")!;
        await p.stability({ ...v, pitch: -0.9 }, 1);
      });
      const shot = await page.screenshot();
      const { data, info } = await sharp(shot).raw().toBuffer({ resolveWithObject: true });
      let ground = 0;
      let total = 0;
      for (let y = info.height - 4; y < info.height; y++)
        for (let x = 0; x < info.width; x++) {
          const i = (y * info.width + x) * info.channels;
          total++;
          if (data[i] === 245 && data[i + 1] === 241 && data[i + 2] === 232) ground++;
        }
      expect(ground / total, "share of the bottom rows in the flat --ground colour").toBeLessThan(0.2);

      await page.getByRole("button", { name: /In This Room/ }).click();
      await page.screenshot({ path: `test-results/immersive-hud-${width}.png` });
      const overflow = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
      expect(overflow.doc).toBeLessThanOrEqual(overflow.win);
      // Every visible overlay control lies inside the viewport.
      const boxes = await page.locator("[data-testid=museum-root] button:visible").evaluateAll((els) =>
        els.map((e) => {
          const r = e.getBoundingClientRect();
          return { l: r.left, r: r.right, t: r.top, b: r.bottom };
        }),
      );
      for (const b of boxes) {
        expect(b.l).toBeGreaterThanOrEqual(0);
        expect(b.r).toBeLessThanOrEqual(width + 0.5);
        // 44 x 44 targets (DESIGN.md 9.1, P9).
        expect(b.r - b.l).toBeGreaterThanOrEqual(44);
        expect(b.b - b.t).toBeGreaterThanOrEqual(44);
      }
    });
  }
});
