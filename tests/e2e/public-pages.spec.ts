/**
 * Public pages (DESIGN.md 11.1-11.4, WP1 acceptance). Runs against the dev server and the
 * development database (read-only: nothing is written).
 *
 *  - Every public page answers 200 with exactly one h1, does not scroll horizontally at 390 or
 *    1280 px, and every visible interactive element is at least 44 x 44 px.
 *  - No placeholder text ("to be confirmed", "TBC", "coming soon") and no dashed placeholder box.
 *  - The home page's numbers are live: they equal the counts read from the database by the test
 *    itself (tests/integration/public-dataset-stats.test.ts seeds a different dataset and shows
 *    the reads change with it).
 *  - Figure 1 is one static indigo plate (DR-022): no draw-on, nothing animates.
 *  - Explore: the two cards' buttons share one baseline; the Colophon lists every parity check (PARITY_CHECKS, P1 to P33)
 *    and shows a result only from a stored run.
 *  - No band, ticks or marker exist anywhere; in high contrast every pane edge is ink; every
 *    control reached by Tab shows the focus ring, in normal and high contrast.
 *  - Layout fit: the home title block is left-aligned with nothing beside it; the tradition index
 *    rows share one title edge and face; the dataset table fits 390 px without scrolling; the two
 *    Explore control tables end on one rule.
 */
import { existsSync } from "node:fs";
import path from "node:path";

import { expect, newContext, test, type Page } from "./fixtures";
import { config as loadEnv } from "dotenv";
import { Pool } from "pg";

import { PARITY_CHECKS } from "@/features/research/interface-parity";

loadEnv({ quiet: true });

test.describe.configure({ timeout: 300_000 });
test.use({ navigationTimeout: 120_000 });

const PAGES = ["/", "/about", "/about/colophon", "/explore", "/accessibility", "/privacy", "/sign-in", "/sign-out", "/forbidden"];

async function audit(page: Page, url: string) {
  // Warm the route first: on the dev server the first request compiles it, and a late chunk or a
  // font swap during that request can shift the layout under the measurement. The audit reads the
  // second, settled load.
  await page.goto(url, { waitUntil: "networkidle" });
  const res = await page.goto(url, { waitUntil: "networkidle" });
  expect(res?.status(), url).toBe(200);
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(() => {
    const d = document.documentElement;
    const small: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, summary, [role=switch]")) {
      const b = el.getBoundingClientRect();
      if (b.width === 0 || b.height === 0 || getComputedStyle(el).visibility === "hidden") continue;
      // The skip link is a 1 px visually hidden link until it takes focus.
      if (el.textContent?.trim() === "Skip to content") continue;
      if (b.width < 43.5 || b.height < 43.5) small.push(`${el.tagName} "${(el.textContent ?? "").trim().slice(0, 40)}" ${Math.round(b.width)}x${Math.round(b.height)}`);
    }
    const dashed = [...document.querySelectorAll<HTMLElement>("main *")].filter((el) => getComputedStyle(el).borderTopStyle === "dashed").length;
    return {
      overflow: d.scrollWidth - d.clientWidth,
      h1: document.querySelectorAll("h1").length,
      small,
      dashed,
      text: document.body.innerText,
    };
  });
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
]) {
  test(`public pages at ${viewport.width} px: one h1, no overflow, 44 px targets, no placeholders`, async ({ browser }) => {
    const ctx = await newContext(browser, { viewport });
    const page = await ctx.newPage();
    for (const url of PAGES) {
      const r = await audit(page, url);
      expect(r.h1, `${url} h1 count`).toBe(1);
      expect(r.overflow, `${url} scrolls horizontally`).toBeLessThanOrEqual(0);
      expect(r.small, `${url} has targets under 44 px`).toEqual([]);
      expect(r.dashed, `${url} has a dashed placeholder box`).toBe(0);
      expect(r.text, url).not.toMatch(/to be confirmed|\bTBC\b|coming soon|will (appear|be published) here/i);
    }
    await ctx.close();
  });
}

