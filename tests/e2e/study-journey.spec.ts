/**
 * Participant journeys through the study engine, against the dev server and database, in the
 * adopted order (D3, D5, D8): enrolment, consent, questionnaire before the study, pre-test (both
 * blind to condition), allocation, display and device check, familiarisation practice
 * (content-free, timed apart from learning), onboarding, learning entry and back (the hub records
 * the end), questionnaire after learning, post-test, transfer, final questionnaire, completion;
 * plus resume, withdrawal and declining. Uses the demo fixture study of ./study-fixtures.ts.
 *
 * The display choice (DR-019) offers the High contrast accommodation once, on the consent page
 * (before the pre-test); the display and device check shows it read-only. The journey checks that
 * the check renders identically for both allocations, that it offers no second switch, and that
 * the choice is recorded on the session.
 *
 * Keyboard after a refusal (WCAG 2.4.3; DESIGN.md 9.1): a refused entry, consent or withdrawal
 * never drops focus to <body>. The submit buttons stay focusable while pending (aria-disabled),
 * and a field error moves focus to the invalid control.
 *
 * Focus (DESIGN.md 9.1, R-A5; WCAG 2.4.7): primary, outline and destructive study buttons are
 * reached with Tab and must show the visible ring (an outline, not only the ground halo), in the
 * default display and in high contrast.
 */
import { expect as baseExpect, test, type Page } from "@playwright/test";

import { PHASE_TEXT } from "../../src/features/learning/strings";

import { E2E_STUDY_CODE, backdateFamiliarisation, closeDb, db, ensureE2eStudy, participantByCode } from "./study-fixtures";

// Headless Chromium only exposes WebGL through SwiftShader when asked to.
test.use({ launchOptions: { args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] } });
test.describe.configure({ mode: "serial", timeout: 300_000 });
// A dev server compiles each route on first visit; allow for it.
const expect = baseExpect.configure({ timeout: 60_000 });

test.beforeAll(async () => {
  await ensureE2eStudy();
});
test.afterAll(async () => {
  await closeDb();
});

/**
 * Presses Tab until `target` has focus, then requires the visible focus ring: `:focus-visible`
 * matches and the outline is drawn (style not none). `minWidth` is the ring's whole band: the
 * outline plus the inner contrasting band the Atlas two-tone ring draws as a box-shadow in its
 * offset (2 px + 2 px in every theme, globals.css and DESIGN.md "Two-tone focus ring"); at least 2 px, 3 px in high contrast.
 */
async function expectFocusRing(page: Page, target: ReturnType<Page["locator"]>, minWidth = 2) {
  for (let i = 0; i < 40; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) break;
    await page.keyboard.press("Tab");
  }
  const ring = await target.evaluate((el) => {
    const cs = getComputedStyle(el);
    // The inner band: the spread of a zero-offset, zero-blur box-shadow ("<colour> 0px 0px 0px 2px").
    const spread = /0px 0px 0px (\d+(?:\.\d+)?)px/.exec(cs.boxShadow);
    return {
      focused: el === document.activeElement,
      visible: el.matches(":focus-visible"),
      style: cs.outlineStyle,
      width: parseFloat(cs.outlineWidth) + (spread ? parseFloat(spread[1]!) : 0),
    };
  });
  expect(ring.focused && ring.visible).toBe(true);
  expect(ring.style).not.toBe("none");
  expect(ring.width).toBeGreaterThanOrEqual(minWidth);
}

/** The id (or tag) of the focused element: never BODY after a refused submit. */
async function focusedId(page: Page): Promise<string> {
  return page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName || "none");
}

