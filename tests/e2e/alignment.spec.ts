/**
 * Visual-alignment guard (docs/research/design-process/modules/visual-alignment.md).
 *
 * 1. Parallel cards: in every card grid that carries an action, the action elements of the cards
 *    in one grid row share the same top and bottom (±1 px) at 1280 px, whatever the length of the
 *    text above them (cards stretch to the row height; the action is pinned with mt-auto).
 * 2. No in-scope page scrolls horizontally at 390 px (document scrollWidth <= clientWidth).
 *
 * Runs against the dev server and database: the 2D pages through the public demo, the consoles
 * through a throwaway staff account made with scripts/create-admin.ts (platform_admin + curator),
 * the study pages through the demo fixture study (./study-fixtures.ts). Never experimental data.
 * The throwaway staff accounts are locked after the run (with any left by earlier runs), so no
 * usable test login accumulates in the users list.
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";

import { expect, newContext, test, type Browser, type Page } from "./fixtures";

import { JOURNEY_STUDY as E2E_STUDY_CODE, closeDb, ensureDemoStudy, retireE2eStaff } from "./study-fixtures";

// The dev server compiles each route on first visit.
test.describe.configure({ timeout: 600_000 });
test.use({ navigationTimeout: 120_000 });

const PASSWORD = `e2e-${randomBytes(12).toString("hex")}`;
const STAFF = `e2e-alignment-${randomBytes(3).toString("hex")}@example.test`;
const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };

test.beforeAll(async () => {
  for (const role of ["platform_admin", "curator"]) {
    execFileSync(process.execPath, ["--import", "tsx", "scripts/create-admin.ts", "--email", STAFF, "--name", "E2E Alignment", "--role", role], {
      env: { ...process.env, ADMIN_PASSWORD: PASSWORD },
      stdio: "pipe",
    });
  }
});
test.afterAll(async () => {
  // Retire this run's account and any left by earlier runs (locked, roles removed, sessions ended).
  await retireE2eStaff(undefined, [STAFF]);
  await closeDb();
});

async function signInStaff(page: Page) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(STAFF);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"), { timeout: 120_000 });
}

async function startDemo(page: Page) {
  await page.goto("/explore");
  await page.getByRole("button", { name: "Open visual course" }).click();
  await page.waitForURL(/\/learn\/2d$/, { timeout: 120_000 });
}

/**
 * For each card matched by `cards`, the box of its `action`; cards are grouped into rows by
 * their top edge, and every action in a row must share top and bottom within 1 px.
 */
async function expectActionsAligned(page: Page, cards: string, action: string) {
  // Pages stream their content in behind Suspense: wait for the grid before measuring.
  await page.locator(cards).nth(1).waitFor({ timeout: 120_000 });
  const boxes = await page.locator(cards).evaluateAll(
    (els, sel) =>
      els.map((el) => {
        const card = el.getBoundingClientRect();
        const target = el.querySelectorAll(sel);
        const a = target[target.length - 1]?.getBoundingClientRect();
        return { cardTop: Math.round(card.top), top: a?.top ?? NaN, bottom: a?.bottom ?? NaN };
      }),
    action,
  );
  expect(boxes.length, `${cards} on ${page.url()}`).toBeGreaterThan(1);
  const rows = new Map<number, typeof boxes>();
  for (const b of boxes) {
    expect(Number.isNaN(b.top), `every card in ${cards} has a "${action}"`).toBe(false);
    const key = [...rows.keys()].find((k) => Math.abs(k - b.cardTop) <= 1) ?? b.cardTop;
    rows.set(key, [...(rows.get(key) ?? []), b]);
  }
  let compared = 0;
  for (const row of rows.values()) {
    if (row.length < 2) continue;
    compared++;
    for (const b of row) {
      expect(Math.abs(b.top - row[0]!.top), `action tops in one row of ${cards}`).toBeLessThanOrEqual(1);
      expect(Math.abs(b.bottom - row[0]!.bottom), `action bottoms in one row of ${cards}`).toBeLessThanOrEqual(1);
    }
  }
  expect(compared, `${cards} has at least one row of side-by-side cards`).toBeGreaterThan(0);
}

