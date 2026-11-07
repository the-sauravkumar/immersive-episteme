import "server-only";

import { redirect } from "next/navigation";

import type { TelemetryConfig } from "@/features/telemetry/client";
import { serverEnv } from "@/lib/env";
import type { LearningCondition } from "@/lib/permissions/learning";
import { requireLearningAccess } from "@/server/auth/learning-access";
import { getPool } from "@/server/db/client";
import { loadSessionState, StudyEngineError, startFamiliarisation } from "@/server/study/engine";
import { nextTelemetrySeq } from "@/server/study/session";

export type PracticeStart = { readonly ok: true; readonly studyMode: boolean; readonly telemetry: TelemetryConfig | null } | { readonly ok: false; readonly message: string };

export async function startPractice(condition: LearningCondition): Promise<PracticeStart> {
  const access = await requireLearningAccess(condition);
  if (access.kind !== "participant") return { ok: true, studyMode: false, telemetry: null };
  try {
    await startFamiliarisation(getPool(), access.sessionId);
  } catch (err) {
    if (err instanceof StudyEngineError && (err.code === "not_current_step" || err.code === "session_closed")) redirect("/study/session");
    if (err instanceof StudyEngineError) return { ok: false, message: "The practice for this study is not set up. Please ask the researcher for help." };
    throw err;
  }
  const state = await loadSessionState(getPool(), access.sessionId);
  return {
    ok: true,
    studyMode: true,
    telemetry: {
      sessionId: access.sessionId,
      firstSeq: await nextTelemetrySeq(access.sessionId),
      contentVersion: state?.snapshotLabel ?? "none",
      appBuild: serverEnv().APP_BUILD_VERSION,
      mode: "study",
    },
  };
}
