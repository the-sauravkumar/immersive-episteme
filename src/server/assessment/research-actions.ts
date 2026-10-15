"use server";
/**
 * Research-console server actions for assessments, reference maps and scoring. Each one checks
 * the permission server-side (`assertPermission`, the matrix in src/lib/permissions) before
 * touching data, and returns a result object instead of throwing service errors.
 */
import { refresh } from "next/cache";

import type { SaveResult } from "@/components/assessment/concept-map-editor";
import type { Permission } from "@/lib/permissions/permissions";
import { assertPermission, PermissionError, type StaffPrincipal } from "@/server/auth/staff";
import { getPool } from "@/server/db/client";

import { AssessmentError } from "./common";
import {
  createAssessment,
  createNewVersion,
  createRubric,
  deleteItem,
  lockRubric,
  publishAssessment,
  saveItem,
  updateAssessmentMeta,
} from "./definitions";
import { itemFromForm, rubricLevelsFromText } from "./forms";
import { createReferenceMap, finaliseReferenceMap, lockReferenceMap, recordAdjudication, submitRaterMap } from "./reference-maps";
import { rateResponse, scoreConceptMaps, scoreKeyedItems } from "./scoring";

export type ActionResult = { ok: true; message?: string; id?: string } | { ok: false; error: string };

async function guarded(permission: Permission, fn: (who: StaffPrincipal) => Promise<ActionResult>): Promise<ActionResult> {
  try {
    const who = await assertPermission(permission);
    const result = await fn(who);
    refresh();
    return result;
  } catch (err) {
    if (err instanceof PermissionError) return { ok: false, error: err.status === 401 ? "Please sign in again." : "You do not have permission to do this." };
    if (err instanceof AssessmentError) return { ok: false, error: err.message };
    if (err && typeof err === "object" && "issues" in err) return { ok: false, error: "Some fields are invalid." };
    console.error("[assessment] research action failed", err);
    return { ok: false, error: "Something went wrong. Nothing was changed." };
  }
}

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};

export async function createAssessmentAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return guarded("assessments.author", async (who) => {
    const id = await createAssessment(getPool(), who.userId, {
      code: str(fd, "code").trim(),
      kind: str(fd, "kind") as never,
      title: str(fd, "title"),
      description: str(fd, "description") || undefined,
      isDemo: fd.get("isDemo") === "on",
    });
    return { ok: true, id, message: "Assessment created." };
  });
}

export async function updateAssessmentMetaAction(assessmentId: string, _prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return guarded("assessments.author", async () => {
    const scoringText = str(fd, "scoring").trim();
    let scoring: unknown;
    if (fd.has("scoring")) {
      try {
        scoring = scoringText ? JSON.parse(scoringText) : {};
      } catch {
        return { ok: false, error: "The scoring configuration is not valid JSON." };
      }
    }
    await updateAssessmentMeta(getPool(), assessmentId, {
      title: str(fd, "title"),
      description: str(fd, "description") || null,
      instrumentName: str(fd, "instrumentName") || null,
      instrumentCitation: str(fd, "instrumentCitation") || null,
      isValidatedInstrument: fd.get("isValidatedInstrument") === "on",
      ...(scoring !== undefined ? { scoring } : {}),
    });
    return { ok: true, message: "Saved." };
  });
}

export async function saveItemAction(assessmentId: string, _prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return guarded("assessments.author", async () => {
    const parsed = itemFromForm(fd);
    if (!parsed.ok) return parsed;
    const id = await saveItem(getPool(), assessmentId, parsed.item);
    return { ok: true, id, message: "Item saved." };
  });
}

export async function deleteItemAction(assessmentId: string, itemId: string): Promise<ActionResult> {
  return guarded("assessments.author", async () => {
    await deleteItem(getPool(), assessmentId, itemId);
    return { ok: true, message: "Item deleted." };
  });
}

