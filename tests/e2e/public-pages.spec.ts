import { expect, newContext, test, type Page } from "./fixtures";
import { config as loadEnv } from "dotenv";
import { Pool } from "pg";

loadEnv({ quiet: true });

test.describe.configure({ timeout: 300_000 });
test.use({ navigationTimeout: 120_000 });

const PAGES = ["/", "/about", "/about/colophon", "/explore", "/accessibility", "/privacy", "/sign-in", "/sign-out", "/forbidden", "/awaiting-access"];

async function audit(page: Page, url: string) {
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
    const total = page.getByRole("row", { name: /^Total/ });
    await expect(total).toContainText(fmt(live.concepts));
    await expect(total).toContainText(fmt(live.claims));
    await expect(total).toContainText(fmt(live.sources));
    await expect(page.locator("[data-slot=tradition-index] > li")).toHaveCount(live.traditions);
    await expect(page.locator("[data-slot=tradition-index] img")).toHaveCount(0);
  } finally {
    await pool.end();
  }
});

test("Figure 1 is a static plate on vat-2: no draw-on and nothing animates (DR-119)", async ({ browser }) => {
  const ctx = await newContext(browser, { viewport: { width: 1280, height: 800 }, reducedMotion: "no-preference" });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const plate = page.locator("[data-slot=figure-one-diagram]");
  await plate.scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  expect(await plate.locator("path[data-draw]").count()).toBe(0);
  const bg = await plate.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).toBe("rgb(22, 38, 78)");
  expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length)).toBe(0);
  await ctx.close();
});

test("Explore cards align their actions and the Colophon promises no interface parity measurement", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/explore");
  const tops = await Promise.all(
    ["Open visual course", "Open walkthrough"].map(async (name) => (await page.getByRole("button", { name }).boundingBox())!),
  );
  expect(Math.abs(tops[0]!.y - tops[1]!.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(tops[0]!.y + tops[0]!.height - (tops[1]!.y + tops[1]!.height))).toBeLessThanOrEqual(1);

  await page.goto("/about/colophon");
  await expect(page.locator("#parity table")).toHaveCount(0);
  await expect(page.locator("#parity")).toContainText("one stage template");
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Equivalence of the Two Conditions" })).toHaveCount(0);
});

test("no decorative graphics exist, and the header edge is a hairline in --line (DR-119)", async ({ browser }) => {
  const ctx = await newContext(browser, { viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  for (const url of ["/", "/about", "/about/colophon"]) {
    await page.goto(url);
    await expect(page.locator(".ie-band, .ie-ticks, .ie-marker, [data-slot=tradition-marker]")).toHaveCount(0);
    const edge = await page.locator("header").first().evaluate((el) => getComputedStyle(el).borderBottomColor);
    expect(edge, url).toBe("rgb(44, 56, 80)");
  }
  await ctx.close();
});

test("every focusable control on Home and Explore shows a focus ring", async ({ browser }) => {
  const ctx = await newContext(browser, { viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  for (const url of ["/", "/explore"]) {
    await page.goto(url);
    await page.waitForLoadState("networkidle");
    const missing: string[] = [];
    let seen = 0;
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press("Tab");
      const f = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        if (el.tagName.startsWith("NEXTJS")) return { name: "", style: "skip", width: 0 };
        const s = getComputedStyle(el);
        return { name: `${el.tagName} "${(el.textContent ?? "").trim().slice(0, 30)}"`, style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
      });
      if (!f) break;
      if (f.style === "skip") continue;
      seen++;
      if (f.style === "none" || f.width < 3) missing.push(f.name);
    }
    expect(seen, url).toBeGreaterThan(3);
    expect(missing, `${url} controls without a visible focus ring`).toEqual([]);
  }
  await ctx.close();
});

const WIDTHS = [390, 768, 1024, 1280] as const;

test("the home title block is left-aligned with only Plate 1 beside it, and Figure 1 follows in the first screens", async ({ browser }) => {
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
