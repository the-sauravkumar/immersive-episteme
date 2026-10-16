/**
 * Interface parity suite (DESIGN.md 12.4, P1-P33; 18 WP8 task 1, 18.0 package 2D-C).
 *
 * For one concept of each study tradition (canonical order: Ajrakh, Machilipatnam Kalamkari,
 * Sanganeri) it compares the 2D concept page with the 3D information panel for the SAME concept,
 * at 390 x 844, 768 x 1024, 1280 x 720 (a 1920 x 1080 laptop at 150%), 1280 x 800 and 1440 x 900,
 * in the light, dark, high-contrast light and high-contrast dark display settings, plus the layout
 * checks P28 and P30 at 1024 x 768 and 1920 x 1080 (light), and writes every measured value to
 * analysis/parity/interface-parity.json (schema: src/features/research/interface-parity.ts),
 * which the Equivalence Monitor reads. Nothing in the report is assumed or copied: a check that
 * was not measured in a run is absent from that run.
 *
 * Notes on scope, recorded in the report as well:
 *  - Study mode is light only (DR-019): on study routes the display sync removes "dark", so the
 *    dark and high-contrast dark runs measure what a participant who chose dark would see (light,
 *    or high-contrast light). Each run records the effective theme it measured.
 *  - The concept is chosen per tradition from the 3D process room: the first station whose 2D page
 *    carries a knowledge figure (so P14 compares a real figure), else the first station.
 *  - P19, P20 and P21 are properties of the code and of the study bundle, not of a viewport; they
 *    are measured once and recorded in the 1280 x 800 light run of each tradition.
 *  - The museum runs headless, on SwiftShader by default or on the discrete GPU with PW_GPU=1
 *    (playwright.config.ts); the renderer string is recorded. `?allowSoftware=1&probe=1` is honoured only
 *    outside study mode. No timing check here depends on GPU speed except P16, which measures
 *    figure decode only.
 *  - Guidance fixture (P22-P24): the demo learning routes read the protocol settings of the newest
 *    demo study pinned to the review snapshot. For the run, a demo study ("Demo: Interface parity
 *    guidance fixture") that copies that study and turns on the hybrid guidance with a demo hint is
 *    inserted, so the hint panel and the stall cue render in both conditions; it is deleted at the
 *    end. The stall cue needs a fresh stall timer, so it is measured after the main loop on freshly
 *    loaded pages at 1280 x 800, in light and in light with high contrast.
 *  - A part of a check that cannot be measured is listed in the check's `notMeasured`, which makes
 *    the check "partial" on the Equivalence Monitor, never "pass".
 *  - P26 reads the room plaques from the museum probe: each plaque's size, and its contrast at the
 *    2.5 m signage distance (as immersive-rendering.spec.ts), for every plaque of each study
 *    tradition's wing and of the hall door into it, measured once at 1280 x 800 and reported in the
 *    1280 x 800 runs only (never copied into runs that did not measure it). The 2D side compares
 *    the three study traditions' catalogue cards and index rows, and requires all three present.
 *  - Citations (DR-022 Addendum A): each claim ends with numbered markers [n] that expand the record
 *    in place; the sheet ends with one deduplicated reference list. P5 compares the reference list
 *    text too; P11 requires every record to open under its own claim.
 *  - P28 (rail): the default open state is read on a fresh load (2D at every viewport; 3D on the
 *    museum's first load at 1280 x 800 for the docked widths, and after a row choice below 1280 px,
 *    where choosing a row closes the drawer, i.e. the default). Geometry and type are read with the
 *    rail shown in both. P29 checks rail and index strings against the claims and the 2D index
 *    numbers against the 3D Plan (the rails' strings read with each rail shown). P33 counts the
 *    elements competing for attention with the open concept on the first screen (DESIGN.md 12.4,
 *    the cognitive-load rule), in each condition's default state (both rails collapsed, DR-021
 *    Addendum B: the 3D exhibit is opened from the rail, which is then collapsed again, the state a
 *    plaque click leaves) and again with the rail shown in both.
 *
 * Machine limits: one browser, one worker, run against the dev server already up on :3300
 * (PORT=3300). The run takes a long time by design (48 combinations), so it is not part of the
 * default quick checks: set PARITY_QUICK=1 to run only 1280 x 800 light for every tradition.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import sharp from "sharp";

import { knowledgeBundleSchema } from "@/features/knowledge/contracts";
import * as strings from "@/features/learning/strings";
import { interfaceParityReportSchema, PARITY_CHECKS, type InterfaceParityCheck, type InterfaceParityRun } from "@/features/research/interface-parity";
import { studyConfigSchema } from "@/features/study/contracts";
import { figureBalance, runParityChecks } from "@/server/research/parity/engine";
import { loadParityInput } from "@/server/research/parity/store";

import { importGraphParity, stringTableParity } from "../unit/design/static-checks";

import { PARITY_HELPERS } from "./parity-helpers";
import { closeDb, db } from "./study-fixtures";

test.describe.configure({ mode: "serial", timeout: 4 * 60 * 60_000 });
test.use({ navigationTimeout: 180_000, actionTimeout: 60_000 });

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REPORT = path.join(ROOT, "analysis/parity/interface-parity.json");
const ALL_STUDY_TRADITIONS = ["ajrakh", "machilipatnam-kalamkari", "sanganeri"] as const;
const QUICK = process.env.PARITY_QUICK === "1";
/** Debugging aid (PARITY_TRADITIONS=ajrakh): measures only the named traditions; the run of record measures all three. */
const STUDY_TRADITIONS = process.env.PARITY_TRADITIONS ? ALL_STUDY_TRADITIONS.filter((t) => process.env.PARITY_TRADITIONS!.split(",").includes(t)) : ALL_STUDY_TRADITIONS;
const VIEWPORTS = QUICK
  ? [{ width: 1280, height: 800 }]
  : [
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1280, height: 720 },
      { width: 1280, height: 800 },
      { width: 1440, height: 900 },
    ];
/** P28 and P30 only (the layout checks), light theme: the sheet docks from 1024 px; the widest common desktop. */
const LAYOUT_VIEWPORTS = QUICK
  ? []
  : [
      { width: 1024, height: 768 },
      { width: 1920, height: 1080 },
    ];
/** P33 limits (a project rule recorded in visual-system.md, 2D-C): elements on the first screen. */
const ATTENTION_CAP = 30;
const ATTENTION_GAP = 6;
const THEMES = QUICK
  ? [{ id: "light", dark: false, hc: false }]
  : [
      { id: "light", dark: false, hc: false },
      { id: "dark", dark: true, hc: false },
      { id: "hc-light", dark: false, hc: true },
      { id: "hc-dark", dark: true, hc: true },
    ];
const MUSEUM = "/learn/immersive?allowSoftware=1&probe=1";

type M = Record<string, unknown> & {
  styles: Record<string, string | null>;
  claimWidth: number | null;
  linesPerClaim: number[];
  visibleLines: number;
  surface: { bg: string; sheetBg: string; backdrop: string; ground: string };
  texts: { claims: string[]; notes: string[]; references: string[]; captions: string[]; credits: string[]; alts: string[] };
  headingOffset: number | null;
  chrome: { studyBar: number | null; notice: number };
  targets: { where: string; name: string; w: number; h: number; ok: boolean }[];
  contrast: { min: number; checked: number; fails: string[] };
  figures: { index: number; kind: string; src: string; alt: string; caption: string; credit: string; w: number; h: number; ratio: number }[];
  marker: string | null;
  related: { afterField: boolean; beforePager: boolean; offset: number | null } | null;
  ui: string[];
  bar: { label: string; name: string; x: number; y: number; w: number; h: number; style: string | null }[];
  progress: { h: number; track: string; fill: string | null; role: string | null; value: string | null } | null;
  titleStyle: string | null;
  theme: { dark: boolean; hc: boolean };
};

const label = (id: string) => PARITY_CHECKS.find((c) => c.id === id)?.label ?? id;
function check(id: string, value2d: InterfaceParityCheck["value2d"], value3d: InterfaceParityCheck["value3d"], delta: InterfaceParityCheck["delta"], tolerance: InterfaceParityCheck["tolerance"], passed: boolean): InterfaceParityCheck {
  return { id, label: label(id), value2d, value3d, delta, tolerance, passed };
}
const same = (id: string, a: string, b: string, extra = true) => check(id, a, b, a === b ? "none" : "differs", 0, a === b && extra);
const hashOf = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
};
const short = (s: string, n = 120) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

async function measure(page: Page, side: "2d" | "3d"): Promise<M> {
  const m = (await page.evaluate((s) => (window as unknown as { __parity: { measure(o: { side: string }): unknown } }).__parity.measure({ side: s }), side)) as M & { error?: string };
  if (m.error) throw new Error(`${side}: ${m.error}`);
  return m;
}

/** Tab presses from the focused sheet h1 until a citation marker [n] has focus (P13), or -1. */
async function tabStopsToNote(page: Page, side: "2d" | "3d"): Promise<number> {
  await focusTitle(page, side);
  for (let n = 1; n <= 40; n++) {
    await page.keyboard.press("Tab");
    const onNote = await page.evaluate(() => document.activeElement?.getAttribute("data-slot") === "citation-marker");
    if (onNote) return n;
  }
  return -1;
}

/** Shift+Tab presses from the focused sheet h1 until "Finish learning" has focus (P24), or -1. */
async function backTabsToFinish(page: Page, side: "2d" | "3d"): Promise<number> {
  await focusTitle(page, side);
  for (let n = 1; n <= 80; n++) {
    await page.keyboard.press("Shift+Tab");
    const name = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return el ? (el.getAttribute("aria-label") ?? el.textContent ?? "").trim() : "";
    });
    if (/^Finish learning$/i.test(name)) return n;
  }
  return -1;
}

async function focusTitle(page: Page, side: "2d" | "3d") {
  await page.evaluate((s) => {
    const p = (window as unknown as { __parity: { sheetOf(s: string): HTMLElement | null } }).__parity;
    const h = p.sheetOf(s)?.querySelector<HTMLElement>("h1");
    h?.focus({ preventScroll: true });
  }, side);
}