test("home page numbers are the live database counts", async ({ page }) => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    const { rows } = await pool.query<{ traditions: number; concepts: number; relationships: number; sources: number; claims: number }>(
      `SELECT (SELECT count(*)::int FROM traditions WHERE NOT is_demo) AS traditions,
              (SELECT count(*)::int FROM concepts WHERE NOT is_demo) AS concepts,
              (SELECT count(*)::int FROM relationships WHERE NOT is_demo) AS relationships,
              (SELECT count(DISTINCT source_id)::int FROM concept_claim_sources WHERE NOT is_demo) AS sources,
              (SELECT count(*)::int FROM concept_claims WHERE NOT is_demo) AS claims`,
    );
    const live = rows[0]!;
    await page.goto("/");
    const fmt = (n: number) => new Intl.NumberFormat("en-GB").format(n);
    const counts = page.locator("[data-slot=figure-one-counts]");
    await expect(counts).toBeVisible();
    for (const [n, label] of [
      [live.traditions, "traditions"],
      [live.concepts, "concepts"],
      [live.relationships, "relations"],
      [live.sources, "sources"],
    ] as const) {
      await expect(counts.getByText(`${fmt(n)} ${label}`, { exact: false })).toBeVisible();
    }
    // Table 1's total row carries the live concept and claim totals.
    const total = page.getByRole("row", { name: /^Total/ });
    await expect(total).toContainText(fmt(live.concepts));
    await expect(total).toContainText(fmt(live.claims));
    // Figure 1 and Table 1 use one definition of sources (distinct sources cited by claims).
    await expect(total).toContainText(fmt(live.sources));
    // One equal row per tradition in the index, with no image (DR-020, DR-022).
    await expect(page.locator("[data-slot=tradition-index] > li")).toHaveCount(live.traditions);
    await expect(page.locator("[data-slot=tradition-index] img")).toHaveCount(0);
  } finally {
    await pool.end();
  }
});

test("Figure 1 is a static indigo plate: no draw-on and nothing animates (DR-022)", async ({ browser }) => {
  const ctx = await newContext(browser, { viewport: { width: 1280, height: 800 }, reducedMotion: "no-preference" });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const plate = page.locator("[data-slot=figure-one-diagram]");
  await plate.scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  expect(await plate.locator("path[data-draw]").count()).toBe(0);
  const bg = await plate.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).toBe("rgb(36, 64, 110)"); // --indigo #24406E
  expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length)).toBe(0);
  await ctx.close();
});


test("Explore cards align their actions and the Colophon shows only stored parity results", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/explore");
  const tops = await Promise.all(
    ["Open conventional pages", "Open immersive museum"].map(async (name) => (await page.getByRole("button", { name }).boundingBox())!),
  );
  expect(Math.abs(tops[0]!.y - tops[1]!.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(tops[0]!.y + tops[0]!.height - (tops[1]!.y + tops[1]!.height))).toBeLessThanOrEqual(1);
  // Exactly one museum button (the immersive specs click /museum/i).
  await expect(page.getByRole("button", { name: /museum/i })).toHaveCount(1);

  await page.goto("/about/colophon");
  const rows = page.locator("#parity tbody tr");
  await expect(rows).toHaveCount(PARITY_CHECKS.length);
  if (!existsSync(path.join(process.cwd(), "analysis", "parity", "interface-parity.json"))) {
    await expect(page.getByText("No parity run recorded yet.", { exact: false })).toBeVisible();
    await expect(rows.filter({ hasText: /Pass|Fail/ })).toHaveCount(0);
  }
});

test("no decorative graphics exist, and high contrast sets every rule in ink (DR-022)", async ({ browser }) => {
  const ctx = await newContext(browser, { viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("ie-display", JSON.stringify({ contrast: true, reduceMotion: false }));
    } catch {}
  });
  const page = await ctx.newPage();
  for (const url of ["/", "/about", "/about/colophon"]) {
    await page.goto(url);
    await expect(page.locator("html")).toHaveClass(/a11y-contrast/);
    await expect(page.locator(".ie-band, .ie-ticks, .ie-marker, [data-slot=tradition-marker]")).toHaveCount(0);
    // The header's one line is a pane edge; in high contrast it is solid ink (#000000).
    const edge = await page.locator("header").first().evaluate((el) => getComputedStyle(el).borderBottomColor);
    expect(edge, url).toBe("rgb(0, 0, 0)");
  }
  await ctx.close();
});