export async function publishAssessmentAction(assessmentId: string): Promise<ActionResult> {
  return guarded("assessments.author", async (who) => {
    await publishAssessment(getPool(), who.userId, assessmentId);
    return { ok: true, message: "Published. This version can no longer change." };
  });
}

export async function newVersionAction(assessmentId: string): Promise<ActionResult> {
  return guarded("assessments.author", async (who) => {
    const id = await createNewVersion(getPool(), who.userId, assessmentId);
    return { ok: true, id, message: "New draft version created." };
  });
}

export async function createRubricAction(assessmentId: string, itemId: string, _prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return guarded("assessments.author", async (who) => {
    const levels = rubricLevelsFromText(str(fd, "levels"));
    if (!levels.ok) return levels;
    const id = await createRubric(getPool(), who.userId, assessmentId, itemId, levels.levels);
    return { ok: true, id, message: "Rubric draft created." };
  });
}

export async function lockRubricAction(rubricId: string): Promise<ActionResult> {
  return guarded("assessments.author", async (who) => {
    await lockRubric(getPool(), who.userId, rubricId);
    return { ok: true, message: "Rubric published." };
  });
}

export async function createReferenceMapAction(assessmentId: string, _prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return guarded("assessments.author", async (who) => {
    const id = await createReferenceMap(getPool(), who.userId, assessmentId, { title: str(fd, "title"), description: str(fd, "description") || undefined });
    return { ok: true, id, message: "Reference map version created." };
  });
}

/** Rater editor save (autosave and submit both store the rater's current map). */
export async function submitRaterMapAction(referenceMapId: string, payload: unknown): Promise<SaveResult> {
  const r = await guarded("assessments.author", async (who) => {
    await submitRaterMap(getPool(), who.userId, referenceMapId, payload);
    return { ok: true };
  });
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

export async function adjudicateAction(referenceMapId: string, _prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return guarded("assessments.author", async (who) => {
    await recordAdjudication(getPool(), who.userId, referenceMapId, {
      key: str(fd, "key"),
      decision: str(fd, "decision") as never,
      note: str(fd, "note") || undefined,
    });
    return { ok: true, message: "Decision recorded." };
  });
}

export async function finaliseReferenceAction(referenceMapId: string, _prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return guarded("assessments.author", async (who) => {
    await finaliseReferenceMap(getPool(), who.userId, referenceMapId, str(fd, "notes") || null);
    return { ok: true, message: "Reference map finalised." };
  });
}

export async function lockReferenceAction(referenceMapId: string): Promise<ActionResult> {
  return guarded("assessments.author", async (who) => {
    await lockReferenceMap(getPool(), who.userId, referenceMapId);
    return { ok: true, message: "Reference map locked." };
  });
}

export async function scoreMapsAction(referenceMapId: string): Promise<ActionResult> {
  return guarded("assessments.score", async (who) => {
    const r = await scoreConceptMaps(getPool(), who.userId, referenceMapId);
    return { ok: true, message: `Scored ${r.maps} map(s) and ${r.changePairs} pre/post pair(s): ${r.inserted} new score rows, ${r.alreadyStored} already stored.` };
  });
}

export async function scoreKeyedAction(assessmentId: string): Promise<ActionResult> {
  return guarded("assessments.score", async (who) => {
    const r = await scoreKeyedItems(getPool(), who.userId, assessmentId);
    return { ok: true, message: `Checked ${r.responses} keyed answer(s): ${r.inserted} new score rows.` };
  });
}

export async function rateResponseAction(rubricId: string, responseId: string, _prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return guarded("assessments.score", async (who) => {
    const value = Number(str(fd, "value"));
    if (!Number.isFinite(value) || str(fd, "value") === "") return { ok: false, error: "Choose a level." };
    await rateResponse(getPool(), who.userId, rubricId, responseId, value, str(fd, "note"));
    return { ok: true, message: "Rating saved." };
  });
}