/** Turns the High contrast accommodation on in the study display choice (consent page). */
async function turnOnContrast(page: Page) {
  await page.locator("[data-slot=study-display-step]").getByRole("button", { name: "Display settings" }).click();
  const dialog = page.getByRole("dialog");
  // Study mode offers only the High contrast accommodation (no dark theme, no reduce motion).
  await expect(dialog.getByRole("switch")).toHaveCount(1);
  await dialog.getByRole("switch", { name: "High contrast" }).click();
  await expect(page.locator("html")).toHaveClass(/a11y-contrast/);
  await dialog.getByRole("button", { name: "Close" }).first().click();
  await expect(page.locator("[data-slot=study-contrast-state]")).toHaveText("On");
}

/** Study code -> consent -> agree. Returns the participant code shown on the consent page. */
async function enrolAndConsent(page: Page, opts: { contrast?: boolean } = {}): Promise<string> {
  await page.goto("/study");
  await page.getByLabel("Study code").fill(E2E_STUDY_CODE);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/study\/consent$/);
  await expect(page.getByRole("heading", { level: 2, name: /Consent \(Version demo-e2e-1\)/ })).toBeVisible();
  const code = (await page.locator("span.text-id").first().textContent())?.trim() ?? "";
  expect(code).toMatch(/^P-[0-9A-Z]{10}$/);
  // The accommodation is offered before the pre-test, with the same control as the device check.
  await expect(page.locator("[data-slot=study-display-step]").getByRole("button", { name: "Display settings" })).toBeVisible();
  await expect(page.locator("[data-slot=study-contrast-state]")).toHaveText("Off");
  if (opts.contrast) await turnOnContrast(page);
  // Keyboard: agreeing without the tick is refused and focus moves to the box, so Space ticks it.
  await page.getByRole("button", { name: "I agree to take part" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText(/Tick the box to confirm/)).toBeVisible();
  await expect.poll(() => focusedId(page)).toBe("confirm");
  await page.keyboard.press("Space");
  await expect(page.getByLabel(/I have read the information above/)).toBeChecked();
  await page.getByRole("button", { name: "I agree to take part" }).click();
  return code;
}

/** The demo questionnaire (one 5-point item) on whichever questionnaire page is showing. */
async function answerQuestionnaire(page: Page, path: RegExp) {
  await expect(page).toHaveURL(path);
  // Unanswered radios read as unanswered: an empty ring on --ground with no dot (a radio group with
  // nothing chosen matches :indeterminate, which must not paint it as selected). Once one is
  // chosen, only that radio shows the dot.
  await expectRadioMarks(page, null);
  await page.getByLabel(/^3/).check();
  await expectRadioMarks(page, "3");
  await expectFocusRing(page, page.getByRole("button", { name: "Submit answers" }));
  await page.getByRole("button", { name: "Submit answers" }).click();
}

/**
 * The radios of the questionnaire as drawn: each one's background and the scale of its dot (the
 * ::before), against the page's --ground. `checked` is the label digit of the chosen option, or null.
 */
