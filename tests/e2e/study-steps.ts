import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { expect as baseExpect, newContext, type Browser, type Page } from "./fixtures";

const expect = baseExpect.configure({ timeout: 90_000 });
export const SHOTS = process.env.JOURNEY_SHOTS ?? null;

export interface Journey {
  readonly door: "2d" | "immersive";
  readonly label: string;
  readonly problems: string[];
  readonly seen: Set<string>;
}

export async function shot(page: Page, journey: Journey, name: string, widths: readonly number[] = [1366, 400]): Promise<void> {
  const key = `${journey.label}-${name}`;
  if (journey.seen.has(key)) return;
  journey.seen.add(key);
  for (const width of widths) {
    await page.setViewportSize({ width, height: width === 400 ? 800 : 768 });
    await page.waitForTimeout(250);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 1) journey.problems.push(`${key} at ${width}: horizontal scroll ${overflow} px`);
    if (SHOTS) {
      mkdirSync(SHOTS, { recursive: true });
      await page.screenshot({ path: join(SHOTS, `${key}-${width}.png`) });
    }
  }
  await page.setViewportSize({ width: 1366, height: 768 });
}

export function watch(page: Page, journey: Journey): void {
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("409")) journey.problems.push(`console: ${message.text().slice(0, 300)}`);
  });
  page.on("pageerror", (error) => journey.problems.push(`pageerror: ${error.message.slice(0, 300)}`));
  page.on("response", (response) => {
    if (response.status() >= 400 && !response.url().includes("/api/study/learning-progress")) journey.problems.push(`${response.status()} ${response.url()}`);
  });
}

export async function enrol(browser: Browser, slug: string): Promise<{ page: Page; code: string; journey: Omit<Journey, "door"> }> {
  const context = await newContext(browser, { viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();
  const journey = { label: "", problems: [] as string[], seen: new Set<string>() };
  await page.goto("/study");
  await page.getByLabel("Study code").fill(slug);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/study\/consent$/);
  await expect(page.getByText(/CXA\/ETH\/01/).first()).toBeVisible();
  const code = (await page.locator("[data-slot=participant-code]").first().textContent())?.trim() ?? "";
  expect(code).toMatch(/^P-[0-9A-Z]{10}$/);
  return { page, code, journey };
}

async function answerVisibleQuestions(page: Page): Promise<void> {
  const fieldsets = page.locator("form fieldset:visible");
  const count = await fieldsets.count();
  for (let index = 0; index < count; index++) {
    const fieldset = fieldsets.nth(index);
    const radios = fieldset.locator("input[type=radio]");
    if ((await radios.count()) > 0) await fieldset.locator("label").first().click();
    const boxes = fieldset.locator("input[type=checkbox]");
    if ((await boxes.count()) > 0) await boxes.first().check();
    const selects = fieldset.locator("select");
    for (let at = 0; at < (await selects.count()); at++) await selects.nth(at).selectOption({ index: at + 1 });
    const down = fieldset.getByRole("button", { name: /^Move .* down$/ }).first();
    if ((await fieldset.getByRole("button", { name: /^Move .* down$/ }).count()) > 0) await down.click();
    const canvas = fieldset.locator("canvas");
    if ((await canvas.count()) > 0) {
      await canvas.first().scrollIntoViewIfNeeded();
      const box = (await canvas.first().boundingBox())!;
      await page.mouse.move(box.x + 20, box.y + 20);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 });
      await page.mouse.up();
      await expect(fieldset.getByRole("button", { name: "Undo" })).toBeEnabled();
    }
  }
  const texts = page.locator("form li:visible input[name^='item:']:not([type=radio]):not([type=checkbox]):not([type=hidden]), form li:visible textarea[name^='item:']");
  for (let index = 0; index < (await texts.count()); index++) {
    const field = texts.nth(index);
    await field.fill((await field.getAttribute("inputmode")) === "decimal" ? "1" : "Demo answer");
  }
}

