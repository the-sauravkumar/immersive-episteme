/**
 * DESIGN.md section 15, the automated acceptance items not covered by other suites
 * (18 WP8 task 2). Each test names the checklist item it measures. Runs against the dev server
 * with one worker and one browser; every value is measured in the page.
 *
 *  - axe-core (WCAG 2.2 A and AA) on every in-scope page in light, dark, HC light and HC dark;
 *  - reflow: no horizontal scroll at 390 px and at 1280 px with 200% zoom (640 CSS px);
 *  - 44 x 44 targets on public, console, CMS and admin pages (compact 36 px with a 44 px hit area
 *    allowed; inline links inside a sentence are the WCAG 2.5.5 inline exception) and on study routes;
 *  - text spacing override (R-A8) without clipping on the concept page in both conditions;
 *  - motion: zero transitions and animations on study routes (P12), and with reduced motion no
 *    running animation on public pages and Figure 1 drawn;
 *  - fonts: at most 2 preloaded files and 176,000 bytes preloaded, at most 230,000 bytes of fonts,
 *    no third-party request; no font-variant-caps or onum in the served CSS;
 *  - images: study page image bytes, lightbox media fetched only on open, CLS 0 on study routes;
 *  - performance under a 4x CPU throttle: LCP, interaction latency (Event Timing) for opening a
 *    citation record and the lightbox in both conditions;
 *  - focus: a visible focus indicator on every Tab stop, never covered by sticky chrome (Tab is
 *    pressed until focus leaves the page or wraps to the first stop, so long tables are covered);
 *  - keyboard: LayerTabs arrow keys, the in-place CitationRecord and FigureLightbox Escape with focus return,
 *    the skip link in both conditions.
 *
 * In-scope pages: the public pages, every study step a participant passes (consent, both
 * questionnaires, pre-test, display and device check, onboarding task, post-test, transfer, final
 * questionnaire, session hub) through a fresh fixture participant, both learning conditions (the 3D
 * panel open as well as closed), and the research, CMS and admin consoles including their form and
 * detail pages (a study and an assessment detail page are found from their lists).
 *
 * Performance numbers come from the DEV server (unminified, compiled on demand), so they are an
 * upper bound of a production build; the test records them and applies the section 15 limits.
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";

import AxeBuilder from "@axe-core/playwright";
import { expect, newContext, test, type Browser, type BrowserContext, type Page, type Request, type Response } from "./fixtures";

import { CONCEPT_TYPES } from "@/lib/validation/enums";

import { backdateFamiliarisation, closeDb, E2E_STUDY_CODE, ensureE2eStudy, retireE2eStaff } from "./study-fixtures";

// Not serial: each checklist item is measured even when another one fails.
// The focus audit tabs through every page to its end in 8 viewport and theme combinations.
test.describe.configure({ timeout: 4 * 60 * 60_000 });
test.use({ navigationTimeout: 180_000, actionTimeout: 60_000 });

const PASSWORD = `e2e-${randomBytes(12).toString("hex")}`;
const STAFF = `e2e-acceptance-${randomBytes(3).toString("hex")}@example.test`;
const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };
const ZOOM_200 = { width: 640, height: 400 };
const MUSEUM = "/learn/immersive?allowSoftware=1&probe=1";

const PUBLIC = ["/", "/about", "/about/colophon", "/explore", "/accessibility", "/privacy", "/sign-in", "/forbidden"];
const CONSOLE = [
  "/research",
  "/research/studies",
  "/research/assessments",
  "/research/analytics",
  "/research/pathways",
  "/research/dashboard",
  "/research/parity",
  "/research/sessions",
  "/research/participants",
  "/research/scoring",
  "/research/exports",
  "/cms",
  "/cms/concepts",
  "/cms/relations",
  "/cms/sources",
  "/cms/traditions",
  "/cms/datasets",
  "/cms/spatial",
  "/cms/media",
  "/cms/review",
  "/admin",
  "/admin/users",
  "/admin/roles",
  "/admin/audit",
  "/admin/settings",
];
const THEMES = [
  { id: "light", dark: false, hc: false },
  { id: "dark", dark: true, hc: false },
  { id: "hc-light", dark: false, hc: true },
  { id: "hc-dark", dark: true, hc: true },
] as const;

test.beforeAll(async () => {
  for (const role of ["platform_admin", "curator", "researcher"]) {
    try {
      execFileSync(process.execPath, ["--import", "tsx", "scripts/create-admin.ts", "--email", STAFF, "--name", "E2E Acceptance", "--role", role], {
        env: { ...process.env, ADMIN_PASSWORD: PASSWORD },
        stdio: "pipe",
      });
    } catch {
      /* a role the registry does not know is skipped; platform_admin is enough to read every page */
    }
  }
});
test.afterAll(async () => {
  // Throwaway accounts are retired after the run, so no usable test login accumulates.
  await retireE2eStaff(undefined, [STAFF]);
  await closeDb();
});

async function themed(browser: Browser, viewport: { width: number; height: number }, theme: { dark: boolean; hc: boolean }, extra: Parameters<Browser["newContext"]>[0] = {}): Promise<BrowserContext> {
  const ctx = await newContext(browser, { viewport, ...extra });
  await ctx.addInitScript((t) => {
    try {
      localStorage.setItem("ie-display", JSON.stringify({ contrast: t.hc, reduceMotion: false }));
      localStorage.setItem("theme", t.dark ? "dark" : "light");
    } catch {
      /* storage blocked */
    }
  }, theme);
  return ctx;
}

async function signIn(page: Page) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(STAFF);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"), { timeout: 120_000 });
}

async function startDemo(page: Page) {
  await page.goto("/explore");
  await page.getByRole("button", { name: /conventional pages/i }).click();
  await page.waitForURL(/\/learn\/2d/, { waitUntil: "commit" });
}

async function settle(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(300);
}

let pathsCache: string[] | null = null;
let consoleCache: string[] | null = null;

/**
 * The console pages: CONSOLE plus the research form pages with dynamic ids, found from their lists
 * once: the first study detail, assessment detail and its first reference map, session detail,
 * scoring rubric and scoring concept map. Call with a signed-in page.
 */
