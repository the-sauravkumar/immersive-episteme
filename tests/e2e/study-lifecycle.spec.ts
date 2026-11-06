import { randomBytes } from "node:crypto";

import { expect as baseExpect, newContext, test, type Browser, type Page } from "./fixtures";
import { closeDb, createE2eStaff, db, ensureDemoStudy, JOURNEY_STUDY, retireE2eStaff, sessionByCode, signInStaff } from "./study-fixtures";
import { enrol, throughConsentToAllocation, throughPracticeToLearning, watch, type Journey } from "./study-steps";

test.describe.configure({ mode: "serial", timeout: 900_000 });
test.use({ actionTimeout: 60_000 });
const expect = baseExpect.configure({ timeout: 90_000 });

const PASSWORD = `e2e-${randomBytes(12).toString("hex")}`;
const INVESTIGATOR = `e2e-investigator-${randomBytes(3).toString("hex")}@example.test`;

interface Learner {
  readonly page: Page;
  readonly code: string;
  readonly sessionId: string;
  readonly door: Journey["door"];
  readonly journey: Journey;
}

async function intoLearning(browser: Browser, label: string): Promise<Learner> {
  const { page, code, journey: partial } = await enrol(browser, JOURNEY_STUDY);
  const door = await throughConsentToAllocation(page, { ...partial, label });
  const journey: Journey = { ...partial, label, door };
  watch(page, journey);
  await throughPracticeToLearning(page, door);
  const { sessionId } = await sessionByCode(code, JOURNEY_STUDY);
  return { page, code, sessionId, door, journey };
}

async function sessionRow(sessionId: string) {
  const r = await db().query<{ status: string; withdrawn: boolean; excluded: boolean; learning_ended_at: Date | null; interruption_count: number }>(
    "SELECT status, withdrawn, excluded, learning_ended_at, interruption_count FROM study_sessions WHERE id = $1",
    [sessionId],
  );
  return r.rows[0]!;
}

const learningPath = (door: Journey["door"]) => (door === "2d" ? "/learn/2d" : "/learn/immersive");

test.beforeAll(() => {
  ensureDemoStudy(JOURNEY_STUDY, 30);
  createE2eStaff(INVESTIGATOR, "E2E Investigator", "principal_investigator", PASSWORD);
});

test.afterAll(async () => {
  await retireE2eStaff(undefined, [INVESTIGATOR]);
  await closeDb();
});

test("a hub visit and a resume keep learning open, then the participant withdraws", async ({ browser }) => {
  const learner = await intoLearning(browser, "resume");
  const { page, sessionId, door } = learner;

  await page.goto("/study/session");
  await expect(page.getByText("Your learning task is still open.")).toBeVisible();
  expect((await sessionRow(sessionId)).learning_ended_at).toBeNull();

  const context = page.context();
  await page.close();
  const back = await context.newPage();
  watch(back, learner.journey);
  await back.goto("/study");
  await expect(back.getByRole("heading", { name: "You Have A Study Session In Progress" })).toBeVisible();
  const before = (await sessionRow(sessionId)).interruption_count;
  await back.getByRole("button", { name: "Continue your session" }).click();
  await expect(back).toHaveURL(/\/study\/session$/);
  await expect(back.getByRole("link", { name: "Return to the learning task" })).toBeVisible();
  const resumed = await sessionRow(sessionId);
  expect(resumed.learning_ended_at).toBeNull();
  expect(resumed.interruption_count).toBe(before + 1);
  await back.getByRole("link", { name: "Return to the learning task" }).click();
  await expect(back).toHaveURL(new RegExp(`${learningPath(door)}$`));

  expect(learner.journey.problems).toEqual([]);
  await back.goto("/study/withdraw");
  await back.getByRole("button", { name: "Withdraw from the study" }).click();
  await expect(back.getByText("Tick the box to confirm that you want to withdraw.")).toBeVisible();
  expect((await sessionRow(sessionId)).withdrawn).toBe(false);
  await back.getByLabel("I want to withdraw from the study now.").check();
  await back.getByRole("button", { name: "Withdraw from the study" }).click();
  await expect(back).toHaveURL(/\/study\/complete\?status=withdrawn/);
  expect((await sessionRow(sessionId)).withdrawn).toBe(true);

  await back.goto(learningPath(door));
  await expect.poll(() => new URL(back.url()).pathname).not.toBe(learningPath(door));
  const refused = await back.evaluate(async () => (await fetch("/api/study/learning-progress", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "finish" }) })).status);
  expect(refused).toBeGreaterThanOrEqual(400);
  await context.close();
});

test("an excluded session stops at once, says only that it ended, and can still withdraw", async ({ browser }) => {
  const learner = await intoLearning(browser, "excluded");
  const { page, sessionId, door } = learner;

  expect(learner.journey.problems).toEqual([]);
  const staff = await newContext(browser);
  const investigator = await staff.newPage();
  await signInStaff(investigator, INVESTIGATOR, PASSWORD);
  await investigator.goto(`/research/sessions/${sessionId}`);
  const exclude = investigator.locator("#exclude");
  await exclude.getByLabel("Reason category").selectOption("technical_failure");
  await exclude.getByLabel("Detail").fill("Demo: excluded by the e2e lifecycle check.");
  await exclude.getByRole("button", { name: "Exclude session" }).click();
  await expect(investigator.getByText("Excluded: technical_failure: Demo: excluded by the e2e lifecycle check.")).toBeVisible();
  await expect(exclude).toHaveCount(0);
  expect((await sessionRow(sessionId)).excluded).toBe(true);
  await staff.close();

  await page.goto(learningPath(door));
  await expect(page).toHaveURL(/\/study(\?|$)/);
  await expect(page.getByRole("heading", { name: "Your Study Session Has Ended" })).toBeVisible();
  await expect(page.getByText("Thank you for taking part. You can still withdraw from the study.")).toBeVisible();
  await expect(page.getByText(/exclu/i)).toHaveCount(0);
  await page.goto("/study/session");
  await expect.poll(() => new URL(page.url()).pathname).not.toBe("/study/session");

  await page.goto("/study");
  await page.getByRole("link", { name: "Withdraw from the study" }).click();
  await expect(page).toHaveURL(/\/study\/withdraw$/);
  await page.getByLabel("I want to withdraw from the study now.").check();
  await page.getByRole("button", { name: "Withdraw from the study" }).click();
  await expect(page).toHaveURL(/\/study\/complete\?status=withdrawn/);
  const ended = await sessionRow(sessionId);
  expect(ended.excluded).toBe(true);
  expect(ended.withdrawn).toBe(true);
  await page.context().close();
});
