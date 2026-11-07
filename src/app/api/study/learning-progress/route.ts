import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { learningProgressRequestSchema, type FinishOutcome, type StageEntryOutcome } from "@/features/study/learning-progress";
import { serverEnv } from "@/lib/env";
import { DEMO_COOKIE, PARTICIPANT_COOKIE } from "@/server/auth/cookie-names";
import { getStaffPrincipal } from "@/server/auth/staff";
import { getPool } from "@/server/db/client";
import { StudyEngineError, finishLearning, recordStageEntered, recordStageLeft } from "@/server/study/engine";
import { resolveTelemetryPrincipal } from "@/server/telemetry/principal";

const NO_STORE = { "Cache-Control": "no-store" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

function safeHost(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function stageRefusal(err: unknown): StageEntryOutcome | null {
  if (!(err instanceof StudyEngineError)) return null;
  if (err.code === "stage_refused") {
    return { ok: false, reason: err.details.reason === "unknown_stop" ? "unknown_stop" : "stop_ahead", expected: (err.details.expected as { traditionKey: string; stageKey: string } | null) ?? null };
  }
  return { ok: false, reason: "not_learning", expected: null };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (origin && host && safeHost(origin) !== host) return json({ error: "cross_origin" }, 403);

  const jar = await cookies();
  const who = await resolveTelemetryPrincipal(
    {
      participantCookie: jar.get(PARTICIPANT_COOKIE)?.value,
      demoCookie: jar.get(DEMO_COOKIE)?.value,
      staff: async () => {
        const principal = await getStaffPrincipal();
        return principal ? { userId: principal.userId, roles: principal.roles } : null;
      },
    },
    { secret: serverEnv().BETTER_AUTH_SECRET },
  );
  if (!who.ok) return json({ error: "unauthenticated" }, 401);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const parsed = learningProgressRequestSchema.safeParse(raw);
  if (!parsed.success) return json({ error: "invalid_request" }, 400);
  const body = parsed.data;

  if (who.principal.kind !== "participant") {
    if (body.kind === "stage_entered") return json({ ok: true, persisted: false, visitCount: 1, backStep: false, complete: false, unvisited: 0 } satisfies StageEntryOutcome);
    if (body.kind === "finish") return json({ ok: true, next: "/explore" } satisfies FinishOutcome);
    return json({ ok: true });
  }

  const pool = getPool();
  const { sessionId } = who.principal;
  if (body.kind === "stage_entered") {
    try {
      const entry = await recordStageEntered(pool, sessionId, { traditionKey: body.stage.traditionKey, stageKey: body.stage.stageKey });
      return json({ ok: true, persisted: true, visitCount: entry.visitCount, backStep: entry.backStep, complete: entry.coverage.complete, unvisited: entry.coverage.unvisited.length } satisfies StageEntryOutcome);
    } catch (err) {
      const refusal = stageRefusal(err);
      if (refusal) return json(refusal, 409);
      throw err;
    }
  }
  if (body.kind === "stage_left") {
    await recordStageLeft(pool, sessionId, { traditionKey: body.stage.traditionKey, stageKey: body.stage.stageKey, activeMs: body.activeMs });
    return json({ ok: true });
  }
  try {
    await finishLearning(pool, sessionId);
    return json({ ok: true, next: "/study/session" } satisfies FinishOutcome);
  } catch (err) {
    if (err instanceof StudyEngineError && err.code === "learning_incomplete") {
      return json({ ok: false, reason: "stages_unvisited", unvisited: err.details.unvisited as { traditionKey: string; stageKey: string; stageNumber: number }[] } satisfies FinishOutcome, 409);
    }
    if (err instanceof StudyEngineError && err.code === "learning_time_remaining") {
      return json({ ok: false, reason: "time_remaining", endsAt: String(err.details.endsAt) } satisfies FinishOutcome, 409);
    }
    if (err instanceof StudyEngineError) return json({ ok: false, reason: "not_learning" } satisfies FinishOutcome, 409);
    throw err;
  }
}
