/**
 * Guards for `npm run content:bootstrap:remote` (scripts/content/bootstrap-remote.ts). Pure, so
 * tests/unit/deploy-production-data-path.test.ts covers them.
 *
 *  - decideBootstrapTarget: a non-local database runs only with --i-understand-this-is-remote, and
 *    the decision always names the host and database so the operator sees the target first.
 *  - missingReferenceCodes: the reference rows the content and telemetry need (db:seed:reference).
 *  - pendingMigrations: the database must carry every migration in db/migrations/meta/_journal.json.
 */
import { isLocalHost } from "../db/_shared";

export const REMOTE_CONFIRM_FLAG = "--i-understand-this-is-remote";
const KNOWN_ARGS = new Set([REMOTE_CONFIRM_FLAG]);

export interface TargetDecision {
  ok: boolean;
  /** Host name of the target, or "" when the URL cannot be read. */
  host: string;
  database: string;
  remote: boolean;
  /** One line for the operator: the target, and why it may or may not run. */
  message: string;
}

export function decideBootstrapTarget(url: string, argv: readonly string[]): TargetDecision {
  const unknown = argv.filter((a) => !KNOWN_ARGS.has(a));
  let host = "";
  let database = "";
  try {
    const u = new URL(url);
    host = u.hostname;
    database = decodeURIComponent(u.pathname.replace(/^\//, ""));
  } catch {
    return { ok: false, host, database, remote: true, message: "Refused: the database URL cannot be parsed." };
  }
  if (!/^postgres(ql)?:$/.test(new URL(url).protocol) || !host) {
    return { ok: false, host, database, remote: true, message: "Refused: not a postgres:// or postgresql:// URL with a host." };
  }
  const remote = !isLocalHost(url);
  const target = `target host ${host}, database ${database || "(default)"} (${remote ? "REMOTE" : "local"})`;
  if (unknown.length > 0) {
    return { ok: false, host, database, remote, message: `Refused: unknown argument(s) ${unknown.join(" ")}; the only option is ${REMOTE_CONFIRM_FLAG}. ${target}` };
  }
  if (remote && !argv.includes(REMOTE_CONFIRM_FLAG)) {
    return {
      ok: false,
      host,
      database,
      remote,
      message: `Refused: ${target}. Check that this is the database you mean, then rerun with ${REMOTE_CONFIRM_FLAG}.`,
    };
  }
  return { ok: true, host, database, remote, message: `${target}${remote ? `; confirmed by ${REMOTE_CONFIRM_FLAG}` : ""}` };
}

export interface ReferencePresence {
  eventTypes: readonly string[];
  relationshipTypes: readonly string[];
  knowledgeCategories: readonly string[];
}

/** Reference codes the registries define but the database lacks, as "table:code". */
export function missingReferenceCodes(expected: ReferencePresence, present: ReferencePresence): string[] {
  const out: string[] = [];
  const check = (table: string, want: readonly string[], have: readonly string[]) => {
    const got = new Set(have);
    for (const c of want) if (!got.has(c)) out.push(`${table}:${c}`);
  };
  check("event_types", expected.eventTypes, present.eventTypes);
  check("relationship_types", expected.relationshipTypes, present.relationshipTypes);
  check("knowledge_categories", expected.knowledgeCategories, present.knowledgeCategories);
  return out;
}

/** Number of migrations in the journal that the database has not recorded (never negative). */
export function pendingMigrations(journalEntries: number, applied: number): number {
  return Math.max(0, journalEntries - applied);
}
