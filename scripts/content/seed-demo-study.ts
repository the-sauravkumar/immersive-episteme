import { LEARNING_CAP_MINUTES, NEW_STUDY_CONFIG } from "../../src/server/study/config";
import { seedInstrumentDefinitions } from "../../src/server/study/instruments";
import { DESIGNED_TEST_BATTERY, seedTestBattery } from "../../src/server/study/test-battery";
import { isLocalHost, makePool, redact, resolveDatabaseUrl } from "../db/_shared";

const SNAPSHOT_LABEL = "demo-snapshot-v1";
const INSTRUMENTS = ["background", "common-questions", "mps-physical-presence", "ssq", "sus"] as const;

function option(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

const log = (message: string) => process.stdout.write(`[seed-demo-study] ${message}\n`);

async function main(): Promise<void> {
  const slug = option("slug", "demo-walking-the-process");
  const capMinutes = Number(option("cap-minutes", String(LEARNING_CAP_MINUTES)));
  if (!slug.startsWith("demo-")) throw new Error("A demo study slug must start with demo-");
  const { url } = resolveDatabaseUrl();
  if (!isLocalHost(url)) throw new Error(`Refusing to seed a demo study into a non-local database: ${redact(url)}`);
  const battery = DESIGNED_TEST_BATTERY;
  const batteryVersion = Number(option("battery-version", "1"));
  const pool = makePool(url);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await seedInstrumentDefinitions(client);
    const inserted = await seedTestBattery(client, battery, batteryVersion);
    log(`battery: ${inserted.length} new of ${battery.length}`);

    const snapshot = await client.query<{ id: string }>("SELECT id FROM content_snapshots WHERE version_label = $1 AND status = 'published'", [SNAPSHOT_LABEL]);
    const snapshotId = snapshot.rows[0]?.id;
    if (!snapshotId) throw new Error(`${SNAPSHOT_LABEL} is missing: run npm run dev:bootstrap first`);

    const existing = await client.query<{ id: string }>("SELECT id FROM studies WHERE slug = $1", [slug]);
    if (existing.rows[0]) {
      await client.query("COMMIT");
      log(`study ${slug} already exists: ${existing.rows[0].id}`);
      return;
    }
    const config = {
      ...NEW_STUDY_CONFIG,
      exposure: { ...NEW_STUDY_CONFIG.exposure, minutes: capMinutes },
      allocation: { ...NEW_STUDY_CONFIG.allocation, seed: `${slug}-seed` },
      traditionSlugs: ["ajrakh", "sanganeri", "machilipatnam-kalamkari"],
      nonExperimental: true,
      consent: { version: "demo-walking-1", text: "Demo: consent text for a demonstration study, reference CXA/ETH/01. This is not a real study and nothing is kept as study data." },
      participantInformation: "Demo: information sheet for a demonstration study of two ways of learning a craft process.",
      webglFailurePolicy: "retry",
      resume: { allowed: true },
      retentionDays: 30,
    };
    const study = await client.query<{ id: string }>(
      `INSERT INTO studies (slug, title, description, protocol_version, design, snapshot_id, config, allow_unverified_content, is_demo)
       VALUES ($1, $2, 'Demo: the full journey through both doors. Never real data.', 'demo-walking-1', 'between', $3, $4::jsonb, true, true) RETURNING id`,
      [slug, `Demo: Walking The Process`, snapshotId, JSON.stringify(config)],
    );
    const studyId = study.rows[0]!.id;
    await client.query(
      `INSERT INTO study_conditions (study_id, code, label, interface, position)
       VALUES ($1, 'conventional', 'Demo: Door 1', 'conventional_2d', 0), ($1, 'immersive', 'Demo: Door 2', 'immersive_3d', 1)`,
      [studyId],
    );
    for (const assessment of battery) {
      await client.query("INSERT INTO study_assessments (study_id, assessment_id, phase, position) SELECT $1, id, $2, $3 FROM assessments WHERE code = $4 AND version = $5", [studyId, assessment.phase, assessment.position, assessment.code, batteryVersion]);
    }
    let position = 20;
    for (const code of INSTRUMENTS) {
      await client.query("INSERT INTO study_assessments (study_id, assessment_id, phase, position) SELECT $1, id, 'post', $2 FROM assessments WHERE code = $3 ORDER BY version DESC LIMIT 1", [studyId, position++, code]);
    }
    await client.query("UPDATE studies SET status = 'active' WHERE id = $1", [studyId]);
    await client.query("COMMIT");
    log(`study ${slug} active: ${studyId}, cap ${capMinutes} minutes`);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`[seed-demo-study] failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
