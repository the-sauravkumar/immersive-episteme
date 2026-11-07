import { randomBytes } from "node:crypto";

import { expect as baseExpect, newContext, test, type Browser, type Page } from "./fixtures";
import { closeDb, createE2eStaff, db, ensureDemoStudy, JOURNEY_STUDY, retireE2eStaff, sessionByCode, signInStaff } from "./study-fixtures";
import { answerAssessment, enrol, throughConsentToAllocation, throughPracticeToLearning, watch, type Journey } from "./study-steps";

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

test("a required question left blank is refused with its own message, and the form goes on once it is answered", async ({ browser }) => {
  const { page, code, journey } = await enrol(browser, JOURNEY_STUDY);
  await page.getByLabel(/I have read the information above/).check();
  await page.getByRole("button", { name: "I agree to take part" }).click();
  await expect(page).toHaveURL(/questionnaire\/before/);
  const title = page.locator("#assessment-title");
  await expect(title).toBeVisible();
  const shownTitle = await title.textContent();
  const submit = page.getByRole("button", { name: "Submit answers" });
  const next = page.getByRole("button", { name: "Next", exact: true });
  while (!(await submit.isVisible())) await next.click();
  await submit.click();
  const summary = page.locator("[data-slot=error-summary]");
  await expect(summary).toBeVisible();
  await expect(summary).toContainText("Answer this question to continue.");
  await expect(title).toHaveText(shownTitle ?? "");
  await page.reload();
  await expect(summary).toHaveCount(0);
  await answerAssessment(page, { ...journey, label: "required" }, "required");
  const submitted = () =>
    db()
      .query<{ n: number }>(
        `SELECT count(*)::int AS n FROM audit_log j JOIN study_sessions ss ON j.entity_id = ss.id::text JOIN participants p ON p.id = ss.participant_id
          WHERE p.code = $1 AND j.action = 'study.assessment_submitted'`,
        [code],
      )
      .then((r) => r.rows[0]!.n);
  await expect.poll(submitted).toBeGreaterThan(0);
  await page.context().close();
});

test("a finish before every stage is visited is refused while the cap still runs, and learning stays open", async ({ browser }) => {
  const learner = await intoLearning(browser, "early-finish");
  const { page, sessionId } = learner;
  const reply = await page.evaluate(async () => {
    const r = await fetch("/api/study/learning-progress", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "finish" }) });
    return { status: r.status, body: (await r.json()) as { reason?: string; unvisited?: unknown[] } };
  });
  expect(reply.status).toBe(409);
  expect(reply.body.reason).toBe("stages_unvisited");
  expect(reply.body.unvisited?.length ?? 0).toBeGreaterThan(0);
  const clock = await db().query<{ ended: Date | null; ends: Date | null; now: Date }>("SELECT learning_ended_at AS ended, learning_ends_at AS ends, now() AS now FROM study_sessions WHERE id = $1", [sessionId]);
  expect(clock.rows[0]!.ended).toBeNull();
  expect(clock.rows[0]!.ends!.getTime()).toBeGreaterThan(clock.rows[0]!.now.getTime());
  await page.goto("/study/session");
  await expect(page.getByText("Your learning task is still open.")).toBeVisible();
  expect(learner.journey.problems).toEqual([]);
  await page.context().close();
});

test("the research console sets up a study: the learning cap, the information sheet and consent, the designed battery", async ({ browser }) => {
  const slug = `e2e-setup-${randomBytes(3).toString("hex")}`;
  const staff = await newContext(browser);
  const page = await staff.newPage();
  await signInStaff(page, INVESTIGATOR, PASSWORD);
  await page.goto("/research/studies");
  const create = page.locator("form").filter({ has: page.getByRole("button", { name: "Create draft study" }) });
  await create.locator('[name="title"]').fill(`E2E Console Set-Up ${slug}`);
  await create.locator('[name="slug"]').fill(slug);
  await create.getByRole("button", { name: "Create draft study" }).click();
  await expect(page).toHaveURL(/\/research\/studies\/[0-9a-f-]{36}$/);
  const studyId = new URL(page.url()).pathname.split("/").pop()!;
  try {
    const save = page.getByRole("button", { name: "Save configuration" });
    const config = page.locator("form").filter({ has: save });
    await config.locator('[name="exposureMinutes"]').fill("25");
    await config.locator('[name="participantInformation"]').fill("Demo: information sheet written by the e2e console check.");
    await config.locator('[name="consentVersion"]').fill("1.0");
    await config.locator('[name="consentText"]').fill("Demo: consent text written by the e2e console check.");
    await save.click();
    await expect(config.getByRole("status")).toContainText("Configuration saved");

    const attach = page.locator("form").filter({ has: page.getByRole("button", { name: "Attach the designed test battery" }) });
    await attach.getByRole("button", { name: "Attach the designed test battery" }).click();
    await expect(attach.getByRole("status")).toContainText("Battery saved");

    const stored = await db().query<{ config: { exposure: { minutes?: number }; consent?: { version: string }; participantInformation?: string }; battery: number }>(
      "SELECT config, (SELECT count(*)::int FROM study_assessments WHERE study_id = s.id) AS battery FROM studies s WHERE id = $1",
      [studyId],
    );
    const row = stored.rows[0]!;
    expect(row.config.exposure.minutes).toBe(25);
    expect(row.config.consent?.version).toBe("1.0");
    expect(row.config.participantInformation).toContain("information sheet");
    expect(row.battery).toBeGreaterThan(0);
  } finally {
    await db().query("DELETE FROM study_assessments WHERE study_id = $1", [studyId]).catch(() => undefined);
    await staff.close();
  }
});
