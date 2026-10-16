/**
 * Participant data removal from the command line (DR-030; the same service as the research
 * console's "Participant data" section, src/server/study/purge.ts).
 *
 *   npx tsx scripts/db/purge.ts --study <slug> --by <PI email> --retention            # list who is due (dry run)
 *   npx tsx scripts/db/purge.ts --study <slug> --by <PI email> --retention --confirm  # remove their data
 *   npx tsx scripts/db/purge.ts --study <slug> --by <PI email> --participant P-XXXXXXXXXX --reason "asked on 16 Oct" --confirm
 *
 * `--by` must be an active staff account holding participants.purge (the principal
 * investigator); every removal is journalled under that account with its reason. Without
 * --confirm nothing is deleted. --test targets TEST_DATABASE_URL instead of DATABASE_URL.
 */
import { parseArgs } from "node:util";

import { drizzle } from "drizzle-orm/node-postgres";

import * as schema from "../../db/schema";
import { permissionsForRoles } from "../../src/lib/permissions/matrix";
import { loadUserRoles } from "../../src/server/auth/roles-repository";
import { listRetentionDue, purgeParticipantData, purgeRetentionDue } from "../../src/server/study/purge";

import { makePool, redact, resolveDatabaseUrl } from "./_shared";

function usage(): never {
  console.error(
    "Usage: npx tsx scripts/db/purge.ts --study <slug> --by <PI email> (--retention | --participant <code> --reason <text>) [--confirm] [--test]",
  );
  process.exit(2);
}

async function main() {
  const { values } = parseArgs({
    options: {
      study: { type: "string" },
      by: { type: "string" },
      participant: { type: "string" },
      reason: { type: "string" },
      retention: { type: "boolean", default: false },
      confirm: { type: "boolean", default: false },
      test: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    strict: true,
  });
  if (values.help || !values.study || !values.by || values.retention === !!values.participant) usage();

  const { url, label } = resolveDatabaseUrl(values.test ? ["--test"] : []);
  const pool = makePool(url);
  try {
    const actor = await pool.query<{ id: string; disabled_at: Date | null }>("SELECT id, disabled_at FROM users WHERE lower(email) = lower($1)", [values.by.trim()]);
    const a = actor.rows[0];
    if (!a || a.disabled_at) throw new Error(`--by ${values.by} is not an active staff account`);
    const roles = await loadUserRoles(drizzle(pool, { schema, casing: "snake_case" }), a.id);
    if (!permissionsForRoles(roles).includes("participants.purge")) throw new Error(`--by ${values.by} may not remove participant data (participants.purge)`);
    const study = await pool.query<{ id: string }>("SELECT id FROM studies WHERE slug = $1", [values.study]);
    const studyId = study.rows[0]?.id;
    if (!studyId) throw new Error(`no study with slug ${values.study}`);
    console.log(`[purge] ${label} db ${redact(url)}, study ${values.study}`);

    if (values.retention) {
      const { retentionDays, due } = await listRetentionDue(pool, studyId);
      if (!retentionDays) {
        console.log("  the study sets no retention period (config.retentionDays): nothing is due");
        return;
      }
      console.log(`  retention ${retentionDays} days; due: ${due.length === 0 ? "none" : due.map((d) => `${d.participantCode} (ended ${d.endedAt.slice(0, 10)})`).join(", ")}`);
      if (!values.confirm || due.length === 0) {
        if (due.length) console.log("  dry run: add --confirm to remove their data");
        return;
      }
      for (const r of await purgeRetentionDue(pool, { studyId, actorId: a.id })) console.log(`  removed ${r.participantCode}: ${JSON.stringify(r.rows)}`);
      return;
    }

    if (!values.reason) usage();
    if (!values.confirm) {
      console.log(`  dry run: add --confirm to remove the data of ${values.participant}`);
      return;
    }
    const r = await purgeParticipantData(pool, { studyId, participant: values.participant!, reason: values.reason, actorId: a.id, trigger: "request" });
    console.log(`  removed ${r.participantCode} (${r.sessions} session(s)): ${JSON.stringify(r.rows)}`);
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error("[purge] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