const sheetLocator = (page: Page, side: "2d" | "3d") => (side === "3d" ? page.locator("#museum-panel [data-slot=knowledge-sheet]") : page.locator("main [data-slot=knowledge-sheet]:visible"));

/** P11 and the parts of P1, P9 and P14 that need an interaction. */
async function interactions(page: Page, side: "2d" | "3d") {
  const sheet = sheetLocator(page, side).first();
  const out = { record: "n/a", lightbox: "n/a", layer: "n/a", back: "n/a", noteEscape: "n/a", lightboxEdge: null as number | null, lightboxClose: null as { w: number; h: number } | null };
  // One activation to the expanded citation record (in place, under the claim); Escape inside the
  // record closes it and returns focus to the marker; a second activation also closes it.
  const note = sheet.locator("ol[aria-label='Statements'] [data-slot=citation-marker]").first();
  if ((await note.count()) > 0) {
    await note.click();
    const recId = (await note.getAttribute("aria-controls")) ?? "";
    const rec = page.locator(`[id="${recId}"]`);
    const inPlace = await note.evaluate((b) => {
      const r = document.getElementById(b.getAttribute("aria-controls") ?? "");
      return !!r && r.closest("li") === b.closest("li");
    });
    out.record = (await rec.isVisible()) && inPlace ? "1" : "not reached in 1";
    const link = rec.locator("a").first();
    if ((await link.count()) > 0) {
      await link.focus();
      await page.keyboard.press("Escape");
      out.noteEscape = (await note.evaluate((b) => document.activeElement === b && b.getAttribute("aria-expanded") === "false")) ? "1" : "focus not returned";
    } else {
      await note.click();
      out.noteEscape = (await note.getAttribute("aria-expanded")) === "false" ? "n/a (no link in the record; closed by a second activation)" : "not closed";
    }
  }
  // One activation to the lightbox; Escape returns focus to Enlarge.
  const enlarge = sheet.getByRole("button", { name: /^Enlarge figure 1$/ }).first();
  if ((await enlarge.count()) > 0 && (await enlarge.isVisible())) {
    await enlarge.click();
    const dialog = page.locator("dialog[open]").first();
    out.lightbox = (await dialog.isVisible()) ? "1" : "not reached in 1";
    const box = await dialog.evaluate((d) => {
      const media = d.querySelector("img, [data-slot=structure-diagram], [role=img]") as HTMLElement | null;
      const r = media?.getBoundingClientRect();
      const close = Array.from(d.querySelectorAll("button")).find((b) => /close/i.test(b.getAttribute("aria-label") ?? b.textContent ?? ""));
      const c = close?.getBoundingClientRect();
      return { edge: r ? Math.round(Math.max(r.width, r.height)) : null, close: c ? { w: Math.round(c.width), h: Math.round(c.height) } : null };
    });
    out.lightboxEdge = box.edge;
    out.lightboxClose = box.close;
    await page.keyboard.press("Escape");
    out.back = (await enlarge.evaluate((b) => document.activeElement === b)) ? "1" : "focus not returned";
  }
  // One activation to switch layer (when the concept has more than one layer).
  const tabs = sheet.getByRole("tab");
  if ((await tabs.count()) > 1) {
    const second = tabs.nth(1);
    await second.click();
    out.layer = (await second.getAttribute("aria-selected")) === "true" ? "1" : "not reached in 1";
    await tabs.nth(0).click();
  }
  return out;
}

/**
 * A shared component as rendered (P23): its serialised DOM, with ids and id references removed
 * (they come from useId and differ by render order, not by design), and the computed styles of it
 * and every descendant. Digits are masked when `maskDigits` (the timer's running value).
 */
async function serialise(page: Page, selector: string, maskDigits = false): Promise<{ html: string; styles: string } | null> {
  return page.evaluate(
    ([sel, mask]) => {
      const el = Array.from(document.querySelectorAll<HTMLElement>(sel)).find((e) => e.checkVisibility({ checkVisibilityCSS: true }));
      if (!el) return null;
      let html = el.outerHTML.replace(/ (?:id|for|aria-controls|aria-labelledby|aria-describedby)="[^"]*"/g, "");
      if (mask) html = html.replace(/\d/g, "#");
      const PROPS = ["font-family", "font-size", "line-height", "font-weight", "letter-spacing", "color", "background-color", "border-top-width", "border-top-color", "border-left-width", "border-left-color", "padding-top", "padding-left", "width", "height"];
      const styles = [el, ...Array.from(el.querySelectorAll<HTMLElement>("*"))]
        .map((n) => {
          const cs = getComputedStyle(n);
          return `${n.tagName}:${PROPS.map((p) => cs.getPropertyValue(p)).join(",")}`;
        })
        .join(";");
      return { html, styles };
    },
    [selector, maskDigits] as const,
  );
}
const sigOf = (s: { html: string; styles: string } | null) => (s ? `${hashOf(s.html)}/${hashOf(s.styles)}` : "absent");

/** P23 and P24 on the shared chrome: the hint panel (DOM, styles, open and close counts) and the timer. */
async function sharedChrome(page: Page) {
  const hint = page.locator("[data-slot=study-bar] [data-slot=guidance-hint] > button").first();
  const result = { hintPanel: "absent", hintOpen: "n/a", hintClose: "n/a", timer: "absent", displaySettings: 0 };
  result.timer = sigOf(await serialise(page, "[data-slot=study-bar] [data-slot=learning-timer]", true));
  result.displaySettings = await page.getByRole("button", { name: /display settings/i }).count();
  if ((await hint.count()) > 0 && (await hint.isVisible())) {
    await hint.click();
    const panel = page.locator("[data-slot=study-bar] [data-slot=guidance-hint] [role=region]").first();
    result.hintOpen = (await panel.isVisible()) ? "1" : "not open";
    result.hintPanel = sigOf(await serialise(page, "[data-slot=study-bar] [data-slot=guidance-hint] [role=region]"));
    const close = panel.getByRole("button", { name: /close/i }).first();
    await close.click();
    result.hintClose = (await panel.isVisible()) ? "not closed" : "1";
  }
  return result;
}

type RailInfo = {
  shown: boolean;
  button: string;
  geometry: { x: number; y: number; w: number; h: number; position: string; overflowY: string; bg: string; edge: string; row: string | null; rowMin: number | null; rowType: string | null; detailType: string | null; heading: string | null } | null;
};
const parity = <T,>(page: Page, method: string, ...args: unknown[]) =>
  page.evaluate(([m, a]) => (window as unknown as { __parity: Record<string, (...x: unknown[]) => unknown> }).__parity[m as string]!(...(a as unknown[])), [method, args] as const) as Promise<T>;

/**
 * P28: the rail's geometry and type with the rail shown (opened from its StudyBar button when it
 * is hidden, then hidden again so the page is left as it was).
 */
async function railShown(page: Page, side?: "2d" | "3d"): Promise<RailInfo & { attention?: Attention }> {
  const now = await parity<RailInfo>(page, "rail");
  // P33 with the rail shown: counted with the rail on screen, the second state P33 compares.
  const withAttention = async (r: RailInfo) => (side ? { ...r, attention: await parity<Attention>(page, "attention", side) } : r);
  if (now.shown) return withAttention(now);
  const button = page.locator("[data-slot=study-bar] [data-slot=rail-button]").first();
  if ((await button.count()) === 0 || !(await button.isVisible())) return now;
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-slot=place-rail]:visible").first()).toBeVisible({ timeout: 10_000 });
  const shown = await withAttention(await parity<RailInfo>(page, "rail"));
  await page.locator("[data-slot=place-rail]:visible [data-slot=rail-hide]").first().click();
  return shown;
}

type Attention = { sheet: number; chrome: number; navigation: number; total: number };

/**
 * The rail as the participant sees it: left edge, width, scrolling, surface, edge rule, row box and
 * type. The CSS position scheme is not part of it: the 2D rail is fixed to the viewport and the 3D
 * rail is absolute in the full-viewport museum, which places it at the same x, width and top.
 */
const railSig = (g: RailInfo["geometry"]) => (g ? `x ${g.x}, w ${g.w}, ${g.overflowY}, ${g.bg}, edge ${g.edge}, row ${g.row}, type ${hashOf(`${g.rowType}|${g.detailType}|${g.heading}`)}` : "not shown");

/** P29: a rail or index string that repeats claim text (eight consecutive words of a claim, or a whole claim). */
function claimLeaks(strings: readonly string[], claims: readonly string[]): string[] {
  const words = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
  const shingles = new Set<string>();
  for (const c of claims) {
    const w = words(c);
    for (let i = 0; i + 8 <= w.length; i++) shingles.add(w.slice(i, i + 8).join(" "));
  }
  return strings.filter((s) => {
    if (claims.some((c) => c.trim() === s.trim())) return true;
    const w = words(s);
    for (let i = 0; i + 8 <= w.length; i++) if (shingles.has(w.slice(i, i + 8).join(" "))) return true;
    return false;
  });
}

type SheetGeometry = { x: number; w: number; top: number; sheetX: number; sheetW: number; scroller: string; overflowY: string; scrollsInside: boolean } | null;

/** P30: the sheet column's left edge, width and top within 1 px; the same scroll container behaviour. */
function geometryCheck(g2: SheetGeometry, g3: SheetGeometry): InterfaceParityCheck {
  const sig = (g: SheetGeometry) => (g ? `x ${g.x}, w ${g.w}, top ${g.top}, sheet ${g.sheetX}+${g.sheetW}, ${g.scroller} ${g.overflowY}${g.scrollsInside ? ", scrolls inside" : ""}` : "absent");
  if (!g2 || !g3) return check("P30", sig(g2), sig(g3), "absent", "within 1 px; same scroll container", false);
  const d = Math.max(Math.abs(g2.x - g3.x), Math.abs(g2.w - g3.w), Math.abs(g2.top - g3.top), Math.abs(g2.sheetX - g3.sheetX), Math.abs(g2.sheetW - g3.sheetW));
  const same = g2.scroller === g3.scroller && g2.overflowY === g3.overflowY && g2.scrollsInside === g3.scrollsInside;
  return check("P30", sig(g2), sig(g3), Math.round(d * 10) / 10, "within 1 px; same scroll container", d <= 1 && same);
}

