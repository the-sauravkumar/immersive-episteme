import { connectionHost, isLocalHost } from "../db/_shared";

export const REMOTE_CONFIRM_FLAG = "--i-understand-this-is-remote";
const KNOWN_ARGS = new Set([REMOTE_CONFIRM_FLAG]);

export interface TargetDecision {
  ok: boolean;
  host: string;
  database: string;
  remote: boolean;
  message: string;
}

export function decideBootstrapTarget(url: string, argv: readonly string[]): TargetDecision {
  const unknown = argv.filter((a) => !KNOWN_ARGS.has(a));
  let host = "";
  let database = "";
  try {
    const u = new URL(url);
    host = connectionHost(url);
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

export function pendingMigrations(journalEntries: number, applied: number): number {
  return Math.max(0, journalEntries - applied);
}
