import { Check } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { GateFallback } from "@/components/shell/gate-fallback";
import { PageHeader } from "@/components/shell/page-header";
import { StudyActions } from "@/components/study/action-form";
import { FinishForm, FullPageRedirect } from "@/components/study/session-widgets";
import { StudyStateMessage } from "@/components/study/state-message";
import { StepFooter } from "@/components/study/step-footer";
import { StepProgress, stepCountOf } from "@/components/study/step-progress";
import { Button } from "@/components/ui/button";
import { TelemetryProvider } from "@/features/telemetry/client";
import { serverEnv } from "@/lib/env";
import { LEARNING_ROUTE } from "@/lib/permissions/learning";
import { titleCase } from "@/lib/text/title-case";
import { STEP_LABEL, type StudyStep } from "@/server/study/config";
import { completedSteps, type Position } from "@/server/study/engine";
import { getCurrentSession, routeFor } from "@/server/study/session";

export const metadata: Metadata = { title: titleCase("Your session") };

/**
 * The steps of the session as a numbered list: one 44 px row per step with its number in tabular
 * figures, the label, and the status in words ("Done" with a check, "Current", "To do"), so state
 * is never carried by colour or weight alone (R-A4). The current row carries a 2 px ink bar, not
 * `--wash`, which study reserves for a chosen questionnaire option (DESIGN.md 12.2 rule 5).
 */
function Progress({ steps, done, position }: { steps: readonly StudyStep[]; done: ReadonlySet<StudyStep>; position: Position }) {
  return (
    <ol className="flex flex-col divide-y divide-rule border-y border-rule" aria-label="Steps of this session">
      {steps.map((s, i) => {
        const current = position.kind === "step" && position.step === s;
        const status = done.has(s) ? "Done" : current ? "Current" : "To do";
        return (
          <li
            key={s}
            aria-current={current ? "step" : undefined}
            className="grid min-h-11 grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-x-3 py-2 pr-3 aria-[current=step]:bg-wash"
          >
            <span className="text-ui text-right tabular-nums text-ink-3">{i + 1}</span>
            <span className={current ? "text-ui font-bold text-ink" : "text-body text-ink"}>{STEP_LABEL[s]}</span>
            <span className="text-ui inline-flex items-center gap-1.5 text-ink-3">
              {done.has(s) ? <Check aria-hidden="true" className="size-4 stroke-[1.75] text-ink" /> : null}
              {status}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Session hub: routes the participant to the current step. It renders only for the learning step
 * (the learning time is not over and the study does not allow finishing early), for an allocation
 * refused by the protocol, and at the end (final confirmation); every other position redirects.
 *
 * Arriving here ends the learning phase whenever the study allows it: both conditions hand the
 * participant back to /study/session through the shared <LearningPhaseProvider>
 * (src/components/learning), so the end is recorded by the server the same way in both.
 */
async function Hub({ searchParams }: { searchParams: PageProps<"/study/session">["searchParams"] }) {
  const { state, position } = await getCurrentSession(true);
  const { allocation } = await searchParams;
  const learningOpen = position.kind === "step" && position.step === "learning" && state.condition !== null;
  const refused = position.kind === "allocation" && allocation === "refused";
  if (position.kind === "allocation" && !refused) return <FullPageRedirect href="/study/allocate" label="Preparing the next part of the study…" />;
  if (position.kind !== "finish" && !learningOpen && !refused) redirect(routeFor(position, state.condition));

  if (refused) {
    const last = [...state.journal].reverse().find((e) => e.action === "study.allocation_refused");
    return (
      <>
        <StudyStateMessage
          id="refused-heading"
          tone="error"
          live="alert"
          title="This study cannot continue right now"
          detail={`For the research team (protocol error, allocation refused): ${typeof last?.after.reason === "string" ? last.after.reason : "see the session journal"}.`}
        >
          Please tell the facilitator. Your answers so far are saved.
        </StudyStateMessage>
        <StepFooter />
      </>
    );
  }

  const telemetry = { sessionId: state.sessionId, contentVersion: state.snapshotLabel ?? "none", appBuild: serverEnv().APP_BUILD_VERSION, mode: "study" as const };
  const remainingMinutes =
    state.learning.endsAt && state.learning.endsAt > state.now ? Math.ceil((state.learning.endsAt.getTime() - state.now.getTime()) / 60_000) : null;

  return (
    <TelemetryProvider config={telemetry}>
      <StepProgress count={stepCountOf(state.study.protocol.steps, position)} />
      <div className="flex flex-col gap-12">
        {learningOpen && state.condition ? (
          <section aria-labelledby="learning-heading" className="flex flex-col gap-4">
            <h2 id="learning-heading" className="text-h2 text-ink">
              {titleCase("Learning task")}
            </h2>
            <p className="text-reading max-w-[34rem] text-ink">
              {state.learning.startedAt ? "Your learning task is still open." : "Your learning task is ready."}
              {remainingMinutes !== null ? ` About ${remainingMinutes} ${remainingMinutes === 1 ? "minute" : "minutes"} of learning time are left.` : ""}
            </p>
            <StudyActions>
              <Button asChild>
                <Link href={LEARNING_ROUTE[state.condition]}>{state.learning.startedAt ? "Return to the learning task" : "Open the learning task"}</Link>
              </Button>
            </StudyActions>
          </section>
        ) : (
          <section aria-labelledby="finish-heading" className="flex flex-col gap-4">
            <h2 id="finish-heading" className="text-h2 text-ink">
              {titleCase("All steps are done")}
            </h2>
            <p className="text-reading max-w-[34rem] text-ink">Submit to finish your session. After this you cannot change your answers.</p>
            <FinishForm />
          </section>
        )}
        <section aria-labelledby="progress-heading" className="flex flex-col gap-3">
          <h2 id="progress-heading" className="text-h3 text-ink">
            {titleCase("Your progress")}
          </h2>
          <Progress steps={state.study.protocol.steps} done={completedSteps(state)} position={position} />
        </section>
      </div>
      {/* The step list ends on its own closing rule, so the footer draws none. */}
      <StepFooter ruled={false} />
    </TelemetryProvider>
  );
}

/** May block: access is verified against the participant session on the server for every navigation (Next 16 `instant`, "Disabling instant"). */
export const instant = false;

export default function SessionPage({ searchParams }: PageProps<"/study/session">) {
  return (
    <>
      <PageHeader title="Your session" description="Where you are in the study and what to do next." />
      <Suspense fallback={<GateFallback label="Loading your session…" />}>
        <Hub searchParams={searchParams} />
      </Suspense>
    </>
  );
}
