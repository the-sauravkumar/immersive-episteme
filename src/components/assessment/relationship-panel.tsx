"use client";

/**
 * Keyboard-first relationship controls of the concept-map editor: a form that creates a typed,
 * directed relationship from three native selects (no mouse needed), and the list of every
 * relationship with change-type, reverse and delete controls. The canvas mirrors the same
 * state; this panel is the complete, screen-reader-friendly way to build the map.
 */
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { titleCase } from "@/lib/text/title-case";
import { cn } from "@/lib/utils";

import { addEdgeProblem, describeEdge, type EditorRules, type MapAction, type MapState } from "./map-state";

/**
 * Native selects with the Input rules (DESIGN.md 9.5): 44 px, 1 px `--rule-strong`, `--surface`,
 * Inter 16 px. Focus is the global ring. Native controls keep the keyboard path library-free.
 */
const selectClass =
  "h-11 w-full min-w-0 rounded-control border border-rule-strong bg-surface px-3 font-sans text-base leading-6 font-normal text-ink disabled:cursor-not-allowed disabled:border-rule disabled:bg-sunk disabled:text-ink-3";
/** A label above its control: Inter 14/500 `--ink` (the Label primitive's style, on a native label). */
const fieldLabel = "flex min-w-0 flex-col gap-2 font-sans text-sm leading-5 font-medium text-ink";

export interface PendingConnection {
  source: string;
  target: string;
}