/** P29 (see railContentCheck). */
/** The rail's strings, read with the rail shown (it is collapsed by default in both, DR-021 Addendum B), then hidden again. */
async function railStringsShown(page: Page): Promise<string[]> {
  const button = page.locator("[data-slot=study-bar] [data-slot=rail-button]").first();
  const collapsed = (await button.count()) > 0 && (await button.isVisible()) && (await button.getAttribute("aria-expanded")) !== "true";
  if (collapsed) {
    await button.click();
    await expect(page.locator("[data-slot=place-rail]:visible").first()).toBeVisible({ timeout: 10_000 });
  }
  const strings = (await parity<string[] | null>(page, "railStrings")) ?? [];
  if (collapsed) await page.locator("[data-slot=place-rail]:visible [data-slot=rail-hide]").first().click();
  return strings;
}

async function railContentCheck(page2d: Page, page3d: Page, claims: readonly string[]): Promise<InterfaceParityCheck> {
  const rail2 = await railStringsShown(page2d);
  const rail3 = await railStringsShown(page3d);
  const index = await parity<{ strings: string[]; sections: { tradition: string; number: string; title: string }[] } | null>(page2d, "indexStrings");
  const leaks2 = claimLeaks([...rail2, ...(index?.strings ?? [])], claims);
  const leaks3 = claimLeaks(rail3, claims);
  const rooms = await planRooms(page3d);
  const notMeasured: string[] = ["in-scene lettering (plaques, door signs): read by the 3D track's museum probe and checked in immersive-rendering.spec.ts, not here"];
  let numbers = "not compared";
  let numbersOk = true;
  if (!index || index.sections.length === 0) notMeasured.push("2D index section numbers: the index is not on screen at this viewport");
  else if (!rooms) notMeasured.push("3D Plan room numbers: the Plan dialog did not open");
  else {
    const key = (x: string) => x.toLowerCase().replace(/\s+/g, " ").trim();
    const matched = index.sections.filter((sec) => rooms.some((r) => key(r.name) === key(sec.title)));
    const wrong = matched.filter((sec) => !rooms.some((r) => key(r.name) === key(sec.title) && r.number === sec.number));
    numbers = `${matched.length} of ${index.sections.length} sections matched to rooms by name, ${wrong.length} with another number`;
    if (matched.length === 0) notMeasured.push("index-to-Plan numbers: no 2D section title matched a 3D room name");
    numbersOk = wrong.length === 0;
  }
  const c = check(
    "P29",
    short(`${rail2.length} rail and ${index?.strings.length ?? 0} index strings, ${leaks2.length} repeating claim text${leaks2.length ? `: ${leaks2.slice(0, 2).join("; ")}` : ""}`, 200),
    short(`${rail3.length} rail strings, ${leaks3.length} repeating claim text${leaks3.length ? `: ${leaks3.slice(0, 2).join("; ")}` : ""}; ${numbers}`, 200),
    leaks2.length + leaks3.length === 0 && numbersOk ? "none" : "claim text in navigation or numbers differ",
    "no claim text; index numbers = Plan numbers",
    rail2.length > 0 && rail3.length > 0 && leaks2.length === 0 && leaks3.length === 0 && numbersOk,
  );
  c.notMeasured = notMeasured;
  return c;
}

/** P29, 3D: the Plan dialog's numbered rooms, opened from the StudyBar and closed again. */
async function planRooms(page: Page): Promise<{ number: string; name: string }[] | null> {
  const plan = page.locator("[data-slot=study-bar]").getByRole("button", { name: /^Plan$/ }).first();
  if ((await plan.count()) === 0 || !(await plan.isVisible())) return null;
  await plan.click();
  const dialog = page.locator("[data-slot=museum-plan-dialog]");
  try {
    await expect(dialog).toBeVisible({ timeout: 10_000 });
  } catch {
    return null;
  }
  const rooms = await parity<{ number: string; name: string }[] | null>(page, "planRooms");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden({ timeout: 10_000 });
  return rooms;
}

/**
 * The guidance fixture (see the header): a copy of the demo study the demo learning routes read,
 * with the hybrid guidance on and a demo hint, inserted as the newest demo study on the same review
 * snapshot. `stallSeconds` is set per phase: long during the main loop (no stall cue appears while
 * other checks are measured), 10 s (the protocol minimum) for the stall-cue phase.
 */
const FIXTURE_SLUG = "demo-parity-guidance-fixture";
const FIXTURE_HINT = "Demo: interface parity fixture. This hint text is shown only while the automated parity run measures the hint panel.";
async function installGuidanceFixture(): Promise<boolean> {
  await removeGuidanceFixture();
  const r = await db().query(
    `INSERT INTO studies (slug, title, description, protocol_version, design, snapshot_id, manifest_id, config, allow_unverified_content, is_demo)
     SELECT $1, 'Demo: Interface parity guidance fixture', 'Demo: inserted and deleted by tests/e2e/parity.spec.ts. Never real data.',
            st.protocol_version, st.design, st.snapshot_id, st.manifest_id,
            st.config || jsonb_build_object('guidance', jsonb_build_object('policy', 'hybrid', 'cueEnabled', true, 'stallSeconds', 1800, 'hintText', $2::text)),
            st.allow_unverified_content, true
       FROM content_snapshots s
       JOIN LATERAL (SELECT * FROM studies WHERE is_demo AND snapshot_id = s.id ORDER BY created_at DESC, id DESC LIMIT 1) st ON true
      WHERE s.kind = 'review' AND NOT s.is_demo
      ORDER BY s.created_at DESC, s.id DESC LIMIT 1`,
    [FIXTURE_SLUG, FIXTURE_HINT],
  );
  return (r.rowCount ?? 0) > 0;
}
async function setFixtureStallSeconds(seconds: number) {
  await db().query(`UPDATE studies SET config = jsonb_set(config, '{guidance,stallSeconds}', to_jsonb($2::int)) WHERE slug = $1`, [FIXTURE_SLUG, seconds]);
}
async function removeGuidanceFixture() {
  await db().query("DELETE FROM studies WHERE slug = $1 AND is_demo", [FIXTURE_SLUG]);
}

/** The stall cue as rendered on a page whose stall timer starts fresh (no concept exposed yet). */
async function stallCueOf(page: Page): Promise<{ html: string; styles: string } | null> {
  const cue = page.locator("[data-slot=guidance-stall]").first();
  try {
    await expect(cue).toBeVisible({ timeout: 60_000 });
  } catch {
    return null;
  }
  return serialise(page, "[data-slot=guidance-stall]");
}

/** P26, 3D side: every room plaque of the study traditions' wings (and the hall door into each), by tradition. */
interface PlaqueRow {
  id: string;
  tradition: string;
  size: string;
  ratio: number | null;
}
async function measurePlaques(page: Page): Promise<PlaqueRow[]> {
  type Probe = Record<string, (...a: unknown[]) => unknown>;
  const call = <T,>(m: string, ...args: unknown[]) => page.evaluate(([mm, aa]) => (window as unknown as { __museumProbe: Probe }).__museumProbe[mm as string]!(...(aa as unknown[])), [m, args] as const) as Promise<T>;
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  // Same method as immersive-rendering.spec.ts: inside the plaque's screen rectangle (6% side inset,
  // 10% top and bottom), paper = 90th and ink = 1st luminance percentile.
  const ratioIn = async (shot: Buffer, r: { left: number; top: number; width: number; height: number }) => {
    const meta = await sharp(shot).metadata();
    const l = Math.max(0, Math.round(r.left + r.width * 0.06));
    const t = Math.max(0, Math.round(r.top + r.height * 0.1));
    const w = Math.min(meta.width!, Math.round(r.left + r.width * 0.94)) - l;
    const h = Math.min(meta.height!, Math.round(r.top + r.height * 0.9)) - t;
    if (w < 4 || h < 4) return null;
    const { data, info } = await sharp(shot).extract({ left: l, top: t, width: w, height: h }).raw().toBuffer({ resolveWithObject: true });
    const ls: number[] = [];
    for (let i = 0; i < data.length; i += info.channels) ls.push(0.2126 * lin(data[i]!) + 0.7152 * lin(data[i + 1]!) + 0.0722 * lin(data[i + 2]!));
    ls.sort((a, b) => a - b);
    const q = (f: number) => ls[Math.min(ls.length - 1, Math.floor(f * ls.length))]!;
    return (q(0.9) + 0.05) / (q(0.01) + 0.05);
  };
  const traditionOf = (roomId: string) => ALL_STUDY_TRADITIONS.find((t) => roomId.startsWith(`room:${t}:`)) ?? null;
  const views = await call<{ id: string; roomId: string; toRoomId: string; size?: { w: number; h: number } }[]>("doorSignViews", 2.5);
  const rows: PlaqueRow[] = [];
  for (const v of views) {
    const tradition = traditionOf(v.roomId) ?? traditionOf(v.toRoomId);
    if (!tradition) continue;
    await call("stability", v, 1);
    const rect = (await call<{ id: string; left: number; top: number; width: number; height: number }[]>("doorSignRects")).find((r) => r.id === v.id);
    rows.push({ id: v.id, tradition, size: v.size ? `${v.size.w} x ${v.size.h} m` : "unknown", ratio: rect ? await ratioIn(await page.screenshot(), rect) : null });
  }
  return rows;
}

async function startDemo(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.goto("/explore");
  await page.getByRole("button", { name: /conventional pages/i }).click();
  await page.waitForURL(/\/learn\/2d/, { waitUntil: "commit" });
  return page;
}

interface MuseumHandle {
  page: Page;
  /** The rail on the museum's first load, before anything is opened (P28, the 3D default at a docked width). */
  initialRail: RailInfo;
  open(exhibitId: string): Promise<{ shift: { all: number; noInput: number }; focusOnTitle: boolean }>;
  close(): Promise<void>;
}

