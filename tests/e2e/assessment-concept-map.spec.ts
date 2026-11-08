import { randomBytes } from "node:crypto";

import { expect, newContext, test, type Page } from "./fixtures";
import { config as loadEnv } from "dotenv";
import { Pool } from "pg";

import { signParticipantSession } from "../../src/server/auth/participant-session-token";

import { createE2eStaff, retireE2eStaff, signInStaff } from "./study-fixtures";

loadEnv({ quiet: true });

const tag = randomBytes(3).toString("hex");
const PASSWORD = `e2e-${randomBytes(12).toString("hex")}`;
const RESEARCHER = `e2e-researcher-${tag}@example.test`;
const KEYS = [1, 2, 3].map((i) => `demo-a.process_stage.stage-${i}`);

let pool: Pool;
const ids = {} as { assessment: string; item: string; study: string; participant: string; session: string; code: string; reference: string; concepts: string[]; titles: string[] };

async function one<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T> {
  const r = await pool.query<T>(sql, params);
  if (!r.rows[0]) throw new Error(`no row: ${sql}`);
  return r.rows[0];
}

test.beforeAll(async () => {
  pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  const snap = await one<{ id: string }>("SELECT id FROM content_snapshots WHERE version_label = 'demo-snapshot-v1' AND status = 'published'");
  const concepts = await pool.query<{ id: string; key: string; title: string }>("SELECT id, key, title FROM concepts WHERE key = ANY($1::text[])", [KEYS]);
  const byKey = new Map(concepts.rows.map((c) => [c.key, c]));
  ids.concepts = KEYS.map((k) => byKey.get(k)!.id);
  ids.titles = KEYS.map((k) => byKey.get(k)!.title);

  createE2eStaff(RESEARCHER, "E2E Researcher", "researcher", PASSWORD);
  const researcher = await one<{ id: string }>("SELECT id FROM users WHERE email = $1", [RESEARCHER]);
  const otherRater = `e2e-rater-${tag}`;
  await pool.query("INSERT INTO users (id, name, email) VALUES ($1, 'E2E second rater', $2)", [otherRater, `${otherRater}@example.test`]);

  ids.assessment = (
    await one<{ id: string }>("INSERT INTO assessments (code, version, kind, title, is_demo) VALUES ($1, 1, 'reconstruction', $2, true) RETURNING id", [
      `demo-e2e-map-${tag}`,
      `Demo: E2E reconstruction ${tag}`,
    ])
  ).id;
  ids.item = (
    await one<{ id: string }>("INSERT INTO assessment_items (assessment_id, item_key, position, kind, prompt, config) VALUES ($1, 'map', 0, 'concept_map', $2, $3) RETURNING id", [
      ids.assessment,
      "Demo: connect the demo process stages.",
      JSON.stringify({ kind: "concept_map", conceptKeys: KEYS, relationshipTypes: ["PRECEDES", "USES"], directed: true, allowFreeNodes: false }),
    ])
  ).id;
  await pool.query("UPDATE assessments SET status = 'locked' WHERE id = $1", [ids.assessment]);

  const rs = await one<{ id: string }>(
    `INSERT INTO mapping_rule_sets (name, version, config, is_demo) VALUES ($1, 1, '{"schemaVersion":1,"rules":[]}', true) RETURNING id`,
    [`Demo: assessment e2e rules ${tag}`],
  );
  await pool.query("UPDATE mapping_rule_sets SET status = 'frozen', frozen_at = now() WHERE id = $1", [rs.id]);
  const manifest = await one<{ id: string }>(
    `INSERT INTO spatial_manifests (snapshot_id, rule_set_id, compiler_version, seed, manifest, is_demo) VALUES ($1, $2, 'demo-e2e', $3, '{"schemaVersion":1,"elements":[]}', true) RETURNING id`,
    [snap.id, rs.id, `map-${tag}`],
  );
  await pool.query("UPDATE spatial_manifests SET status = 'published', published_at = now() WHERE id = $1", [manifest.id]);
  const config = {
    traditionSlugs: ["demo-tradition-a"],
    nonExperimental: true,
    steps: ["learning", "reconstruction"],
    exposure: {},
  };
  ids.study = (
    await one<{ id: string }>(
      `INSERT INTO studies (slug, title, protocol_version, design, snapshot_id, manifest_id, config, allow_unverified_content, is_demo)
       VALUES ($1, $2, 'demo-e2e-1', 'between', $3, $4, $5, true, true) RETURNING id`,
      [`demo-e2e-map-${tag}`, `Demo: assessment E2E ${tag}`, snap.id, manifest.id, JSON.stringify(config)],
    )
  ).id;
  const c2d = await one<{ id: string }>("INSERT INTO study_conditions (study_id, code, label, interface, position) VALUES ($1, 'conventional', 'Demo: 2D', 'conventional_2d', 0) RETURNING id", [ids.study]);
  await pool.query("INSERT INTO study_conditions (study_id, code, label, interface, position) VALUES ($1, 'immersive', 'Demo: 3D', 'immersive_3d', 1)", [ids.study]);
  await pool.query("INSERT INTO study_assessments (study_id, assessment_id, phase, position) VALUES ($1, $2, 'post', 0)", [ids.study, ids.assessment]);
  await pool.query("UPDATE studies SET status = 'active' WHERE id = $1", [ids.study]);

  ids.code = `E2E-${tag}`;
  ids.participant = (await one<{ id: string }>("INSERT INTO participants (study_id, code) VALUES ($1, $2) RETURNING id", [ids.study, ids.code])).id;
  await pool.query("INSERT INTO consent_records (participant_id, consent_version, consent_text_sha256, decision) VALUES ($1, 'demo-e2e', $2, 'granted')", [ids.participant, "a".repeat(64)]);
  const alloc = await one<{ id: string }>(
    `INSERT INTO allocations (study_id, participant_id, condition_id, algorithm, seed, sequence_index, study_protocol_version, override_reason)
     VALUES ($1, $2, $3, 'manual', 'demo-e2e', 0, 'demo-e2e-1', 'Demo: e2e fixture') RETURNING id`,
    [ids.study, ids.participant, c2d.id],
  );
  ids.session = (
    await one<{ id: string }>(
      `INSERT INTO study_sessions (study_id, participant_id, condition_id, allocation_id, app_build, status, started_at) VALUES ($1, $2, $3, $4, 'e2e', 'in_progress', now()) RETURNING id`,
      [ids.study, ids.participant, c2d.id, alloc.id],
    )
  ).id;
  await pool.query("UPDATE study_sessions SET learning_started_at = now() - interval '5 minutes' WHERE id = $1", [ids.session]);
  await pool.query("UPDATE study_sessions SET learning_ended_at = now() WHERE id = $1", [ids.session]);
  await pool.query(
    "INSERT INTO audit_log (actor_kind, actor_id, action, entity, entity_id, after) VALUES ('participant', $1, 'study.device_checked', 'study_session', $2, $3)",
    [ids.code, ids.session, JSON.stringify({ outcome: "passed" })],
  );

  ids.reference = (
    await one<{ id: string }>("INSERT INTO reference_maps (assessment_id, version, title, nodes, is_demo, created_by) VALUES ($1, 1, $2, $3, true, $4) RETURNING id", [
      ids.assessment,
      `Demo: E2E reference ${tag}`,
      JSON.stringify(ids.concepts.map((conceptId, i) => ({ conceptId, label: ids.titles[i] }))),
      researcher.id,
    ])
  ).id;
  const edge = (s: number, t: number, type: string) => ({ sourceConceptId: ids.concepts[s], targetConceptId: ids.concepts[t], relationshipTypeCode: type, directed: true, required: true });
  const agreed = [edge(0, 1, "PRECEDES"), edge(1, 2, "PRECEDES")];
  for (const [rater, edges] of [
    [researcher.id, [...agreed, edge(0, 2, "USES")]],
    [otherRater, agreed],
  ] as const) {
    await pool.query("INSERT INTO reference_map_raters (reference_map_id, rater_id, role, submission) VALUES ($1, $2, 'rater', $3)", [
      ids.reference,
      rater,
      JSON.stringify({ conceptIds: ids.concepts, edges }),
    ]);
  }
});