async function expectRadioMarks(page: Page, checked: string | null) {
  const marks = await page.locator("input.ie-check[type=radio]").evaluateAll((els) => {
    const probe = document.createElement("div");
    probe.style.background = "var(--ground)";
    document.body.append(probe);
    const ground = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return els.map((el) => {
      const cs = getComputedStyle(el);
      const dot = getComputedStyle(el, "::before").transform;
      const label = (el.closest("label")?.textContent ?? "").trim();
      return { label, onGround: cs.backgroundColor === ground, dot: dot !== "none" && !/^matrix\(0, 0, 0, 0/.test(dot) };
    });
  });
  expect(marks.length).toBeGreaterThan(1);
  for (const m of marks) {
    const isChosen = checked !== null && m.label.startsWith(checked);
    expect(m, `radio "${m.label}"`).toEqual({ label: m.label, onGround: true, dot: isChosen });
  }
}

/** The display step's markup with React's generated ids normalised (they are not content). */
async function displayStepMarkup(page: Page): Promise<string> {
  const html = await page.locator("[data-slot=study-display-record]").evaluate((el) => el.outerHTML);
  return html.replace(/radix-[^"\s]*/g, "radix-id").replace(/_R_[^"\s]*_/g, "react-id").replace(/«[^»]*»/g, "react-id");
}

/**
 * The display and browser check: shows the consent-page choice read-only (no second switch), then
 * continues. `contrast` is the choice made on the consent page.
 */
async function throughDisplayCheck(page: Page, contrast: boolean): Promise<string> {
  await expect(page).toHaveURL(/\/study\/device-check$/);
  await expect(page.getByRole("heading", { level: 2, name: "Display" })).toBeVisible();
  await expect(page.locator("[data-slot=study-contrast-state]")).toHaveText(contrast ? "On" : "Off");
  await expect(page.getByRole("button", { name: "Display settings" })).toHaveCount(0);
  const markup = await displayStepMarkup(page);
  await page.getByRole("button", { name: "Check and continue" }).click();
  return markup;
}

/** Blind steps, then allocation (via /study/allocate) and the display and device check, up to the practice page. */
async function throughAllocation(
  page: Page,
  code: string,
  opts: { contrast?: boolean; onDisplayStep?: (markup: string) => void } = {},
): Promise<"conventional_2d" | "immersive_3d"> {
  await answerQuestionnaire(page, /\/study\/questionnaire\/before$/);
  await expect(page).toHaveURL(/\/study\/pre-test$/);
  expect((await participantByCode(code)).condition).toBeNull(); // still blind to condition
  // Before allocation no learning condition is reachable.
  await page.goto("/learn/2d");
  await page.waitForURL((u) => u.pathname === "/study/pre-test", { timeout: 60_000 });
  await page.getByLabel("Demo option A").check();
  await page.getByRole("button", { name: "Submit answers" }).click();
  // allocate -> display and device check -> the familiarisation practice of the assigned condition
  const markup = await throughDisplayCheck(page, opts.contrast ?? false);
  opts.onDisplayStep?.(markup);
  await expect(page).toHaveURL(/\/learn\/(2d|immersive)\/practice$/);
  const row = await participantByCode(code);
  expect(row.sessionStatus).toBe("in_progress");
  expect(row.condition).not.toBeNull();
  expect(new URL(page.url()).pathname).toBe(row.condition === "immersive_3d" ? "/learn/immersive/practice" : "/learn/2d/practice");
  return row.condition!;
}

async function learningStarted(code: string): Promise<boolean> {
  const row = await participantByCode(code);
  const r = await db().query<{ started: boolean }>("SELECT learning_started_at IS NOT NULL AS started FROM study_sessions WHERE id = $1", [row.sessionId]);
  return r.rows[0]!.started;
}

/**
 * The familiarisation step (D5): content-free practice that cannot be skipped and is not learning
 * time (the learning clock stays unset). When its minutes are over the practice page hands the
 * participant back to the session, which shows the onboarding.
 */
async function throughPractice(page: Page, code: string, condition: "conventional_2d" | "immersive_3d") {
  if (condition === "conventional_2d") {
    // The 2D practice page (WP2) shows the shared StudyBar timer and practice content; its section
    // entry may be a link or a disclosure button depending on the page layout.
    await expect(page.getByRole("timer", { name: /^Practice time left/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Practice Section 1/ }).or(page.getByRole("button", { name: /Practice Section 1/ })).first()).toBeVisible();
  }
  // The next step is not reachable before the practice is over.
  await page.goto("/study/task");
  await page.waitForURL((u) => u.pathname.endsWith("/practice"), { timeout: 60_000 });
  expect(await learningStarted(code)).toBe(false);
  await backdateFamiliarisation(code);
  await page.reload();
  await expect(page).toHaveURL(/\/study\/task$/);
  expect(await learningStarted(code)).toBe(false);
}

test("journey for each condition: blind pre-test, allocation, learning entry and back, completion", async ({ browser }) => {
  const seen = new Set<string>();
  const displayMarkup = new Map<string, string>();
  let completed = false;
  for (let attempt = 0; attempt < 6 && (seen.size < 2 || !completed); attempt++) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const code = await enrolAndConsent(page);
    let markup = "";
    const condition = await throughAllocation(page, code, { onDisplayStep: (m) => (markup = m) });
    displayMarkup.set(condition, markup);
    await throughPractice(page, code, condition);
    const learnPath = condition === "immersive_3d" ? "/learn/immersive" : "/learn/2d";
    if (seen.has(learnPath) && completed) {
      await context.close();
      continue;
    }
    seen.add(learnPath);

    // The other condition is refused and sent back to the current step.
    await page.goto(learnPath === "/learn/2d" ? "/learn/immersive" : "/learn/2d");
    await page.waitForURL((u) => u.pathname === "/study/task", { timeout: 60_000 });

    // Onboarding -> the assigned condition (the guard lets the participant in). The time rule names
    // the Finish control by the label the StudyBar shows (strings.ts), and the step offers withdrawal.
    await expect(page.getByText(`choose “${PHASE_TEXT.learning.finish}” in the top bar`)).toBeVisible();
    await expect(page.getByRole("link", { name: "Withdraw from the study" })).toBeVisible();
    await page.getByRole("button", { name: "Start the learning task" }).click();
    await page.waitForURL((u) => u.pathname.startsWith(learnPath), { timeout: 60_000 });

    // Back to the study: arriving at the hub ends the (self-paced) learning phase and the
    // questionnaire after learning follows immediately (D8).
    await page.goto("/study/session");
    await answerQuestionnaire(page, /\/study\/questionnaire\/after-learning$/);
    await expect(page).toHaveURL(/\/study\/post-test$/);

    if (!completed) {
      await page.getByLabel("Demo option A").check();
      await page.getByRole("button", { name: "Submit answers" }).click();
      await expect(page).toHaveURL(/\/study\/transfer$/);
      await page.getByLabel(/Demo: placeholder transfer prompt/).fill("Because of the demo reason.");
      await page.getByRole("button", { name: "Submit answers" }).click();
      await answerQuestionnaire(page, /\/study\/questionnaire$/);
      await expect(page).toHaveURL(/\/study\/session$/);
      await page.getByRole("button", { name: "Finish and submit" }).click();
      await expect(page).toHaveURL(/\/study\/complete\?status=completed$/);
      await expect(page.getByRole("heading", { level: 1, name: "Thank You" })).toBeVisible();
      await expect(page.getByRole("heading", { level: 2, name: "Your Session Is Complete" })).toBeVisible();
      expect(await participantByCode(code)).toMatchObject({ participantStatus: "completed", sessionStatus: "completed" });
      await page.goto("/study/session");
      await expect(page).toHaveURL(/\/study(\?.*)?$/);
      completed = true;
    }
    await context.close();
  }
  expect([...seen].sort()).toEqual(["/learn/2d", "/learn/immersive"]);
  expect(completed).toBe(true);
  // The display step renders identically whichever condition the participant was allocated to.
  expect(displayMarkup.get("conventional_2d")).toBeTruthy();
  expect(displayMarkup.get("conventional_2d")).toBe(displayMarkup.get("immersive_3d"));
});

