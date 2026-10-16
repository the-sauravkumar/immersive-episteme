/**
 * Which commands scripts/deploy/with-env.ts refuses to run against PRODUCTION. Pure, so
 * tests/unit/deploy-production-data-path.test.ts covers it.
 *
 * Refused: demo or reset data (`db:seed`, `db:reset`, scripts/db/seed.ts, scripts/db/reset.ts),
 * the local bootstrap (`dev:bootstrap`, scripts/dev/bootstrap.ts: demo seed and test database),
 * the test database (`--test`), and schema changes outside the migration history
 * (`drizzle-kit push|drop`).
 *
 * Allowed on purpose (the production data path, RUNBOOK section 5):
 *  - `db:seed:reference` / scripts/db/seed-reference.ts: reference data only (idempotent upserts);
 *  - `content:bootstrap:remote` / scripts/content/bootstrap-remote.ts: the public demo museum,
 *    which itself demands --i-understand-this-is-remote for a non-local host.
 */
const BLOCKED: readonly { re: RegExp; why: string }[] = [
  // `db:seed` but not `db:seed:reference` (a following word character, ':' or '-' would be another script).
  { re: /db:seed(?!:reference(?![\w:-]))/, why: "db:seed loads the demo dataset" },
  { re: /db:reset/, why: "db:reset drops data" },
  { re: /dev:bootstrap/, why: "dev:bootstrap seeds demo data and migrates the test database" },
  // scripts/db/seed.ts and scripts/db/reset.ts, not scripts/db/seed-reference.ts.
  { re: /scripts[\\/]+db[\\/]+(seed|reset)(?![\w-])/, why: "the demo seed or the reset script" },
  { re: /scripts[\\/]+dev[\\/]+bootstrap/, why: "the local bootstrap" },
  { re: /(^|\s)--test(\s|=|$)/, why: "--test targets the test database" },
  { re: /drizzle-kit\s+(push|drop)/, why: "drizzle-kit push/drop changes the schema outside the migrations" },
];

/** The reason with-env refuses this command, or null when it may run. */
export function refusalReason(command: readonly string[]): string | null {
  if (command.length === 0) return "no command given";
  const joined = command.join(" ");
  const hit = BLOCKED.find((b) => b.re.test(joined));
  return hit ? hit.why : null;
}
