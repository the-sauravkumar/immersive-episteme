"use client";

import { Check } from "lucide-react";
import { useEffect, useReducer, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useOptionalTelemetry } from "@/features/telemetry/client";
import { titleCase } from "@/lib/text/title-case";
import { cn } from "@/lib/utils";

import { LazyMapCanvas, PARTICIPANT_MAP_WIDTH } from "./lazy-map-canvas";
import { emptyState, reduceMap, type EditLogEntry, type EditorRules, type MapAction, type MapConcept, type MapState } from "./map-state";
import { RelationshipPanel, type PendingConnection } from "./relationship-panel";

const MAP_PRACTICE_TASK = "practice.concept-map";

const PRACTICE_CONCEPTS: readonly MapConcept[] = [
  { nodeKey: "rain", conceptId: "practice-rain", label: "Rain" },
  { nodeKey: "umbrella", conceptId: "practice-umbrella", label: "Umbrella" },
  { nodeKey: "puddle", conceptId: "practice-puddle", label: "Puddle" },
];

const PRACTICE_RULES: EditorRules = { relationshipTypes: [], directedLinks: true };

const PRACTICE_STEPS: readonly { op: EditLogEntry["op"] | null; title: string; mouse: string; keys: string }[] = [
  { op: "move_node", title: "Place a concept", mouse: "Drag a box to a new spot.", keys: "Press Tab until a box has an outline, press Enter, then use the arrow keys." },
  {
    op: "add_edge",
    title: "Link two concepts",
    mouse: "Drag from the dot under one box to another box, then press Add relationship.",
    keys: "Under the map, choose a From concept and a To concept, then press Add relationship.",
  },
  { op: "reverse_edge", title: "Turn the link around", mouse: "Under Your relationships, press Reverse. The arrow now points the other way.", keys: "Tab to Reverse and press Enter." },
  { op: "delete_edge", title: "Delete the link", mouse: "Under Your relationships, press Delete.", keys: "Tab to Delete and press Enter. On the map, you can also select a link and press Delete." },
  { op: null, title: "Finish", mouse: "In the real task, press Submit map when your map is ready. Here, press Start the real task.", keys: "Tab to the button and press Enter." },
];

export function MapPractice({ onClose, focusOnOpen = false }: { onClose: () => void; focusOnOpen?: boolean }) {
  const t = useOptionalTelemetry();
  const [state, dispatch] = useReducer((s: MapState, a: MapAction) => reduceMap(s, a, PRACTICE_RULES), PRACTICE_CONCEPTS, emptyState);
  const [pending, setPending] = useState<PendingConnection | null>(null);
  const startedAt = useRef<number | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (startedAt.current !== null) return;
    startedAt.current = performance.now();
    void t?.taskStarted({ metadata: { taskCode: MAP_PRACTICE_TASK }, roomOrPageId: "study:reconstruction", target: MAP_PRACTICE_TASK });
    if (focusOnOpen) heading.current?.focus();
  }, [t, focusOnOpen]);

  const done = new Set(state.editLog.map((entry) => entry.op));
  const current = PRACTICE_STEPS.findIndex((step) => step.op === null || !done.has(step.op));

  function finish() {
    const durationMs = startedAt.current === null ? undefined : Math.max(0, Math.round(performance.now() - startedAt.current));
    void t?.taskCompleted({ metadata: { taskCode: MAP_PRACTICE_TASK, durationMs }, roomOrPageId: "study:reconstruction", target: MAP_PRACTICE_TASK });
    onClose();
  }

  function skip() {
    void t?.guidanceCueUsed({ metadata: { action: "dismissed", cueId: MAP_PRACTICE_TASK }, roomOrPageId: "study:reconstruction", target: MAP_PRACTICE_TASK });
    onClose();
  }

  return (
    <section aria-labelledby="map-practice-title" data-slot="map-practice" className="flex flex-col gap-8">
      <div className="flex max-w-[65ch] flex-col gap-3">
        <h2 id="map-practice-title" ref={heading} tabIndex={-1} className="t-h4 text-lime outline-none focus-visible:outline-2">
          {titleCase("Try the map first")}
        </h2>
        <p className="t-b text-lime-dim">
          A short practice with three everyday concepts. Nothing here is saved or marked. It takes about a minute, and you can skip it.
        </p>
      </div>
      <ol aria-label="Practice steps" className="flex flex-col gap-2">
        {PRACTICE_STEPS.map((step, index) => {
          const complete = step.op !== null && done.has(step.op);
          return (
            <li
              key={step.title}
              aria-current={index === current ? "step" : undefined}
              className={cn(
                "grid gap-x-6 gap-y-2 border bg-vat-2 px-4 py-3 sm:grid-cols-2",
                index === current ? "border-turmeric outline-2 -outline-offset-2 outline-turmeric" : "border-line",
              )}
            >
              <p className="t-label flex items-center gap-2 text-lime sm:col-span-2">
                <span className="tabular-nums">{index + 1}.</span> {step.title}
                {complete ? (
                  <>
                    <Check aria-hidden="true" className="ml-auto size-5 shrink-0 stroke-[1.75] text-turmeric" />
                    <span className="sr-only">(done)</span>
                  </>
                ) : null}
              </p>
              <p className="t-s text-lime">
                <span className="font-semibold">Mouse: </span>
                {step.mouse}
              </p>
              <p className="t-s text-lime">
                <span className="font-semibold">Keyboard: </span>
                {step.keys}
              </p>
            </li>
          );
        })}
      </ol>
      <div className={PARTICIPANT_MAP_WIDTH}>
        <LazyMapCanvas
          state={state}
          rules={PRACTICE_RULES}
          dispatch={dispatch}
          readOnly={false}
          onConnectRequest={(source, target) => setPending({ source, target })}
          ariaLabel="Practice map: Rain, Umbrella and Puddle"
          attribution={false}
        />
      </div>
      <RelationshipPanel state={state} rules={PRACTICE_RULES} dispatch={dispatch} readOnly={false} showRequired={false} fullWidthActions pending={pending} onPendingHandled={() => setPending(null)} />
      <div data-slot="study-actions" className="flex flex-col items-stretch gap-3 xs:flex-row xs:flex-wrap xs:items-center xs:justify-between [&_[data-slot=button]]:max-xs:w-full">
        <Button type="button" variant="ghost" onClick={skip}>
          Skip the practice
        </Button>
        <Button type="button" className="xs:ml-auto" onClick={finish}>
          Start the real task
        </Button>
      </div>
    </section>
  );
}