test.afterAll(async () => {
  if (pool) await retireE2eStaff(pool, [RESEARCHER, `e2e-rater-${tag}@example.test`]);
  await pool?.end();
});

async function addRelationship(page: Page, from: string, type: string, to: string) {
  const form = page.getByRole("form", { name: "Add a relationship" });
  await form.getByLabel("From concept").selectOption({ label: from });
  await form.getByLabel("Relationship").selectOption({ label: type });
  await form.getByLabel("To concept").selectOption({ label: to });
  await form.getByRole("button", { name: "Add relationship" }).press("Enter");
}

test("a participant builds and submits a concept map; a researcher adjudicates, scores and exports it", async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  const [s1, s2, s3] = ids.titles as [string, string, string];

  const participant = await newContext(browser);
  const token = await signParticipantSession({ participantId: ids.participant, sessionId: ids.session, condition: "2d" }, process.env.BETTER_AUTH_SECRET!);
  const host = new URL(baseURL!).hostname;
  await participant.addCookies([
    { name: "ie_study_session", value: token, url: baseURL! },
    { name: "__Host-ie_study_session", value: token, domain: host, path: "/", secure: true, httpOnly: true, sameSite: "Lax" },
  ]);
  const page = await participant.newPage();
  await page.goto("/study/reconstruction");
  await expect(page.getByRole("heading", { level: 1, name: "Connect the concepts" })).toBeVisible();
  await expect(page.getByText("After the learning task")).toBeVisible();
  const practice = page.getByRole("region", { name: "Try the map first" });
  await expect(practice).toBeVisible();
  await expect(practice.locator(".react-flow__node")).toHaveCount(3);
  const rain = (await practice.locator(".react-flow__node", { hasText: "Rain" }).boundingBox())!;
  await page.mouse.move(rain.x + rain.width / 2, rain.y + rain.height / 2);
  await page.mouse.down();
  await page.mouse.move(rain.x + rain.width / 2 + 60, rain.y + rain.height / 2 + 30, { steps: 8 });
  await page.mouse.up();
  await expect(practice.getByRole("listitem").filter({ hasText: "Place a concept" })).toContainText("(done)");
  await practice.getByRole("button", { name: "Skip the practice" }).click();
  await expect(practice).toBeHidden();
  expect((await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM concept_maps WHERE session_id = $1", [ids.session])).rows[0]!.n).toBe(0);
  await expect(page.locator(".react-flow__node")).toHaveCount(3);
  await expect(page.getByRole("link", { name: "Withdraw from the study" })).toBeVisible();

  await addRelationship(page, s1, "precedes", s2);
  await expect(page.getByText(`${s1} precedes ${s2}`, { exact: true })).toBeVisible();

  const handle = page.locator(".react-flow__node", { hasText: s2 }).locator(".react-flow__handle.source");
  const target = page.locator(".react-flow__node", { hasText: s3 }).locator(".react-flow__handle.target");
  const from = (await handle.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
  await page.mouse.up();
  const form = page.getByRole("form", { name: "Add a relationship" });
  await expect(form.getByRole("status")).toContainText("Choose the relationship type");
  await form.getByLabel("Relationship").selectOption({ label: "precedes" });
  await form.getByRole("button", { name: "Add relationship" }).click();
  await expect(page.getByText(`${s2} precedes ${s3}`, { exact: true })).toBeVisible();

  await addRelationship(page, s3, "uses", s1);
  await page.getByRole("button", { name: `Reverse: ${s3} uses ${s1}` }).click();
  await page.getByRole("button", { name: `Delete: ${s1} uses ${s3}` }).click();
  await expect(page.getByRole("heading", { name: "Your relationships (2)" })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  for (const name of ["Add relationship", "Submit map"]) {
    const button = (await page.getByRole("button", { name, exact: true }).boundingBox())!;
    const row = (await page.getByRole("button", { name, exact: true }).locator("xpath=..").boundingBox())!;
    expect(Math.abs(button.width - row.width)).toBeLessThanOrEqual(1);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  await page.setViewportSize({ width: 1280, height: 720 });

  await page.getByRole("button", { name: "Submit map" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("2 relationships");
  await dialog.getByRole("button", { name: "Submit map" }).click();
  await page.waitForURL((u) => u.pathname === "/study/session");
  await expect(page.getByRole("heading", { level: 1, name: "Your Session" })).toBeVisible();

  const stored = await one<{ is_final: boolean; raw: { editLog: Array<{ op: string; via: string }> }; edges: string }>(
    "SELECT is_final, raw, (SELECT count(*) FROM concept_map_edges e WHERE e.concept_map_id = cm.id) AS edges FROM concept_maps cm WHERE session_id = $1 AND phase = 'post'",
    [ids.session],
  );
  expect(stored.is_final).toBe(true);
  expect(stored.edges).toBe("2");
  expect(stored.raw.editLog.map((l) => l.op)).toEqual(["add_edge", "add_edge", "add_edge", "reverse_edge", "delete_edge"]);
  expect(stored.raw.editLog[1]!.via).toBe("canvas");
  await participant.close();

  const staff = await newContext(browser);
  const r = await staff.newPage();
  await signInStaff(r, RESEARCHER, PASSWORD);

  await r.goto(`/research/assessments/${ids.assessment}/reference/${ids.reference}`);
  await expect(r.getByText("1 tied edge needs an adjudication decision.")).toBeVisible();
  const tie = r.locator("li", { hasText: "Tie: adjudicate" });
  await expect(tie).toContainText(`${s1} uses ${s3}`);
  await tie.getByLabel("Decision").selectOption("excluded");
  await tie.getByLabel("Reason").fill("Demo: excluded in the e2e test.");
  await tie.getByRole("button", { name: "Record decision" }).click();
  await expect(r.getByText("No ties remain.")).toBeVisible();
  await r.getByRole("button", { name: "Finalise reference map" }).click();
  await expect(r.getByRole("heading", { name: "Adjudicated reference" })).toBeVisible();
  await expect(r.getByText("2 edges; participant maps are scored against these.")).toBeVisible();

  await r.getByRole("link", { name: "Score participant maps against this reference" }).click();
  await r.getByRole("button", { name: "Score all submitted maps" }).click();
  await expect(r.getByText(/Scored 1 map\(s\)/)).toBeVisible();
  const row = r.getByRole("row", { name: new RegExp(ids.code) });
  await expect(row).toBeVisible();
  const cells = row.getByRole("cell");
  await expect(cells.nth(4)).toHaveText("2");
  await expect(cells.nth(5)).toHaveText("0");
  await expect(cells.nth(6)).toHaveText("0");

  await row.getByRole("link", { name: /Breakdown/ }).click();
  await expect(r.getByRole("heading", { name: "Participant relationships" })).toBeVisible();
  await expect(r.getByRole("cell", { name: "Correct", exact: true })).toHaveCount(2);
  await expect(r.getByText("Stored scores differ from a recomputation")).toHaveCount(0);

  const csv = await r.request.get(`/research/scoring/export?dataset=scores&format=csv&assessment=${ids.assessment}`);
  expect(csv.status()).toBe(200);
  const body = await csv.text();
  expect(body.split("\r\n")[0]).toContain("participant_code");
  expect(body).toContain(`${ids.code},`);
  expect(body).toContain("cmap.valid_relationships");
  await staff.close();
});