export async function answerAssessment(page: Page, journey: Journey | Omit<Journey, "door">, step: string): Promise<void> {
  await expect(page.locator("#assessment-title")).toBeVisible();
  const title = (await page.locator("#assessment-title").textContent())?.trim().replace(/\W+/g, "-") ?? "form";
  await shot(page, journey as Journey, `${step}-${title}`);
  const submit = page.getByRole("button", { name: "Submit answers" });
  const next = page.getByRole("button", { name: "Next", exact: true });
  const legend = () => page.locator("form fieldset:visible legend").first().textContent();
  for (;;) {
    await expect(submit.or(next).first()).toBeVisible();
    await answerVisibleQuestions(page);
    if (await submit.isVisible()) break;
    const shown = await legend();
    await next.click();
    await expect
      .poll(legend, { timeout: 4000 })
      .not.toBe(shown)
      .catch(() => next.click());
  }
  const shownTitle = await page.locator("#assessment-title").textContent();
  await submit.click();
  await expect
    .poll(async () => {
      if ((await page.locator("form [role=alert]").count()) > 0) return true;
      const heading = await page.locator("#assessment-title").textContent({ timeout: 500 }).catch(() => null);
      return heading !== shownTitle;
    })
    .toBe(true);
  const alert = page.locator("form [role=alert]");
  if ((await alert.count()) > 0) throw new Error(`Form refused: ${await alert.first().textContent()}`);
}

export async function linkConceptMap(page: Page, journey: Journey): Promise<void> {
  const form = page.getByRole("form", { name: "Add a relationship" });
  await expect(form).toBeVisible();
  await shot(page, journey, `reconstruction-${journey.seen.size}`);
  const selects = form.locator("select");
  await selects.nth(0).selectOption({ index: 1 });
  await selects.nth(1).selectOption({ index: 2 });
  await form.getByRole("button", { name: "Add relationship" }).click();
  await page.getByRole("button", { name: "Submit map" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Submit map" }).click();
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(800);
}

export async function throughConsentToAllocation(page: Page, journey: Omit<Journey, "door">): Promise<"2d" | "immersive"> {
  await shot(page, journey as Journey, "consent");
  await page.getByLabel(/I have read the information above/).check();
  await page.getByRole("button", { name: "I agree to take part" }).click();
  await expect(page).toHaveURL(/questionnaire\/before/);
  const title = page.locator("#assessment-title");
  const check = page.getByRole("button", { name: "Check and continue" });
  const practice = /\/learn\/(2d|immersive)\/practice/;
  for (;;) {
    await expect.poll(async () => practice.test(new URL(page.url()).pathname) || (await title.isVisible()) || (await check.isVisible()), { timeout: 90_000 }).toBe(true);
    if (!(await title.isVisible())) break;
    await answerAssessment(page, journey, new URL(page.url()).pathname.includes("pre-test") ? "pre-test" : "background");
  }
  if (await check.isVisible()) {
    await shot(page, journey as Journey, "device-check");
    await check.click();
  }
  await expect(page).toHaveURL(practice);
  await page.waitForLoadState("domcontentloaded");
  expect(await page.locator("body").innerText(), "the practice page names no door").not.toMatch(/\bdoors?\b/i);
  return new URL(page.url()).pathname.startsWith("/learn/2d") ? "2d" : "immersive";
}

export async function throughPracticeToLearning(page: Page, door: Journey["door"]): Promise<void> {
  await expect(page).toHaveURL(/practice/);
  if (door === "2d") {
    for (let i = 0; i < 3; i++) await page.locator(".step-next:visible").click();
  } else {
    await expect(page.locator(".walkthrough-cover")).toHaveCount(0, { timeout: 180_000 });
    await page.getByRole("button", { name: "Finish Practice" }).click();
  }
  await page.getByRole("button", { name: "Start the learning task" }).click();
  await expect(page).toHaveURL(/\/learn\/(2d|immersive)$/);
}
