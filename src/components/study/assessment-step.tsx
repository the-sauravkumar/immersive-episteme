/**
 * Server side of an assessment step page (pre-test, post-test, transfer, questionnaire):
 * guards the step, picks the next assessment of the step not yet submitted, and renders it.
 * Must render inside <Suspense> (reads the participant cookie).
 */
import { redirect } from "next/navigation";

import { countOf } from "@/components/brand/numbering";

import { TelemetryProvider } from "@/features/telemetry/client";
import { serverEnv } from "@/lib/env";
import { getPool } from "@/server/db/client";
import { optionOrder, itemConfig } from "@/server/study/answers";
import type { StudyStep } from "@/server/study/config";
import { listStepAssessments, stepReadiness, StudyEngineError, submittedAssessments } from "@/server/study/engine";
import { requireStep } from "@/server/study/session";

import { AssessmentForm, type RenderItem } from "./assessment-form";
import { StudyStateMessage } from "./state-message";
import { StepFooter } from "./step-footer";
import { StepProgress, stepCountOf } from "./step-progress";

export async function AssessmentStep({ step, route }: { step: StudyStep; route: string }) {
  const { state, position } = await requireStep(step);
  const count = stepCountOf(state.study.protocol.steps, position);
  let all;
  try {
    all = await listStepAssessments(getPool(), state, step);
  } catch (err) {
    if (err instanceof StudyEngineError) return <NotReady reasons={[err.message]} />;
    throw err;
  }
  // The whole step starts only when every instrument of it is showable (verified wording).
  const ready = stepReadiness(all);
  if (!ready.ready) {
    console.error(`[study] step ${step} is not deliverable: ${ready.reasons.join("; ")}`);
    return <NotReady reasons={ready.reasons} />;
  }
  const done = submittedAssessments(state, step);
  const next = all.find((a) => !done.has(a.id));
  // Nothing left: the engine has completed the step; the hub moves on.
  if (!next) redirect("/study/session");
  const items: RenderItem[] = next.items.map((item) => {
    const cfg = itemConfig(item)!;
    switch (cfg.kind) {
      case "single_choice":
      case "multiple_choice": {
        const byId = new Map(cfg.options.map((o) => [o.id, o]));
        const options = optionOrder(state.sessionId, item).map((id) => byId.get(id)!);
        return cfg.kind === "single_choice"
          ? { id: item.id, kind: "single_choice", prompt: item.prompt, options }
          : { id: item.id, kind: "multiple_choice", prompt: item.prompt, options, maxSelections: cfg.maxSelections };
      }
      case "short_text":
      case "long_text":
        return { id: item.id, kind: cfg.kind, prompt: item.prompt, maxLength: cfg.maxLength };
      case "likert":
        return { id: item.id, kind: "likert", prompt: item.prompt, points: cfg.points, min: cfg.min, anchors: cfg.anchors };
      case "numeric":
        return { id: item.id, kind: "numeric", prompt: item.prompt, min: cfg.min, max: cfg.max, step: cfg.step };
      default:
        throw new Error(`item kind ${cfg.kind} is not deliverable`);
    }
  });
  const presentation = next.config.presentation === "semantic_differential" ? "semantic_differential" : "standard";
  const body = (
    <>
      <StepProgress count={count} />
      {all.length > 1 ? <p className="text-ui mb-2 tabular-nums text-ink-3">{countOf("Part", all.indexOf(next) + 1, all.length)}</p> : null}
      <AssessmentForm
        key={next.id}
        step={step}
        returnTo={route}
        assessment={{ id: next.id, code: next.code, version: next.version, title: next.title, description: next.description, presentation }}
        items={items}
      />
      <StepFooter />
    </>
  );
  // Telemetry only once allocated: an unallocated session has no condition to store events under.
  if (state.condition === null) return body;
  return (
    <TelemetryProvider config={{ sessionId: state.sessionId, contentVersion: state.snapshotLabel ?? "none", appBuild: serverEnv().APP_BUILD_VERSION, mode: "study" }}>
      {body}
    </TelemetryProvider>
  );
}

/** Participant-facing refusal with the reason for the research team (e.g. instrument wording pending). */
function NotReady({ reasons }: { reasons: string[] }) {
  return (
    <>
      <StudyStateMessage id="not-ready-title" tone="error" live="alert" title="This part is not ready yet" detail={`For the research team: ${reasons.join("; ")}.`}>
        Please tell the study facilitator.
      </StudyStateMessage>
      <StepFooter />
    </>
  );
}
