"use client";

import { CircleAlert, CircleCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import {
  emptyState,
  reduceMap,
  stateFromPayload,
  toPayload,
  type EditorRules,
  type MapAction,
  type MapConcept,
  type MapPayload,
  type MapRelationshipType,
  type MapState,
} from "./map-state";
import { LazyMapCanvas, PARTICIPANT_MAP_WIDTH } from "./lazy-map-canvas";
import { RelationshipPanel, type PendingConnection } from "./relationship-panel";

export type SaveResult = { ok: true } | { ok: false; error: string };

const AUTOSAVE_MS = 1500;

export function ConceptMapEditor({
  concepts,
  relationshipTypes,
  directedLinks,
  initial,
  mode,
  readOnly = false,
  onSave,
  onSubmitted,
  submitLabel = "Submit map",
  canvasLabel = "Concept map",
  autosave = true,
  finalNote = "After submitting you cannot change it.",
}: {
  concepts: readonly MapConcept[];
  relationshipTypes: readonly MapRelationshipType[];
  directedLinks: boolean;
  initial: MapPayload | null;
  mode: "participant" | "rater";
  readOnly?: boolean;
  onSave: (payload: MapPayload, final: boolean) => Promise<SaveResult>;
  onSubmitted?: () => void;
  submitLabel?: string;
  canvasLabel?: string;
  autosave?: boolean;
  finalNote?: string;
}) {
  const rules: EditorRules = useMemo(() => ({ relationshipTypes, directedLinks }), [relationshipTypes, directedLinks]);
  const [state, dispatch] = useReducer(
    (s: MapState, a: MapAction) => reduceMap(s, a, rules),
    null,
    () => (initial ? stateFromPayload(initial) : emptyState(concepts)),
  );
  const [pending, setPending] = useState<PendingConnection | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const locked = readOnly || submitted;
  const participant = mode === "participant";

  const savedLength = useRef(initial?.editLog.length ?? 0);
  const inFlight = useRef<Promise<SaveResult> | null>(null);
  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
  }, [state]);

  const save = useCallback(
    async (final: boolean): Promise<SaveResult> => {
      while (inFlight.current) await inFlight.current;
      const snapshot = latest.current;
      if (!final && snapshot.editLog.length === savedLength.current) return { ok: true };
      setStatus("saving");
      const p = onSave(toPayload(snapshot), final).catch((): SaveResult => ({ ok: false, error: "The map could not be saved. Check the connection and try again." }));
      inFlight.current = p;
      const result = await p;
      inFlight.current = null;
      if (result.ok) {
        savedLength.current = snapshot.editLog.length;
        setStatus("saved");
        setError(null);
      } else {
        setStatus("error");
        setError(result.error);
      }
      return result;
    },
    [onSave],
  );

  useEffect(() => {
    if (!autosave || locked || state.editLog.length === savedLength.current) return;
    const t = setTimeout(() => void save(false), AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [state.editLog.length, locked, save, autosave]);

  async function submit() {
    if (status === "saving") return;
    const result = await save(true);
    setConfirmOpen(false);
    if (result.ok) {
      setSubmitted(true);
      onSubmitted?.();
    }
  }

  const statusText =
    status === "saving" ? "Saving…" : status === "saved" ? "All changes saved." : status === "error" ? (error ?? "Not saved.") : locked ? "" : autosave ? "Changes are saved automatically." : "Changes are stored when you submit.";

  return (
    <div className="flex flex-col gap-6">
      <div
        data-slot="map-canvas-region"
        className={participant ? PARTICIPANT_MAP_WIDTH : undefined}
      >
        <LazyMapCanvas
          state={state}
          rules={rules}
          dispatch={locked ? () => undefined : dispatch}
          readOnly={locked}
          onConnectRequest={(source, target) => setPending({ source, target })}
          ariaLabel={canvasLabel}
          attribution={mode === "rater"}
        />
      </div>
      <RelationshipPanel
        state={state}
        rules={rules}
        dispatch={dispatch}
        readOnly={locked}
        showRequired={mode === "rater"}
        fullWidthActions={participant}
        pending={pending}
        onPendingHandled={() => setPending(null)}
      />
      {locked ? (
        submitted ? (
          <p role="status" className="t-b flex items-center gap-3 border-b border-line pb-4 text-lime">
            <CircleCheck aria-hidden="true" strokeWidth={1.5} className="size-6 shrink-0" />
            Submitted. Thank you.
          </p>
        ) : null
      ) : (
        <div
          data-slot="study-actions"
          className={
            participant
              ? "flex flex-col items-stretch gap-3 xs:flex-row xs:flex-wrap xs:items-center xs:justify-between"
              : "flex flex-wrap items-center justify-between gap-3"
          }
        >
          <p
            role="status"
            aria-live="polite"
            className={status === "error" ? "inline-flex items-start gap-2 t-s font-semibold text-madder-text" : "t-s text-lime-dim"}
          >
            {status === "error" ? <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 stroke-2" /> : null}
            {statusText}
          </p>
          <Button type="button" className={participant ? "max-xs:w-full xs:ml-auto" : "ml-auto"} onClick={() => setConfirmOpen(true)}>
            {submitLabel}
          </Button>
        </div>
      )}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{submitLabel}?</DialogTitle>
            <DialogDescription>
              {state.edges.length === 0
                ? "Your map has no relationships yet. "
                : `Your map has ${state.edges.length} relationship${state.edges.length === 1 ? "" : "s"}. `}
              {finalNote}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Keep editing
              </Button>
            </DialogClose>
            <Button type="button" onClick={() => void submit()} aria-disabled={status === "saving"}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
