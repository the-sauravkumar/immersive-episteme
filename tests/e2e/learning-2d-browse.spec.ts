/**
 * 2D condition, end to end (public demo over the review snapshot from `npm run dev:bootstrap`):
 * catalogue -> tradition -> concept -> related concept, citations disclose inline, and the
 * telemetry batches reach POST /api/telemetry/batch and are acknowledged.
 */
import { expect, test, type Request } from "@playwright/test";

// The dev server compiles each route on first visit.
test.setTimeout(180_000);
test.use({ navigationTimeout: 90_000 });
const SLOW = { timeout: 90_000 };

interface SentEvent {
  type: string;
  conceptId?: string;
  roomOrPageId?: string;
  metadata?: Record<string, unknown>;
}

test("browse catalogue, tradition, concept and a related concept; telemetry reaches the batch endpoint", async ({ page }) => {
  const batches: { request: Request; events: SentEvent[] }[] = [];
  const statuses: number[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/telemetry/batch") {
      const body = request.postDataJSON() as { events: SentEvent[] };
      batches.push({ request, events: body.events });
    }
  });
  page.on("response", (response) => {
    if (new URL(response.url()).pathname === "/api/telemetry/batch") statuses.push(response.status());
  });

  await page.goto("/explore");
  await page.getByRole("button", { name: "Open conventional pages" }).click();
  await expect(page).toHaveURL(/\/learn\/2d$/, SLOW);
  await expect(page.getByRole("heading", { level: 1, name: "Craft Traditions" })).toBeVisible(SLOW);
  // The 2D navigation (DR-021): the shared PlaceRail "In This Section" docked at the left from
  // 1280 px, the index in the field, and the StudyBar's condition group (Contents below 1024 px only).
  const bar = page.locator("[data-slot=study-bar]");
  await expect(page.getByRole("navigation", { name: "In This Section" })).toBeVisible();
  await expect(page.locator("[data-slot=study-index]")).toBeVisible();
  await expect(bar.getByRole("button", { name: "Contents" })).toBeHidden();

  // Catalogue -> tradition.
  const traditionCard = page.locator('section[aria-labelledby="traditions-heading"] a').first();
  const traditionName = (await traditionCard.locator("span").first().textContent())!.trim();
  await traditionCard.click();
  await expect(page.getByRole("heading", { level: 1, name: traditionName })).toBeVisible(SLOW);
  await expect(page.getByRole("navigation", { name: "breadcrumb" })).toContainText("Traditions");

  // Template sections are disclosed on demand; the process is an ordered list of steps.
  const process = page.getByRole("button", { name: /Process sequence/i });
  await expect(process).toHaveAttribute("aria-expanded", "false");
  await process.click();
  await expect(process).toHaveAttribute("aria-expanded", "true");
  const steps = page.getByRole("list", { name: /process steps in order/ });
  const firstStep = steps.getByRole("link").first();
  const stepTitle = (await firstStep.textContent())!.trim();
  await firstStep.click();

  // Concept page: the shared KnowledgeSheet, its h1 focused on open; no breadcrumb and no "Up to":
  // Close in the sheet's action slot returns to the section view, as Close does in 3D (DR-021).
  const conceptTitle = page.getByRole("heading", { level: 1, name: stepTitle });
  await expect(conceptTitle).toBeVisible(SLOW);
  await expect(conceptTitle).toBeFocused();
  await expect(page.getByRole("navigation", { name: "breadcrumb" })).toHaveCount(0);
  await expect(bar.getByRole("link", { name: /^Up to/ })).toHaveCount(0);
  await expect(page.locator("[data-slot=sheet-action]").getByRole("link", { name: "Close" })).toHaveAttribute("href", /#section-process$/);
  // The rail lists the section's concepts with this one marked "You are here".
  await expect(page.getByRole("navigation", { name: "In This Section" }).locator("[aria-current=location]")).toContainText(stepTitle);
  const claims = page.getByRole("list", { name: "Statements" });
  await expect(claims.getByRole("listitem").first()).toBeVisible();
  // Numbered citation markers [n] after each claim (DR-022 Addendum A), collapsed until asked for;
  // the record opens in place under the claim, and one reference list ends the sheet.
  const citation = claims.getByRole("button", { name: /^Source \d+:/ }).first();
  await expect(citation).toHaveAttribute("aria-expanded", "false");
  await expect(citation).toHaveText(/^\[\d+\]$/);
  await citation.click();
  await expect(citation).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(`[id="${(await citation.getAttribute("aria-controls")) ?? ""}"]`)).toBeVisible();
  await expect(page.locator("main [data-slot=knowledge-sheet]:visible").getByRole("region", { name: "References" })).toHaveCount(1);
  // The sequence pager carries the shared default label, as the 3D panel's.
  await expect(page.getByRole("navigation", { name: "Previous and next" })).toBeVisible();

  // LayerTabs, as in the 3D panel (DR-021): a process station has Overview and Process; the
  // keyboard path from the h1 passes the selected tab first.
  const layers = page.getByRole("tablist", { name: "Information layers" });
  await expect(layers.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
  await conceptTitle.focus();
  await page.keyboard.press("Tab");
  await expect(page.locator("[data-slot=sheet-action]").getByRole("link", { name: "Close" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(layers.getByRole("tab", { name: "Overview" })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  const second = layers.getByRole("tab").nth(1);
  await expect(second).toHaveAttribute("aria-selected", "true");
  await layers.getByRole("tab", { name: "Process" }).click();
  await expect(page.getByRole("heading", { level: 3, name: "Sequence" })).toBeVisible();
  await layers.getByRole("tab", { name: "Overview" }).click();

  // Related concepts sit at the end of the sheet (no side rail), grouped by verb.
  const related = page.locator("[data-slot=related-concepts] a").first();
  const relatedTitle = (await related.textContent())!.trim();
  await related.click();
  await expect(page.getByRole("heading", { level: 1, name: relatedTitle })).toBeVisible(SLOW);
  // A pager only on a station of an ordered sequence ("Step n of N"), as in the 3D panel (DR-021).
  const isStation = (await page.getByText(/step \d+ of \d+/i).count()) > 0;
  await expect(page.getByRole("navigation", { name: /previous and next/i })).toHaveCount(isStation ? 1 : 0);

  // The tracker flushes on its interval (5 s); wait for the acknowledged uploads.
  await expect.poll(() => batches.flatMap((b) => b.events.map((e) => e.type)), { timeout: 20_000 }).toEqual(
    expect.arrayContaining(["page_entered", "page_exited", "concept_encountered", "relationship_followed", "exposure_started", "citation_opened", "information_layer_opened"]),
  );
  expect(statuses.length).toBeGreaterThan(0);
  expect(statuses.every((s) => s === 200)).toBe(true);

  const events = batches.flatMap((b) => b.events);
  const followed = events.find((e) => e.type === "relationship_followed")!;
  expect(followed.metadata).toMatchObject({ relationshipId: expect.any(String), relationshipTypeCode: expect.stringMatching(/^[A-Z_]+$/) });
  expect(events.filter((e) => e.type === "page_entered").map((e) => e.roomOrPageId)).toEqual(expect.arrayContaining(["catalogue", expect.stringMatching(/^tradition:/), expect.stringMatching(/^concept:/)]));
});

test("traditions outside the session's study and unknown concepts are not served", async ({ page }) => {
  await page.goto("/explore");
  await page.getByRole("button", { name: "Open conventional pages" }).click();
  await expect(page).toHaveURL(/\/learn\/2d$/, SLOW);
  // "bagh" exists in the snapshot but is not one of the demo study's traditions.
  const catalogue = page.locator('section[aria-labelledby="traditions-heading"]');
  await expect(catalogue).toBeVisible(SLOW);
  await expect(catalogue.getByRole("link", { name: /Bagh/ })).toHaveCount(0);
  for (const path of ["/learn/2d/traditions/bagh", "/learn/2d/concepts/no-such-concept"]) {
    await page.goto(path);
    // Streaming responses keep status 200; the not-found boundary renders instead of content.
    await expect(page.getByText(/could not be found/i)).toBeVisible(SLOW);
    await expect(page.getByRole("heading", { level: 1, name: /Bagh/ })).toHaveCount(0);
  }
});
