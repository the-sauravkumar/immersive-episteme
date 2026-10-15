"use client";

/**
 * Generic assessment renderer for pre/post tests, transfer tasks and questionnaires. Native
 * form controls inside fieldsets (keyboard and screen-reader support without custom widgets);
 * no timers, scores or feedback are shown to the participant.
 *
 * Presentation (DESIGN.md 11.7, 9.5): each question opens with "Question n of N" in tabular
 * figures, then the question in Inter 20/28 600. Choice options are full-row 56 px labels with a
 * 20 px native control, separated by 1 px `--rule`; the chosen option takes `--wash`, a 2 px
 * `--indigo` bar and a check icon (never colour alone). Likert scales are a 4- to 11-column row
 * with tabular numbers and the end labels in `text-eyebrow`, stacked vertically on narrow
 * screens. Free text is at least 132 px tall. Field errors carry an icon and words and are linked
 * through `aria-describedby`; an error summary at the top takes focus after a refused submit.
 * Nothing moves (study zero-motion rule).
 *
 * Telemetry (study vocabulary): ASSESSMENT_STARTED = `task_started`, ASSESSMENT_SUBMITTED =
 * `task_completed`, both with `taskCode = assessment.<code>.v<version>` and
 * `roomOrPageId = study:<step>`. The authoritative record of the submission is the server
 * (responses + journal); the event marks the submission attempt on the client timeline.
 */
import { Check, CircleAlert } from "lucide-react";
import { useActionState, useEffect, useRef, type CSSProperties, type ReactNode } from "react";

import { countOf } from "@/components/brand/numbering";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useOptionalTelemetry } from "@/features/telemetry/client";
import { titleCase } from "@/lib/text/title-case";
import { cn } from "@/lib/utils";
import { markAssessmentStarted, submitAssessmentForm, type FormState } from "@/server/study/actions";

import { keepEnteredValues, StudyActions } from "./action-form";

export type RenderItem =
  | { id: string; kind: "single_choice" | "multiple_choice"; prompt: string; options: { id: string; label: string }[]; maxSelections?: number }
  | { id: string; kind: "short_text" | "long_text"; prompt: string; maxLength: number }
  | { id: string; kind: "likert"; prompt: string; points: number; min: number; anchors: Record<string, string> }
  | { id: string; kind: "numeric"; prompt: string; min?: number; max?: number; step?: number };

export interface RenderAssessment {
  id: string;
  code: string;
  version: number;
  title: string;
  description: string | null;
  presentation: "standard" | "semantic_differential";
}

export function assessmentTaskCode(a: Pick<RenderAssessment, "code" | "version">): string {
  return `assessment.${a.code}.v${a.version}`;
}

/** The control a question's error links to (its first focusable input). */
function firstControlId(item: RenderItem): string {
  switch (item.kind) {
    case "single_choice":
    case "multiple_choice":
      return `${item.id}-${item.options[0]?.id ?? "none"}`;
    case "likert":
      return `${item.id}-${item.min}`;
    default:
      return item.id;
  }
}

