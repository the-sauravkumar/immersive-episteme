"use client";

import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { titleCase } from "@/lib/text/title-case";
import { cn } from "@/lib/utils";

import { addEdgeProblem, describeEdge, type EditorRules, type MapAction, type MapState } from "./map-state";
import { NativeSelect } from "@/components/ui/native-select";

const fieldLabel = "flex min-w-0 flex-col gap-2 t-label text-lime";

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
  showRequired: boolean;
  pending: PendingConnection | null;
  onPendingHandled: () => void;
  fullWidthActions?: boolean;
}) {
  const formId = useId();
  const typed = rules.relationshipTypes.length > 0;
  const [source, setSource] = useState("");
  const [target, setTarget] = useState("");
  const [type, setType] = useState("");
  const [requiredFlag, setRequiredFlag] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

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
        <form aria-labelledby={`${formId}-title`} onSubmit={add} className="flex flex-col gap-4 border-t border-line pt-4">
          <h2 id={`${formId}-title`} className="t-label text-lime">
            {titleCase("Add a relationship")}
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className={fieldLabel}>
              <span>From concept</span>
              <NativeSelect value={source} onChange={(e) => setSource(e.target.value)} name="source">
                <option value="">Choose…</option>
                {state.nodes.map((n) => (
                  <option key={n.key} value={n.key}>
                    {n.label}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <label className={fieldLabel}>
              <span>Relationship</span>
              {typed ? (
                <NativeSelect value={type} onChange={(e) => setType(e.target.value)} name="type">
                  <option value="">Choose…</option>
                  {rules.relationshipTypes.map((t) => (
                    <option key={t.code} value={t.code}>
                      {t.label}
                    </option>
                  ))}
                </NativeSelect>
              ) : (
                <span className="flex h-11 items-center font-sans text-base font-normal text-lime-dim">is linked to</span>
              )}
            </label>
            <label className={fieldLabel}>
              <span>To concept</span>
              <NativeSelect value={target} onChange={(e) => setTarget(e.target.value)} name="target">
                <option value="">Choose…</option>
                {state.nodes.map((n) => (
                  <option key={n.key} value={n.key}>
                    {n.label}
                  </option>
                ))}
              </NativeSelect>
            </label>
          </div>
          {showRequired ? (
            <label className="flex min-h-11 cursor-pointer items-center gap-3 font-sans t-s text-lime">
              <input type="checkbox" checked={requiredFlag} onChange={(e) => setRequiredFlag(e.target.checked)} className="ie-check" />
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
          <p role="status" aria-live="polite" className="t-s text-lime-dim min-h-5">
            {message}
          </p>
        </form>
      )}

      <section aria-labelledby={`${formId}-list`} className="flex flex-col gap-2">
        <h2 id={`${formId}-list`} className="t-label text-lime">
          {titleCase("Your relationships")} <span className="tabular-nums">({state.edges.length})</span>
        </h2>
        {state.edges.length === 0 ? (
          <p className="t-s text-lime-dim border-y border-line py-3">No relationships yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line border-y border-line">
            {state.edges.map((edge) => {
              const sentence = describeEdge(edge, labelOf, typeLabel);
              return (
                <li key={edge.key} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <span className="t-b text-lime">{sentence}</span>
                  {readOnly ? null : (
                    <div className="flex flex-wrap items-center gap-2">
                      {typed ? (
                        <label className="flex items-center">
                          <NativeSelect
                            aria-label={`Relationship type for: ${sentence}`}
                            className="w-auto"
                            value={edge.relationshipType ?? ""}
                            onChange={(e) => dispatch({ type: "retype_edge", edgeKey: edge.key, relationshipType: e.target.value || null, via: "form" })}
                          >
                            {rules.relationshipTypes.map((t) => (
                              <option key={t.code} value={t.code}>
                                {t.label}
                              </option>
                            ))}
                          </NativeSelect>
                        </label>
                      ) : null}
                      {showRequired ? (
                        <label className="flex min-h-11 cursor-pointer items-center gap-2 px-1 font-sans t-s text-lime">
                          <input
                            type="checkbox"
                            className="ie-check"
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
