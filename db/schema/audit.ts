/**
 * Append-only audit log. UPDATE, DELETE and TRUNCATE are rejected by triggers (migration
 * 0003). `actor_id` is plain text (not an FK) because actors may be staff users, the system
 * or a pseudonymous participant code, and entries must outlive every referenced row.
 * IP addresses are never stored raw: only a keyed hash (`ip_hash`).
 */
import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text } from "drizzle-orm/pg-core";

import { SHA256_HEX_RE, pk, tsz } from "./_common";

export const auditLog = pgTable(
  "audit_log",
  {
    id: pk(),
    occurredAt: tsz().notNull().defaultNow(),
    actorKind: text().notNull(),
    actorId: text(),
    action: text().notNull(),
    entity: text().notNull(),
    entityId: text(),
    before: jsonb(),
    after: jsonb(),
    reason: text(),
    ipHash: text(),
    requestId: text(),
  },
  (t) => [
    check("audit_log_actor_kind_ck", sql`${t.actorKind} IN ('user', 'participant', 'system')`),
    check("audit_log_action_ck", sql`${t.action} ~ '^[a-z][a-z0-9_.]{1,63}$'`),
    check("audit_log_ip_ck", sql`${t.ipHash} IS NULL OR ${t.ipHash} ~ ${sql.raw(`'${SHA256_HEX_RE}'`)}`),
    index("audit_log_entity_idx").on(t.entity, t.entityId, t.occurredAt),
    index("audit_log_actor_idx").on(t.actorId, t.occurredAt),
  ],
);