test("resumes an interrupted session before allocation and records the interruption", async ({ page }) => {
  const code = await enrolAndConsent(page);
  await expect(page).toHaveURL(/\/study\/questionnaire\/before$/);
  await page.goto("/study");
  await expect(page.getByRole("heading", { name: "You Have a Study Session in Progress" })).toBeVisible();
  await page.getByRole("button", { name: "Continue your session" }).click();
  await expect(page).toHaveURL(/\/study\/questionnaire\/before$/);
  expect((await participantByCode(code)).interruptionCount).toBe(1);
});

test("withdraws at any point and keeps the record; the high-contrast choice is recorded on the session", async ({ page }) => {
  const code = await enrolAndConsent(page, { contrast: true });
  await throughPractice(page, code, await throughAllocation(page, code, { contrast: true }));
  const row = await participantByCode(code);
  const device = await db().query<{ contrast: boolean | null }>("SELECT (device->>'contrastAccommodation')::boolean AS contrast FROM study_sessions WHERE id = $1", [row.sessionId]);
  expect(device.rows[0]!.contrast).toBe(true);
  // The accommodation stays applied on later study pages; study mode stays light.
  await expect(page.locator("html")).toHaveClass(/a11y-contrast/);
  await expect(page.locator("html")).not.toHaveClass(/(^|\s)dark(\s|$)/);
  await page.getByRole("link", { name: "Withdraw from the study" }).click();
  await expect(page).toHaveURL(/\/study\/withdraw$/);
  await page.getByLabel("I do not have time to finish").check();
  // Keyboard: withdrawing without the confirmation is refused and focus moves to the box.
  await page.getByRole("button", { name: "Withdraw from the study" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText(/Tick the box to confirm that you want to withdraw/)).toBeVisible();
  await expect.poll(() => focusedId(page)).toBe("confirm");
  await page.getByLabel("I want to withdraw from the study now.").check();
  // High contrast: the outline and destructive buttons show the full two-tone ring (4 px band).
  await expectFocusRing(page, page.getByRole("link", { name: "Go back to the study" }), 3);
  await expectFocusRing(page, page.getByRole("button", { name: "Withdraw from the study" }), 3);
  await page.getByRole("button", { name: "Withdraw from the study" }).click();
  await expect(page).toHaveURL(/\/study\/complete\?status=withdrawn$/);
  expect(await participantByCode(code)).toMatchObject({ participantStatus: "withdrawn", withdrawn: true });
  await page.goto("/study/task");
  await expect(page).toHaveURL(/\/study(\?.*)?$/);
});

test("declining consent exits cleanly without a session", async ({ page }) => {
  await page.goto("/study");
  await page.getByLabel("Study code").fill(E2E_STUDY_CODE);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/study\/consent$/);
  const code = (await page.locator("span.text-id").first().textContent())?.trim() ?? "";
  // Both consent buttons (outline and primary) show the focus ring when reached with Tab.
  await page.getByLabel(/I have read the information above/).focus();
  await expectFocusRing(page, page.getByRole("button", { name: "I do not want to take part" }));
  await expectFocusRing(page, page.getByRole("button", { name: "I agree to take part" }));
  await page.getByRole("button", { name: "I do not want to take part" }).click();
  await expect(page).toHaveURL(/\/study\/complete\?status=declined$/);
  expect((await participantByCode(code)).sessionId).toBeNull();
});

test("an unknown study code is refused with a message, and the keyboard keeps its place", async ({ page }) => {
  await page.goto("/study");
  // An empty code: Enter in the field is refused and focus stays on the field.
  await page.getByLabel("Study code").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Enter the study code.")).toBeVisible();
  await expect.poll(() => focusedId(page)).toBe("studyCode");
  // An unknown code, typed and submitted from the field with Enter.
  await page.keyboard.type("no-such-study");
  await page.keyboard.press("Enter");
  await expect(page.getByText(/No study has this code/)).toBeVisible();
  await expect.poll(() => focusedId(page)).toBe("studyCode");
  // The refusal keeps what was typed (React's automatic form reset is cancelled), so a typo can be
  // corrected rather than retyped.
  await expect(page.getByLabel("Study code")).toHaveValue("no-such-study");
  // The same refusal from the Continue button: focus stays on the button (not <body>), so the next
  // Tab moves on from it rather than from the end of the page.
  const cont = page.getByRole("button", { name: "Continue" });
  await cont.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText(/No study has this code/)).toBeVisible();
  await expect(cont).toBeFocused();
  expect(await focusedId(page)).not.toBe("BODY");
});
