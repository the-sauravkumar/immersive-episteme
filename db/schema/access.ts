import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { SHA256_HEX_RE, actorId, createdAt, pk, requiredActorId, tsz } from "./_common";
import { studies } from "./study";

const SHA = sql.raw(`'${SHA256_HEX_RE}'`);

export const inviteCodes = pgTable(
  "invite_codes",
  {
    id: pk(),
    label: text().notNull(),
    codeHash: text().notNull().unique(),
    codeHint: text().notNull(),
    studyId: uuid().references(() => studies.id, { onDelete: "set null" }),
    maxUses: integer(),
    useCount: integer().notNull().default(0),
    expiresAt: tsz(),
    revokedAt: tsz(),
    revokedBy: actorId(),
    lastUsedAt: tsz(),
    createdBy: requiredActorId(),
    createdAt: createdAt(),
  },
  (t) => [
    check("invite_codes_hash_ck", sql`${t.codeHash} ~ ${SHA}`),
    check("invite_codes_hint_ck", sql`${t.codeHint} ~ '^[0-9A-Z]{4}$'`),
    check("invite_codes_label_ck", sql`btrim(${t.label}) <> '' AND char_length(${t.label}) <= 120`),
    check("invite_codes_max_uses_ck", sql`${t.maxUses} IS NULL OR ${t.maxUses} > 0`),
    check("invite_codes_use_count_ck", sql`${t.useCount} >= 0 AND (${t.maxUses} IS NULL OR ${t.useCount} <= ${t.maxUses})`),
    index("invite_codes_created_idx").on(t.createdAt),
  ],
);
