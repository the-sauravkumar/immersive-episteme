"use client";

import { Check, CircleAlert } from "lucide-react";
import { useActionState, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { countOf } from "@/components/brand/numbering";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { REQUIRED_ANSWERS_SUMMARY, unansweredItems } from "@/features/study/answer-presence";
import { useOptionalTelemetry } from "@/features/telemetry/client";
import { titleCase } from "@/lib/text/title-case";
import { cn } from "@/lib/utils";
import { markAssessmentStarted, submitAssessmentForm, type FormState } from "@/server/study/actions";

import { keepEnteredValues, StudyActions } from "./action-form";
import { ItemAccount, ItemFigure, MatchingField, SequenceField, SketchField, type ItemFigureImage } from "./test-item-fields";

interface ItemContext {
  image?: ItemFigureImage;
  account?: string;
  sampleText?: boolean;
}

export type RenderItem =
  | ({ id: string; kind: "single_choice" | "multiple_choice"; prompt: string; options: { id: string; label: string }[]; maxSelections?: number } & ItemContext)
  | ({ id: string; kind: "ranking"; prompt: string; options: { id: string; label: string }[] } & ItemContext)
  | ({ id: string; kind: "matching"; prompt: string; pairs: { id: string; image: ItemFigureImage }[]; options: { id: string; label: string }[] } & ItemContext)
  | { id: string; kind: "sketch"; prompt: string; maxBytes: number }
  | { id: string; kind: "short_text" | "long_text"; prompt: string; maxLength: number }
  | { id: string; kind: "likert"; prompt: string; points: number; min: number; anchors: Record<string, string> }
  | { id: string; kind: "numeric"; prompt: string; min?: number; max?: number; step?: number };

export interface RenderAssessment {
  id: string;
  code: string;
  version: number;
  title: string;
  description: string | null;
  paged?: boolean;
  required: boolean;
}

function assessmentTaskCode(a: Pick<RenderAssessment, "code" | "version">): string {
  return `assessment.${a.code}.v${a.version}`;
}

function firstControlId(item: RenderItem): string {
  switch (item.kind) {
    case "single_choice":
    case "multiple_choice":
      return `${item.id}-${item.options[0]?.id ?? "none"}`;
    case "likert":
      return `${item.id}-${item.min}`;
    case "ranking":
    case "matching":
    case "sketch":
      return `prompt-${item.id}`;
    default:
      return item.id;
  }
}

export function AssessmentForm({ step, assessment, items, returnTo }: { step: string; assessment: RenderAssessment; items: RenderItem[]; returnTo: string }) {
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
    if (assessment.required) {
      const missing = unansweredItems(items, (id) => fd.getAll(`item:${id}`).map(String));
      if (Object.keys(missing).length > 0) return { error: REQUIRED_ANSWERS_SUMMARY, fieldErrors: missing };
    }
    fd.set("clientTs", new Date().toISOString());
    const durationMs = startedAt.current === null ? undefined : Math.max(0, Math.round(performance.now() - startedAt.current));
    await t?.taskCompleted({ metadata: { taskCode, durationMs }, roomOrPageId: `study:${step}`, target: assessment.id });
    void t?.flush();
    return submitAssessmentForm(prev, fd);
  }, {});
  const errors = state.fieldErrors ?? {};
  const flagged = items.map((item, i) => ({ item, number: i + 1 })).filter(({ item }) => errors[item.id]);
  const [screen, setScreen] = useState(0);
  const paged = assessment.paged === true && items.length > 1;
  const onLastScreen = !paged || screen >= items.length - 1;

  const summaryRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.error || (state.fieldErrors && Object.keys(state.fieldErrors).length > 0)) summaryRef.current?.focus();
  }, [state]);

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (pending) e.preventDefault();
      }}
      onReset={keepEnteredValues}
      className="flex flex-col gap-10"
      noValidate
      aria-labelledby="assessment-title"
    >
      <input type="hidden" name="step" value={step} />
      <input type="hidden" name="assessmentId" value={assessment.id} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <div className="flex flex-col gap-2">
        <h2 id="assessment-title" className="t-h4 text-lime">
          {titleCase(assessment.title)}
        </h2>
        {assessment.description ? <p className="t-b max-w-[34rem] whitespace-pre-line text-lime-dim">{assessment.description}</p> : null}
        {assessment.required ? <p className="t-s text-lime-dim">{REQUIRED_ANSWERS_SUMMARY}</p> : null}
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
          <li key={item.id} hidden={paged && i !== screen && flagged.length === 0}>
            <ItemField item={item} number={i + 1} total={items.length} error={errors[item.id]} />
          </li>
        ))}
      </ol>
      <StudyActions>
        {onLastScreen || flagged.length > 0 ? (
          <Button key="submit" type="submit" aria-disabled={pending}>
            {pending ? "Saving…" : "Submit answers"}
          </Button>
        ) : (
          <Button key="next" type="button" onClick={() => setScreen((n) => n + 1)}>
            Next
          </Button>
        )}
      </StudyActions>
    </form>
  );
}

function Prompt({ id, number, total, children }: { id: string; number: number; total: number; children: ReactNode }) {
  return (
    <span id={id} className="flex flex-col gap-1">
      <span className="t-label tabular-nums text-lime-dim">{countOf("Question", number, total)}</span>{" "}
      <span className="text-[1.25rem] leading-7 font-semibold whitespace-pre-line text-lime">{children}</span>
    </span>
  );
}

