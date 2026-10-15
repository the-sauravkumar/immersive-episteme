/**
 * Server side of the familiarisation practice pages (/learn/2d/practice, /learn/immersive/practice;
 * study decision D5). Resolves the practice context (same guard and protocol settings as the
 * learning context, never the learning clock), and in study mode starts the familiarisation step
 * on the study engine (server time, set once; journal `study.familiarisation_started`). The
 * practice time is returned in the learning-budget shape so both conditions count it down with
 * the shared LearningPhaseProvider (`kind="practice"`). Practice time is never learning time.
 *
 * Call inside <Suspense> (reads cookies). A participant whose current step is not
 * familiarisation is sent back to /study/session.
 */
import "server-only";

import { redirect } from "next/navigation";

import type { LearningTimeBudget } from "@/features/learning/time-budget";
import type { LearningCondition } from "@/lib/permissions/learning";
import { getPool } from "@/server/db/client";
import { StudyEngineError, startFamiliarisation } from "@/server/study/engine";

import { getPracticeContext, LearningContextUnavailableError, type PracticeContext } from "./context";

export type PracticeStart = { ok: true; ctx: PracticeContext; budget: LearningTimeBudget } | { ok: false; message: string };

export async function startPractice(condition: LearningCondition): Promise<PracticeStart> {
  let ctx: PracticeContext;
  try {
    ctx = await getPracticeContext(condition);
  } catch (e) {
    if (e instanceof LearningContextUnavailableError) return { ok: false, message: "Your study session could not be found. Please ask the researcher for help." };
    throw e;
  }
  const pool = getPool();
  const serverNow = async () => (await pool.query<{ now: Date }>("SELECT now() AS now")).rows[0]!.now.toISOString();

  if (ctx.mode === "study") {
    let started: { startedAt: Date; minutes: number };
    try {
      started = await startFamiliarisation(pool, ctx.sessionId!);
    } catch (e) {
      if (e instanceof StudyEngineError && (e.code === "not_current_step" || e.code === "session_closed")) redirect("/study/session");
      if (e instanceof StudyEngineError) return { ok: false, message: "The practice for this study is not set up. Please ask the researcher for help." };
      throw e;
    }
    const startedAt = started.startedAt.toISOString();
    return {
      ok: true,
      ctx,
      budget: {
        mode: "fixed_time",
        budgetSeconds: started.minutes * 60,
        allowEarlyFinish: false,
        startedAt,
        endsAt: new Date(started.startedAt.getTime() + started.minutes * 60_000).toISOString(),
        endedAt: null,
        serverNow: await serverNow(),
        persisted: true,
      },
    };
  }

  // Demo and preview: the demo study's practice minutes counted from now, nothing stored;
  // without configured minutes the practice can be finished at any time.
  return {
    ok: true,
    ctx,
    budget: {
      mode: ctx.minutes ? "fixed_time" : "self_paced",
      budgetSeconds: ctx.minutes ? ctx.minutes * 60 : null,
      allowEarlyFinish: true,
      startedAt: null,
      endsAt: null,
      endedAt: null,
      serverNow: await serverNow(),
      persisted: false,
    },
  };
}
