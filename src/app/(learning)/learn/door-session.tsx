import type { ComponentType, ReactNode } from "react";

import { LearningSessionFrame } from "@/components/study/learning-session-frame";
import type { StageTemplate } from "@/features/process/domain/stage-template";
import { inAssignedOrder } from "@/features/study/stage-coverage";
import { TelemetryProvider } from "@/features/telemetry/client";
import type { LearningCondition } from "@/lib/permissions/learning";
import { getPool } from "@/server/db/client";
import type { LearningContext } from "@/server/learning/context-data";
import { CAP_WARNING_MINUTES } from "@/server/study/config";
import { loadSessionState } from "@/server/study/engine";
import { loadStageTemplates } from "@/server/study/stage-templates";

export interface DoorSessionProps {
  readonly templates: readonly StageTemplate[];
}

export const DOOR_SESSIONS: Partial<Record<LearningCondition, ComponentType<DoorSessionProps>>> = {};

export async function doorSessionFor(condition: LearningCondition, ctx: LearningContext): Promise<ReactNode | null> {
  const Door = DOOR_SESSIONS[condition];
  if (!Door) return null;
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
