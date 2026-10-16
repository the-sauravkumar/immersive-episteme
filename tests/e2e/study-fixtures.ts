/**
 * E2E fixture for the study-engine journeys: an ACTIVE demo study in the development database
 * (DATABASE_URL), created once and reused. Everything is demo data (`is_demo`, `demo-` slug,
 * `Demo:` titles): it runs on the seeded, published demo snapshot (`demo-snapshot-v1`, from
 * `npm run db:seed` / `npm run dev:bootstrap`) with the seeded demo assessments, and a demo
 * placeholder manifest. Demo studies are never experimental.
 *
 * (The bootstrap study `demo-review-walkthrough` cannot be used: it is pinned to the review
 * snapshot, which can never be published, so it can never be activated.)
 */
import { config as loadEnv } from "dotenv";
import { Pool } from "pg";

loadEnv({ quiet: true });

/**
 * A new slug for the D3/D8 protocol with the D5 familiarisation step: an active study's config
 * is frozen, so the earlier fixtures stay as they were.
 */
export const E2E_STUDY_CODE = "demo-e2e-study-engine-d8-practice";

let pool: Pool | null = null;
export function db(): Pool {
  pool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  return pool;
}

export async function closeDb(): Promise<void> {
  await pool?.end();
  pool = null;
}

/**
 * Retires the throwaway staff accounts the e2e specs create (the calling spec's own, plus every
 * `e2e-*@example.test` row over an hour old, the password-less "E2E second rater" rows included): locked, roles removed and sessions ended, so no
 * usable test login accumulates and none counts as a role holder on /admin/roles. The rows stay,
 * because audit entries and adjudications may reference them. Call it from a spec's afterAll.
 */
export async function retireE2eStaff(client: Pick<Pool, "query"> = db(), own: readonly string[] = []): Promise<void> {
  // This spec's own accounts, and any left by earlier runs (over an hour old). Accounts another
  // spec running in parallel created a moment ago are left alone: retiring them mid-test signed
  // that spec's staff out (workers > 1).
  const mine =
    "SELECT id FROM users WHERE email LIKE 'e2e-%@example.test' AND (email = ANY($1::text[]) OR created_at < now() - interval '1 hour')";
  await client.query(`UPDATE users SET disabled_at = now() WHERE id IN (${mine}) AND disabled_at IS NULL`, [own]);
  await client.query(`DELETE FROM user_roles WHERE user_id IN (${mine})`, [own]);
  await client.query(`DELETE FROM auth_sessions WHERE user_id IN (${mine})`, [own]);
}

/**
 * The adopted protocol (D3 allocation after the pre-test, D8 order with the three questionnaire
 * steps and familiarisation before onboarding), shortened for automation: self-paced learning
 * instead of D5's 30 fixed minutes (familiarisation keeps D5's minimum of 5 minutes; the journey
 * test back-dates its start, see `backdateFamiliarisation`), the
 * demo questionnaire as the instrument of every questionnaire step (the D7 instruments are not
 * all showable yet), no concept-map steps (the editor is covered by the assessment module's tests).
 */
const CONFIG = {
  traditionSlugs: ["demo-tradition-a"],
  nonExperimental: true,
  consent: { version: "demo-e2e-1", text: "Demo: consent text used only by automated tests. This is not a real study." },
  participantInformation: "Demo: information sheet used only by automated tests.",
  steps: ["questionnaire_pre", "pre_test", "familiarisation", "onboarding", "learning", "questionnaire_post_learning", "post_test", "transfer", "questionnaire_end"],
  familiarisation: { minutes: 5 },
  questionnaires: { pre: ["demo-questionnaire"], postLearning: ["demo-questionnaire"], end: ["demo-questionnaire"] },
  allocation: { algorithm: "block", blockSize: 2, seed: "demo-e2e-seed", point: "after_pre_test" },
  exposure: { mode: "self_paced" },
  webglFailurePolicy: "retry",
  resume: { allowed: true },
  retentionDays: 30,
};

