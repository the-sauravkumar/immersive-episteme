import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { ReconstructionTask } from "@/components/assessment/reconstruction-task";
import { GateFallback } from "@/components/shell/gate-fallback";
import { ParticipantPage } from "@/components/shell/gates";
import { PageHeader } from "@/components/shell/page-header";
import { StudyStateMessage } from "@/components/study/state-message";
import { StepFooter } from "@/components/study/step-footer";
import { StepProgress, stepCountOf } from "@/components/study/step-progress";
import { buttonVariants } from "@/components/ui/button";
import { titleCase } from "@/lib/text/title-case";
import { AssessmentError } from "@/server/assessment/common";
import { loadReconstructionTask } from "@/server/assessment/participant-maps";
import { requireParticipantSession } from "@/server/auth/learning-access";
import { getPool } from "@/server/db/client";
import { requireReconstructionStep } from "@/server/study/session";

export const metadata: Metadata = { title: titleCase("Connect the concepts") };

const PHASE_LABEL = { pre: "Before the learning task", post: "After the learning task" } as const;

/** May block: access is verified against the participant session on the server for every navigation (Next 16 `instant`, "Disabling instant"). */
export const instant = false;

export default function Page() {
  return (
    <ParticipantPage>
      <Suspense fallback={<GateFallback label="Loading the task…" />}>
        <Reconstruction />
      </Suspense>
    </ParticipantPage>
  );
}

/**
 * Every state where the editor is not shown: the study state message with one way back (DESIGN.md
 * 9.7), followed by the withdrawal footer that every in-session step carries.
 */
function BackToSession({ title, tone = "info", children }: { title: string; tone?: "info" | "error" | "done"; children: React.ReactNode }) {
  return (
    <>
      <StudyStateMessage
        id="map-state-title"
        title={title}
        tone={tone}
        action={
          <Link href="/study/session" className={buttonVariants()}>
            Back to your session
          </Link>
        }
      >
        {children}
      </StudyStateMessage>
      <StepFooter />
    </>
  );
}

/**
 * The study engine decides when this page may render (its `pre_reconstruction` / `reconstruction`
 * step must be current; otherwise it redirects to the session hub) and which phase it is. The
 * editor gets the concept set, the allowed relationship types and the stored map. It is never
 * given the learning condition: the task is identical in both conditions. Like every other
 * in-session step, each state ends with the withdrawal footer (StepFooter).
 */
async function Reconstruction() {
  const step = await requireReconstructionStep();
  const who = await requireParticipantSession();
  let task;
  try {
    task = await loadReconstructionTask(getPool(), { participantId: who.participantId, sessionId: who.sessionId });
    // The service derives the phase from the learning clock; it must agree with the engine's step.
    if (task.phase !== step.phase) throw new AssessmentError("conflict", "Phase mismatch between the study step and the learning clock");
  } catch (err) {
    if (!(err instanceof AssessmentError)) throw err;
    console.error("[assessment] reconstruction task unavailable", err.message);
    return (
      <>
        <PageHeader title="Connect the concepts" />
        <BackToSession title="This task cannot be shown" tone="error">
          This task cannot be shown right now. Please tell the study facilitator.
        </BackToSession>
      </>
    );
  }
  if (task.kind === "none") {
    return (
      <>
        <PageHeader title="Connect the concepts" />
        <BackToSession title="No task here">There is no concept-map task at this point of the study.</BackToSession>
      </>
    );
  }
  return (
    <>
      <PageHeader
        title="Connect the concepts"
        description={
          <div className="flex flex-col gap-3">
            {/* Which of the two maps this is, as a plain sentence (DR-022: no eyebrows). */}
            <p>{PHASE_LABEL[task.phase]}.</p>
            <p className="text-reading whitespace-pre-line text-ink">{task.prompt}</p>
            <p>
              Move the concepts anywhere you like. Add a relationship with the form below the map, or by dragging from the dot under one
              concept to another. You can change, reverse or delete any relationship until you submit.
            </p>
          </div>
        }
      />
      <StepProgress count={stepCountOf(step.state.study.protocol.steps, step.position)} />
      {task.map?.isFinal ? (
        <BackToSession title="Map submitted" tone="done">
          You have already submitted this map. Thank you.
        </BackToSession>
      ) : (
        <>
          <ReconstructionTask
            itemId={task.itemId}
            concepts={task.set.concepts}
            relationshipTypes={task.set.relationshipTypes}
            directedLinks={task.set.directedLinks}
            initial={task.map?.payload ?? null}
          />
          <StepFooter />
        </>
      )}
    </>
  );
}