async function consolePaths(page: Page): Promise<string[]> {
  if (consoleCache) return consoleCache;
  const detail = async (list: string, pattern: RegExp) => {
    await settle(page, list);
    const hrefs = await page.locator(`main a[href^="${list}/"]`).evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
    return hrefs.find((h) => pattern.test(h)) ?? null;
  };
  const study = await detail("/research/studies", /^\/research\/studies\/[0-9a-f-]{36}$/);
  const assessment = await detail("/research/assessments", /^\/research\/assessments\/[0-9a-f-]{36}$/);
  const reference = assessment ? await detail(assessment, /\/reference\/[0-9a-f-]{36}$/) : null;
  const session = await detail("/research/sessions", /^\/research\/sessions\/[0-9a-f-]{36}$/);
  const rubric = await detail("/research/scoring", /^\/research\/scoring\/rubrics\/[0-9a-f-]{36}$/);
  const map = await detail("/research/scoring", /^\/research\/scoring\/maps\/[0-9a-f-]{36}$/);
  consoleCache = [...CONSOLE, ...[study, assessment, reference, session, rubric, map].filter((x): x is string => !!x)];
  return consoleCache;
}

/**
 * A fresh fixture participant's way through the e2e study (./study-fixtures.ts, the adopted D8
 * order); `visit` runs on every study step page once it has loaded. The familiarisation wait is
 * back-dated as study-journey.spec.ts does. Returns the participant code.
 */
async function studyJourney(page: Page, visit: (path: string) => Promise<void>): Promise<string> {
  let previousTitle = "";
  const step = async (path: RegExp) => {
    await page.waitForURL(path, { timeout: 120_000 });
    await page.waitForLoadState("networkidle");
    // After a server-action redirect the URL changes before the new page commits its <title> (a
    // soft navigation: the previous step's title stays, then the new one replaces it). Audit the
    // page once it carries its own title (every study step has a distinct one), and fail here if
    // it never gets one.
    await expect
      .poll(async () => {
        const t = await page.title();
        return t !== "" && t !== previousTitle;
      }, { message: `document title on ${page.url()} (previous step: "${previousTitle}")`, timeout: 15_000 })
      .toBe(true);
    previousTitle = await page.title();
    await visit(new URL(page.url()).pathname);
  };
  const answer = async () => {
    await page.getByLabel(/^3/).check();
    await page.getByRole("button", { name: "Submit answers" }).click();
  };
  await page.goto("/study");
  await page.getByLabel("Study code").fill(E2E_STUDY_CODE);
  await page.getByRole("button", { name: "Continue" }).click();
  await step(/\/study\/consent$/);
  const code = (await page.locator("span.text-id").first().textContent())?.trim() ?? "";
  await page.getByLabel(/I have read the information above/).check();
  await page.getByRole("button", { name: "I agree to take part" }).click();
  await step(/\/study\/questionnaire\/before$/);
  // The withdraw page of the running session (visited, not submitted), then back to the step.
  await page.goto("/study/withdraw");
  await step(/\/study\/withdraw$/);
  await page.goto("/study/questionnaire/before");
  await page.waitForURL(/\/study\/questionnaire\/before$/, { timeout: 120_000 });
  await answer();
  await step(/\/study\/pre-test$/);
  await page.getByLabel("Demo option A").check();
  await page.getByRole("button", { name: "Submit answers" }).click();
  await step(/\/study\/device-check$/);
  await page.getByRole("button", { name: "Check and continue" }).click();
  await page.waitForURL(/\/learn\/(2d|immersive)\/practice$/, { timeout: 120_000 });
  await backdateFamiliarisation(code);
  await page.goto("/study/task");
  await step(/\/study\/task$/);
  await page.getByRole("button", { name: "Start the learning task" }).click();
  await page.waitForURL((u) => u.pathname.startsWith("/learn/"), { timeout: 120_000 });
  await page.goto("/study/session");
  await step(/\/study\/questionnaire\/after-learning$/);
  await answer();
  await step(/\/study\/post-test$/);
  await page.getByLabel("Demo option A").check();
  await page.getByRole("button", { name: "Submit answers" }).click();
  await step(/\/study\/transfer$/);
  await page.getByLabel(/Demo: placeholder transfer prompt/).fill("Because of the demo reason.");
  await page.getByRole("button", { name: "Submit answers" }).click();
  await step(/\/study\/questionnaire$/);
  await answer();
  await step(/\/study\/session$/);
  // The closing page (public, the same for every outcome).
  await page.goto("/study/complete");
  await step(/\/study\/complete$/);
  return code;
}

/** The demo's 2D study pages: index, a tradition, a concept with a figure, categories, comparisons, practice (found once). */
async function studyPaths(page: Page): Promise<string[]> {
  if (pathsCache) return pathsCache;
  pathsCache = await findStudyPaths(page);
  return pathsCache;
}

async function findStudyPaths(page: Page): Promise<string[]> {
  await settle(page, "/learn/2d");
  const tradition = (await page.locator('main a[href^="/learn/2d/traditions/"]').first().getAttribute("href"))!;
  await settle(page, tradition);
  const concepts = await page.locator('main a[href^="/learn/2d/concepts/"]').evaluateAll((as) => as.map((a) => a.getAttribute("href")!));
  let concept = concepts[0]!;
  // Prefer a process stage (the structure diagrams anchor there), then any concept with a figure.
  const ordered = [...concepts.filter((c) => c.includes("-process-stage-")), ...concepts.filter((c) => !c.includes("-process-stage-"))];
  for (const c of ordered) {
    const res = await page.request.get(c);
    if ((await res.text()).includes('data-slot="knowledge-figure"')) {
      concept = c;
      break;
    }
  }
  return ["/learn/2d", tradition, concept, "/learn/2d/categories", "/learn/2d/comparisons", "/learn/2d/practice"];
}

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"];

