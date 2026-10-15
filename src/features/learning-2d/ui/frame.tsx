/**
 * The 2D condition frame (server component, rendered inside the layout's <Suspense> and
 * LearningGate): resolves the learning context once, mounts the client session (telemetry,
 * visit memory, learning phase, guidance), the "under review" notice, the shared StudyBar with
 * the 2D navigation group, the shared learning-task prompts and the stall cue, and hides the pages
 * once the learning phase has ended.
 *
 * Chrome above content (DESIGN.md 6, 11.5): the AccessNotice slot (rendered by the gate), then the
 * StudyBar (56 px plus its 1 px line, sticky under the notice). Below it, the spread (DR-021,
 * spread.tsx): the shared PlaceRail, the index field and the sheet column. Nothing stacks above
 * the content: the learning-task prompts sit at the top of the field from 1024 px (where the museum
 * keeps them at the top left of the scene) and after a concept's sheet at narrower widths
 * (`LearningPromptsSlot`). The sheet column is the skip-link target.
 */
import type { ReactNode } from "react";

import { LearningPhaseContent } from "@/components/learning/learning-phase";
import { LearningTaskPrompts } from "@/components/learning/learning-task-prompts";
import { LearningUnavailable } from "@/components/learning/learning-unavailable";
import { UnverifiedContentNotice } from "@/components/learning/unverified-content-notice";

import { learning2dContext, loadStudyBarIndex } from "../server/data";

import { Learning2dSession, LearningPromptsSlot } from "./session";
import { Learning2dStudyBar } from "./site-header";
import { Learning2dSpread, Rail2dProvider } from "./spread";

export async function Learning2dFrame({ children }: { children: ReactNode }) {
  const result = await learning2dContext();
  if (!result.ok) return <ContentUnavailable reason={result.reason} />;
  const ctx = result.ctx;
  const index = await loadStudyBarIndex(ctx);
  const prompts = ctx.settings.learningPrompts.length > 0 ? <LearningTaskPrompts prompts={ctx.settings.learningPrompts} /> : null;
  return (
    <Learning2dSession
      telemetry={{ sessionId: ctx.telemetrySessionId, contentVersion: ctx.contentVersion, appBuild: ctx.appBuild, mode: ctx.mode }}
      budget={ctx.learningTime}
      mode={ctx.mode}
      guidance={ctx.settings.guidance}
    >
      {/* The "under review" strip, in the notice slot above the StudyBar (DESIGN.md 9.15). */}
      {ctx.unverifiedContent ? <UnverifiedContentNotice /> : null}
      <Rail2dProvider>
        <Learning2dStudyBar index={index} searchEnabled={ctx.features.search} />
        <LearningPhaseContent>
          <Learning2dSpread index={index} prompts={prompts}>
            {/* Protocol prompts (ctx.settings.learningPrompts) below 1024 px: never above a concept's sheet (LearningPromptsSlot). */}
            {prompts ? <LearningPromptsSlot position="before">{prompts}</LearningPromptsSlot> : null}
            {children}
            {prompts ? <LearningPromptsSlot position="after">{prompts}</LearningPromptsSlot> : null}
          </Learning2dSpread>
        </LearningPhaseContent>
      </Rail2dProvider>
    </Learning2dSession>
  );
}

/**
 * No content to show: the shared LearningUnavailable message (DESIGN.md 9.7, P23), the same
 * component and props as the museum's unavailable screen. No outbound navigation (study surfaces
 * have none).
 */
export function ContentUnavailable({ reason }: { reason: "no_review_snapshot" | "session_not_found" | "study_has_no_snapshot" }) {
  return (
    <div className="px-4 py-16 xs:px-6">
      <LearningUnavailable reason={reason} />
    </div>
  );
}
