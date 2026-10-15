"use client";

/** Read-only view of a stored concept map (research console), using the participant editor. */
import { ConceptMapEditor } from "./concept-map-editor";
import type { MapConcept, MapPayload, MapRelationshipType } from "./map-state";

export function MapViewer({
  concepts,
  relationshipTypes,
  directedLinks,
  payload,
  label,
}: {
  concepts: MapConcept[];
  relationshipTypes: MapRelationshipType[];
  directedLinks: boolean;
  payload: MapPayload;
  label: string;
}) {
  // The participant editor lets its canvas break out of the 40rem study column (up to 72rem of
  // the viewport). In the console the column is the page, so the breakout would overflow beside
  // the rail: the wrapper pins the breakout width to the container (margins become 0).
  return (
    <div className="min-w-0 [&_[data-slot=map-canvas-region]]:[--bw:100%]">
      <ConceptMapEditor
        concepts={concepts}
        relationshipTypes={relationshipTypes}
        directedLinks={directedLinks}
        initial={payload}
        mode="participant"
        readOnly
        onSave={async () => ({ ok: false, error: "Read-only" })}
        canvasLabel={label}
      />
    </div>
  );
}
