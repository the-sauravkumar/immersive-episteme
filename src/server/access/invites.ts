import type { Pool } from "pg";
import { z } from "zod";

import { CmsError, audit, ensure, inActorTx, type Actor, type Q } from "@/server/cms/core";

import { generateInviteCode, hashInviteCode, inviteCodeHint, normaliseInviteCode } from "./invite-code";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

export const createInviteInput = z.object({
  label: z.string().trim().min(1, "Enter a label").max(120, "Use at most 120 characters"),
  maxUses: z.preprocess(blank, z.coerce.number().int("Enter a whole number").min(1, "At least 1").max(100_000, "At most 100000").optional()),
  expiresOn: z.preprocess(blank, z.iso.date("Enter a date").optional()),
  studyId: z.preprocess(blank, z.string().regex(UUID_RE, "Choose a study").optional()),
});
export type CreateInviteInput = z.input<typeof createInviteInput>;

export const revokeInviteInput = z.object({ inviteId: z.string().regex(UUID_RE, "Unknown code") });

export function endOfUtcDay(isoDate: string): Date {
  return new Date(`${isoDate}T23:59:59.999Z`);
}

export interface CreatedInvite {
  id: string;
  code: string;
  hint: string;
  studySlug: string | null;
}

export async function createInvite(pool: Pool, actor: Actor, raw: CreateInviteInput, now: Date = new Date()): Promise<CreatedInvite> {
  ensure(actor, "admin.users");
  const input = createInviteInput.parse(raw);
  const expiresAt = input.expiresOn ? endOfUtcDay(input.expiresOn) : null;
  if (expiresAt && expiresAt.getTime() <= now.getTime()) {
    throw new CmsError("invalid_expiry", "The expiry date has already passed. Choose today or a later date.", 422);
  }
  const code = generateInviteCode();
  const normalised = normaliseInviteCode(code)!;
  const hint = inviteCodeHint(normalised);
  return inActorTx(pool, actor, null, async (c) => {
    let studySlug: string | null = null;
    if (input.studyId) {
      const s = await c.query<{ slug: string }>("SELECT slug FROM studies WHERE id = $1", [input.studyId]);
      if (!s.rows[0]) throw new CmsError("not_found", "No such study.", 404);
      studySlug = s.rows[0].slug;
    }
    const r = await c.query<{ id: string }>(
      `INSERT INTO invite_codes (label, code_hash, code_hint, study_id, max_uses, expires_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [input.label, hashInviteCode(normalised), hint, input.studyId ?? null, input.maxUses ?? null, expiresAt, actor.userId],
    );
    const id = r.rows[0]!.id;
    await audit(c, actor, {
      action: "admin.invite_created",
      entity: "invite_codes",
      entityId: id,
      after: { label: input.label, hint, maxUses: input.maxUses ?? null, expiresAt: expiresAt?.toISOString() ?? null, studyId: input.studyId ?? null },
      reason: "invite code created by an administrator",
    });
    return { id, code, hint, studySlug };
  });
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type InviteStatus = "active" | "revoked" | "expired" | "used_up";

export interface InviteRow {
  id: string;
  label: string;
  hint: string;
  studyId: string | null;
  studySlug: string | null;
  studyTitle: string | null;
  maxUses: number | null;
  useCount: number;
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  createdByName: string | null;
  status: InviteStatus;
  endsWithinWeek: boolean;
}

export function inviteStatus(row: { revokedAt: string | Date | null; expiresAt: string | Date | null; maxUses: number | null; useCount: number }, now: Date): InviteStatus {
  if (row.revokedAt) return "revoked";
  if (row.expiresAt && new Date(row.expiresAt).getTime() <= now.getTime()) return "expired";
  if (row.maxUses !== null && row.useCount >= row.maxUses) return "used_up";
  return "active";
}

export async function listInvites(q: Q, actor: Actor, now: Date = new Date()): Promise<InviteRow[]> {
  ensure(actor, "admin.users");
  const r = await q.query<{
    id: string;
    label: string;
    code_hint: string;
    study_id: string | null;
    slug: string | null;
    title: string | null;
    max_uses: number | null;
    use_count: number;
    expires_at: Date | null;
    revoked_at: Date | null;
    last_used_at: Date | null;
    created_at: Date;
    created_by_name: string | null;
  }>(
    `SELECT i.id, i.label, i.code_hint, i.study_id, s.slug, s.title, i.max_uses, i.use_count, i.expires_at,
            i.revoked_at, i.last_used_at, i.created_at, u.name AS created_by_name
       FROM invite_codes i
       LEFT JOIN studies s ON s.id = i.study_id
       LEFT JOIN users u ON u.id = i.created_by
      ORDER BY i.created_at DESC`,
  );
  return r.rows.map((x) => {
    const row = {
      id: x.id,
      label: x.label,
      hint: x.code_hint,
      studyId: x.study_id,
      studySlug: x.slug,
      studyTitle: x.title,
      maxUses: x.max_uses,
      useCount: x.use_count,
      expiresAt: x.expires_at ? x.expires_at.toISOString() : null,
      revokedAt: x.revoked_at ? x.revoked_at.toISOString() : null,
      lastUsedAt: x.last_used_at ? x.last_used_at.toISOString() : null,
      createdAt: x.created_at.toISOString(),
      createdByName: x.created_by_name,
    };
    const status = inviteStatus(row, now);
    return { ...row, status, endsWithinWeek: status === "active" && x.expires_at !== null && x.expires_at.getTime() - now.getTime() < WEEK_MS };
  });
}

export async function revokeInvite(pool: Pool, actor: Actor, raw: z.input<typeof revokeInviteInput>): Promise<void> {
  ensure(actor, "admin.users");
  const input = revokeInviteInput.parse(raw);
  await inActorTx(pool, actor, "invite code revoked", async (c) => {
    const r = await c.query<{ label: string; code_hint: string; use_count: number }>(
      "UPDATE invite_codes SET revoked_at = now(), revoked_by = $2 WHERE id = $1 AND revoked_at IS NULL RETURNING label, code_hint, use_count",
      [input.inviteId, actor.userId],
    );
    const row = r.rows[0];
    if (!row) {
      const exists = await c.query("SELECT 1 FROM invite_codes WHERE id = $1", [input.inviteId]);
      throw exists.rowCount ? new CmsError("already_revoked", "This code is already revoked.", 409) : new CmsError("not_found", "No such invite code.", 404);
    }
    await audit(c, actor, {
      action: "admin.invite_revoked",
      entity: "invite_codes",
      entityId: input.inviteId,
      after: { label: row.label, hint: row.code_hint, useCount: row.use_count },
      reason: "invite code revoked by an administrator",
    });
  });
}

export type RedeemResult = { ok: true; inviteId: string } | { ok: false; reason: "malformed" | "refused" };

export async function redeemInvite(q: Q, rawCode: unknown): Promise<RedeemResult> {
  const normalised = normaliseInviteCode(rawCode);
  if (!normalised) return { ok: false, reason: "malformed" };
  const r = await q.query<{ id: string }>(
    `UPDATE invite_codes
        SET use_count = use_count + 1, last_used_at = now()
      WHERE code_hash = $1
        AND revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at > now())
        AND (max_uses IS NULL OR use_count < max_uses)
      RETURNING id`,
    [hashInviteCode(normalised)],
  );
  const id = r.rows[0]?.id;
  return id ? { ok: true, inviteId: id } : { ok: false, reason: "refused" };
}

export async function inviteNotRevoked(q: Q, inviteId: string): Promise<boolean> {
  if (!UUID_RE.test(inviteId)) return false;
  const r = await q.query("SELECT 1 FROM invite_codes WHERE id = $1 AND revoked_at IS NULL", [inviteId]);
  return (r.rowCount ?? 0) > 0;
}

export interface StudyChoice {
  id: string;
  slug: string;
  title: string;
  isDemo: boolean;
}

export async function listStudyChoices(q: Q, actor: Actor): Promise<StudyChoice[]> {
  ensure(actor, "admin.users");
  const r = await q.query<{ id: string; slug: string; title: string; is_demo: boolean }>(
    "SELECT id, slug, title, is_demo FROM studies WHERE status <> 'closed' ORDER BY created_at DESC",
  );
  return r.rows.map((s) => ({ id: s.id, slug: s.slug, title: s.title, isDemo: s.is_demo }));
}
