"use client";

/**
 * Participant wrapper around the concept-map editor: saves through the participant server action
 * and, after the final submission, returns to the session hub (/study/session). Receives no learning condition.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { saveReconstructionMap } from "@/server/assessment/participant-actions";

import { ConceptMapEditor } from "./concept-map-editor";
import type { MapConcept, MapPayload, MapRelationshipType } from "./map-state";

export function ReconstructionTask({
  itemId,
  concepts,
  relationshipTypes,
  directedLinks,
  initial,
}: {
  itemId: string;
  concepts: MapConcept[];
  relationshipTypes: MapRelationshipType[];
  directedLinks: boolean;
  initial: MapPayload | null;
}) {
  const [done, setDone] = useState(false);
  const router = useRouter();
  return (
    <div className="flex flex-col gap-6">
      <ConceptMapEditor
        concepts={concepts}
        relationshipTypes={relationshipTypes}
        directedLinks={directedLinks}
        initial={initial}
        mode="participant"
        onSave={(payload, final) => saveReconstructionMap(itemId, payload, final)}
        onSubmitted={() => {
          // Back to the study engine, which sees the final map and moves to the next step.
          setDone(true);
          router.replace("/study/session");
        }}
        canvasLabel="Concept map: arrange the concepts and draw links between them"
      />
      {done ? (
        <Button asChild className="self-end max-xs:w-full max-xs:self-stretch">
          <Link href="/study/session">Continue</Link>
        </Button>
      ) : null}
    </div>
  );
}
