/**
 * Audit-log reader for /admin/audit. audit_log is append-only (UPDATE/DELETE/TRUNCATE are
 * rejected by triggers, migration 0003), so this module only reads.
 *
 * Not `server-only` (tests call it with their own pool).
 */
import type { Pool } from "pg";
import { z } from "zod";

import { ensure, type Actor } from "@/server/cms/core";

export const AUDIT_PAGE_SIZE = 50;

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));
const optDate = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined));

export const auditFilterSchema = z.object({
  action: optText(64),
  entity: optText(64),
  actor: optText(128),
  q: optText(200),
  from: optDate,
  to: optDate,
  page: z.coerce.number().int().min(1).max(100_000).catch(1).default(1),
});
export type AuditFilter = z.infer<typeof auditFilterSchema>;

export interface AuditRow {
  id: string;
  occurredAt: string;
  actorKind: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  reason: string | null;
}

export interface AuditPage {
  rows: AuditRow[];
  page: number;
  hasNext: boolean;
  filter: AuditFilter;
}

/** Escapes LIKE wildcards so filters match literally. */
function likePrefix(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/** Search params (any shape) -> validated filter (invalid values are dropped, never thrown). */
export function parseAuditFilter(params: Record<string, string | string[] | undefined>): AuditFilter {
  const flat = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const r = auditFilterSchema.safeParse(flat);
  return r.success ? r.data : auditFilterSchema.parse({});
}

export async function queryAuditLog(pool: Pool, actor: Actor, filter: AuditFilter): Promise<AuditPage> {
  ensure(actor, "admin.audit");
  const where: string[] = [];
  const args: unknown[] = [];
  const add = (sql: string, v: unknown) => {
    args.push(v);
    where.push(sql.replace("?", `$${args.length}`));
  };
  if (filter.action) add("a.action LIKE ? ESCAPE '\\'", `${likePrefix(filter.action)}%`);
  if (filter.entity) add("a.entity = ?", filter.entity);
  if (filter.actor) add("a.actor_id = ?", filter.actor);
  if (filter.q) add("a.reason ILIKE ? ESCAPE '\\'", `%${likePrefix(filter.q)}%`);
  if (filter.from) add("a.occurred_at >= ?::date", filter.from);
  if (filter.to) add("a.occurred_at < (?::date + 1)", filter.to);
  const offset = (filter.page - 1) * AUDIT_PAGE_SIZE;
  const r = await pool.query<{
    id: string; occurred_at: Date; actor_kind: string; actor_id: string | null; actor_name: string | null; action: string;
    entity: string; entity_id: string | null; before: unknown; after: unknown; reason: string | null;
  }>(
    `SELECT a.id, a.occurred_at, a.actor_kind, a.actor_id, u.name AS actor_name, a.action, a.entity, a.entity_id, a.before, a.after, a.reason
       FROM audit_log a LEFT JOIN users u ON a.actor_kind = 'user' AND u.id = a.actor_id
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY a.occurred_at DESC, a.id DESC
      LIMIT ${AUDIT_PAGE_SIZE + 1} OFFSET ${offset}`,
    args,
  );
  const rows = r.rows.slice(0, AUDIT_PAGE_SIZE).map((a) => ({
    id: a.id,
    occurredAt: a.occurred_at.toISOString(),
    actorKind: a.actor_kind,
    actorId: a.actor_id,
    actorName: a.actor_name,
    action: a.action,
    entity: a.entity,
    entityId: a.entity_id,
    before: a.before,
    after: a.after,
    reason: a.reason,
  }));
  return { rows, page: filter.page, hasNext: r.rows.length > AUDIT_PAGE_SIZE, filter };
}

/** Distinct entities present (for the filter's select). */
export async function auditEntities(pool: Pool, actor: Actor): Promise<string[]> {
  ensure(actor, "admin.audit");
  const r = await pool.query<{ entity: string }>("SELECT DISTINCT entity FROM audit_log ORDER BY entity");
  return r.rows.map((x) => x.entity);
}
