"use server";

/**
 * Admin server actions. Each one: assertPermission (runAction) -> Zod -> service (which
 * re-checks the permission and writes the audit row in the same transaction) -> refresh().
 */
import type { ActionState } from "@/components/cms/action-state";
import { getAuth } from "@/server/auth";
import { CmsError } from "@/server/cms/core";
import { formObject, runAction } from "@/server/cms/run-action";
import { getDb } from "@/server/db/client";

import {
  createStaffInput,
  createStaffUser,
  grantStaffRole,
  lockInput,
  lockStaffUser,
  revokeStaffRole,
  roleInput,
  unlockStaffUser,
  userIdInput,
} from "./users";

/**
 * Typed confirmation (DESIGN.md 11.11): destructive admin actions carry a `confirm` field that must
 * equal the target account's email address (trimmed, case-insensitive). The form keeps its button
 * inactive until it matches; this is the server-side check, so a forged or stale submission is
 * refused with a field error and nothing is written.
 */
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

/** A confirmation refusal is reported on the `confirm` field as well as in the form's alert. */
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

export async function grantRoleAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction("admin.roles", roleInput, formObject(fd), async ({ actor, pool }, input) => {
    await grantStaffRole(pool, actor, input);
    return `Role ${input.role} granted.`;
  });
}

export async function revokeRoleAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const raw = formObject(fd);
  return withConfirmField(
    await runAction("admin.roles", roleInput, raw, async ({ actor, pool }, input) => {
      await assertConfirmed(pool, input.userId, raw.confirm);
      await revokeStaffRole(pool, actor, input);
      return `Role ${input.role} removed.`;
    }),
  );
}
