"use client";

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