async function axe(page: Page): Promise<string[]> {
  const r = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  return r.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} node(s), e.g. ${v.nodes[0]?.target.join(" ")}`);
}

test("axe-core reports no WCAG 2.2 A or AA violation on in-scope pages in all four themes", async ({ browser }) => {
  const found: string[] = [];
  await ensureE2eStudy();
  for (const theme of THEMES) {
    // Public pages and the study entry.
    const anon = await themed(browser, DESKTOP, theme);
    const p = await anon.newPage();
    for (const path of [...PUBLIC, "/study"]) {
      await settle(p, path);
      for (const v of await axe(p)) found.push(`${theme.id} ${path}: ${v}`);
    }
    // Every study step a participant passes (fresh fixture participant).
    await studyJourney(p, async (path) => {
      for (const v of await axe(p)) found.push(`${theme.id} ${path}: ${v}`);
    });
    await anon.close();

    // Both learning conditions (demo).
    const demo = await themed(browser, DESKTOP, theme);
    const d = await demo.newPage();
    await startDemo(d);
    for (const path of await studyPaths(d)) {
      await settle(d, path);
      for (const v of await axe(d)) found.push(`${theme.id} ${path}: ${v}`);
    }
    await d.goto(MUSEUM);
    await d.waitForFunction(() => (window as unknown as { __museumInfo?: () => { ready: boolean } }).__museumInfo?.().ready === true, null, { timeout: 600_000 });
    for (const v of await axe(d)) found.push(`${theme.id} /learn/immersive: ${v}`);
    // The 3D panel open on the same concept as the 2D concept page.
    const key = keyFromSlug(decodeURIComponent((await studyPaths(d))[2]!.replace("/learn/2d/concepts/", "")));
    if (await openInMuseum(d, key)) {
      for (const v of await axe(d)) found.push(`${theme.id} /learn/immersive panel: ${v}`);
    } else found.push(`${theme.id} 3D: could not open ${key}`);
    await demo.close();

    // Consoles.
    const staff = await themed(browser, DESKTOP, theme);
    const s = await staff.newPage();
    await signIn(s);
    for (const path of await consolePaths(s)) {
      await settle(s, path);
      for (const v of await axe(s)) found.push(`${theme.id} ${path}: ${v}`);
    }
    await staff.close();
  }
  // At 390 px too, for the participant-facing pages (study steps, both learning conditions with a
  // concept open), in the two themes that take effect on study routes (DR-019).
  for (const theme of THEMES.filter((t) => !t.dark)) {
    const tag = `390 ${theme.id}`;
    const part = await themed(browser, PHONE, theme);
    const q = await part.newPage();
    await studyJourney(q, async (path) => {
      for (const v of await axe(q)) found.push(`${tag} ${path}: ${v}`);
    });
    await part.close();
    const demo = await themed(browser, PHONE, theme);
    const d = await demo.newPage();
    await startDemo(d);
    for (const path of await studyPaths(d)) {
      await settle(d, path);
      for (const v of await axe(d)) found.push(`${tag} ${path}: ${v}`);
    }
    await d.goto(MUSEUM);
    await d.waitForFunction(() => (window as unknown as { __museumInfo?: () => { ready: boolean } }).__museumInfo?.().ready === true, null, { timeout: 600_000 });
    const key = keyFromSlug(decodeURIComponent((await studyPaths(d))[2]!.replace("/learn/2d/concepts/", "")));
    if (await openInMuseum(d, key)) {
      for (const v of await axe(d)) found.push(`${tag} /learn/immersive panel: ${v}`);
    } else found.push(`${tag} 3D: could not open ${key}`);
    await demo.close();
  }
  expect(found).toEqual([]);
});

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test("no horizontal scroll at 390 px and at 1280 px with 200% zoom (640 CSS px)", async ({ browser }) => {
  const found: string[] = [];
  for (const [label, viewport, scale] of [
    ["390", PHONE, 1],
    ["1280@200%", ZOOM_200, 2],
  ] as const) {
    const anon = await newContext(browser, { viewport, deviceScaleFactor: scale });
    const p = await anon.newPage();
    for (const path of [...PUBLIC, "/study"]) {
      await settle(p, path);
      const o = await horizontalOverflow(p);
      if (o > 0) found.push(`${label} ${path}: ${o} px`);
    }
    await startDemo(p);
    for (const path of [...(await studyPaths(p)), MUSEUM]) {
      await settle(p, path);
      if (path === MUSEUM) await p.waitForFunction(() => (window as unknown as { __museumInfo?: () => { ready: boolean } }).__museumInfo?.().ready === true, null, { timeout: 600_000 });
      const o = await horizontalOverflow(p);
      if (o > 0) found.push(`${label} ${path}: ${o} px`);
    }
    await anon.close();
    const staff = await newContext(browser, { viewport, deviceScaleFactor: scale });
    const s = await staff.newPage();
    await signIn(s);
    for (const path of await consolePaths(s)) {
      await settle(s, path);
      const o = await horizontalOverflow(s);
      if (o > 0) found.push(`${label} ${path}: ${o} px`);
    }
    await staff.close();
  }
  expect(found).toEqual([]);
});

/** Interactive elements under 44 x 44 (a compact control's ::after hit area counts; inline links in a sentence are exempt). */
async function smallTargets(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const SEL = "a[href], button, input:not([type=hidden]), select, textarea, summary, [role=tab], [role=button], [role=switch], [role=checkbox], [role=radio], [tabindex]:not([tabindex='-1'])";
    const out: string[] = [];
    document.querySelectorAll<HTMLElement>(SEL).forEach((el) => {
      if (!el.checkVisibility({ checkVisibilityCSS: true })) return;
      if (el.closest("[inert]")) return;
      const r = el.getBoundingClientRect();
      if (r.width <= 1 && r.height <= 1) return; // visually hidden until focused
      let w = r.width;
      let h = r.height;
      const after = getComputedStyle(el, "::after");
      if (after.content && after.content !== "none" && after.position === "absolute") {
        w = Math.max(w, parseFloat(after.minWidth) || 0, r.width + 2 * Math.max(0, -parseFloat(after.left) || 0));
        h = Math.max(h, parseFloat(after.minHeight) || 0, r.height + 2 * Math.max(0, -parseFloat(after.top) || 0));
      }
      // A radio or checkbox inside a full-row label: the label is the target.
      const lab = el.closest("label");
      if (lab) {
        const lr = lab.getBoundingClientRect();
        w = Math.max(w, lr.width);
        h = Math.max(h, lr.height);
      }
      if (w >= 44 - 0.01 && h >= 44 - 0.01) return;
      // WCAG 2.5.5 inline exception: a link inside a sentence or block of text.
      const cs = getComputedStyle(el);
      const parent = el.parentElement;
      const inSentence = el.tagName === "A" && cs.display === "inline" && !!parent && (parent.textContent ?? "").trim().length > (el.textContent ?? "").trim().length + 1;
      if (inSentence) return;
      const name = (el.getAttribute("aria-label") ?? el.textContent ?? el.getAttribute("name") ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
      out.push(`${el.tagName.toLowerCase()} "${name}" ${Math.round(w)}x${Math.round(h)}`);
    });
    return out;
  });
}

test("every interactive element is at least 44 x 44 px (study, public, console, CMS, admin)", async ({ browser }) => {
  const found: string[] = [];
  for (const viewport of [DESKTOP, PHONE]) {
    const anon = await newContext(browser, { viewport });
    const p = await anon.newPage();
    for (const path of [...PUBLIC, "/study"]) {
      await settle(p, path);
      for (const t of await smallTargets(p)) found.push(`${viewport.width} ${path}: ${t}`);
    }
    await startDemo(p);
    for (const path of await studyPaths(p)) {
      await settle(p, path);
      for (const t of await smallTargets(p)) found.push(`${viewport.width} ${path}: ${t}`);
    }
    await anon.close();
    const staff = await newContext(browser, { viewport });
    const s = await staff.newPage();
    await signIn(s);
    for (const path of await consolePaths(s)) {
      await settle(s, path);
      for (const t of await smallTargets(s)) found.push(`${viewport.width} ${path}: ${t}`);
    }
    await staff.close();
  }
  expect(found).toEqual([]);
});

const TEXT_SPACING = "*{line-height:1.5 !important;letter-spacing:0.12em !important;word-spacing:0.16em !important}p{margin-bottom:2em !important}";

/** Clipped text (an element whose text overflows a box that hides overflow) inside `root`. */
async function clipped(page: Page, root: string): Promise<string[]> {
  return page.evaluate((sel) => {
    const out: string[] = [];
    const r = Array.from(document.querySelectorAll<HTMLElement>(sel)).find((e) => e.checkVisibility());
    if (!r) return ["no root"];
    r.querySelectorAll<HTMLElement>("*").forEach((el) => {
      if (!el.checkVisibility() || !/\S/.test(el.textContent ?? "")) return;
      const cs = getComputedStyle(el);
      const hides = (v: string) => v === "hidden" || v === "clip";
      if (cs.textOverflow === "ellipsis") return; // a single-line label truncated by design keeps a title
      if (el.clientWidth <= 1 && el.clientHeight <= 1) return; // visually hidden (sr-only) until focused
      if ((hides(cs.overflowY) && el.scrollHeight > el.clientHeight + 1) || (hides(cs.overflowX) && el.scrollWidth > el.clientWidth + 1)) {
        out.push(`${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 3).join(".")} ${el.scrollWidth}x${el.scrollHeight} in ${el.clientWidth}x${el.clientHeight}`);
      }
    });
    return out;
  }, root);
}

test("text spacing override causes no clipping on the concept page in both conditions (R-A8)", async ({ browser }) => {
  const ctx = await newContext(browser, { viewport: DESKTOP });
  const p = await ctx.newPage();
  await startDemo(p);
  const concept = (await studyPaths(p))[2]!;
  const found: string[] = [];
  await settle(p, concept);
  await p.addStyleTag({ content: TEXT_SPACING });
  await p.waitForTimeout(300);
  for (const c of await clipped(p, "main [data-slot=knowledge-sheet]")) found.push(`2D ${c}`);
  for (const c of await clipped(p, "[data-slot=study-bar]")) found.push(`2D bar ${c}`);
  // 3D: open the same concept in the panel.
  const key = keyFromSlug(decodeURIComponent(concept.replace("/learn/2d/concepts/", "")));
  await p.goto(MUSEUM);
  await p.waitForFunction(() => (window as unknown as { __museumInfo?: () => { ready: boolean } }).__museumInfo?.().ready === true, null, { timeout: 600_000 });
  const opened = await openInMuseum(p, key);
  if (opened) {
    await p.addStyleTag({ content: TEXT_SPACING });
    await p.waitForTimeout(300);
    for (const c of await clipped(p, "#museum-panel [data-slot=knowledge-sheet]")) found.push(`3D ${c}`);
    for (const c of await clipped(p, "[data-slot=study-bar]")) found.push(`3D bar ${c}`);
  } else found.push(`3D: could not open ${key}`);
  await ctx.close();
  expect(found).toEqual([]);
});

/**
 * The concept key ("ajrakh.process_stage.saaj") behind a 2D page slug ("ajrakh-process-stage-saaj"):
 * the slug joins the tradition, the concept type and the name with hyphens.
 */
function keyFromSlug(slug: string): string {
  const owners = ["machilipatnam-kalamkari", "ajrakh", "bagh", "bagru", "dabu", "sanganeri", "shared"];
  for (const owner of owners) {
    if (!slug.startsWith(`${owner}-`)) continue;
    const rest = slug.slice(owner.length + 1);
    const type = [...CONCEPT_TYPES].sort((a, b) => b.length - a.length).find((t) => rest.startsWith(`${t.replace(/_/g, "-")}-`));
    if (type) return `${owner}.${type}.${rest.slice(type.length + 1)}`;
  }
  return slug;
}

/** Opens the panel for a concept key: teleport into its room through the probe, then select its row. */
async function openInMuseum(page: Page, key: string): Promise<boolean> {
  const ok = await page.evaluate(async (k) => {
    const p = (window as unknown as { __museumProbe: { viewpoints(): { id: string; roomId: string; kind: string }[]; stability(v: unknown, n: number): Promise<unknown> } }).__museumProbe;
    const slug = k.split(".")[0]!;
    const rooms = p.viewpoints().filter((v) => v.roomId.startsWith(`room:${slug}:`));
    // Each concept type has its room in the tradition's wing (the compiler's section order).
    const ROOM: Record<string, string> = {
      process_stage: "process_sequence",
      material: "materials_tools",
      tool: "materials_tools",
      artisan_decision: "artisan_decisions",
      design_principle: "design_outcomes",
      outcome: "design_outcomes",
      scientific_mechanism: "science_technology",
      environmental_condition: "science_technology",
      explanation: "science_technology",
      historical_context: "tradition_context",
      tradition: "tradition_context",
      open_question: "open_questions",
    };
    const type = k.split(".")[1] ?? "";
    const pick = rooms.find((v) => v.id.includes(k)) ?? rooms.find((v) => v.roomId.endsWith(`:${ROOM[type] ?? ""}`)) ?? rooms[0];
    if (!pick) return false;
    await p.stability(pick, 1);
    return true;
  }, key);
  if (!ok) return false;
  // The shared PlaceRail "In This Room" (DR-021) is collapsed by default in 3D: its StudyBar button shows it.
  const railButton = page.locator("[data-slot=study-bar] [data-slot=rail-button]");
  if ((await railButton.getAttribute("aria-expanded")) !== "true") await railButton.click();
  const row = page.locator(`#museum-rail li button[data-exhibit-id$=":${key}"]`);
  if ((await row.count()) === 0) return false;
  await row.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-slot=museum-info-panel]")).toBeVisible({ timeout: 300_000 });
  return true;
}

