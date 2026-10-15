/**
 * Wrapper used by every CMS / admin server action:
 *   1. assertPermission (server-side, from the session; never trusts the client),
 *   2. Zod validation of the raw input,
 *   3. the service call (which re-checks the permission, writes and audits in one transaction),
 *   4. refresh() so the page re-renders with the new state.
 * Errors become an ActionState for the form; unexpected errors are logged and reported generically.
 */
import "server-only";

import { refresh } from "next/cache";
import type { z } from "zod";

import type { ActionState } from "@/components/cms/action-state";
import type { Permission } from "@/lib/permissions/permissions";
import { assertPermission, PermissionError, type StaffPrincipal } from "@/server/auth/staff";
import { getPool } from "@/server/db/client";

import { CmsError } from "./core";

export type ActionOutcome = string | { message: string; data?: Record<string, unknown> };

export function fieldErrorsOf(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "_";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

export async function runAction<S extends z.ZodType>(
  permission: Permission | readonly Permission[],
  schema: S,
  raw: unknown,
  fn: (ctx: { actor: StaffPrincipal; pool: ReturnType<typeof getPool> }, input: z.infer<S>) => Promise<ActionOutcome>,
): Promise<ActionState> {
  let actor: StaffPrincipal;
  try {
    actor = await assertPermission(permission);
  } catch (err) {
    if (err instanceof PermissionError) return { ok: false, code: err.status === 401 ? "unauthenticated" : "forbidden", error: err.message };
    throw err;
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, code: "invalid_input", error: "Check the highlighted fields.", fieldErrors: fieldErrorsOf(parsed.error) };
  }
  try {
    const outcome = await fn({ actor, pool: getPool() }, parsed.data);
    refresh();
    return typeof outcome === "string" ? { ok: true, message: outcome } : { ok: true, message: outcome.message, data: outcome.data };
  } catch (err) {
    if (err instanceof CmsError) return { ok: false, code: err.code, error: err.message, data: err.details ? { details: err.details } : undefined };
    console.error("[cms] action failed", err);
    return { ok: false, code: "server_error", error: "The change could not be saved. Nothing was written; try again." };
  }
}

/** FormData -> plain object (repeated keys become arrays; `$ACTION_` keys dropped). */
export function formObject(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("$ACTION")) continue;
    const val = typeof v === "string" ? v : v;
    if (k in out) {
      const prev = out[k];
      out[k] = Array.isArray(prev) ? [...prev, val] : [prev, val];
    } else out[k] = val;
  }
  return out;
}