const OPTION_ROW = "group/opt flex min-h-14 cursor-pointer items-center gap-3 px-3 py-3 hover:bg-raised-hover has-[:checked]:bg-vat-2 has-[:checked]:outline-2 has-[:checked]:-outline-offset-2 has-[:checked]:outline-turmeric";
const NATIVE_CONTROL = "ie-check";

function OptionCheck({ className }: { className?: string }) {
  return (
    <Check
      aria-hidden="true"
      data-slot="option-check"
      className={cn("invisible size-5 shrink-0 stroke-[1.75] text-turmeric group-has-[:checked]/opt:visible", className)}
    />
  );
}

const LIKERT = {
  xs: {
    grid: "xs:grid-cols-[repeat(var(--points),minmax(0,1fr))]",
    cell: "max-xs:last:border-b-0 xs:flex-col xs:justify-center xs:gap-2 xs:border-b-0 xs:px-1",
    number: "xs:order-first",
    check: "max-xs:ml-auto xs:order-1",
    anchorWide: "xs:sr-only",
    anchorEach: "xs:order-2 xs:text-center xs:t-s",
    ends: "hidden xs:flex",
  },
  sm: {
    grid: "sm:grid-cols-[repeat(var(--points),minmax(0,1fr))]",
    cell: "max-sm:last:border-b-0 sm:flex-col sm:justify-center sm:gap-2 sm:border-b-0 sm:px-1",
    number: "sm:order-first",
    check: "max-sm:ml-auto sm:order-1",
    anchorWide: "sm:sr-only",
    anchorEach: "sm:order-2 sm:text-center sm:t-s",
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
    case "ranking":
      return (
        <fieldset className="flex min-w-0 flex-col gap-4" aria-describedby={describedBy}>
          <legend className="mb-4">{prompt}</legend>
          {item.account ? <ItemAccount account={item.account} sampleText={item.sampleText === true} /> : null}
          <SequenceField name={name} options={item.options} />
          {err}
        </fieldset>
      );
    case "matching":
      return (
        <fieldset className="flex min-w-0 flex-col gap-4" aria-describedby={describedBy}>
          <legend className="mb-4">{prompt}</legend>
          <MatchingField name={name} pairs={item.pairs} options={item.options} />
          {err}
        </fieldset>
      );
    case "sketch":
      return (
        <fieldset className="flex min-w-0 flex-col gap-4" aria-describedby={describedBy}>
          <legend className="mb-4">{prompt}</legend>
          <SketchField name={name} maxBytes={item.maxBytes} />
          {err}
        </fieldset>
      );
    case "single_choice":
    case "multiple_choice":
      return (
        <fieldset className="flex min-w-0 flex-col gap-4" aria-describedby={describedBy}>
          <legend className="mb-4">{prompt}</legend>
          {item.account ? <ItemAccount account={item.account} sampleText={item.sampleText === true} /> : item.sampleText ? <span className="walking-sample self-start">Sample Text</span> : null}
          {item.image ? <ItemFigure image={item.image} /> : null}
          {item.kind === "multiple_choice" ? (
            <p className="t-s text-lime-dim -mt-2">Choose all that apply{item.maxSelections ? ` (at most ${item.maxSelections})` : ""}.</p>
          ) : null}
          <div className="flex flex-col divide-y divide-line border-y border-line">
            {item.options.map((o) => {
              const id = `${item.id}-${o.id}`;
              return (
                <label key={o.id} htmlFor={id} className={OPTION_ROW}>
                  <input
                    id={id}
                    type={item.kind === "single_choice" ? "radio" : "checkbox"}
                    name={name}
                    value={o.id}
                    aria-invalid={item.kind === "multiple_choice" ? invalid : undefined}
                    className={NATIVE_CONTROL}
                  />
                  <span className="t-b min-w-0 flex-1 text-lime">{o.label}</span>
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
            type="text"
            inputMode="decimal"
            pattern="-?[0-9]*([.,][0-9]+)?"
            autoComplete="off"
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
      const middleAnchors = points.some((p) => p !== first && p !== last && item.anchors[String(p)]);
      const L = item.points > 7 ? LIKERT.sm : LIKERT.xs;
      return (
        <fieldset className="flex min-w-0 flex-col gap-4" aria-describedby={describedBy}>
          <legend className="mb-4">{prompt}</legend>
          <div>
            <div
              data-slot="likert-scale"
              style={{ "--points": item.points } as CSSProperties}
              className={cn("grid border-y border-line bg-vat-2", L.grid)}
            >
              {points.map((p) => {
                const id = `${item.id}-${p}`;
                const anchor = item.anchors[String(p)];
                return (
                  <label key={p} htmlFor={id} className={cn(OPTION_ROW, "border-b border-b-line has-[:checked]:bg-turmeric has-[:checked]:**:text-vat", L.cell)}>
                    <input id={id} type="radio" name={name} value={String(p)} className={NATIVE_CONTROL} />
                    <span className={cn("t-label tabular-nums text-lime", L.number)}>{p}</span>
                    {anchor ? " " : null}
                    {anchor ? (
                      <span className={cn("t-b min-w-0 text-lime", middleAnchors ? L.anchorEach : L.anchorWide)}>{anchor}</span>
                    ) : null}
                    <OptionCheck className={L.check} />
                  </label>
                );
              })}
            </div>
            {!middleAnchors && (left || right) ? (
              <div aria-hidden="true" className={cn("justify-between gap-4 pt-2", L.ends)}>
                <span className="t-label max-w-[45%]">{left}</span>
                <span className="t-label max-w-[45%] text-right">{right}</span>
              </div>
            ) : null}
          </div>
          {err}
        </fieldset>
      );
    }
  }
}
