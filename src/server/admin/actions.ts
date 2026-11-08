"use server";

import type { ActionState } from "@/components/cms/action-state";
import { ROLE_LABELS } from "@/lib/permissions/roles";
import { getAuth } from "@/server/auth";
import { CmsError } from "@/server/cms/core";
import { formObject, runAction } from "@/server/cms/run-action";
import { getDb } from "@/server/db/client";

import {
  clearStaffSignInLock,
  createStaffInput,
  createStaffUser,
  grantStaffRole,
  lockInput,
  lockStaffUser,
  resetPasswordInput,
  resetStaffPassword,
  revokeStaffRole,
  roleInput,
  unlockStaffUser,
  userIdInput,
} from "./users";

const CONFIRM_MISMATCH = "confirm_mismatch";

interface EmailQuery {
  query(sql: string, params: unknown[]): Promise<{ rows: { email: string }[] }>;
}

async function assertConfirmed(pool: EmailQuery, userId: string, confirm: unknown): Promise<void> {
  const r = await pool.query("SELECT email FROM users WHERE id = $1", [userId]);
  const email = r.rows[0]?.email;
  if (!email) throw new CmsError("not_found", "No such staff account.", 404);
  const typed = typeof confirm === "string" ? confirm.trim().toLowerCase() : "";
  if (typed !== email.trim().toLowerCase()) throw new CmsError(CONFIRM_MISMATCH, "Type the account's email address exactly to confirm.", 422);
}

function withConfirmField(state: ActionState): ActionState {
  return state && !state.ok && state.code === CONFIRM_MISMATCH ? { ...state, fieldErrors: { confirm: [state.error ?? ""] } } : state;
}

export async function createStaffAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(["admin.users"], createStaffInput, formObject(fd), async ({ actor, pool }, input) => {
    const res = await createStaffUser({ pool, auth: getAuth(), db: getDb() }, actor, input);
    return { message: `Account created for ${input.email}.`, data: { userId: res.userId } };
  });
}

export async function lockStaffAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const raw = formObject(fd);
  return withConfirmField(
    await runAction("admin.users", lockInput, raw, async ({ actor, pool }, input) => {
      await assertConfirmed(pool, input.userId, raw.confirm);
      const res = await lockStaffUser(pool, actor, input);
      return `Account locked; ${res.sessionsEnded} active session(s) ended.`;
    }),
  );
}

export async function unlockStaffAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction("admin.users", userIdInput, formObject(fd), async ({ actor, pool }, input) => {
    await unlockStaffUser(pool, actor, input);
    return "Account unlocked.";
  });
}

export async function clearSignInLockAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction("admin.users", lockInput, formObject(fd), async ({ actor, pool }, input) => {
    await clearStaffSignInLock(pool, actor, input);
    return "Sign-in lock lifted. The account can sign in again now.";
  });
}

export async function resetPasswordAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const raw = formObject(fd);
  return withConfirmField(
    await runAction("admin.users", resetPasswordInput, raw, async ({ actor, pool }, input) => {
      await assertConfirmed(pool, input.userId, raw.confirm);
      const res = await resetStaffPassword({ pool, auth: getAuth() }, actor, input);
      return `Password reset; ${res.sessionsEnded} active session(s) ended. Share the new password out of band; the person can change it from their account menu.`;
    }),
  );
}

export async function grantRoleAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction("admin.roles", roleInput, formObject(fd), async ({ actor, pool }, input) => {
    await grantStaffRole(pool, actor, input);
    return `${ROLE_LABELS[input.role]} role granted.`;
  });
}

export async function revokeRoleAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const raw = formObject(fd);
  return withConfirmField(
    await runAction("admin.roles", roleInput, raw, async ({ actor, pool }, input) => {
      await assertConfirmed(pool, input.userId, raw.confirm);
      await revokeStaffRole(pool, actor, input);
      return `${ROLE_LABELS[input.role]} role removed.`;
    }),
  );
}
