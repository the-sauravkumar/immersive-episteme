import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { StageTemplate } from "../../src/features/process/domain/stage-template";

import { expect, test, type Page } from "./fixtures";

const dir = join(process.cwd(), "content", "study");
const templates = readdirSync(dir)
  .filter((name) => name.endsWith(".template.json"))
  .sort()
  .map((name) => JSON.parse(readFileSync(join(dir, name), "utf8")) as StageTemplate);

const photoRecords = new Set(
  (JSON.parse(readFileSync(join(process.cwd(), "tools", "walkthrough-lab", "study-photos.json"), "utf8")) as { tradition: string; record: string }[]).map((photo) => `${photo.tradition} ${photo.record.replace(/\/+$/, "")}`),
);

const textOf = async (page: Page, selector: string): Promise<string> => ((await page.locator(selector).first().textContent()) ?? "").trim();

async function startDemo(page: Page): Promise<void> {
  await page.goto("/explore");
  await page.getByRole("button", { name: "Open visual course" }).click();
  await expect(page).toHaveURL(/\/learn\/2d$/);
}

test.describe.configure({ timeout: 600_000 });

test("Door 1 shows the template's own words, in template order, for every stage of every tradition", async ({ page }) => {
  await startDemo(page);
  for (const template of templates) {
    for (const stage of template.stages) {
      await expect(page.locator("#course-stage-name:visible")).toContainText(stage.name);
      const panel = page.locator("[data-course-root]:visible");
      await expect(panel).toContainText(stage.caption.text);
      for (const item of stage.items) await expect(panel).toContainText(item.label);
      await expect(page.locator(".step-next:visible")).toBeEnabled();
      await page.locator(".step-next:visible").click();
    }
    await expect(page.locator("#course-stage-name:visible")).toHaveText("Finished Textiles");
    await expect.poll(() => page.locator("[data-course-root]:visible img").count()).toBeGreaterThanOrEqual(template.products.length);
    const replaced: string[] = [];
    for (const product of template.products) if ((await page.locator(`img[src="${product.file}"]`).count()) === 0) replaced.push(product.record);
    expect(replaced.filter((record) => !photoRecords.has(`${template.tradition} ${record.replace(/\/+$/, "")}`)), "products missing without a study photograph of the same record").toEqual([]);
    expect(await textOf(page, ".panel-kicker:visible")).toBe(template.traditionName);
    if (template !== templates.at(-1)) {
      await expect(page.locator(".step-next:visible")).toBeEnabled();
      await page.locator(".step-next:visible").click();
    }
  }
});
