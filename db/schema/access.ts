/**
 * Site access: invite codes (deployment source change S11, DR "Invite-only site access").
 *
 * The site is always invite-only. An administrator creates codes in Admin -> Access; a visitor
 * redeems one once (`?invite=<code>` on any URL, or the /invite form) and receives a signed,
 * httpOnly cookie (src/server/access/invite-cookie.ts). Staff pass by signing in.
 *
 *  - Only a SHA-256 of the normalised code is stored (`code_hash`); the code itself is shown
 *    once, when it is created. `code_hint` keeps its last four characters so a row can be told
 *    apart in the list. Codes carry 100 random bits, so an unsalted hash is enough.
 *  - `use_count` counts redemptions (cookies issued). It never exceeds `max_uses` (check), and a
 *    redemption is one conditional UPDATE, so concurrent redemptions cannot overshoot the limit.
 *  - Revocation is a timestamp, never a delete, so the use history stays.
 *  - `study_id` (optional) only records which study's participant link the code was made for.
 */
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