export function RelationshipPanel({
  state,
  rules,
  dispatch,
  readOnly,
  showRequired,
  pending,
  onPendingHandled,
  fullWidthActions = false,
}: {
  state: MapState;
  rules: EditorRules;
  dispatch: (action: MapAction) => void;
  readOnly: boolean;
  /** Expert-rater mode: each relationship can be marked as expected (required). */
  showRequired: boolean;
  /** A connection drawn on the canvas, waiting for its relationship type. */
  pending: PendingConnection | null;
  onPendingHandled: () => void;
  /**
   * Participant mode: under 520 px the form's actions stack at full width in DOM order, like the
   * study action row (StudyActions) on every other study step. The rater console keeps its row.
   */
  fullWidthActions?: boolean;
}) {
  const formId = useId();
  const typed = rules.relationshipTypes.length > 0;
  const [source, setSource] = useState("");
  const [target, setTarget] = useState("");
  const [type, setType] = useState("");
  const [requiredFlag, setRequiredFlag] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  // A connection drawn on the canvas pre-fills the form (render-time sync, no effect).
  const [seenPending, setSeenPending] = useState<PendingConnection | null>(null);
  if (pending !== seenPending) {
    setSeenPending(pending);
    if (pending) {
      setSource(pending.source);
      setTarget(pending.target);
      setMessage("Choose the relationship type for the link you drew, then add it.");
    }
  }

  const labelOf = (key: string) => state.nodes.find((n) => n.key === key)?.label ?? key;
  const typeLabel = (code: string | null) => (code === null ? "is linked to" : (rules.relationshipTypes.find((t) => t.code === code)?.label ?? code));

  function add(event: React.FormEvent) {
    event.preventDefault();
    const relationshipType = typed ? type || null : null;
    const problem = addEdgeProblem(state, source, target, relationshipType, rules);
    if (problem) {
      setMessage(problem);
      return;
    }
    dispatch({ type: "add_edge", source, target, relationshipType, via: pending ? "canvas" : "form", ...(showRequired ? { required: requiredFlag } : {}) });
    setMessage(`Added: ${describeEdge({ source, target, relationshipType, directed: true }, labelOf, typeLabel)}.`);
    setSource("");
    setTarget("");
    setType("");
    onPendingHandled();
  }

  return (
    <div className="flex flex-col gap-6">
      {readOnly ? null : (
        <form aria-labelledby={`${formId}-title`} onSubmit={add} className="flex flex-col gap-4 border-t border-rule pt-4">
          <h2 id={`${formId}-title`} className="text-h3 text-ink">
            {titleCase("Add a relationship")}
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className={fieldLabel}>
              <span>From concept</span>
              <select className={selectClass} value={source} onChange={(e) => setSource(e.target.value)} name="source">
                <option value="">Choose…</option>
                {state.nodes.map((n) => (
                  <option key={n.key} value={n.key}>
                    {n.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={fieldLabel}>
              <span>Relationship</span>
              {typed ? (
                <select className={selectClass} value={type} onChange={(e) => setType(e.target.value)} name="type">
                  <option value="">Choose…</option>
                  {rules.relationshipTypes.map((t) => (
                    <option key={t.code} value={t.code}>
                      {t.label}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="flex h-11 items-center font-sans text-base font-normal text-ink-2">is linked to</span>
              )}
            </label>
            <label className={fieldLabel}>
              <span>To concept</span>
              <select className={selectClass} value={target} onChange={(e) => setTarget(e.target.value)} name="target">
                <option value="">Choose…</option>
                {state.nodes.map((n) => (
                  <option key={n.key} value={n.key}>
                    {n.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {showRequired ? (
            <label className="flex min-h-11 cursor-pointer items-center gap-3 font-sans text-[0.9375rem] leading-5 text-ink">
              <input type="checkbox" checked={requiredFlag} onChange={(e) => setRequiredFlag(e.target.checked)} className="size-5 shrink-0 cursor-pointer accent-indigo" />
              Expected (must appear for full credit); unticked means acceptable but optional
            </label>
          ) : null}
          <div
            className={cn(
              "flex flex-wrap items-center justify-end gap-3",
              fullWidthActions && "max-xs:flex-col max-xs:items-stretch [&_[data-slot=button]]:max-xs:w-full",
            )}
          >
            {pending ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  onPendingHandled();
                  setMessage(null);
                }}
              >
                Cancel drawn link
              </Button>
            ) : null}
            <Button type="submit">Add relationship</Button>
          </div>
          <p role="status" aria-live="polite" className="text-source min-h-5">
            {message}
          </p>
        </form>
      )}

      <section aria-labelledby={`${formId}-list`} className="flex flex-col gap-2">
        <h2 id={`${formId}-list`} className="text-h3 text-ink">
          {titleCase("Your relationships")} <span className="tabular-nums">({state.edges.length})</span>
        </h2>
        {state.edges.length === 0 ? (
          <p className="text-source border-y border-rule py-3">No relationships yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-rule border-y border-rule">
            {state.edges.map((edge) => {
              const sentence = describeEdge(edge, labelOf, typeLabel);
              return (
                <li key={edge.key} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <span className="font-sans text-base leading-6 text-ink">{sentence}</span>
                  {readOnly ? null : (
                    <div className="flex flex-wrap items-center gap-2">
                      {typed ? (
                        <label className="flex items-center">
                          <select
                            aria-label={`Relationship type for: ${sentence}`}
                            className={cn(selectClass, "w-auto")}
                            value={edge.relationshipType ?? ""}
                            onChange={(e) => dispatch({ type: "retype_edge", edgeKey: edge.key, relationshipType: e.target.value || null, via: "form" })}
                          >
                            {rules.relationshipTypes.map((t) => (
                              <option key={t.code} value={t.code}>
                                {t.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                      {showRequired ? (
                        <label className="flex min-h-11 cursor-pointer items-center gap-2 px-1 font-sans text-[0.9375rem] leading-5 text-ink">
                          <input
                            type="checkbox"
                            className="size-5 shrink-0 cursor-pointer accent-indigo"
                            aria-label={`Expected: ${sentence}`}
                            checked={edge.required ?? false}
                            onChange={(e) => dispatch({ type: "set_required", edgeKey: edge.key, required: e.target.checked, via: "form" })}
                          />
                          Expected
                        </label>
                      ) : null}
                      <Button
                        type="button"
                        variant="outline"
                        aria-label={`Reverse: ${sentence}`}
                        disabled={!edge.directed}
                        onClick={() => dispatch({ type: "reverse_edge", edgeKey: edge.key, via: "form" })}
                      >
                        Reverse
                      </Button>
                      <Button type="button" variant="destructive" aria-label={`Delete: ${sentence}`} onClick={() => dispatch({ type: "delete_edge", edgeKey: edge.key, via: "form" })}>
                        Delete
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