async function openMuseum(context: BrowserContext): Promise<MuseumHandle> {
  const page = await context.newPage();
  await page.goto(MUSEUM);
  await page.waitForFunction(() => (window as unknown as { __museumInfo?: () => { ready: boolean } }).__museumInfo?.().ready === true, null, { timeout: 600_000 });
  const initialRail = await parity<RailInfo>(page, "rail");
  const handle: MuseumHandle = {
    page,
    initialRail,
    async open(exhibitId: string) {
      // The shared PlaceRail "In This Room" (DR-021) is collapsed by default in 3D: its StudyBar button
      // shows it, and it is collapsed again once the panel is open, so the open concept is measured in
      // the state a visitor who clicks the plaque in the scene sees (the rail's default; P28, P33).
      const railButton = page.locator("[data-slot=study-bar] [data-slot=rail-button]");
      const wasCollapsed = (await railButton.getAttribute("aria-expanded")) !== "true";
      if (wasCollapsed) {
        await railButton.focus();
        await page.keyboard.press("Enter");
      }
      const row = page.locator(`#museum-rail li button[data-exhibit-id="${exhibitId}"]`);
      await row.focus();
      await page.evaluate(() => (window as unknown as { __parity: { startShift(): void } }).__parity.startShift());
      await page.keyboard.press("Enter");
      const panel = page.locator("[data-slot=museum-info-panel]");
      await expect(panel).toBeVisible({ timeout: 300_000 });
      await expect(panel.locator("[data-slot=knowledge-sheet] h1")).toBeVisible();
      await page.waitForTimeout(400);
      const focusOnTitle = await page.evaluate(() => document.activeElement?.matches("#museum-panel [data-slot=knowledge-sheet] h1") ?? false);
      const shift = await page.evaluate(() => (window as unknown as { __parity: { stopShift(): { all: number; noInput: number } } }).__parity.stopShift());
      const hide = page.locator("#museum-rail [data-slot=rail-hide]");
      if (wasCollapsed && (await hide.isVisible())) {
        await hide.click();
        await expect(page.locator("#museum-rail")).toBeHidden();
      }
      return { shift, focusOnTitle };
    },
    async close() {
      if (await page.locator("[data-slot=museum-info-panel]").isVisible()) {
        await page.locator("#museum-panel [data-slot=knowledge-sheet] h1").focus();
        await page.keyboard.press("Escape");
        await expect(page.locator("[data-slot=museum-info-panel]")).toBeHidden();
      }
    },
  };
  return handle;
}

/** The exhibits of a tradition's process room and the station chosen for the run. */
async function chooseConcept(museum: MuseumHandle, page2d: Page, slug: string): Promise<{ exhibitId: string; key: string; hasFigure: boolean }> {
  const page = museum.page;
  await page.evaluate(async (s) => {
    const p = (window as unknown as { __museumProbe: { viewpoints(): { id: string; roomId: string; kind: string }[]; stability(v: unknown, n: number): Promise<unknown> } }).__museumProbe;
    const v = p.viewpoints().find((x) => x.roomId === `room:${s}:process_sequence`) ?? p.viewpoints().find((x) => x.roomId.startsWith(`room:${s}:`))!;
    await p.stability(v, 1);
  }, slug);
  const railButton = page.locator("[data-slot=study-bar] [data-slot=rail-button]");
  await expect(railButton).toBeAttached({ timeout: 120_000 });
  const wasCollapsed = (await railButton.getAttribute("aria-expanded")) !== "true";
  if (wasCollapsed) await railButton.click();
  const ids = await page.locator("#museum-rail li button[data-exhibit-id]").evaluateAll((els) => els.map((e) => e.getAttribute("data-exhibit-id")!));
  // Back to the rail's default (collapsed), so the exhibit is opened and measured from it (P28, P33).
  if (wasCollapsed) {
    await page.locator("#museum-rail [data-slot=rail-hide]").click();
    await expect(page.locator("#museum-rail")).toBeHidden();
  }
  const candidates = ids.filter((id) => id.includes(`${slug}.`));
  for (const id of candidates) {
    const key = id.replace(/^[a-z]+:/, "");
    const res = await page2d.request.get(`/learn/2d/concepts/${encodeURIComponent(key)}`);
    if (res.ok() && (await res.text()).includes('data-slot="knowledge-figure"')) return { exhibitId: id, key, hasFigure: true };
  }
  const id = candidates[0]!;
  return { exhibitId: id, key: id.replace(/^[a-z]+:/, ""), hasFigure: false };
}

/** Opens the 2D concept page by client navigation from its tradition page (P27), then reloads it for the load CLS (P15). */
async function open2d(page: Page, slug: string, key: string, theme: { dark: boolean; hc: boolean }) {
  // Pages link concepts by slug ("ajrakh-process-stage-saaj"); the route also resolves the key.
  const href = `/learn/2d/concepts/${key.replace(/[._]/g, "-")}`;
  await page.evaluate((t) => {
    try {
      localStorage.setItem("ie-display", JSON.stringify({ contrast: t.hc, reduceMotion: false }));
      localStorage.setItem("theme", t.dark ? "dark" : "light");
    } catch {
      /* storage blocked */
    }
  }, theme);
  await page.goto(`/learn/2d/traditions/${slug}`);
  await page.waitForLoadState("networkidle");
  // The concept link sits in a collapsed section disclosure: open that section first (retried until
  // the page has hydrated and the section reports itself open).
  const panelId = await page.evaluate((h) => {
    const a = Array.from(document.querySelectorAll<HTMLAnchorElement>("main a")).find((x) => x.getAttribute("href") === h);
    return a?.closest("[hidden]")?.id ?? null;
  }, href);
  if (panelId) {
    const toggle = page.locator(`[aria-controls="${panelId}"]`).first();
    await expect(async () => {
      if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "true", { timeout: 2_000 });
    }).toPass({ timeout: 60_000 });
  }
  const link = page.locator(`main a[href="${href}"]:visible`).first();
  let focusOnTitle: boolean | null = null;
  if ((await link.count()) > 0) {
    await link.click();
    await page.waitForURL((u) => u.pathname === href || decodeURIComponent(u.pathname) === decodeURIComponent(href));
    await expect(page.locator("main [data-slot=knowledge-sheet]:visible h1")).toBeVisible();
    await page.waitForTimeout(600);
    focusOnTitle = await page.evaluate(() => {
      const a = document.activeElement;
      return !!a && a.tagName === "H1" && !!a.closest("[data-slot=knowledge-sheet]") && (a as HTMLElement).checkVisibility();
    });
  }
  await page.goto(href);
  await page.waitForLoadState("networkidle");
  await expect(page.locator("main [data-slot=knowledge-sheet]:visible h1")).toBeVisible();
  await page.waitForTimeout(500);
  const cls = (await page.evaluate(() => (window as unknown as { __parity: { loadShift(): Promise<number | null> } }).__parity.loadShift())) ?? null;
  return { focusOnTitle, cls };
}

function gitCommit(): string {
  try {
    const sha = execFileSync("git", ["rev-parse", "--short=12", "HEAD"], { cwd: ROOT }).toString().trim();
    const dirty = execFileSync("git", ["status", "--porcelain"], { cwd: ROOT }).toString().trim().length > 0;
    return dirty ? `${sha}+uncommitted` : sha;
  } catch {
    return "unknown";
  }
}

/** P21: the content parity engine's figure-balance check on the demo study's bundle. */
async function figureBalanceCheck(): Promise<{ value: string; passed: boolean } | null> {
  const pool = db();
  const r = await pool.query<{ id: string }>(
    `SELECT st.id FROM studies st
       JOIN content_snapshots s ON s.id = st.snapshot_id
      WHERE st.is_demo AND s.kind = 'review' AND NOT s.is_demo
      ORDER BY s.created_at DESC, st.created_at DESC LIMIT 1`,
  );
  const id = r.rows[0]?.id;
  if (!id) return null;
  const input = await loadParityInput(pool, id);
  const fig = runParityChecks(input).checks.find((c) => c.id === "a.figures");
  if (!fig) return null;
  // The matrix behind the check, from the engine's own figure balance on the same inputs.
  const bundle = knowledgeBundleSchema.safeParse(input.snapshot?.payload);
  const config = studyConfigSchema.safeParse(input.study.config ?? {});
  let matrix = "";
  if (bundle.success && config.success) {
    const fb = figureBalance(bundle.data, config.data.traditionSlugs ?? [], { structureDiagrams: config.data.figures.structureDiagrams, figureAssets: input.figureAssets, asOf: input.asOf ?? null });
    matrix = fb.rows
      .filter((row) => Object.values(row.counts).some((n) => n > 0))
      .map((row) => `${row.sectionId} ${fb.traditionSlugs.map((t) => row.counts[t] ?? 0).join("/")}`)
      .join("; ");
  }
  return { value: short(`${fig.passed ? "balanced" : `unbalanced (${fig.issues.length} issues)`}${matrix ? `: ${matrix}` : ""}`, 200), passed: fig.passed };
}

