import "server-only";

import { redirect } from "next/navigation";

import type { LearningCondition } from "@/lib/permissions/learning";
import { requireLearningAccess } from "@/server/auth/learning-access";
import { getPool } from "@/server/db/client";
import { StudyEngineError, startFamiliarisation } from "@/server/study/engine";

export type PracticeStart = { readonly ok: true; readonly studyMode: boolean } | { readonly ok: false; readonly message: string };

export async function startPractice(condition: LearningCondition): Promise<PracticeStart> {
  const access = await requireLearningAccess(condition);
  if (access.kind !== "participant") return { ok: true, studyMode: false };
  try {
    await startFamiliarisation(getPool(), access.sessionId);
  } catch (err) {
    if (err instanceof StudyEngineError && (err.code === "not_current_step" || err.code === "session_closed")) redirect("/study/session");
    if (err instanceof StudyEngineError) return { ok: false, message: "The practice for this study is not set up. Please ask the researcher for help." };
    throw err;
  }
  return { ok: true, studyMode: true };
}
