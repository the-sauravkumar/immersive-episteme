"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { saveReconstructionMap } from "@/server/assessment/participant-actions";

import { ConceptMapEditor } from "./concept-map-editor";
import { MapPractice } from "./map-practice";
import type { MapConcept, MapPayload, MapRelationshipType } from "./map-state";

export function ReconstructionTask({
  itemId,
  concepts,
  relationshipTypes,
  directedLinks,
  initial,
  practiceFirst,
}: {
  itemId: string;
  concepts: MapConcept[];
  relationshipTypes: MapRelationshipType[];
  directedLinks: boolean;
  initial: MapPayload | null;
  practiceFirst: boolean;
}) {
  const [done, setDone] = useState(false);
  const [practice, setPractice] = useState<"first" | "again" | null>(practiceFirst ? "first" : null);
  const [taskShown, setTaskShown] = useState(!practiceFirst);
  const howItWorks = useRef<HTMLParagraphElement>(null);
  const practiced = useRef(false);
  const router = useRouter();

  useEffect(() => {
    if (practice === null && practiced.current) howItWorks.current?.focus();
    if (practice !== null) practiced.current = true;
  }, [practice]);

  return (
    <div className="flex flex-col gap-6">
      {practice ? (
        <MapPractice
          focusOnOpen={practice === "again"}
          onClose={() => {
            setPractice(null);
            setTaskShown(true);
          }}
        />
      ) : null}
      {taskShown ? (
        <div hidden={practice !== null}>
          <div className="flex flex-col gap-6">
            <p ref={howItWorks} tabIndex={-1} data-slot="map-how-it-works" className="t-b flex flex-wrap items-center gap-x-3 gap-y-1 text-lime-dim outline-none focus-visible:outline-2">
              <span>How it works: place the concepts, link them, and reverse or delete links.</span>
              <Button type="button" variant="link" className="h-auto min-h-11 px-0" onClick={() => setPractice("again")}>
                Show the practice again
              </Button>
            </p>
            <ConceptMapEditor
              concepts={concepts}
              relationshipTypes={relationshipTypes}
              directedLinks={directedLinks}
              initial={initial}
              mode="participant"
              onSave={(payload, final) => saveReconstructionMap(itemId, payload, final)}
              onSubmitted={() => {
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
        </div>
      ) : null}
    </div>
  );
}