export function AssessmentForm({ step, assessment, items, returnTo }: { step: string; assessment: RenderAssessment; items: RenderItem[]; returnTo: string }) {
  // No provider before allocation: an unallocated session cannot store telemetry (events carry a
  // condition), so the blind steps emit none; the server journal records them.
  const t = useOptionalTelemetry();
  const startedAt = useRef<number | null>(null);
  const taskCode = assessmentTaskCode(assessment);

  useEffect(() => {
    if (startedAt.current !== null) return;
    startedAt.current = performance.now();
    void markAssessmentStarted(step, assessment.id);
    void t?.taskStarted({ metadata: { taskCode }, roomOrPageId: `study:${step}`, target: assessment.id });
  }, [t, step, assessment.id, taskCode]);

  const [state, action, pending] = useActionState(async (prev: FormState, fd: FormData) => {
    fd.set("clientTs", new Date().toISOString());
    const durationMs = startedAt.current === null ? undefined : Math.max(0, Math.round(performance.now() - startedAt.current));
    await t?.taskCompleted({ metadata: { taskCode, durationMs }, roomOrPageId: `study:${step}`, target: assessment.id });
    void t?.flush();
    return submitAssessmentForm(prev, fd);
  }, {});
  const errors = state.fieldErrors ?? {};
  const flagged = items.map((item, i) => ({ item, number: i + 1 })).filter(({ item }) => errors[item.id]);

  // After a refused submit the summary takes focus, so keyboard and screen-reader users start
  // from the list of questions to fix (DESIGN.md 9.5).
  const summaryRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.error || (state.fieldErrors && Object.keys(state.fieldErrors).length > 0)) summaryRef.current?.focus();
  }, [state]);

  return (
    <form
      action={action}
      // The submit button stays focusable while pending (aria-disabled, not disabled; DESIGN.md
      // 9.1), so a second submit is ignored here: React skips a default-prevented form action.
      onSubmit={(e) => {
        if (pending) e.preventDefault();
      }}
      // React 19 resets a form after every completed form action, refusals included: without
      // this, a refused submit (a required question left out) wiped every answer given.
      onReset={keepEnteredValues}
      className="flex flex-col gap-10"
      noValidate
      aria-labelledby="assessment-title"
    >
      <input type="hidden" name="step" value={step} />
      <input type="hidden" name="assessmentId" value={assessment.id} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <div className="flex flex-col gap-2">
        <h2 id="assessment-title" className="text-h2 text-ink">
          {titleCase(assessment.title)}
        </h2>
        {assessment.description ? <p className="text-reading max-w-[34rem] whitespace-pre-line text-ink-2">{assessment.description}</p> : null}
      </div>
      {state.error || flagged.length > 0 ? (
        <Alert ref={summaryRef} tabIndex={-1} variant="destructive" data-slot="error-summary" className="outline-none focus-visible:outline-2">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            <p>{state.error ?? "Some answers need attention."}</p>
            {flagged.length > 0 ? (
              <ul className="flex flex-col">
                {flagged.map(({ item, number }) => (
                  <li key={item.id}>
                    <a href={`#${firstControlId(item)}`} className="inline-flex min-h-11 items-center">
                      {countOf("Question", number, items.length)}: {errors[item.id]}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
      <ol className="flex flex-col gap-12">
        {items.map((item, i) => (
          <li key={item.id}>
            <ItemField item={item} number={i + 1} total={items.length} error={errors[item.id]} />
          </li>
        ))}
      </ol>
      <StudyActions>
        <Button type="submit" aria-disabled={pending}>
          {pending ? "Saving…" : "Submit answers"}
        </Button>
      </StudyActions>
    </form>
  );
}

/** "Question n of N" over the question text, in the form the legend or label needs. */
function Prompt({ id, number, total, children }: { id: string; number: number; total: number; children: ReactNode }) {
  return (
    <span id={id} className="flex flex-col gap-1">
      <span className="text-ui tabular-nums text-ink-3">{countOf("Question", number, total)}</span>{" "}
      <span className="text-[1.25rem] leading-7 font-semibold whitespace-pre-line text-ink">{children}</span>
    </span>
  );
}

/** A full-row choice: 56 px, native 20 px control, `--wash` plus a 2 px indigo bar and a check icon when chosen. */
const OPTION_ROW =
  "group/opt flex min-h-14 cursor-pointer items-center gap-3 border-l-2 border-l-transparent py-3 pr-3 pl-3 has-[:checked]:border-l-indigo has-[:checked]:bg-wash";
const NATIVE_CONTROL = "size-5 shrink-0 cursor-pointer accent-indigo";

/** The check icon of a chosen option; its space is always reserved, so choosing shifts nothing. */
function OptionCheck({ className }: { className?: string }) {
  return (
    <Check
      aria-hidden="true"
      data-slot="option-check"
      className={cn("invisible size-5 shrink-0 stroke-[1.75] text-indigo group-has-[:checked]/opt:visible", className)}
    />
  );
}

/*
 * Likert layouts. Scales of up to 7 points become a row of columns from 520 px; longer scales
 * (the 0-10 load rating) from 640 px, so no column is narrower than 44 px. Below that the points
 * stack as 56 px rows. Class strings are literal so Tailwind can see them.
 *
 * Each point carries the same check icon as the choice rows (DESIGN.md 4.2, 11.7): at the row end
 * when stacked, and under the control in column mode (before any per-point label, so the icons
 * of all columns sit on one line). Only the bottom rule is set on a cell (`border-b-rule`), so the
 * transparent left bar of OPTION_ROW survives and only the chosen point shows the indigo bar.
 */
const LIKERT = {
  xs: {
    grid: "xs:grid-cols-[repeat(var(--points),minmax(0,1fr))]",
    cell: "max-xs:last:border-b-0 xs:flex-col xs:justify-center xs:gap-2 xs:border-l-0 xs:border-b-2 xs:border-b-transparent xs:px-1 xs:has-[:checked]:border-b-indigo",
    number: "xs:order-first",
    check: "max-xs:ml-auto xs:order-1",
    anchorWide: "xs:sr-only",
    anchorEach: "xs:order-2 xs:text-center xs:text-credit",
    ends: "hidden xs:flex",
  },
  sm: {
    grid: "sm:grid-cols-[repeat(var(--points),minmax(0,1fr))]",
    cell: "max-sm:last:border-b-0 sm:flex-col sm:justify-center sm:gap-2 sm:border-l-0 sm:border-b-2 sm:border-b-transparent sm:px-1 sm:has-[:checked]:border-b-indigo",
    number: "sm:order-first",
    check: "max-sm:ml-auto sm:order-1",
    anchorWide: "sm:sr-only",
    anchorEach: "sm:order-2 sm:text-center sm:text-credit",
    ends: "hidden sm:flex",
  },
} as const;

function ItemField({
  item,
  number,
  total,
  error,
}: {
  item: RenderItem;
  number: number;
  total: number;
  error?: string;
}) {
  const name = `item:${item.id}`;
  const promptId = `prompt-${item.id}`;
  const errorId = `error-${item.id}`;
  const describedBy = error ? errorId : undefined;
  const invalid = error ? true : undefined;
  const prompt = (
    <Prompt id={promptId} number={number} total={total}>
      {item.prompt}
    </Prompt>
  );
  const err = error ? <FieldError id={errorId}>{error}</FieldError> : null;

  switch (item.kind) {
    case "single_choice":
    case "multiple_choice":
      return (
        <fieldset className="flex min-w-0 flex-col gap-4" aria-describedby={describedBy}>
          <legend className="mb-4">{prompt}</legend>
          {item.kind === "multiple_choice" ? (
            <p className="text-source -mt-2">Choose all that apply{item.maxSelections ? ` (at most ${item.maxSelections})` : ""}.</p>
          ) : null}
          <div className="flex flex-col divide-y divide-rule border-y border-rule">
            {item.options.map((o) => {
              const id = `${item.id}-${o.id}`;
              return (
                <label key={o.id} htmlFor={id} className={OPTION_ROW}>
                  <input
                    id={id}
                    type={item.kind === "single_choice" ? "radio" : "checkbox"}
                    name={name}
                    value={o.id}
                    // A radio group's error is described on its fieldset (aria-invalid is not a radio property).
                    aria-invalid={item.kind === "multiple_choice" ? invalid : undefined}
                    className={NATIVE_CONTROL}
                  />
                  <span className="text-reading min-w-0 flex-1 text-ink">{o.label}</span>
                  <OptionCheck />
                </label>
              );
            })}
          </div>
          {err}
        </fieldset>
      );
    case "short_text":
    case "long_text":
      return (
        <div className="flex flex-col gap-4">
          <label htmlFor={item.id}>{prompt}</label>
          {item.kind === "short_text" ? (
            <Input id={item.id} name={name} maxLength={item.maxLength} autoComplete="off" aria-describedby={describedBy} aria-invalid={invalid} />
          ) : (
            <Textarea id={item.id} name={name} maxLength={item.maxLength} rows={6} className="min-h-[132px]" aria-describedby={describedBy} aria-invalid={invalid} />
          )}
          {err}
        </div>
      );
    case "numeric":
      return (
        <div className="flex flex-col gap-4">
          <label htmlFor={item.id}>{prompt}</label>
          <Input
            id={item.id}
            name={name}
            type="number"
            inputMode="decimal"
            min={item.min}
            max={item.max}
            step={item.step ?? "any"}
            className="max-w-48 tabular-nums"
            aria-describedby={describedBy}
            aria-invalid={invalid}
          />
          {err}
        </div>
      );
    case "likert": {
      const first = item.min;
      const last = item.min + item.points - 1;
      const points = Array.from({ length: item.points }, (_, k) => k + first);
      const left = item.anchors[String(first)];
      const right = item.anchors[String(last)];
      // Labels for points between the ends cannot be folded into an end row: then every column
      // shows its own label under its number.
      const middleAnchors = points.some((p) => p !== first && p !== last && item.anchors[String(p)]);
      // `semantic_differential` (bipolar adjective pairs) uses the same layout: its poles are the end labels.
      const L = item.points > 7 ? LIKERT.sm : LIKERT.xs;
      return (
        <fieldset className="flex min-w-0 flex-col gap-4" aria-describedby={describedBy}>
          <legend className="mb-4">{prompt}</legend>
          <div>
            <div
              data-slot="likert-scale"
              style={{ "--points": item.points } as CSSProperties}
              className={cn("grid border-y border-rule", L.grid)}
            >
              {points.map((p) => {
                const id = `${item.id}-${p}`;
                const anchor = item.anchors[String(p)];
                return (
                  <label key={p} htmlFor={id} className={cn(OPTION_ROW, "border-b border-b-rule", L.cell)}>
                    <input id={id} type="radio" name={name} value={String(p)} className={NATIVE_CONTROL} />
                    <span className={cn("text-ui tabular-nums text-ink", L.number)}>{p}</span>
                    {/* A space keeps the accessible name "1 Not at all", not "1Not at all" (flex ignores it visually). */}
                    {anchor ? " " : null}
                    {anchor ? (
                      <span className={cn("text-reading min-w-0 text-ink", middleAnchors ? L.anchorEach : L.anchorWide)}>{anchor}</span>
                    ) : null}
                    <OptionCheck className={L.check} />
                  </label>
                );
              })}
            </div>
            {!middleAnchors && (left || right) ? (
              <div aria-hidden="true" className={cn("justify-between gap-4 pt-2", L.ends)}>
                <span className="text-eyebrow max-w-[45%]">{left}</span>
                <span className="text-eyebrow max-w-[45%] text-right">{right}</span>
              </div>
            ) : null}
          </div>
          {err}
        </fieldset>
      );
    }
  }
}