test("interface parity P1-P33: 2D concept page vs 3D panel", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addInitScript({ content: PARITY_HELPERS });
  const runs: (InterfaceParityRun & { effectiveTheme: string; conceptKey: string; layoutOnly?: boolean })[] = [];
  const failures: string[] = [];

  // Code-level checks (P19, P20 static part) and the bundle-level check (P21), measured once.
  const graph = importGraphParity();
  const table = stringTableParity(strings);
  const balance = await figureBalanceCheck();

  try {
    const fixture = await installGuidanceFixture();
    const page2d = await startDemo(context);
    let museum = await openMuseum(context);
    const renderer = await museum.page.evaluate(() => String((window as unknown as { __museumInfo?: () => { gpu?: string } }).__museumInfo?.().gpu ?? "unknown"));
    // P26, 3D: the room plaques, measured once at 1280 x 800 before any panel opens.
    const plaques = await measurePlaques(museum.page);
    // Index and comparisons pages, per viewport and theme, for the 2D salience part of P26.
    const salience2d = new Map<string, { index: string[]; rows: string[]; comparisons: string[] }>();
    const titles = new Map<string, { t2d: string[]; t3d: string[]; m2d: string[]; m3d: string[] }>();

    for (const slug of STUDY_TRADITIONS) {
      await museum.close();
      const chosen = await chooseConcept(museum, page2d, slug);
      await museum.open(chosen.exhibitId);
      await expect(museum.page.locator("[data-slot=museum-info-panel]")).toHaveAttribute("data-concept-key", chosen.key);

      for (const vp of VIEWPORTS) {
        await page2d.setViewportSize(vp);
        await museum.page.setViewportSize(vp);
        for (const theme of THEMES) {
          const combo = `${vp.width}x${vp.height}/${theme.id}`;
          // 2D: client navigation to the concept (P27), reload for the load CLS (P15).
          const nav2d = await open2d(page2d, slug, chosen.key, theme);
          const eff2d = await page2d.evaluate(() => ({ dark: document.documentElement.classList.contains("dark"), hc: document.documentElement.classList.contains("a11y-contrast") }));
          // 3D: apply the theme, then close and reopen the panel (P15 panel open, P27).
          const eff3d = await museum.page.evaluate((t) => (window as unknown as { __parity: { applyTheme(t: unknown): Promise<{ dark: boolean; hc: boolean }> } }).__parity.applyTheme(t), theme);
          await museum.close();
          const open3d = await museum.open(chosen.exhibitId);
          await museum.page.waitForTimeout(300);

          const m2 = await measure(page2d, "2d");
          const m3 = await measure(museum.page, "3d");
          // First-screen and layout reads before any interaction moves focus or scroll (P28-P33).
          const att2 = await parity<Attention>(page2d, "attention", "2d");
          const att3 = await parity<Attention>(museum.page, "attention", "3d");
          type Geometry = { x: number; w: number; top: number; sheetX: number; sheetW: number; scroller: string; overflowY: string; scrollsInside: boolean } | null;
          const geo2 = await parity<Geometry>(page2d, "sheetGeometry", "2d");
          const geo3 = await parity<Geometry>(museum.page, "sheetGeometry", "3d");
          type Header = { html: string; closeName: string | null; closeBox: string | null; closeStyle: string | null } | null;
          const head2 = await parity<Header>(page2d, "header", "2d");
          const head3 = await parity<Header>(museum.page, "header", "3d");
          // P28 defaults: 2D on this fresh load; 3D from the first load (docked widths) or now (drawer widths).
          const railNow2 = await parity<RailInfo>(page2d, "rail");
          const railNow3 = await parity<RailInfo>(museum.page, "rail");
          type Rec = { texts: string[]; quoteStyle: string | null; sourceStyle: string | null; inPlace: boolean };
          const rec2 = await parity<Rec>(page2d, "records", "2d");
          const rec3 = await parity<Rec>(museum.page, "records", "3d");
          const motion2 = await page2d.evaluate(() => (window as unknown as { __parity: { motion(): { bad: number; sample: string[] } } }).__parity.motion());
          const motion3 = await museum.page.evaluate(() => (window as unknown as { __parity: { motion(): { bad: number; sample: string[] } } }).__parity.motion());
          const tabs2 = await tabStopsToNote(page2d, "2d");
          const tabs3 = await tabStopsToNote(museum.page, "3d");
          const back2 = await backTabsToFinish(page2d, "2d");
          const back3 = await backTabsToFinish(museum.page, "3d");
          const act2 = await interactions(page2d, "2d");
          const act3 = await interactions(museum.page, "3d");
          const chrome2 = await sharedChrome(page2d);
          const chrome3 = await sharedChrome(museum.page);
          const prog2 = await page2d.evaluate(() => (window as unknown as { __parity: { progressAtEnd(s: string): Promise<string | null> } }).__parity.progressAtEnd("2d"));
          const prog3 = await museum.page.evaluate(() => (window as unknown as { __parity: { progressAtEnd(s: string): Promise<string | null> } }).__parity.progressAtEnd("3d"));
          // P31 focus rings and P28 rail geometry (these move focus and may open the rail, so they come last).
          type Rings = Record<string, string[] | null>;
          const rings2 = await parity<Rings>(page2d, "focusRings", "2d");
          const rings3 = await parity<Rings>(museum.page, "focusRings", "3d");
          const railG2 = await railShown(page2d, "2d");
          const railG3 = await railShown(museum.page, "3d");

          const checks: InterfaceParityCheck[] = [];
          // P1: computed styles (claim, title, caption, credit, quote, the record's source line, the citation marker, the reference list).
          const styles2: Record<string, string | null> = { ...m2.styles, quote: rec2.quoteStyle, source: rec2.sourceStyle };
          const styles3: Record<string, string | null> = { ...m3.styles, quote: rec3.quoteStyle, source: rec3.sourceStyle };
          const diffs1 = Object.keys(styles2).filter((k) => styles2[k] !== styles3[k]);
          checks.push(check("P1", hashOf(JSON.stringify(styles2)), hashOf(JSON.stringify(styles3)), diffs1.length ? `differs: ${diffs1.join(", ")}` : "none", 0, diffs1.length === 0 && styles2.claim !== null && styles2.title !== null));
          // P2: claim width.
          const w2 = m2.claimWidth ?? 0;
          const w3 = m3.claimWidth ?? 0;
          checks.push(check("P2", w2, w3, Math.round((w3 - w2) * 10) / 10, 1, Math.abs(w3 - w2) <= 1 && w2 > 0));
          // P3: lines per claim.
          checks.push(same("P3", m2.linesPerClaim.join(","), m3.linesPerClaim.join(","), m2.linesPerClaim.length > 0));
          // P4: surface.
          const surf2 = `${m2.surface.bg} | backdrop ${m2.surface.backdrop}`;
          const surf3 = `${m3.surface.bg} | backdrop ${m3.surface.backdrop}`;
          checks.push(check("P4", surf2, surf3, surf2 === surf3 ? "none" : "differs", "--ground, none", m2.surface.bg === m2.surface.ground && m3.surface.bg === m3.surface.ground && m2.surface.sheetBg === m2.surface.ground && m3.surface.sheetBg === m3.surface.ground && m2.surface.backdrop === "none" && m3.surface.backdrop === "none"));
          // P5: text of claims, citation records, captions, credits and alt text.
          const t2 = JSON.stringify({ ...m2.texts, records: rec2.texts });
          const t3 = JSON.stringify({ ...m3.texts, records: rec3.texts });
          checks.push(check("P5", `${hashOf(t2)} (${m2.texts.claims.length} claims, ${rec2.texts.length} records)`, `${hashOf(t3)} (${m3.texts.claims.length} claims, ${rec3.texts.length} records)`, t2 === t3 ? "none" : "differs", 0, t2 === t3 && m2.texts.claims.length > 0));
          // P6: first heading offset below the chrome.
          const o2 = m2.headingOffset ?? NaN;
          const o3 = m3.headingOffset ?? NaN;
          checks.push(check("P6", o2, o3, Math.round((o3 - o2) * 10) / 10, 1, Math.abs(o3 - o2) <= 1));
          // P7: StudyBar and notice heights.
          const c2 = `bar ${m2.chrome.studyBar} / notice ${m2.chrome.notice}`;
          const c3 = `bar ${m3.chrome.studyBar} / notice ${m3.chrome.notice}`;
          checks.push(same("P7", c2, c3));
          // P8: claim lines visible in the first screen.
          checks.push(check("P8", m2.visibleLines, m3.visibleLines, m3.visibleLines - m2.visibleLines, 1, Math.abs(m3.visibleLines - m2.visibleLines) <= 1));
          // P9: 44 x 44 targets (sheet, StudyBar, panel Close, plan, and the lightbox Close).
          const small2 = m2.targets.filter((t) => !t.ok).map((t) => `${t.where}:${t.name} ${t.w}x${t.h}`);
          const small3 = m3.targets.filter((t) => !t.ok).map((t) => `${t.where}:${t.name} ${t.w}x${t.h}`);
          if (act2.lightboxClose && (act2.lightboxClose.w < 44 || act2.lightboxClose.h < 44)) small2.push(`lightbox close ${act2.lightboxClose.w}x${act2.lightboxClose.h}`);
          if (act3.lightboxClose && (act3.lightboxClose.w < 44 || act3.lightboxClose.h < 44)) small3.push(`lightbox close ${act3.lightboxClose.w}x${act3.lightboxClose.h}`);
          checks.push(check("P9", small2.length ? short(`${small2.length} under 44: ${small2.join("; ")}`) : `0 of ${m2.targets.length} under 44`, small3.length ? short(`${small3.length} under 44: ${small3.join("; ")}`) : `0 of ${m3.targets.length} under 44`, small3.length - small2.length, "0 under 44", small2.length === 0 && small3.length === 0));
          // P10: text contrast.
          checks.push(check("P10", m2.contrast.min, m3.contrast.min, Math.round((m3.contrast.min - m2.contrast.min) * 100) / 100, ">= 4.5", m2.contrast.min >= 4.5 && m3.contrast.min >= 4.5));
          // P11: interaction counts.
          const firstClaim2 = m2.visibleLines > 0 ? "0" : "not visible";
          const firstClaim3 = m3.visibleLines > 0 ? "0" : "not visible";
          const i2 = `claim ${firstClaim2} | record ${act2.record} | lightbox ${act2.lightbox} | layer ${act2.layer} | back ${act2.back}`;
          const i3 = `claim ${firstClaim3} | record ${act3.record} | lightbox ${act3.lightbox} | layer ${act3.layer} | back ${act3.back}`;
          const okCounts = (a: typeof act2, first: string) => first === "0" && a.record === "1" && ["1", "n/a"].includes(a.lightbox) && ["1", "n/a"].includes(a.layer) && ["1", "n/a"].includes(a.back);
          const p11 = check("P11", i2, i3, i2 === i3 ? "none" : "differs", "0 / 1 / 1 / 1 / 1; every record in place", i2 === i3 && okCounts(act2, firstClaim2) && okCounts(act3, firstClaim3) && rec2.inPlace && rec3.inPlace);
          if (!rec2.inPlace || !rec3.inPlace) p11.delta = `${p11.delta}; records in place: 2D ${rec2.inPlace}, 3D ${rec3.inPlace}`;
          checks.push(p11);
          // P12: no transitions or animations on the study route.
          checks.push(check("P12", motion2.bad === 0 ? "0 elements" : short(`${motion2.bad}: ${motion2.sample.join(", ")}`), motion3.bad === 0 ? "0 elements" : short(`${motion3.bad}: ${motion3.sample.join(", ")}`), motion3.bad - motion2.bad, "0s", motion2.bad === 0 && motion3.bad === 0));
          // P13: tab stops to the first citation note.
          checks.push(check("P13", tabs2, tabs3, tabs3 - tabs2, 0, tabs2 === tabs3 && tabs2 > 0));
          // P14: figure slots.
          const fsig = (m: M, edge: number | null) => m.figures.map((f) => `${f.index}:${f.kind}:${f.src}|${f.alt}|${f.caption}|${f.credit}|${f.w}x${f.h}`).join(";") + `|edge ${edge}`;
          const f2 = fsig(m2, act2.lightboxEdge);
          const f3 = fsig(m3, act3.lightboxEdge);
          const ratiosOk = [...m2.figures, ...m3.figures].every((f) => Math.abs(f.ratio - 1.5) <= 0.01);
          const edgesOk = [act2.lightboxEdge, act3.lightboxEdge].every((e) => e === null || e <= 768);
          checks.push(check("P14", `${m2.figures.length} figure(s) ${hashOf(f2)}; edge ${act2.lightboxEdge ?? "–"}`, `${m3.figures.length} figure(s) ${hashOf(f3)}; edge ${act3.lightboxEdge ?? "–"}`, f2 === f3 ? "none" : "differs", "equal; 3:2; edge <= 768", f2 === f3 && ratiosOk && edgesOk));
          // P15: layout shift on 2D load and on 3D panel open, both by the CLS rule (shifts within
          // 500 ms of the participant's own input are excluded, hadRecentInput). Measured at the
          // merge, the only 3D shifts on opening were input-driven: the rail drawer's rows (y 636 at
          // 390 px, 816 at 768 px) as the chosen row closed the drawer, never the sheet; 2D has the
          // same reflow on its navigation, outside any CLS window. All shifts stay in the log.
          const cls2 = nav2d.cls ?? NaN;
          const cls3 = open3d.shift.noInput;
          if (open3d.shift.all >= 0.005) console.log(`P15 ${slug} ${combo}: 3D shift ${open3d.shift.all.toFixed(3)} (no input ${open3d.shift.noInput.toFixed(3)}), sources ${JSON.stringify((open3d.shift as { sources?: string[] }).sources ?? [])}`);
          // 12.4 states 0.00, a two-decimal value: a shift below 0.005 rounds to 0.00 and passes.
          checks.push(check("P15", Math.round(cls2 * 1000) / 1000, Math.round(cls3 * 1000) / 1000, Math.round((cls3 - cls2) * 1000) / 1000, "0.00 at 2 dp (< 0.005)", cls2 < 0.005 && cls3 < 0.005));
          // P16: figure decode latency (inline SVG diagrams have no decode step).
          const kinds2 = m2.figures.map((f) => f.kind).join(",") || "none";
          const kinds3 = m3.figures.map((f) => f.kind).join(",") || "none";
          const decodeFree = (k: string) => k === "none" || k.split(",").every((x) => x === "diagram");
          checks.push(check("P16", decodeFree(kinds2) ? `0 ms (${kinds2}: inline SVG, no decode)` : `photo: measured separately`, decodeFree(kinds3) ? `0 ms (${kinds3}: inline SVG, no decode)` : `photo: measured separately`, 0, "< 150 ms", decodeFree(kinds2) && decodeFree(kinds3) && kinds2 === kinds3));
          // P17 (DR-022): no tradition marker in either condition (all traditions finalised below).
          checks.push(check("P17", m2.marker ?? "absent", m3.marker ?? "absent", !m2.marker && !m3.marker ? "none" : "marker present", "absent in both", !m2.marker && !m3.marker));
          // P18: Related Concepts position.
          const r2 = m2.related ? `after field ${m2.related.afterField}, before pager ${m2.related.beforePager}, offset ${m2.related.offset}` : "absent";
          const r3 = m3.related ? `after field ${m3.related.afterField}, before pager ${m3.related.beforePager}, offset ${m3.related.offset}` : "absent";
          const relOk = (!m2.related && !m3.related) || (!!m2.related && !!m3.related && m2.related.afterField && m3.related.afterField && m2.related.beforePager && m3.related.beforePager && Math.abs((m2.related.offset ?? 0) - (m3.related.offset ?? 0)) <= 1);
          checks.push(check("P18", r2, r3, m2.related && m3.related ? Math.round(((m3.related.offset ?? 0) - (m2.related.offset ?? 0)) * 10) / 10 : "n/a", 1, relOk));
          // P20 (rendered part): the shared interface strings as rendered.
          const ui2 = m2.ui.join("\n");
          const ui3 = m3.ui.join("\n");
          const onlyIn = (a: string[], b: string[]) => a.filter((x) => !b.includes(x));
          const uiDiff = [...onlyIn(m2.ui, m3.ui).map((x) => `2D ${x}`), ...onlyIn(m3.ui, m2.ui).map((x) => `3D ${x}`)];
          // P22: shared StudyBar group and skip link.
          const barSig = (m: M) => m.bar.map((b) => `${b.label}:${b.name}:${b.style}`).join(";");
          const boxDiffs = m2.bar.flatMap((b) => {
            const o = m3.bar.find((x) => x.label === b.label);
            if (!o) return [`${b.label} missing in 3D`];
            const d = Math.max(Math.abs(o.x - b.x), Math.abs(o.y - b.y), Math.abs(o.w - b.w), Math.abs(o.h - b.h));
            return d > 1 ? [`${b.label} ${Math.round(d)} px`] : [];
          });
          const barOk = barSig(m2) === barSig(m3) && boxDiffs.length === 0 && m2.bar.length > 0;
          checks.push(check("P22", `${m2.bar.length} items ${hashOf(barSig(m2))}`, `${m3.bar.length} items ${hashOf(barSig(m3))}`, boxDiffs.length ? short(`boxes: ${boxDiffs.join(", ")}`) : barSig(m2) === barSig(m3) ? "none" : "names, order or styles differ", "identical; boxes within 1 px", barOk));
          // P23: shared component markup. Measured here: the open hint panel and the timer (DOM and
          // computed styles). The stall cue is added after the loop (it needs a fresh stall timer).
          // Not measurable in a working demo session, so listed as not measured (never a pass):
          const onboarding2 = await page2d.locator("[data-slot=onboarding]:visible").count();
          const onboarding3 = await museum.page.locator("[data-slot=onboarding]:visible").count();
          const s23a = `hint ${chrome2.hintPanel} | timer ${chrome2.timer}`;
          const s23b = `hint ${chrome3.hintPanel} | timer ${chrome3.timer}`;
          // Both sides must have rendered the parts compared: an absent part on either side is a failure, never a pass.
          const p23 = same("P23", s23a, s23b, chrome2.hintPanel !== "absent" && chrome3.hintPanel !== "absent" && chrome2.timer !== "absent" && chrome3.timer !== "absent");
          p23.notMeasured = [
            ...(onboarding2 === 0 && onboarding3 === 0 ? ["onboarding screens: shown in neither condition (onboarding is off in both, a lead decision), so there is no onboarding DOM to compare"] : []),
            "StateMessage unavailable, error and loading: these states cannot be produced on a working demo session (the unavailable message is one shared component, tests/unit/design/learning-unavailable.test.tsx)",
            "Display Settings dialog: not part of either learning shell (study mode offers it before learning, DESIGN.md 4.5)",
          ];
          if (onboarding2 !== onboarding3) {
            p23.passed = false;
            p23.delta = `onboarding screens ${onboarding2} vs ${onboarding3}`;
          }
          checks.push(p23);
          // P24: interaction counts for the shared chrome (hint open and close, Finish by keyboard).
          const s24a = `hint open ${chrome2.hintOpen}, close ${chrome2.hintClose} | Finish ${back2} back-tabs`;
          const s24b = `hint open ${chrome3.hintOpen}, close ${chrome3.hintClose} | Finish ${back3} back-tabs`;
          const p24 = same("P24", s24a, s24b, back2 > 0 && back3 > 0 && chrome2.hintOpen === "1" && chrome3.hintOpen === "1" && chrome2.hintClose === "1" && chrome3.hintClose === "1");
          if (chrome2.displaySettings === 0 && chrome3.displaySettings === 0) p24.notMeasured = ["open Display Settings: no Display Settings control in either learning shell (study mode offers it before learning, DESIGN.md 4.5)"];
          else if (chrome2.displaySettings !== chrome3.displaySettings) {
            p24.passed = false;
            p24.delta = `Display Settings controls ${chrome2.displaySettings} vs ${chrome3.displaySettings}`;
          }
          checks.push(p24);
          // P25: reading progress.
          const p25 = (m: M, end: string | null) => (m.progress ? `h ${m.progress.h}, track ${m.progress.track}, fill ${m.progress.fill}, ${m.progress.role}, end ${end}` : "absent");
          checks.push(check("P25", p25(m2, prog2), p25(m3, prog3), p25(m2, prog2) === p25(m3, prog3) ? "none" : "differs", "present; equal; 100 at end", p25(m2, prog2) === p25(m3, prog3) && prog2 === "100" && prog3 === "100"));
          // P27: focus on the sheet h1 when a concept opens.
          checks.push(check("P27", nav2d.focusOnTitle === null ? "not measured" : nav2d.focusOnTitle ? "sheet h1" : "elsewhere", open3d.focusOnTitle ? "sheet h1" : "elsewhere", "none", "sheet h1", nav2d.focusOnTitle === true && open3d.focusOnTitle));
          // P28: the PlaceRail (DR-021). Geometry and type with the rail shown in both; default open
          // state per viewport: collapsed in both conditions at every width (DR-021 Addendum B: the
          // 3D rail is collapsed by default, a lead decision, so the 2D rail is too; drawers closed).
          const wide = vp.width >= 1280;
          const def2 = railNow2.shown;
          const def3 = wide ? museum.initialRail.shown : railNow3.shown;
          // On a mismatch, the parts behind the type hash (row, detail line and heading type).
          if (railSig(railG2.geometry) !== railSig(railG3.geometry)) console.log(`P28 ${slug} ${combo}: 2D ${JSON.stringify(railG2.geometry)} | 3D ${JSON.stringify(railG3.geometry)}`);
          const railOk =
            railSig(railG2.geometry) === railSig(railG3.geometry) &&
            !!railG2.geometry &&
            (railG2.geometry.rowMin ?? 0) >= 44 &&
            (railG3.geometry?.rowMin ?? 0) >= 44 &&
            def2 === false &&
            def3 === false;
          checks.push(
            check(
              "P28",
              short(`${railSig(railG2.geometry)}; default ${def2 ? "open" : "closed"}`, 200),
              short(`${railSig(railG3.geometry)}; default ${def3 ? "open" : "closed"}`, 200),
              railSig(railG2.geometry) === railSig(railG3.geometry) ? "geometry and type equal" : "geometry or type differs",
              "equal; default closed in both; rows >= 44 px",
              railOk,
            ),
          );
          // P30: sheet geometry (from 1024 px, where the sheet docks right in both conditions).
          if (vp.width >= 1024) checks.push(geometryCheck(geo2, geo3));
          // P31: focus rings on the StudyBar, rail and sheet focusables.
          const ringSig = (r: Rings) => ["studybar", "rail", "sheet"].map((k) => `${k}: ${r[k] ? r[k]!.join(" ; ") : "absent"}`).join(" | ");
          const ringsOk = ringSig(rings2) === ringSig(rings3) && (rings2.sheet?.length ?? 0) > 0 && (rings2.studybar?.length ?? 0) > 0;
          checks.push(check("P31", short(ringSig(rings2), 240), short(ringSig(rings3), 240), ringSig(rings2) === ringSig(rings3) ? "none" : "differs", "identical in 2D and 3D", ringsOk));
          // P32: sheet header DOM and the Close control.
          const h2s = head2 ? `${hashOf(head2.html)} | ${head2.closeName} ${head2.closeBox} ${hashOf(head2.closeStyle ?? "")}` : "absent";
          const h3s = head3 ? `${hashOf(head3.html)} | ${head3.closeName} ${head3.closeBox} ${hashOf(head3.closeStyle ?? "")}` : "absent";
          checks.push(check("P32", h2s, h3s, h2s === h3s ? "none" : "differs", 'identical; accessible name "Close"', h2s === h3s && head2?.closeName === "Close"));
          // P33: elements competing for attention with the open concept on the first screen.
          // Two states (DR-021 Addendum B): each condition's default (rail collapsed: 2D opened by a link,
          // 3D as after a plaque click in the scene), and with the rail shown in both.
          const attSig = (a: Attention) => `${a.total} (sheet ${a.sheet}, chrome ${a.chrome}, navigation ${a.navigation})`;
          const attPairOk = (a: Attention, b: Attention) => a.sheet === b.sheet && Math.max(a.total, b.total) <= ATTENTION_CAP && Math.abs(a.total - b.total) <= ATTENTION_GAP;
          const railAtt2 = railG2.attention;
          const railAtt3 = railG3.attention;
          const railPair = railAtt2 && railAtt3 ? attPairOk(railAtt2, railAtt3) : true;
          const railPart = (a: Attention | undefined) => (a ? `; rail shown ${attSig(a)}` : "");
          const attGap = Math.max(Math.abs(att3.total - att2.total), railAtt2 && railAtt3 ? Math.abs(railAtt3.total - railAtt2.total) : 0);
          console.log(`P33 ${slug} ${combo}: default 2D ${attSig(att2)} | 3D ${attSig(att3)}${railAtt2 && railAtt3 ? ` ; rail shown 2D ${attSig(railAtt2)} | 3D ${attSig(railAtt3)}` : ""}`);
          checks.push(
            check(
              "P33",
              short(`default ${attSig(att2)}${railPart(railAtt2)}`, 200),
              short(`default ${attSig(att3)}${railPart(railAtt3)}`, 200),
              attGap,
              `both states: sheet equal; each total <= ${ATTENTION_CAP}; gap <= ${ATTENTION_GAP}`,
              attPairOk(att2, att3) && railPair,
            ),
          );
          // P29: rail and index strings are titles, types, steps and destinations, never claim text;
          // 2D index numbers equal the 3D Plan's room numbers (measured once per tradition, 1280 x 800 light).
          if (vp.width === 1280 && vp.height === 800 && theme.id === "light") {
            checks.push(await railContentCheck(page2d, museum.page, [...m2.texts.claims, ...m3.texts.claims]));
          }

          // P20: one string table (static) and the rendered shared strings.
          const headline = vp.width === 1280 && theme.id === "light";
          checks.push(
            check(
              "P20",
              `${m2.ui.length} strings ${hashOf(ui2)}`,
              `${m3.ui.length} strings ${hashOf(ui3)}`,
              uiDiff.length ? short(`differs: ${uiDiff.join("; ")}`) : "none",
              "empty diff",
              uiDiff.length === 0 && (!headline || table.passed),
            ),
          );
          if (headline) {
            checks.push(check("P19", graph.shared.filter((s) => s.in2d).length + " shared modules", graph.shared.filter((s) => s.in3d).length + " shared modules", graph.passed ? "none" : short(`one-sided: ${graph.oneSided.join(", ")}; copies: ${graph.copies.join(", ")}`), "same module files", graph.passed));
            checks.push(check("P21", balance?.value ?? "no demo study bundle", balance?.value ?? "no demo study bundle", "same bundle", "equal per section", balance?.passed ?? false));
          }
          // P26 is finalised after every tradition (it compares traditions).
          const key = combo;
          const tt = titles.get(key) ?? { t2d: [], t3d: [], m2d: [], m3d: [] };
          tt.t2d.push(m2.titleStyle ?? "");
          tt.t3d.push(m3.titleStyle ?? "");
          tt.m2d.push(m2.marker ?? "");
          tt.m3d.push(m3.marker ?? "");
          titles.set(key, tt);
          if (!salience2d.has(key)) {
            salience2d.set(key, await salienceOf2d(page2d));
          }

          runs.push({ viewport: vp, theme: theme.id, effectiveTheme: `2D ${eff2d.dark ? "dark" : "light"}${eff2d.hc ? "+hc" : ""}, 3D ${eff3d.dark ? "dark" : "light"}${eff3d.hc ? "+hc" : ""}`, traditionKey: slug, conceptKey: chosen.key, checks });
        }
      }

      // P28 and P30 at the layout viewports (1024 x 768, 1920 x 1080), light only.
      for (const vp of LAYOUT_VIEWPORTS) {
        const light = THEMES[0]!;
        await page2d.setViewportSize(vp);
        await museum.page.setViewportSize(vp);
        await open2d(page2d, slug, chosen.key, light);
        await museum.page.evaluate((t) => (window as unknown as { __parity: { applyTheme(t: unknown): Promise<unknown> } }).__parity.applyTheme(t), light);
        await museum.close();
        await museum.open(chosen.exhibitId);
        await museum.page.waitForTimeout(300);
        const geo2 = await parity<SheetGeometry>(page2d, "sheetGeometry", "2d");
        const geo3 = await parity<SheetGeometry>(museum.page, "sheetGeometry", "3d");
        const railNow2 = await parity<RailInfo>(page2d, "rail");
        const railNow3 = await parity<RailInfo>(museum.page, "rail");
        const railG2 = await railShown(page2d);
        const railG3 = await railShown(museum.page);
        const def2 = railNow2.shown;
        const def3 = vp.width >= 1280 ? museum.initialRail.shown : railNow3.shown;
        const ok = railSig(railG2.geometry) === railSig(railG3.geometry) && !!railG2.geometry && (railG2.geometry.rowMin ?? 0) >= 44 && (railG3.geometry?.rowMin ?? 0) >= 44 && def2 === false && def3 === false;
        const checks: InterfaceParityCheck[] = [
          check(
            "P28",
            short(`${railSig(railG2.geometry)}; default ${def2 ? "open" : "closed"}`, 200),
            short(`${railSig(railG3.geometry)}; default ${def3 ? "open" : "closed"}`, 200),
            railSig(railG2.geometry) === railSig(railG3.geometry) ? "geometry and type equal" : "geometry or type differs",
            "equal; default closed in both; rows >= 44 px",
            ok,
          ),
          geometryCheck(geo2, geo3),
        ];
        runs.push({ viewport: vp, theme: light.id, effectiveTheme: "light (layout checks only)", traditionKey: slug, conceptKey: chosen.key, checks, layoutOnly: true });
      }
    }

    // P23, the stall cue: it shows once per stall timer, so each measurement needs freshly loaded
    // pages. The fixture's stall time drops to the protocol minimum (10 s) for this phase only.
    // Measured at 1280 x 800 in the two themes that take effect on study routes.
    const stall = new Map<boolean, { s2: Awaited<ReturnType<typeof stallCueOf>>; s3: Awaited<ReturnType<typeof stallCueOf>> }>();
    if (fixture) {
      await setFixtureStallSeconds(10);
      await museum.page.close();
      for (const hc of QUICK ? [false] : [false, true]) {
        const theme = { dark: false, hc };
        await page2d.setViewportSize({ width: 1280, height: 800 });
        await page2d.evaluate((t) => {
          try {
            localStorage.setItem("ie-display", JSON.stringify({ contrast: t.hc, reduceMotion: false }));
            localStorage.setItem("theme", "light");
          } catch {
            /* storage blocked */
          }
        }, theme);
        await page2d.goto("/learn/2d");
        await page2d.waitForLoadState("networkidle");
        const s2 = await stallCueOf(page2d);
        museum = await openMuseum(context);
        await museum.page.evaluate((t) => (window as unknown as { __parity: { applyTheme(t: unknown): Promise<unknown> } }).__parity.applyTheme(t), theme);
        const s3 = await stallCueOf(museum.page);
        stall.set(hc, { s2, s3 });
        await museum.page.close();
      }
    }

    // P26, 3D plaques: one size, and legible (>= 4.5:1 at 2.5 m, ratios truncated, R-A2) in every tradition.
    const trunc2 = (x: number) => (Math.floor(x * 100) / 100).toFixed(2);
    const plaqueSizes = [...new Set(plaques.map((p) => p.size))];
    const plaqueBy = ALL_STUDY_TRADITIONS.map((t) => {
      const rows = plaques.filter((p) => p.tradition === t);
      const ratios = rows.map((r) => r.ratio).filter((r): r is number => r !== null);
      return { t, n: rows.length, min: ratios.length ? Math.min(...ratios) : null, unmeasured: rows.length - ratios.length };
    });
    const plaquesOk = plaques.length > 0 && plaqueSizes.length === 1 && plaqueBy.every((p) => p.n > 0 && p.unmeasured === 0 && p.min !== null && p.min >= 4.5);
    const plaqueText = `plaques ${plaqueSizes.join(" / ") || "none"} (${plaques.length}); lowest contrast at 2.5 m ${plaqueBy.map((p) => `${p.t} ${p.min === null ? "–" : trunc2(p.min)} of ${p.n}${p.unmeasured ? `, ${p.unmeasured} unread` : ""}`).join(", ")}`;

    // P17 across traditions, P23's stall cue and P26: finalised per viewport and theme.
    for (const run of runs) {
      const key = `${typeof run.viewport === "string" ? run.viewport : `${run.viewport.width}x${run.viewport.height}`}/${run.theme}`;
      if (run.layoutOnly) {
        run.checks.sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
        for (const c of run.checks) if (!c.passed) failures.push(`${run.traditionKey} ${key} ${c.id}: 2D ${c.value2d} | 3D ${c.value3d} | ${c.delta}`);
        continue;
      }
      const tt = titles.get(key)!;
      const sal = salience2d.get(key)!;
      const allSame = (xs: string[]) => xs.length > 0 && xs.every((x) => x === xs[0]);
      const p17 = run.checks.find((c) => c.id === "P17")!;
      const noMarker = [...tt.m2d, ...tt.m3d].every((m) => m === "");
      p17.passed = p17.passed && noMarker;
      p17.delta = noMarker ? "none across 3 traditions" : "a marker is present";
      const p23 = run.checks.find((c) => c.id === "P23")!;
      const st = typeof run.viewport !== "string" && run.viewport.width === 1280 && run.viewport.height === 800 ? stall.get(run.effectiveTheme.includes("+hc")) : undefined;
      if (st) {
        const a = sigOf(st.s2);
        const b = sigOf(st.s3);
        p23.value2d = `${p23.value2d} | stall ${a}`;
        p23.value3d = `${p23.value3d} | stall ${b}`;
        const ok = !!st.s2 && !!st.s3 && st.s2.html === st.s3.html && st.s2.styles === st.s3.styles;
        if (!ok) p23.delta = p23.delta === "none" ? "stall cue differs or absent" : `${p23.delta}; stall cue differs or absent`;
        p23.passed = p23.passed && ok;
      } else {
        p23.notMeasured = [...(p23.notMeasured ?? []), "stall cue: measured in the 1280 x 800 runs only (each measurement needs freshly loaded pages)"];
      }
      // 2D: all three study traditions present on the catalogue and in the index, each identical.
      const three = ALL_STUDY_TRADITIONS.length;
      const ok2d = sal.index.length === three && allSame(sal.index) && (sal.rows.length === 0 || (sal.rows.length === three && allSame(sal.rows))) && allSame(sal.comparisons) && allSame(tt.t2d);
      // 3D: panel titles in every run; the plaques only in the 1280 x 800 runs, where they were measured.
      const plaqueRun = typeof run.viewport !== "string" && run.viewport.width === 1280 && run.viewport.height === 800;
      const ok3d = allSame(tt.t3d) && (!plaqueRun || plaquesOk);
      run.checks.push(
        check(
          "P26",
          `catalogue cards ${allSame(sal.index) ? "equal" : "differ"} (${sal.index.length} of ${three}); index rows ${sal.rows.length === 0 ? "not on screen" : `${allSame(sal.rows) ? "equal" : "differ"} (${sal.rows.length} of ${three})`}; comparison headings ${allSame(sal.comparisons) ? "equal" : "differ"} (${sal.comparisons.length}); titles ${allSame(tt.t2d) ? "equal" : "differ"}`,
          short(`panel titles ${allSame(tt.t3d) ? "equal" : "differ"} (${tt.t3d.length}); ${plaqueRun ? plaqueText : "plaques: measured in the 1280 x 800 runs"}`, 300),
          ok2d && ok3d ? "none" : "differs",
          "identical across the three study traditions; plaques one size, each >= 4.5:1 at 2.5 m",
          ok2d && ok3d,
        ),
      );
      run.checks.sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
      for (const c of run.checks) if (!c.passed) failures.push(`${run.traditionKey} ${key} ${c.id}: 2D ${c.value2d} | 3D ${c.value3d} | ${c.delta}`);
    }

    const report = interfaceParityReportSchema.parse({ runId: `parity-${new Date().toISOString()}`, commit: gitCommit(), generatedAt: new Date().toISOString(), runs });
    // The parse validates the schema; the file keeps the extra per-run fields (effective theme, concept key).
    void report;
    mkdirSync(path.dirname(REPORT), { recursive: true });
    if (!QUICK) {
      writeFileSync(
        REPORT,
        `${JSON.stringify(
          {
            runId: report.runId,
            commit: report.commit,
            generatedAt: report.generatedAt,
            environment: `headless Chromium, WebGL renderer ${renderer}; dev server, demo session; one browser, one worker`,
            notes: [
              "Study mode is light only (DR-019): the 60 main runs (5 viewports x 4 themes x 3 traditions) request four themes, but only two take effect (light, and light with high contrast); dark and high-contrast dark runs record the effective theme they measured.",
              "P19, P20 (string table) and P21 are measured once and recorded in the 1280 x 800 light run of each tradition.",
              "P16: the study figures are graph-derived inline SVG diagrams (DR-018); there is no image decode step to time.",
              "P15: 2D is the load CLS without recent input; 3D is every layout shift during the keyboard-triggered panel open. DESIGN.md 12.4 states 0.00 (two decimals): a value below 0.005 rounds to 0.00 and passes; the unrounded value is recorded.",
              `P22-P24 ran with the guidance fixture (a demo study copying the demo protocol with the hybrid guidance on and a demo hint)${fixture ? "" : ", which could not be installed: no demo study on the review snapshot"}. The stall cue is measured in the 1280 x 800 runs, on freshly loaded pages with a 10 s stall time.`,
              "P23 and P24 list the parts that a working demo session cannot show (onboarding, which is off in both conditions; StateMessage unavailable, error and loading; Display Settings, which is not in either learning shell) as not measured, so these checks show as partial, never as passed.",
              "P26 (3D) reads every room plaque of the three study traditions' wings, and the hall door into each, from the museum probe, once at 1280 x 800: plaque size, and contrast at the 2.5 m signage distance (paper 90th and ink 1st luminance percentile, as immersive-rendering.spec.ts). The plaque part is reported in the 1280 x 800 runs only; the other runs compare the 2D cards, index rows and comparison headings and the 3D panel titles.",
              "P28 and P30 also run at 1024 x 768 and 1920 x 1080 in light (6 layout-only runs). P28's 3D default at docked widths is the museum's first-load state at 1280 x 800 (the panel opens rows through the rail afterwards); below 1280 px it is the state after a row choice, which closes the drawer.",
              "P29 runs once per tradition at 1280 x 800 light: no rail or index string repeats eight consecutive words of a claim; 2D index section numbers equal the 3D Plan's room numbers where names match. In-scene lettering is checked by the 3D track's rendering spec.",
              `P33 counts visible, uncovered controls, headings, images, canvases, badges and status messages on the first screen, each once; the claim text is not counted. Pass: the sheet's count equal in both, each total <= ${ATTENTION_CAP}, and the totals within ${ATTENTION_GAP} (project limits, visual-system.md 2D-C).`,
            ],
            runs,
          },
          null,
          1,
        )}\n`,
      );
    } else {
      writeFileSync(path.join(ROOT, "test-results", "interface-parity-quick.json"), `${JSON.stringify({ ...report, runs }, null, 1)}\n`);
    }
  } finally {
    await context.close();
    await removeGuidanceFixture().catch(() => undefined);
    await closeDb();
  }
  expect(failures).toEqual([]);
});

/**
 * 2D salience inputs of P26: the study traditions' catalogue cards, their rows in the spread's
 * index (when it is on screen) and the comparison headings. Every value is a measured box and
 * computed style; an absent tradition makes the check fail (the counts are compared with 3).
 */
async function salienceOf2d(page: Page): Promise<{ index: string[]; rows: string[]; comparisons: string[] }> {
  await page.goto("/learn/2d");
  await page.waitForLoadState("networkidle");
  const index = await page.locator("main [data-slot=tradition-card]:visible").evaluateAll((cards) =>
    cards.map((c) => {
      const r = c.getBoundingClientRect();
      const title = c.querySelector(".text-h3") as HTMLElement | null;
      const cs = title ? getComputedStyle(title) : null;
      // No tradition marker on any key (P17, DR-022): a marker would add a field here.
      const marker = c.querySelector("[data-slot=tradition-marker]");
      return [Math.round(r.width), Math.round(r.height), cs ? [cs.fontFamily, cs.fontSize, cs.fontWeight, cs.color].join(",") : "", marker ? "marker" : "", c.querySelectorAll("img, picture").length].join("|");
    }),
  );
  const rows = await page.locator("[data-slot=study-index]:visible li[data-tradition] > h3 > a").evaluateAll((links) =>
    links.map((a) => {
      const r = a.getBoundingClientRect();
      const cs = getComputedStyle(a);
      const marker = a.querySelector("[data-slot=tradition-marker]");
      // Width, type, colour, marker and images; not the height, which follows the length of the
      // tradition's curated name (a long name wraps to a second line in the same row box).
      return [Math.round(r.width), cs.minHeight, cs.fontFamily, cs.fontSize, cs.fontWeight, cs.color, marker ? "marker" : "", a.querySelectorAll("img, picture").length].join("|");
    }),
  );
  await page.goto("/learn/2d/comparisons");
  await page.waitForLoadState("networkidle");
  const comparisons = await page.locator("main h3:visible").evaluateAll((hs) =>
    hs
      .filter((h) => h.querySelector("[data-slot=tradition-name]"))
      .map((h) => {
        const cs = getComputedStyle(h);
        const marker = h.querySelector("[data-slot=tradition-marker]");
        return [cs.fontFamily, cs.fontSize, cs.fontWeight, cs.color, marker ? "marker" : ""].join(",");
      }),
  );
  return { index, rows, comparisons };
}
