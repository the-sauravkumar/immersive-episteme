"use server";

/**
 * Research-console Server Actions. Each one re-checks the caller's permission on the server
 * (`assertPermission`), validates its input with Zod in the service, and reports the outcome as
 * an ActionState; database refusals (frozen protocol, activation preconditions) are shown
 * verbatim.
 */
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { plural } from "@/lib/text/plural";
import { assertPermission, PermissionError } from "@/server/auth/staff";
import { getPool } from "@/server/db/client";
import { dbMessage } from "@/server/research/db";
import { recomputeStudyMetrics } from "@/server/research/metrics/pipeline";
import { METRICS_PIPELINE_VERSION } from "@/server/research/metrics/session";
import { runAndStoreParityReport } from "@/server/research/parity/store";
import { addAnnotation, addDeviation, excludeSession } from "@/server/research/sessions";
import { activateStudy, closeStudy, createStudy, draftStudyConfigSchema, getStudy, newStudyVersion, setBattery, updateStudy } from "@/server/research/studies";

import type { ActionState } from "./_components/action-state";

const ok = (message: string): ActionState => ({ status: "ok", message });

function fail(err: unknown): ActionState {
  if (err instanceof PermissionError) return { status: "error", message: "You do not have permission for this action." };
  if (err instanceof z.ZodError) return { status: "error", message: "Some fields are invalid.", details: err.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`) };
  const e = err as { details?: string[] };
  return { status: "error", message: dbMessage(err), details: Array.isArray(e?.details) && e.details.length ? e.details : undefined };
}

const text = (d: FormData, k: string) => {
  const v = d.get(k);
  return typeof v === "string" ? v.trim() : "";
};
const lines = (d: FormData, k: string) =>
  text(d, k)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
const optInt = (d: FormData, k: string) => (text(d, k) ? Number(text(d, k)) : undefined);

export async function createStudyAction(_: ActionState, d: FormData): Promise<ActionState> {
  let id: string;
  try {
    const p = await assertPermission("study.configure");
    id = await createStudy(getPool(), { userId: p.userId }, {
      slug: text(d, "slug"),
      title: text(d, "title"),
      description: text(d, "description") || undefined,
      protocolVersion: text(d, "protocolVersion"),
      design: text(d, "design") as "between" | "within",
    });
  } catch (err) {
    return fail(err);
  }
  redirect(`/research/studies/${id}`);
}

export async function updateStudyAction(studyId: string, _: ActionState, d: FormData): Promise<ActionState> {
  try {
    const p = await assertPermission("study.configure");
    const current = await getStudy(getPool(), studyId);
    if (!current) return { status: "error", message: "Study not found." };
    const contentSetsRaw = text(d, "contentSets");
    const config = draftStudyConfigSchema.parse({
      ...current.config,
      traditionSlugs: d.getAll("traditions").map(String),
      contentSets: contentSetsRaw ? JSON.parse(contentSetsRaw) : undefined,
      allocation: {
        // Keep the engine's allocation fields the form does not edit (seed, point, stratifyBy).
        ...current.config.allocation,
        algorithm: text(d, "allocationAlgorithm") || "block",
        blockSize: optInt(d, "blockSize"),
        strata: text(d, "strata")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      },
      exposure: { mode: text(d, "exposureMode") || "self_paced", minutes: optInt(d, "exposureMinutes"), allowEarlyFinish: d.get("allowEarlyFinish") === "on" },
      guidance: { policy: text(d, "guidancePolicy") || "none", cueEnabled: d.get("cueEnabled") === "on" },
      searchEnabled: d.get("searchEnabled") === "on",
      minimap: text(d, "minimap") || "toggle",
      webglFailurePolicy: text(d, "webglFailurePolicy") || "retry",
      retentionDays: optInt(d, "retentionDays"),
      consentVersion: text(d, "consentVersion") || undefined,
      notes: text(d, "notes") || undefined,
      eligibility: { inclusion: lines(d, "inclusion"), exclusion: lines(d, "exclusion") },
    });
    await updateStudy(getPool(), { userId: p.userId }, studyId, {
      title: text(d, "title"),
      description: text(d, "description") || null,
      protocolVersion: text(d, "protocolVersion"),
      design: text(d, "design") as "between" | "within",
      snapshotId: text(d, "snapshotId") || null,
      manifestId: text(d, "manifestId") || null,
      config,
    });
    refresh();
    return ok("Configuration saved. Run the parity check again before activating.");
  } catch (err) {
    if (err instanceof SyntaxError) return { status: "error", message: "Content sets must be valid JSON." };
    return fail(err);
  }
}

export async function setBatteryAction(studyId: string, _: ActionState, d: FormData): Promise<ActionState> {
  try {
    const p = await assertPermission("study.configure");
    const items = d
      .getAll("item")
      .map(String)
      .filter(Boolean)
      .map((id) => ({
        assessmentId: id,
        phase: text(d, `phase:${id}`) as "pre" | "learning" | "post" | "follow_up",
        position: Number(text(d, `position:${id}`) || 0),
        required: d.get(`required:${id}`) === "on",
      }));
    await setBattery(getPool(), { userId: p.userId }, studyId, items);
    refresh();
    return ok(`Battery saved (${items.length} assessment${items.length === 1 ? "" : "s"}).`);
  } catch (err) {
    return fail(err);
  }
}

export async function runParityAction(studyId: string, _: ActionState): Promise<ActionState> {
  try {
    const p = await assertPermission("parity.run");
    const r = await runAndStoreParityReport(getPool(), studyId, { userId: p.userId });
    refresh();
    return r.report.passed
      ? ok(`Parity passed (${r.report.warnings} warning${r.report.warnings === 1 ? "" : "s"}).`)
      : { status: "error", message: `Parity failed: ${plural(r.report.criticalFailures, "critical check")}.` };
  } catch (err) {
    return fail(err);
  }
}

export async function activateStudyAction(studyId: string, _: ActionState): Promise<ActionState> {
  try {
    const p = await assertPermission("study.activate");
    const r = await activateStudy(getPool(), { userId: p.userId }, studyId);
    refresh();
    return r.activated ? ok("Study activated. Its protocol is now frozen.") : { status: "error", message: "Activation refused: the parity report has critical failures.", details: r.failures };
  } catch (err) {
    return fail(err);
  }
}

export async function closeStudyAction(studyId: string, _: ActionState, d: FormData): Promise<ActionState> {
  try {
    const p = await assertPermission("study.activate");
    await closeStudy(getPool(), { userId: p.userId }, studyId, text(d, "reason"));
    refresh();
    return ok("Study closed.");
  } catch (err) {
    return fail(err);
  }
}

export async function newVersionAction(studyId: string, _: ActionState, d: FormData): Promise<ActionState> {
  let id: string;
  try {
    const p = await assertPermission("study.configure");
    id = await newStudyVersion(getPool(), { userId: p.userId }, studyId, { slug: text(d, "slug"), protocolVersion: text(d, "protocolVersion") });
  } catch (err) {
    return fail(err);
  }
  redirect(`/research/studies/${id}`);
}

export async function annotateAction(sessionId: string, _: ActionState, d: FormData): Promise<ActionState> {
  try {
    const p = await assertPermission("sessions.annotate");
    await addAnnotation(getPool(), { userId: p.userId }, { sessionId, kind: text(d, "kind") as "note", body: text(d, "body") });
    refresh();
    return ok("Annotation added.");
  } catch (err) {
    return fail(err);
  }
}

export async function deviationAction(studyId: string, sessionId: string, _: ActionState, d: FormData): Promise<ActionState> {
  try {
    const p = await assertPermission("sessions.annotate");
    await addDeviation(getPool(), { userId: p.userId }, {
      studyId,
      sessionId,
      category: text(d, "category") as "other",
      severity: text(d, "severity") as "minor",
      description: text(d, "description"),
      resolution: text(d, "resolution") || null,
    });
    refresh();
    return ok("Deviation recorded.");
  } catch (err) {
    return fail(err);
  }
}

export async function excludeAction(sessionId: string, _: ActionState, d: FormData): Promise<ActionState> {
  try {
    const p = await assertPermission("sessions.exclude");
    await excludeSession(getPool(), { userId: p.userId }, { sessionId, category: text(d, "category") as "other", detail: text(d, "detail") });
    refresh();
    return ok("Session flagged as excluded.");
  } catch (err) {
    return fail(err);
  }
}

export async function recomputeMetricsAction(studyId: string, _: ActionState): Promise<ActionState> {
  try {
    await assertPermission("study.configure");
    const r = await recomputeStudyMetrics(getPool(), studyId);
    refresh();
    return ok(`Recomputed ${plural(r.sessions, "session")}: ${plural(r.rowsWritten, "metric row")} written, ${r.unchanged} unchanged (pipeline ${METRICS_PIPELINE_VERSION}).`);
  } catch (err) {
    return fail(err);
  }
}