async function expectNoHorizontalOverflow(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  const { scroll, client } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(scroll, `${path} scrolls horizontally at ${client} px`).toBeLessThanOrEqual(client);
}

async function context(browser: Browser, viewport: { width: number; height: number }) {
  const ctx = await newContext(browser, { viewport });
  return { ctx, page: await ctx.newPage() };
}

test("card actions in one row share a baseline at 1280 px", async ({ browser }) => {
  const { ctx, page } = await context(browser, DESKTOP);

  await page.goto("/");
  // The two conditions are parallel items of equal weight (Atlas: unboxed, one rule above each).
  await expectActionsAligned(page, 'section[aria-labelledby="conditions-heading"] ul[aria-label="The two conditions"] > li', 'a[href="/explore"]');

  await page.goto("/explore");
  await expectActionsAligned(page, '[data-slot="card"]', 'button[type="submit"]');

  // Study entry: label and field share the left edge; Continue ends on the field's right edge
  // (DESIGN.md 11.7: the primary action sits right, on the study column's edge).
  await page.goto("/study");
  // boundingBox() does not wait: the form streams in behind Suspense, so wait for it first.
  await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
  const label = (await page.getByText("Study code", { exact: true }).boundingBox())!;
  const field = (await page.getByLabel("Study code").boundingBox())!;
  const go = (await page.getByRole("button", { name: "Continue" }).boundingBox())!;
  expect(Math.abs(label.x - field.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(go.x + go.width - (field.x + field.width))).toBeLessThanOrEqual(1);
  await ctx.close();

  const staff = await context(browser, DESKTOP);
  await signInStaff(staff.page);
  await staff.page.goto("/cms");
  await expectActionsAligned(staff.page, "section#integrity, section#versions", ":scope > a");
  await staff.ctx.close();
});

test("no in-scope page scrolls horizontally at 390 px", async ({ browser }) => {
  const anon = await context(browser, PHONE);
  for (const path of ["/", "/explore", "/about", "/about/colophon", "/accessibility", "/privacy", "/sign-in", "/forbidden", "/study"]) {
    await expectNoHorizontalOverflow(anon.page, path);
  }
  await anon.ctx.close();

  const demo = await context(browser, PHONE);
  await startDemo(demo.page);
  await expectNoHorizontalOverflow(demo.page, "/learn/2d");
  await demo.ctx.close();

  const staff = await context(browser, PHONE);
  await signInStaff(staff.page);
  await staff.page.goto("/cms/concepts");
  const conceptDetail = await staff.page.locator('a[href^="/cms/concepts/"]').first().getAttribute("href");
  const consolePaths = ["/cms", "/cms/concepts", "/cms/traditions", "/cms/sources", "/cms/relations", "/cms/datasets", "/cms/review", "/cms/media"];
  for (const path of [...consolePaths, conceptDetail!, "/admin", "/admin/users", "/admin/roles", "/admin/audit", "/admin/settings"]) {
    await expectNoHorizontalOverflow(staff.page, path);
  }
  await staff.ctx.close();
});

test("the study consent page does not scroll horizontally at 390 px", async ({ browser }) => {
  // Participant: consent page of the demo fixture study (kept apart so the study fixture never blocks the other checks).
  ensureDemoStudy(E2E_STUDY_CODE, 30);
  const p = await context(browser, PHONE);
  await p.page.goto("/study");
  await p.page.getByLabel("Study code").fill(E2E_STUDY_CODE);
  await p.page.getByRole("button", { name: "Continue" }).click();
  await p.page.waitForURL(/\/study\/consent$/, { timeout: 120_000 });
  await expectNoHorizontalOverflow(p.page, "/study/consent");
  await p.ctx.close();
});
