"use server";

import { redirect } from "next/navigation";

import type { ActionState } from "@/components/cms/action-state";
import { inviteNextPath } from "@/lib/access/invite-paths";
import { CmsError } from "@/server/cms/core";
import { formObject, runAction } from "@/server/cms/run-action";
import { getPool } from "@/server/db/client";

import { createInvite, createInviteInput, redeemInvite, revealInvite, revealInviteInput, revokeInvite, revokeInviteInput } from "./invites";
import { grantSiteAccess } from "./site-access";

export type InviteFormState = { error?: string; fieldError?: string } | null;

export async function redeemInviteAction(_prev: InviteFormState, formData: FormData): Promise<InviteFormState> {
  const next = inviteNextPath(formData.get("next"));
  const result = await redeemInvite(getPool(), formData.get("code"));
  if (!result.ok) {
    return result.reason === "malformed"
      ? { fieldError: "Enter the code exactly as you received it: 20 letters and digits, with or without the dashes." }
      : { error: "This code cannot be used. It may have expired, been withdrawn or been used up. Ask the person who invited you for a new one." };
  }
  await grantSiteAccess(result.inviteId);
  redirect(next);
}

export async function createInviteAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction("admin.users", createInviteInput, formObject(fd), async ({ actor, pool }, input) => {
    const created = await createInvite(pool, actor, input);
    return {
      message: `Code created for "${input.label}". Share it privately; you can show it again from the list while it lets people in.`,
      data: { inviteId: created.id, code: created.code, hint: created.hint, studySlug: created.studySlug },
    };
  });
}

export async function revealInviteAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction("admin.users", revealInviteInput, formObject(fd), async ({ actor, pool }, input) => {
    const shown = await revealInvite(pool, actor, input);
    return { message: "Code shown. This look is recorded in the audit log.", data: { code: shown.code, studySlug: shown.studySlug } };
  });
}

export async function revokeInviteAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const raw = formObject(fd);
  const state = await runAction("admin.users", revokeInviteInput, raw, async ({ actor, pool }, input) => {
    const hint = await pool.query<{ code_hint: string }>("SELECT code_hint FROM invite_codes WHERE id = $1", [input.inviteId]);
    const expected = hint.rows[0]?.code_hint;
    if (!expected) throw new CmsError("not_found", "No such invite code.", 404);
    const typed = typeof raw.confirm === "string" ? raw.confirm.trim().toUpperCase() : "";
    if (typed !== expected) throw new CmsError("confirm_mismatch", "Type the last four characters of the code exactly to confirm.", 422);
    await revokeInvite(pool, actor, input);
    return "Code revoked. It no longer admits anyone: browsers that already used it, including participants part-way through a study, are refused on their next page or study request.";
  });
  return state && !state.ok && state.code === "confirm_mismatch" ? { ...state, fieldErrors: { confirm: [state.error ?? ""] } } : state;
}
