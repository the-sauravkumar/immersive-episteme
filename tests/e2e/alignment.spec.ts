import { randomBytes } from "node:crypto";

import { expect, newContext, openDemo, test, type Browser, type Page } from "./fixtures";

import { JOURNEY_STUDY as E2E_STUDY_CODE, closeDb, createE2eStaff, ensureDemoStudy, retireE2eStaff, signInStaff as signInAs } from "./study-fixtures";

test.describe.configure({ timeout: 600_000 });
test.use({ navigationTimeout: 120_000 });

const PASSWORD = `e2e-${randomBytes(12).toString("hex")}`;
const STAFF_TAG = randomBytes(3).toString("hex");
const ADMIN = `e2e-alignment-admin-${STAFF_TAG}@example.test`;
const CURATOR = `e2e-alignment-curator-${STAFF_TAG}@example.test`;
const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };

test.beforeAll(async () => {
  createE2eStaff(ADMIN, "E2E Alignment Admin", "super_admin", PASSWORD);
  createE2eStaff(CURATOR, "E2E Alignment Curator", "curator", PASSWORD);
});
test.afterAll(async () => {
  await retireE2eStaff(undefined, [ADMIN, CURATOR]);
  await closeDb();
});

async function signInStaff(page: Page, email: string) {
  await signInAs(page, email, PASSWORD);
}

async function expectActionsAligned(page: Page, cards: string, action: string) {
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

  await page.goto("/study");
  await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
  const label = (await page.getByText("Study code", { exact: true }).boundingBox())!;
  const field = (await page.getByLabel("Study code").boundingBox())!;
  const go = (await page.getByRole("button", { name: "Continue" }).boundingBox())!;
  expect(Math.abs(label.x - field.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(go.x + go.width - (field.x + field.width))).toBeLessThanOrEqual(1);
  await ctx.close();

  const staff = await context(browser, DESKTOP);
  await signInStaff(staff.page, ADMIN);
  await staff.page.goto("/admin");
  await expectActionsAligned(staff.page, "section#awaiting, section#invites", ":scope > header a");
  await staff.ctx.close();
});

test("no in-scope page scrolls horizontally at 390 px", async ({ browser }) => {
  const anon = await context(browser, PHONE);
  for (const path of ["/", "/explore", "/about", "/about/colophon", "/accessibility", "/privacy", "/sign-in", "/forbidden", "/study"]) {
    await expectNoHorizontalOverflow(anon.page, path);
  }
  await anon.ctx.close();

  const demo = await context(browser, PHONE);
  await openDemo(demo.page, "2d");
  await expectNoHorizontalOverflow(demo.page, "/learn/2d");
  await demo.ctx.close();

  const staff = await context(browser, PHONE);
  await signInStaff(staff.page, CURATOR);
  await staff.page.goto("/cms/concepts");
  const conceptDetail = await staff.page.locator('a[href^="/cms/concepts/"]').first().getAttribute("href");
  const consolePaths = ["/cms", "/cms/concepts", "/cms/traditions", "/cms/sources", "/cms/relations", "/cms/datasets", "/cms/review", "/cms/media"];
  for (const path of [...consolePaths, conceptDetail!]) await expectNoHorizontalOverflow(staff.page, path);
  await staff.ctx.close();
  const admin = await context(browser, PHONE);
  await signInStaff(admin.page, ADMIN);
  for (const path of ["/admin", "/admin/users", "/admin/access", "/admin/roles", "/admin/audit", "/admin/settings"]) await expectNoHorizontalOverflow(admin.page, path);
  await admin.ctx.close();
});

test("the study consent page does not scroll horizontally at 390 px", async ({ browser }) => {
  ensureDemoStudy(E2E_STUDY_CODE, 30);
  const p = await context(browser, PHONE);
  await p.page.goto("/study");
  await p.page.getByLabel("Study code").fill(E2E_STUDY_CODE);
  await p.page.getByRole("button", { name: "Continue" }).click();
  await p.page.waitForURL(/\/study\/consent$/, { timeout: 120_000 });
  await expectNoHorizontalOverflow(p.page, "/study/consent");
  await p.ctx.close();
});
