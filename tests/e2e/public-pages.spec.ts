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
 *  - Figure 1: with `prefers-reduced-motion: reduce` it is fully drawn and nothing animates;
 *    without it, the branch strokes are hidden below the fold and draw once when scrolled to.
 *  - Explore: the two cards' buttons share one baseline; the Colophon lists all 27 parity checks
 *    and shows a result only from a stored run.
 *  - High contrast: band and ticks hidden, every rule and accent (ochre eyebrows, madder numbers)
 *    flat ink; every control reached by Tab shows a focus ring, in normal and high contrast.
 *  - Layout fit: Plate 1 is an exact 4:5 box whose specimen is never clipped; the tradition plates'
 *    region eyebrows share one top per row; the dataset table fits 390 px without scrolling; the
 *    two Explore control tables end on one rule.
 */
import { existsSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";
import { config as loadEnv } from "dotenv";
import { Pool } from "pg";

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
    const ctx = await browser.newContext({ viewport });
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
    // One plate per tradition, never a mix of photographs and typographic plates.
    await expect(page.locator("[data-slot=tradition-plates] > li")).toHaveCount(live.traditions);
    await expect(page.locator("[data-slot=tradition-plates]")).toHaveAttribute("data-plates", /^(photo|typographic)$/);
  } finally {
    await pool.end();
  }
});

test("Figure 1 is fully drawn with reduced motion and nothing animates", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const figure = page.locator("[data-slot=figure-one-diagram] svg:visible");
  await figure.scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  const states = await figure.locator("path[data-draw]").evaluateAll((ps) => ps.map((p) => [p.getAttribute("data-draw"), getComputedStyle(p).strokeDashoffset]));
  expect(states.length).toBeGreaterThan(0);
  for (const [phase, offset] of states) {
    expect(phase).toBe("drawn");
    expect(parseFloat(offset ?? "0")).toBe(0);
  }
  expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length)).toBe(0);
  await ctx.close();
});

test("Figure 1 draws its branches once when scrolled into view", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: "no-preference" });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const paths = page.locator("[data-slot=figure-one-diagram] svg:visible path[data-draw]");
  await expect(paths.first()).toHaveAttribute("data-draw", "hidden");
  await page.locator("[data-slot=figure-one-diagram]").scrollIntoViewIfNeeded();
  await expect(paths.first()).toHaveAttribute("data-draw", "drawing");
  await page.waitForTimeout(1000);
  expect(await paths.evaluateAll((ps) => ps.map((p) => parseFloat(getComputedStyle(p).strokeDashoffset)))).toEqual([0, 0]);
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
  await expect(rows).toHaveCount(27);
  if (!existsSync(path.join(process.cwd(), "analysis", "parity", "interface-parity.json"))) {
    await expect(page.getByText("No parity run recorded yet.", { exact: false })).toBeVisible();
    await expect(rows.filter({ hasText: /Pass|Fail/ })).toHaveCount(0);
  }
});

test("high contrast hides the decorative band and the registration ticks", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("ie-display", JSON.stringify({ contrast: true, reduceMotion: false }));
    } catch {}
  });
  const page = await ctx.newPage();
  await page.goto("/");
  await expect(page.locator("html")).toHaveClass(/a11y-contrast/);
  await expect(page.locator(".ie-band").first()).toBeHidden();
  await expect(page.locator(".ie-ticks").first()).toBeHidden();
  // Every rule is solid ink in high contrast (DESIGN.md 4.4), including the madder section rules.
  const ruleColours = await page.locator(".border-madder").evaluateAll((els) =>
    els.map((el) => {
      const s = getComputedStyle(el);
      return s.borderTopWidth !== "0px" ? s.borderTopColor : s.borderLeftColor;
    }),
  );
  expect(ruleColours.length).toBeGreaterThan(0);
  for (const c of ruleColours) expect(c).toBe("rgb(17, 17, 17)");
  // HC text is flat ink: no ochre (yellow-gold) eyebrows and no madder figure numbers.
  for (const url of ["/", "/about"]) {
    await page.goto(url);
    await expect(page.locator("html")).toHaveClass(/a11y-contrast/);
    const accents = await page.locator(".text-ochre, .text-madder").evaluateAll((els) => els.map((el) => getComputedStyle(el).color));
    expect(accents.length, url).toBeGreaterThan(0);
    for (const c of accents) expect(c, url).toBe("rgb(17, 17, 17)");
  }
  await ctx.close();
});

// Every control reached by Tab shows a focus indicator (DESIGN.md 9.1, 15; WCAG 2.4.7): the 2 px
// indigo outline, or the HC double ring (an outline of at least 2 px as well).
for (const contrast of [false, true]) {
  test(`every focusable control on Home and Explore shows a focus ring${contrast ? " in high contrast" : ""}`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
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

test("Plate 1 is an exact 4:5 box and its specimen is never clipped", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto("/");
  const box = page.locator("[data-slot=plate-box]").first();
  await expect(page.locator("[data-slot=claim-specimen]")).toBeVisible();
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 800 });
    const r = await box.evaluate((el) => {
      const b = el.getBoundingClientRect();
      const spec = el.querySelector<HTMLElement>("[data-slot=claim-specimen]")!;
      const link = spec.querySelector("a");
      return {
        ratio: b.height / b.width,
        overflow: spec.scrollHeight - spec.clientHeight,
        linkInside: link ? link.getBoundingClientRect().bottom <= b.bottom + 0.5 : true,
      };
    });
    expect(Math.abs(r.ratio - 1.25), `${width} px ratio ${r.ratio}`).toBeLessThanOrEqual(0.01);
    expect(r.overflow, `${width} px specimen overflow`).toBeLessThanOrEqual(0);
    expect(r.linkInside, `${width} px link inside the frame`).toBe(true);
  }
  // At 1280 the plate ends within the first screen's reach: Figure 1 starts in the second screen.
  await page.setViewportSize({ width: 1280, height: 800 });
  const figTop = await page.locator("#conditions-heading").evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
  expect(figTop).toBeLessThan(1600);
  await ctx.close();
});

test("tradition plate eyebrows share one top per row", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto("/");
  await expect(page.locator("[data-slot=tradition-plates] > li").first()).toBeVisible();
  for (const width of [600, 768, 1024, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    const rows = await page.locator("[data-slot=tradition-plates] > li").evaluateAll((lis) => {
      const byRow = new Map<number, number[]>();
      for (const li of lis) {
        const top = Math.round(li.getBoundingClientRect().top);
        const eyebrow = li.querySelector(".text-eyebrow");
        if (!eyebrow) continue;
        byRow.set(top, [...(byRow.get(top) ?? []), eyebrow.getBoundingClientRect().top]);
      }
      return [...byRow.values()];
    });
    expect(rows.length, `${width} px rows`).toBeGreaterThan(1);
    for (const tops of rows) expect(Math.max(...tops) - Math.min(...tops), `${width} px eyebrow tops ${tops.join(", ")}`).toBeLessThanOrEqual(1);
  }
  await ctx.close();
});

test("the dataset table fits 390 px without scrolling its region", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
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
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
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