// Every control reached by Tab shows a focus indicator (DESIGN.md 9.1, 15; WCAG 2.4.7): the 2 px
// indigo outline, or the HC double ring (an outline of at least 2 px as well).
for (const contrast of [false, true]) {
  test(`every focusable control on Home and Explore shows a focus ring${contrast ? " in high contrast" : ""}`, async ({ browser }) => {
    const ctx = await newContext(browser, { viewport: { width: 1280, height: 800 } });
    if (contrast) {
      await ctx.addInitScript(() => {
        try {
          localStorage.setItem("ie-display", JSON.stringify({ contrast: true, reduceMotion: false }));
        } catch {}
      });
    }
    const page = await ctx.newPage();
    for (const url of ["/", "/explore"]) {
      await page.goto(url);
      await page.waitForLoadState("networkidle");
      if (contrast) await expect(page.locator("html")).toHaveClass(/a11y-contrast/);
      const missing: string[] = [];
      let seen = 0;
      for (let i = 0; i < 60; i++) {
        await page.keyboard.press("Tab");
        const f = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el || el === document.body) return null;
          // The Next.js dev-tools badge (development only) is not part of the page.
          if (el.tagName.startsWith("NEXTJS")) return { name: "", style: "skip", width: 0 };
          const s = getComputedStyle(el);
          return { name: `${el.tagName} "${(el.textContent ?? "").trim().slice(0, 30)}"`, style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
        });
        if (!f) break;
        if (f.style === "skip") continue;
        seen++;
        if (f.style === "none" || f.width < 2) missing.push(f.name);
      }
      expect(seen, url).toBeGreaterThan(3);
      expect(missing, `${url} controls without a visible focus ring`).toEqual([]);
    }
    await ctx.close();
  });
}

const WIDTHS = [390, 768, 1024, 1280] as const;

test("the home title block is left-aligned with nothing beside it, and Figure 1 follows in the first screens", async ({ browser }) => {
  const ctx = await newContext(browser, { viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto("/");
  const h1 = page.getByRole("heading", { level: 1, name: "Immersive Episteme" });
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 800 });
    const r = await h1.evaluate((el) => {
      const mainEl = document.querySelector("main")!;
      const main = mainEl.getBoundingClientRect();
      const b = el.getBoundingClientRect();
      const cs = getComputedStyle(mainEl);
      return { left: b.left - main.left - parseFloat(cs.paddingLeft), scroll: document.documentElement.scrollWidth - window.innerWidth };
    });
    expect(Math.abs(r.left), `${width} px h1 left edge`).toBeLessThanOrEqual(1);
    expect(r.scroll, `${width} px horizontal overflow`).toBeLessThanOrEqual(0);
  }
  await expect(page.locator("[data-slot=public-plate], [data-slot=claim-specimen]")).toHaveCount(0);
  await page.setViewportSize({ width: 1280, height: 800 });
  const figTop = await page.locator("#conditions-heading").evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
  expect(figTop).toBeLessThan(1600);
  await ctx.close();
});

test("the tradition index rows are equal: one left edge and one title face per row", async ({ browser }) => {
  const ctx = await newContext(browser, { viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto("/");
  await expect(page.locator("[data-slot=tradition-index] > li").first()).toBeVisible();
  for (const width of [390, 768, 1024, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    const rows = await page.locator("[data-slot=tradition-index] > li").evaluateAll((lis) =>
      lis.map((li) => {
        const h = li.querySelector("h3")!;
        const cs = getComputedStyle(h);
        return { left: Math.round(h.getBoundingClientRect().left), face: [cs.fontFamily, cs.fontSize, cs.fontWeight].join("|") };
      }),
    );
    expect(new Set(rows.map((r) => r.left)).size, `${width} px title edges`).toBe(1);
    expect(new Set(rows.map((r) => r.face)).size, `${width} px title faces`).toBe(1);
  }
  await ctx.close();
});

test("the dataset table fits 390 px without scrolling its region", async ({ browser }) => {
  const ctx = await newContext(browser, { viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  for (const url of ["/", "/about"]) {
    await page.goto(url);
    const total = page.getByRole("row", { name: /^Total/ });
    await expect(total).toBeVisible();
    const r = await total.evaluate((row) => {
      const c = row.closest("[data-slot=table-container]")!;
      return { scroll: c.scrollWidth, client: c.clientWidth };
    });
    expect(r.scroll, `${url} table scrolls sideways`).toBeLessThanOrEqual(r.client);
  }
  await ctx.close();
});

test("the two Explore control tables end on one rule", async ({ browser }) => {
  const ctx = await newContext(browser, { viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto("/explore");
  const tables = page.locator("section[aria-labelledby=before-heading] table");
  await expect(tables).toHaveCount(2);
  for (const width of [768, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    const rows = await tables.evaluateAll((ts) => ts.map((t) => [...t.querySelectorAll("tbody tr")].map((tr) => Math.round(tr.getBoundingClientRect().bottom))));
    expect(rows[0]!.length).toBe(rows[1]!.length);
    rows[0]!.forEach((bottom, i) => expect(Math.abs(bottom - rows[1]![i]!), `${width} px row ${i + 1}: ${rows[0]} vs ${rows[1]}`).toBeLessThanOrEqual(1));
  }
  await ctx.close();
});
