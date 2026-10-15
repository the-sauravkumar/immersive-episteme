import type { Metadata } from "next";
import { Loader } from "lucide-react";
import { Suspense } from "react";

import { StateMessage } from "@/components/knowledge/state-message";
import { LearningUnavailable } from "@/components/learning/learning-unavailable";
import { ImmersiveSession } from "@/components/museum/immersive-session";
import { LearningPage } from "@/components/shell/gates";
import { buildMuseumPayload, MuseumUnavailableError } from "@/features/immersive/server/payload";
import { SCREEN_TEXT } from "@/features/learning/strings";
import { getLearningContext, LearningContextUnavailableError } from "@/server/learning/context";

export const metadata: Metadata = { title: "Learning" };

/** May block: the learning gate verifies the participant session per navigation (see the layout). */
export const instant = false;

/**
 * Immersive condition (condition B). The page gate runs the condition guard (a participant
 * assigned to "2d" is redirected and never receives this content); inside <Suspense> the learning
 * context gives the snapshot and the pinned manifest, from which the server builds the museum's
 * data. The 3D runtime itself is a client component loaded on demand.
 */
export default function LearnImmersivePage() {
  return (
    <LearningPage condition="immersive">
      <Suspense fallback={<MuseumShell loading />}>
        <Museum />
      </Suspense>
    </LearningPage>
  );
}

async function Museum() {
  let ctx;
  try {
    ctx = await getLearningContext("immersive");
  } catch (e) {
    if (e instanceof LearningContextUnavailableError) return <MuseumShell reason={e.reason} />;
    throw e;
  }
  let payload;
  try {
    payload = await buildMuseumPayload(ctx);
  } catch (e) {
    if (e instanceof MuseumUnavailableError) return <MuseumShell reason={e.reason} />;
    throw e;
  }
  return (
    <ImmersiveSession
      telemetry={{ sessionId: ctx.telemetrySessionId, contentVersion: ctx.contentVersion, appBuild: ctx.appBuild, mode: ctx.mode }}
      budget={ctx.learningTime}
      mode={ctx.mode}
      payload={payload}
      unverifiedContent={ctx.unverifiedContent}
      settings={ctx.settings}
      onboardingKey={ctx.sessionId ?? ctx.telemetrySessionId}
    />
  );
}

/**
 * The museum's unavailable and preparing states through the shared StateMessage (DESIGN.md 9.7):
 * unavailable is the shared LearningUnavailable message, the same component and props as the 2D
 * content-unavailable page, so the error state is identical in both conditions (P23). No outbound
 * navigation (study surfaces have none).
 */
function MuseumShell({ reason, loading = false }: { reason?: string; loading?: boolean }) {
  return (
    <div className="h-full w-full overflow-y-auto bg-ground px-4 py-16 text-ink xs:px-6">
      {loading ? <StateMessage id="museum-shell-title" title={SCREEN_TEXT.loadingTitle} icon={Loader} live="status" /> : <LearningUnavailable reason={reason ?? "no_content"} />}
    </div>
  );
}
