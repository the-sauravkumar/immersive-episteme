"use client";

/** Expert-rater wrapper: the same editor, with "expected" flags, saved only on submit. */
import { useRouter } from "next/navigation";

import { submitRaterMapAction } from "@/server/assessment/research-actions";

import { ConceptMapEditor } from "./concept-map-editor";
import type { MapConcept, MapPayload, MapRelationshipType } from "./map-state";

export function RaterEditor({
  referenceMapId,
  concepts,
  relationshipTypes,
  directedLinks,
  initial,
}: {
  referenceMapId: string;
  concepts: MapConcept[];
  relationshipTypes: MapRelationshipType[];
  directedLinks: boolean;
  initial: MapPayload | null;
}) {
  const router = useRouter();
  return (
    <ConceptMapEditor
      concepts={concepts}
      relationshipTypes={relationshipTypes}
      directedLinks={directedLinks}
      initial={initial}
      mode="rater"
      autosave={false}
      submitLabel="Submit my rater map"
      finalNote="Other raters cannot see your map. You can revise it until the reference map is finalised."
      canvasLabel="Expert concept map: arrange the concepts and draw the relationships you consider correct"
      onSave={(payload) => submitRaterMapAction(referenceMapId, payload)}
      onSubmitted={() => router.refresh()}
    />
  );
}