export async function ensureE2eStudy(): Promise<string> {
  const q = db();
  const existing = await q.query<{ id: string }>("SELECT id FROM studies WHERE slug = $1", [E2E_STUDY_CODE]);
  if (existing.rows[0]) return existing.rows[0].id;
  const snap = await q.query<{ id: string }>("SELECT id FROM content_snapshots WHERE version_label = 'demo-snapshot-v1' AND status = 'published'");
  if (!snap.rows[0]) throw new Error("demo-snapshot-v1 is missing: run `npm run dev:bootstrap` (or `npm run db:seed`) first");
  const snapshotId = snap.rows[0].id;
  const client = await q.connect();
  try {
    await client.query("BEGIN");
    // The frozen rule set is reused (frozen rule sets are immutable).
    const found = await client.query<{ id: string }>("SELECT id FROM mapping_rule_sets WHERE name = 'Demo: e2e placeholder rules' AND version = 1");
    const rs = found.rows[0]
      ? found
      : await client.query<{ id: string }>(
          `INSERT INTO mapping_rule_sets (name, version, config, is_demo) VALUES ('Demo: e2e placeholder rules', 1, '{"schemaVersion":1,"rules":[]}', true) RETURNING id`,
        );
    await client.query("UPDATE mapping_rule_sets SET status = 'frozen', frozen_at = coalesce(frozen_at, now()) WHERE id = $1 AND status <> 'frozen'", [rs.rows[0]!.id]);
    const m = await client.query<{ id: string }>(
      `INSERT INTO spatial_manifests (snapshot_id, rule_set_id, compiler_version, seed, manifest, is_demo)
       VALUES ($1, $2, 'demo-e2e', $3, '{"schemaVersion":1,"elements":[]}', true) RETURNING id`,
      [snapshotId, rs.rows[0]!.id, E2E_STUDY_CODE],
    );
    await client.query("UPDATE spatial_manifests SET status = 'published', published_at = now() WHERE id = $1", [m.rows[0]!.id]);
    const s = await client.query<{ id: string }>(
      `INSERT INTO studies (slug, title, description, protocol_version, design, snapshot_id, manifest_id, config, allow_unverified_content, is_demo)
       VALUES ($1, 'Demo: Study-engine E2E fixture', 'Demo: automated-test study. Never real data.', 'demo-e2e-1', 'between', $2, $3, $4::jsonb, true, true) RETURNING id`,
      [E2E_STUDY_CODE, snapshotId, m.rows[0]!.id, JSON.stringify(CONFIG)],
    );
    const studyId = s.rows[0]!.id;
    await client.query(
      `INSERT INTO study_conditions (study_id, code, label, interface, position)
       VALUES ($1, 'conventional', 'Demo: Conventional 2D', 'conventional_2d', 0), ($1, 'immersive', 'Demo: Immersive 3D', 'immersive_3d', 1)`,
      [studyId],
    );
    const battery: [string, string, number][] = [
      ["demo-pretest", "pre", 0],
      ["demo-posttest", "post", 0],
      ["demo-transfer", "post", 1],
      ["demo-questionnaire", "post", 2],
    ];
    for (const [code, phase, pos] of battery) {
      await client.query(
        "INSERT INTO study_assessments (study_id, assessment_id, phase, position) SELECT $1, id, $2, $3 FROM assessments WHERE code = $4 AND version = 1",
        [studyId, phase, pos, code],
      );
    }
    await client.query("UPDATE studies SET status = 'active' WHERE id = $1", [studyId]);
    await client.query("COMMIT");
    return studyId;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Ends the practice wait of a participant's familiarisation step for automation: the study engine
 * takes the EARLIEST `study.familiarisation_started` journal entry as the start, and the journal
 * (audit_log) is append-only, so an earlier entry is appended instead of editing the real one.
 */
export async function backdateFamiliarisation(code: string, minutes = 6): Promise<void> {
  const row = await participantByCode(code);
  if (!row.sessionId) throw new Error(`participant ${code} has no session`);
  await db().query(
    `INSERT INTO audit_log (actor_kind, actor_id, action, entity, entity_id, after, occurred_at)
     VALUES ('participant', $1, 'study.familiarisation_started', 'study_session', $2, '{"minutes":5,"e2e":"backdated"}'::jsonb, now() - make_interval(mins => $3))`,
    [code, row.sessionId, minutes],
  );
}

export interface ParticipantRow {
  participantId: string;
  participantStatus: string;
  sessionId: string | null;
  sessionStatus: string | null;
  withdrawn: boolean | null;
  interruptionCount: number | null;
  condition: "conventional_2d" | "immersive_3d" | null;
}

export async function participantByCode(code: string): Promise<ParticipantRow> {
  const r = await db().query<{ id: string; status: string; session_id: string | null; s_status: string | null; withdrawn: boolean | null; interruption_count: number | null; interface: ParticipantRow["condition"] }>(
    `SELECT p.id, p.status, ss.id AS session_id, ss.status AS s_status, ss.withdrawn, ss.interruption_count, sc.interface
       FROM participants p
       JOIN studies st ON st.id = p.study_id AND st.slug = $2
       LEFT JOIN study_sessions ss ON ss.participant_id = p.id
       LEFT JOIN study_conditions sc ON sc.id = ss.condition_id
      WHERE p.code = $1
      ORDER BY ss.period DESC NULLS LAST LIMIT 1`,
    [code, E2E_STUDY_CODE],
  );
  const row = r.rows[0];
  if (!row) throw new Error(`participant ${code} not found`);
  return {
    participantId: row.id,
    participantStatus: row.status,
    sessionId: row.session_id,
    sessionStatus: row.s_status,
    withdrawn: row.withdrawn,
    interruptionCount: row.interruption_count,
    condition: row.interface,
  };
}