test("motion: zero transitions on study routes (P12); reduced motion leaves public pages still and Figure 1 drawn", async ({ browser }) => {
  const found: string[] = [];
  const ctx = await newContext(browser, { viewport: DESKTOP });
  const p = await ctx.newPage();
  await startDemo(p);
  const motion = () =>
    p.evaluate(() => {
      const long = (v: string) => v.split(",").some((x) => (x.trim().endsWith("ms") ? parseFloat(x) / 1000 : parseFloat(x)) > 0.00001);
      return Array.from(document.querySelectorAll<HTMLElement>("*"))
        .filter((el) => {
          const cs = getComputedStyle(el);
          return (cs.animationName !== "none" && long(cs.animationDuration)) || (cs.transitionProperty !== "none" && long(cs.transitionDuration));
        })
        .slice(0, 5)
        .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)}`);
    });
  for (const path of [...(await studyPaths(p)), "/study", MUSEUM]) {
    await settle(p, path);
    if (path === MUSEUM) await p.waitForFunction(() => (window as unknown as { __museumInfo?: () => { ready: boolean } }).__museumInfo?.().ready === true, null, { timeout: 600_000 });
    for (const m of await motion()) found.push(`${path}: ${m}`);
  }
  await ctx.close();

  const rm = await newContext(browser, { viewport: DESKTOP, reducedMotion: "reduce" });
  const q = await rm.newPage();
  for (const path of PUBLIC) {
    await settle(q, path);
    await q.mouse.wheel(0, 2000);
    await q.waitForTimeout(400);
    const running = await q.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length);
    if (running > 0) found.push(`reduced motion ${path}: ${running} running animation(s)`);
  }
  await settle(q, "/");
  const undrawn = await q.evaluate(() => Array.from(document.querySelectorAll("[data-draw]")).filter((e) => e.getAttribute("data-draw") !== "drawn").length);
  if (undrawn > 0) found.push(`reduced motion /: ${undrawn} Figure 1 stroke(s) not drawn`);
  await rm.close();
  expect(found).toEqual([]);
});

test("fonts: at most 2 preloaded files and 176,000 bytes preloaded, at most 230,000 bytes of fonts, no third-party host", async ({ browser }) => {
  const found: string[] = [];
  const ctx = await newContext(browser, { viewport: DESKTOP });
  const p = await ctx.newPage();
  await startDemo(p);
  const concept = (await studyPaths(p))[2]!;
  for (const path of ["/", concept, MUSEUM]) {
    const fonts = new Map<string, number>();
    const hosts = new Set<string>();
    const onResponse = async (res: Response) => {
      const u = new URL(res.url());
      if (u.hostname !== "localhost" && u.protocol.startsWith("http")) hosts.add(u.hostname);
      if (/\.(woff2?|ttf|otf)(\?|$)/.test(u.pathname)) {
        try {
          fonts.set(u.pathname, (await res.body()).length);
        } catch {
          /* body unavailable */
        }
      }
    };
    p.on("response", onResponse);
    await p.goto(path);
    await p.waitForLoadState("networkidle");
    if (path === MUSEUM) await p.waitForFunction(() => (window as unknown as { __museumInfo?: () => { ready: boolean } }).__museumInfo?.().ready === true, null, { timeout: 600_000 });
    await p.waitForTimeout(500);
    p.off("response", onResponse);
    const preloads = await p.evaluate(() => Array.from(document.querySelectorAll<HTMLLinkElement>("link[rel=preload][as=font]")).map((l) => new URL(l.href).pathname));
    const preloadBytes = preloads.reduce((s, x) => s + (fonts.get(x) ?? 0), 0);
    const total = [...fonts.values()].reduce((s, x) => s + x, 0);
    test.info().annotations.push({ type: "fonts", description: `${path}: ${preloads.length} preloaded (${preloadBytes} B), ${fonts.size} font files (${total} B)` });
    if (preloads.length > 2) found.push(`${path}: ${preloads.length} preloaded font files`);
    if (preloadBytes > 176_000) found.push(`${path}: ${preloadBytes} bytes preloaded`);
    if (total > 230_000) found.push(`${path}: ${total} bytes of fonts`);
    if (hosts.size > 0) found.push(`${path}: third-party hosts ${[...hosts].join(", ")}`);
  }
  // No font-variant-caps and no onum in any served stylesheet.
  await settle(p, "/");
  const css = await p.evaluate(async () => {
    const hrefs = Array.from(document.querySelectorAll<HTMLLinkElement>("link[rel=stylesheet]")).map((l) => l.href);
    const texts = await Promise.all(hrefs.map((h) => fetch(h).then((r) => r.text())));
    return texts.join("\n") + Array.from(document.querySelectorAll("style")).map((s) => s.textContent).join("\n");
  });
  if (/font-variant-caps/.test(css)) found.push("served CSS uses font-variant-caps");
  if (/["']onum["']|\bonum\b/.test(css)) found.push("served CSS uses onum");
  await ctx.close();
  expect(found).toEqual([]);
});

test("images and layout shift on study routes: figure and page budgets, lightbox media only on open, CLS 0", async ({ browser }) => {
  const found: string[] = [];
  const ctx = await newContext(browser, { viewport: DESKTOP });
  const p = await ctx.newPage();
  await startDemo(p);
  const paths = await studyPaths(p);
  for (const path of paths) {
    const images: number[] = [];
    const onResponse = async (res: Response) => {
      if (res.request().resourceType() === "image") {
        try {
          images.push((await res.body()).length);
        } catch {
          /* body unavailable */
        }
      }
    };
    p.on("response", onResponse);
    await settle(p, path);
    p.off("response", onResponse);
    const bytes = images.reduce((s, x) => s + x, 0);
    if (bytes > 250_000) found.push(`${path}: ${bytes} bytes of images`);
    const big = images.filter((x) => x > 70_000);
    if (big.length > 0) found.push(`${path}: image(s) over 70 KB: ${big.join(", ")}`);
    const cls = await p.evaluate(
      () =>
        new Promise<number>((resolve) => {
          let total = 0;
          const po = new PerformanceObserver((l) => l.getEntries().forEach((e) => ((e as unknown as { hadRecentInput: boolean }).hadRecentInput ? null : (total += (e as unknown as { value: number }).value))));
          po.observe({ type: "layout-shift", buffered: true });
          setTimeout(() => (po.disconnect(), resolve(total)), 300);
        }),
    );
    if (cls >= 0.005) found.push(`${path}: CLS ${cls.toFixed(3)}`);
  }
  // Lightbox media is fetched only when the lightbox opens.
  const concept = paths[2]!;
  await settle(p, concept);
  const enlarge = p.getByRole("button", { name: /^Enlarge figure 1$/ }).first();
  if ((await enlarge.count()) > 0) {
    let fetched = 0;
    const onRequest = (r: Request) => (r.resourceType() === "image" ? fetched++ : null);
    p.on("request", onRequest);
    await p.waitForTimeout(500);
    const before = fetched;
    await enlarge.click();
    await p.waitForTimeout(800);
    p.off("request", onRequest);
    const kind = await p.locator("[data-slot=knowledge-figure]").first().getAttribute("data-figure-kind");
    test.info().annotations.push({ type: "lightbox", description: `figure kind ${kind}; image requests before open ${before}, on open ${fetched - before}` });
    if (before > 0 && kind === "photo") found.push(`lightbox media requested before open (${before})`);
    await p.keyboard.press("Escape");
  }
  await ctx.close();
  expect(found).toEqual([]);
});

test("performance at a 4x CPU throttle: LCP <= 2.5 s; opening a citation record and the lightbox <= 200 ms in both conditions", async ({ browser }) => {
  const found: string[] = [];
  const ctx = await newContext(browser, { viewport: DESKTOP });
  const p = await ctx.newPage();
  await startDemo(p);
  const concept = (await studyPaths(p))[2]!;
  // Warm the dev server's compile cache first, so the measurement is not a first compile.
  for (const path of ["/", concept]) await settle(p, path);
  const cdp = await ctx.newCDPSession(p);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const lcpOf = async (path: string) => {
    await p.goto(path);
    await p.waitForLoadState("networkidle");
    return p.evaluate(
      () =>
        new Promise<number>((resolve) => {
          let last = 0;
          const po = new PerformanceObserver((l) => l.getEntries().forEach((e) => (last = e.startTime)));
          po.observe({ type: "largest-contentful-paint", buffered: true });
          setTimeout(() => (po.disconnect(), resolve(last)), 500);
        }),
    );
  };
  for (const path of ["/", concept]) {
    const lcp = await lcpOf(path);
    test.info().annotations.push({ type: "LCP", description: `${path}: ${Math.round(lcp)} ms (4x CPU, dev server)` });
    if (lcp > 2500) found.push(`${path}: LCP ${Math.round(lcp)} ms`);
  }
  /** Longest Event Timing duration of the click that performs `act`. */
  const latency = async (page: Page, act: () => Promise<void>) => {
    await page.evaluate(() => {
      (window as unknown as { __events: number[] }).__events = [];
      new PerformanceObserver((l) => l.getEntries().forEach((e) => (window as unknown as { __events: number[] }).__events.push(e.duration))).observe({ type: "event", durationThreshold: 16, buffered: false } as PerformanceObserverInit);
    });
    await act();
    await page.waitForTimeout(600);
    return page.evaluate(() => Math.max(0, ...(window as unknown as { __events: number[] }).__events));
  };
  /**
   * Each interaction is measured three times and judged by its median: one sample at a 4x throttle
   * on the shared test machine spread from 104 to 224 ms for the same click (merge-stage runs), so
   * a single sample measured the machine's other work more than the interface. All samples are
   * recorded in the annotation.
   */
  const RUNS = 3;
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
  const measureBoth = async (page: Page, root: string, side: string) => {
    const note = page.locator(`${root} ol[aria-label='Statements'] [data-slot=citation-marker]`).first();
    const recs: number[] = [];
    for (let i = 0; i < RUNS; i++) {
      recs.push(await latency(page, () => note.click()));
      await note.click();
      await page.waitForTimeout(300);
    }
    const rec = median(recs);
    const enlarge = page.locator(`${root}`).getByRole("button", { name: /^Enlarge figure 1$/ }).first();
    const boxes: number[] = [];
    if ((await enlarge.count()) > 0) {
      for (let i = 0; i < RUNS; i++) {
        boxes.push(await latency(page, () => enlarge.click()));
        await page.keyboard.press("Escape");
        await page.waitForTimeout(300);
      }
    }
    const box = boxes.length > 0 ? median(boxes) : 0;
    test.info().annotations.push({
      type: "INP",
      description: `${side}: citation record ${Math.round(rec)} ms (runs ${recs.map(Math.round).join(", ")}), lightbox ${Math.round(box)} ms (runs ${boxes.map(Math.round).join(", ")}) (4x CPU)`,
    });
    if (rec > 200) found.push(`${side}: citation record ${Math.round(rec)} ms`);
    if (box > 200) found.push(`${side}: lightbox ${Math.round(box)} ms`);
  };
  await settle(p, concept);
  await measureBoth(p, "main [data-slot=knowledge-sheet]:visible", "2D");
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  await p.goto(MUSEUM);
  await p.waitForFunction(() => (window as unknown as { __museumInfo?: () => { ready: boolean } }).__museumInfo?.().ready === true, null, { timeout: 600_000 });
  const key = keyFromSlug(decodeURIComponent(concept.replace("/learn/2d/concepts/", "")));
  if (await openInMuseum(p, key)) {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await measureBoth(p, "#museum-panel [data-slot=knowledge-sheet]", "3D");
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  } else found.push(`3D: could not open ${key}`);
  await ctx.close();
  expect(found).toEqual([]);
});

/**
 * Restarts sequential focus navigation at the top of the document: blur() alone keeps the
 * starting point where the focused element was (a concept page focuses its h1 on load), so the
 * body is focused for a moment instead.
 */
async function focusTop(page: Page) {
  await page.evaluate(() => {
    const b = document.body;
    b.tabIndex = -1;
    b.focus();
    b.removeAttribute("tabindex");
  });
}

/** The Next.js development tools indicator (dev server only; not part of any page). */
const DEV_OVERLAY = "NEXTJS-PORTAL";

/** Safety stop only: a page is audited until focus leaves it or wraps to its first stop. */
const MAX_STOPS = 1500;

/**
 * Tabs through a page until focus leaves the document (or returns to the body) or wraps back to the
 * first stop; every stop must show a focus indicator and not sit under sticky chrome. Reaching
 * MAX_STOPS without either is itself reported.
 */
async function focusAudit(page: Page, fromTop = true): Promise<string[]> {
  const out: string[] = [];
  // From the top of the page, or (fromTop false) from wherever focus already is, e.g. the sheet h1.
  if (fromTop) await focusTop(page);
  await page.evaluate(() => document.querySelectorAll("[data-focus-audit-first]").forEach((e) => e.removeAttribute("data-focus-audit-first")));
  let ended = false;
  let first = true;
  for (let i = 0; i < MAX_STOPS; i++) {
    await page.keyboard.press("Tab");
    await page.waitForTimeout(30);
    const r = await page.evaluate(([dev, isFirst]) => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return { done: true } as const;
      if (el.hasAttribute("data-focus-audit-first")) return { done: true } as const; // wrapped around
      if (isFirst) el.setAttribute("data-focus-audit-first", "");
      if (el.tagName === dev) return { done: false, skip: true } as const;
      // The FileInput's native input is transparent over its "Choose file" face, and globals.css
      // draws the ring on that face (`.ie-file__input:focus-visible + .ie-file__button`).
      const face = el.matches(".ie-file__input:focus-visible") ? el.nextElementSibling : null;
      const cs = getComputedStyle(face ?? el);
      // The ring is the outline (DESIGN.md 9.1: 2 px indigo; HC 3 px black or white). The 4 px halo
      // box-shadow alone is the ground colour and is not a visible indicator, so it does not count.
      // A date input's picker button sits in the input's shadow tree: the input matches
      // :focus-within there, not :focus-visible, and globals.css draws the ring for that state.
      const ring = (el.matches(":focus-visible") || (el.tagName === "INPUT" && el.matches(":focus-within"))) && cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) >= 2 && cs.outlineColor !== "rgba(0, 0, 0, 0)" && cs.outlineColor !== "transparent";
      const b = el.getBoundingClientRect();
      // Covered: the element's centre is under another element that is not it or inside it.
      const cx = Math.min(Math.max(b.left + b.width / 2, 0), innerWidth - 1);
      const cy = Math.min(Math.max(b.top + b.height / 2, 0), innerHeight - 1);
      const top = document.elementFromPoint(cx, cy);
      const covered = b.width > 1 && b.height > 1 && !!top && top.tagName !== dev && top !== el && !el.contains(top) && !top.contains(el) && !(el as HTMLElement).closest("dialog, [role=dialog]");
      const name = (el.getAttribute("aria-label") ?? el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 30);
      return { done: false, skip: false, ring, covered, name: `${el.tagName.toLowerCase()} "${name}"` } as const;
    }, [DEV_OVERLAY, first] as const);
    first = false;
    if (r.done) {
      ended = true;
      break;
    }
    if (r.skip) continue;
    if (!r.ring) out.push(`no focus indicator: ${r.name}`);
    if (r.covered) out.push(`covered by other content: ${r.name}`);
  }
  if (!ended) out.push(`focus neither left the page nor wrapped within ${MAX_STOPS} Tab stops`);
  return out;
}

test("focus: a visible indicator on every Tab stop, never hidden under sticky chrome", async ({ browser }) => {
  const found: string[] = [];
  // Real Tab presses at 1280 and 390 px, in all four display settings (study routes force light).
  for (const viewport of [DESKTOP, PHONE]) {
    for (const theme of THEMES) {
      const tag = `${viewport.width} ${theme.id}`;
      const ctx = await themed(browser, viewport, theme);
      const p = await ctx.newPage();
      for (const path of ["/", "/explore", "/about", "/sign-in", "/study"]) {
        await settle(p, path);
        for (const f of await focusAudit(p)) found.push(`${tag} ${path}: ${f}`);
      }
      await startDemo(p);
      const paths = await studyPaths(p);
      for (const path of paths) {
        await settle(p, path);
        for (const f of await focusAudit(p)) found.push(`${tag} ${path}: ${f}`);
      }
      // The museum overlays: StudyBar, room contents and plan, then the panel with a concept open.
      await settle(p, MUSEUM);
      await p.waitForFunction(() => (window as unknown as { __museumInfo?: () => { ready: boolean } }).__museumInfo?.().ready === true, null, { timeout: 600_000 });
      for (const f of await focusAudit(p)) found.push(`${tag} /learn/immersive: ${f}`);
      const key = keyFromSlug(decodeURIComponent(paths[2]!.replace("/learn/2d/concepts/", "")));
      if (await openInMuseum(p, key)) {
        for (const f of await focusAudit(p, false)) found.push(`${tag} /learn/immersive panel: ${f}`);
      } else found.push(`${tag} 3D: could not open ${key}`);
      await ctx.close();
      // Every study step a participant passes (fresh fixture participant).
      const part = await themed(browser, viewport, theme);
      const q = await part.newPage();
      await studyJourney(q, async (path) => {
        for (const f of await focusAudit(q)) found.push(`${tag} ${path}: ${f}`);
      });
      await part.close();
      const staff = await themed(browser, viewport, theme);
      const s = await staff.newPage();
      await signIn(s);
      for (const path of await consolePaths(s)) {
        await settle(s, path);
        for (const f of await focusAudit(s)) found.push(`${tag} ${path}: ${f}`);
      }
      await staff.close();
    }
  }
  expect(found).toEqual([]);
});

test("keyboard: LayerTabs arrows, record and lightbox Escape restore focus, skip link in both conditions", async ({ browser }) => {
  const found: string[] = [];
  const ctx = await newContext(browser, { viewport: DESKTOP });
  const p = await ctx.newPage();
  await startDemo(p);
  const paths = await studyPaths(p);
  const concept = paths[2]!;
  const check2d3d = async (root: string, side: string) => {
    // LayerTabs: ArrowRight moves to and selects the next tab; Home returns to the first.
    const tabs = p.locator(`${root} [role=tab]`);
    if ((await tabs.count()) > 1) {
      await tabs.first().focus();
      await p.keyboard.press("ArrowRight");
      if ((await tabs.nth(1).getAttribute("aria-selected")) !== "true" || !(await tabs.nth(1).evaluate((t) => t === document.activeElement))) found.push(`${side}: ArrowRight did not move the layer tab`);
      await p.keyboard.press("Home");
      if ((await tabs.first().getAttribute("aria-selected")) !== "true") found.push(`${side}: Home did not return to the first tab`);
    }
    // CitationRecord (in place, DR-022 Addendum A): Escape inside it closes it and restores focus to
    // its marker; a second activation of the marker also closes it.
    const note = p.locator(`${root} ol[aria-label='Statements'] [data-slot=citation-marker]`).first();
    await note.click();
    const record = p.locator(`[id="${(await note.getAttribute("aria-controls")) ?? ""}"]`);
    if (!(await record.isVisible())) found.push(`${side}: the marker did not open its record`);
    const inRecord = record.locator("a").first();
    if ((await inRecord.count()) > 0) {
      await inRecord.focus();
      await p.keyboard.press("Escape");
      if (!(await note.evaluate((b) => b === document.activeElement && b.getAttribute("aria-expanded") === "false"))) found.push(`${side}: record Escape did not restore focus`);
    } else {
      await note.click();
      if ((await note.getAttribute("aria-expanded")) !== "false") found.push(`${side}: a second activation did not close the record`);
    }
    // FigureLightbox: Escape closes it and restores focus to Enlarge.
    const enlarge = p.locator(root).getByRole("button", { name: /^Enlarge figure 1$/ }).first();
    if ((await enlarge.count()) > 0) {
      await enlarge.click();
      if (!(await p.locator("dialog[open]").first().isVisible())) found.push(`${side}: lightbox did not open`);
      await p.keyboard.press("Escape");
      if (!(await enlarge.evaluate((b) => b === document.activeElement))) found.push(`${side}: lightbox Escape did not restore focus`);
    }
  };
  // The skip link is the first Tab stop of the view (after the demo AccessNotice's "End demo",
  // which participants never see) and moves focus to the content.
  const firstStop = async () => {
    await focusTop(p);
    for (let i = 0; i < 5; i++) {
      await p.keyboard.press("Tab");
      if (!(await p.evaluate(() => !!document.activeElement?.closest("[data-access-notice]")))) break;
    }
    return p.evaluate(() => document.activeElement?.getAttribute("data-slot"));
  };
  // 2D.
  await settle(p, concept);
  const skip2 = await firstStop();
  if (skip2 !== "study-skip-link") found.push(`2D: first Tab stop is ${skip2}, not the skip link`);
  else {
    await p.keyboard.press("Enter");
    const target = await p.evaluate(() => document.activeElement?.id ?? "");
    if (!target) found.push("2D: the skip link moved focus nowhere");
  }
  await check2d3d("main [data-slot=knowledge-sheet]:visible", "2D");
  // 3D: same checks on the panel.
  await p.goto(MUSEUM);
  await p.waitForFunction(() => (window as unknown as { __museumInfo?: () => { ready: boolean } }).__museumInfo?.().ready === true, null, { timeout: 600_000 });
  const skip3 = await firstStop();
  if (skip3 !== "study-skip-link") found.push(`3D: first Tab stop is ${skip3}, not the skip link`);
  else {
    await p.keyboard.press("Enter");
    const target = await p.evaluate(() => document.activeElement?.id ?? "");
    if (!target) found.push("3D: the skip link moved focus nowhere");
  }
  const key = keyFromSlug(decodeURIComponent(concept.replace("/learn/2d/concepts/", "")));
  if (await openInMuseum(p, key)) await check2d3d("#museum-panel [data-slot=knowledge-sheet]", "3D");
  else found.push(`3D: could not open ${key}`);
  await ctx.close();
  expect(found).toEqual([]);
});
