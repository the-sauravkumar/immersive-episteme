"use server";

/**
 * Spatial studio server actions. Each: permission from the session -> Zod -> service (which
 * re-checks, writes and audits in one transaction) -> refresh. See ../run-action.ts.
 */
import { z } from "zod";

import type { ActionState } from "@/components/cms/action-state";

import { formObject, runAction } from "../run-action";
import { compileManifest, compileWithOverrides, createOverride, publishManifest, revokeOverride } from "./service";

const toArray = (v: unknown) => (v === undefined || v === null || v === "" ? [] : Array.isArray(v) ? v : [v]);

const compileSchema = z.object({
  snapshotId: z.uuid("Choose a snapshot"),
  traditions: z.preprocess(toArray, z.array(z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)).min(1, "Choose at least one tradition")),
  seed: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : "default"), z.string().regex(/^[A-Za-z0-9._-]{1,64}$/, "Letters, digits, . _ - only")),
});

export async function compileManifestAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction("spatial.compile", compileSchema, formObject(fd), async ({ actor, pool }, input) => {
    const m = await compileManifest(pool, actor, input);
    return {
      message: m.created ? `Compiled manifest (${m.status}, ${m.elements} elements).` : `These inputs were already compiled; opened the existing manifest (${m.status}).`,
      data: { manifestId: m.id },
    };
  });
}

const jsonValue = z.string().transform((s, ctx) => {
  try {
    return JSON.parse(s) as unknown;
  } catch {
    ctx.addIssue({ code: "custom", message: 'Enter a JSON value, e.g. 1.5, "text" or {"x":1}' });
    return z.NEVER;
  }
});

const overrideSchema = z.object({
  manifestId: z.uuid(),
  targetElementId: z.string().regex(/^[a-z0-9][a-z0-9_.:-]{0,127}$/, "Unknown element id"),
  field: z.string().regex(/^(\/[^/]+)+$/, "Use a JSON pointer such as /position/x"),
  value: jsonValue,
  reason: z.string().trim().min(3, "Give a reason (at least 3 characters)").max(2000),
});

export async function createOverrideAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction("spatial.override", overrideSchema, formObject(fd), async ({ actor, pool }, input) => {
    const r = await createOverride(pool, actor, input);
    return `Override recorded on rule-set version ${r.version} (draft). Compile with overrides to apply it.`;
  });
}

const revokeSchema = z.object({
  overrideId: z.uuid(),
  reason: z.string().trim().min(3, "Give a reason (at least 3 characters)").max(2000),
});

export async function revokeOverrideAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction("spatial.override", revokeSchema, formObject(fd), async ({ actor, pool }, input) => {
    await revokeOverride(pool, actor, input);
    return "Override revoked.";
  });
}

const manifestSchema = z.object({ manifestId: z.uuid() });

export async function compileWithOverridesAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(["spatial.compile"], manifestSchema, formObject(fd), async ({ actor, pool }, input) => {
    const r = await compileWithOverrides(pool, actor, input);
    return {
      message: `${r.created ? "Compiled" : "Already compiled"} with rule-set version ${r.ruleSetVersion}: ${r.applied} override(s) applied, ${r.skipped} skipped; validation ${r.passed ? "passed" : "failed"}.`,
      data: { manifestId: r.manifestId },
    };
  });
}

const publishSchema = z.object({
  manifestId: z.uuid(),
  supersede: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
  reason: z.string().trim().max(2000).optional(),
});

export async function publishManifestAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction("spatial.publish", publishSchema, formObject(fd), async ({ actor, pool }, input) => {
    const r = await publishManifest(pool, actor, input);
    return `Manifest published for study use${r.superseded.length ? `; ${r.superseded.length} earlier manifest(s) superseded` : ""}.`;
  });
}
