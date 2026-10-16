"use server";

/**
 * Server actions of the invite gate (S11).
 *  - `redeemInviteAction`: the /invite form. A valid code sets the signed invite cookie and
 *    redirects to where the visitor was going; anything else is refused with one message.
 *  - `createInviteAction`, `revokeInviteAction`: Admin -> Access. runAction checks `admin.users`
 *    from the session; the service re-checks it and writes the audit row.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import type { ActionState } from "@/components/cms/action-state";
import { inviteNextPath } from "@/lib/access/invite-paths";
import { serverEnv } from "@/lib/env";
import { SECURE_COOKIES } from "@/server/auth/cookie-names";
import { CmsError } from "@/server/cms/core";
import { formObject, runAction } from "@/server/cms/run-action";
import { getPool } from "@/server/db/client";

import { INVITE_ACCESS_TTL_SECONDS, INVITE_COOKIE, signInviteAccess } from "./invite-cookie";
import { createInvite, createInviteInput, redeemInvite, revokeInvite, revokeInviteInput } from "./invites";

export type InviteFormState = { error?: string; fieldError?: string } | null;

export async function redeemInviteAction(_prev: InviteFormState, formData: FormData): Promise<InviteFormState> {
  const next = inviteNextPath(formData.get("next"));
  const result = await redeemInvite(getPool(), formData.get("code"));
  if (!result.ok) {
    return result.reason === "malformed"
      ? { fieldError: "Enter the code exactly as you received it: 20 letters and digits, with or without the dashes." }
      : { error: "This code cannot be used. It may have expired, been withdrawn or been used up. Ask the person who invited you for a new one." };
  }
  const token = await signInviteAccess(result.inviteId, serverEnv().BETTER_AUTH_SECRET);
  (await cookies()).set(INVITE_COOKIE, token, { httpOnly: true, secure: SECURE_COOKIES, sameSite: "lax", path: "/", maxAge: INVITE_ACCESS_TTL_SECONDS });
  redirect(next);
}

export async function createInviteAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction("admin.users", createInviteInput, formObject(fd), async ({ actor, pool }, input) => {
    const created = await createInvite(pool, actor, input);
    return {
      message: `Code created for "${input.label}". Copy it now: it is not shown again.`,
      data: { inviteId: created.id, code: created.code, hint: created.hint, studySlug: created.studySlug },
    };
  });
}

/** Typed confirmation: the code's four-character hint (DESIGN.md 11.11, as for staff accounts). */
export async function revokeInviteAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const raw = formObject(fd);
  const state = await runAction("admin.users", revokeInviteInput, raw, async ({ actor, pool }, input) => {
    const hint = await pool.query<{ code_hint: string }>("SELECT code_hint FROM invite_codes WHERE id = $1", [input.inviteId]);
    const expected = hint.rows[0]?.code_hint;
    if (!expected) throw new CmsError("not_found", "No such invite code.", 404);
    const typed = typeof raw.confirm === "string" ? raw.confirm.trim().toUpperCase() : "";
    if (typed !== expected) throw new CmsError("confirm_mismatch", "Type the last four characters of the code exactly to confirm.", 422);
    await revokeInvite(pool, actor, input);
    return "Code revoked. It no longer admits anyone, including browsers that already used it.";
  });
  return state && !state.ok && state.code === "confirm_mismatch" ? { ...state, fieldErrors: { confirm: [state.error ?? ""] } } : state;
}
