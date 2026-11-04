import type { ComponentType, ReactNode } from "react";

import { LearningUnavailable } from "@/components/learning/learning-unavailable";
import { LearningSessionFrame } from "@/components/study/learning-session-frame";
import type { StageTemplate } from "@/features/process/domain/stage-template";
import { inAssignedOrder } from "@/features/study/stage-coverage";
import { TelemetryProvider } from "@/features/telemetry/client";
import type { LearningCondition } from "@/lib/permissions/learning";
import { getPool } from "@/server/db/client";
import { getLearningContext, LearningContextUnavailableError, type LearningContext } from "@/server/learning/context";
import { CAP_WARNING_MINUTES } from "@/server/study/config";
import { loadSessionState } from "@/server/study/engine";
import { loadStageTemplates } from "@/server/study/stage-templates";

import { CourseDoor } from "./course-door";
import { WalkthroughDoor } from "./walkthrough-door";

export interface DoorSessionProps {
  readonly templates: readonly StageTemplate[];
}

export const DOOR_SESSIONS: Record<LearningCondition, ComponentType<DoorSessionProps>> = { "2d": CourseDoor, immersive: WalkthroughDoor };

async function doorSessionFor(condition: LearningCondition, ctx: LearningContext): Promise<ReactNode> {
  const Door = DOOR_SESSIONS[condition];
  const all = await loadStageTemplates();
  const state = ctx.sessionId ? await loadSessionState(getPool(), ctx.sessionId) : null;
  const templates = state ? inAssignedOrder(all, state.traditionOrder) : all;
  const telemetry = { sessionId: ctx.telemetrySessionId, contentVersion: ctx.contentVersion, appBuild: ctx.appBuild, mode: ctx.mode };
  return (
    <TelemetryProvider config={telemetry}>
      <LearningSessionFrame endsAt={state?.learning.endsAt?.toISOString() ?? null} serverNow={(state?.now ?? new Date()).toISOString()} warningMinutes={CAP_WARNING_MINUTES}>
        <Door templates={templates} />
      </LearningSessionFrame>
    </TelemetryProvider>
  );
}

export async function DoorContent({ condition }: { readonly condition: LearningCondition }) {
  let ctx: LearningContext;
  try {
    ctx = await getLearningContext(condition);
  } catch (err) {
    if (err instanceof LearningContextUnavailableError) return <LearningUnavailable reason={err.reason} />;
    throw err;
  }
  return doorSessionFor(condition, ctx);
}
