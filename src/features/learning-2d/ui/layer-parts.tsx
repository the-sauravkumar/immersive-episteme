/**
 * 2D adapters of the shared layer parts (src/components/knowledge/layer-parts.tsx, DESIGN.md 12.1
 * rule 1): they map the 2D read model onto the shared components' plain inputs and supply the 2D
 * action (navigate to the concept's page, 12.1 rule 3). The markup exists once, in
 * src/components/knowledge; the 3D panel imports the same components.
 */
import type { ReactNode } from "react";

import { ComparisonBlocks as SharedComparisonBlocks, LayerConceptHead as SharedLayerConceptHead, SequenceList as SharedSequenceList } from "@/components/knowledge/layer-parts";
import type { ComparisonView, ConceptRef, ProcessSequence } from "@/features/knowledge/read/view";

import { href2d } from "../routes";

import { TrackedLink, type FollowedRelationship } from "./tracked-link";

export { LAYER_TEXT } from "@/features/learning/strings";

/** Process layer of a station: the ordered stops of its sequence, this one marked. */
export function SequenceList({ sequence, currentId }: { sequence: ProcessSequence; currentId: string }) {
  return <SharedSequenceList steps={sequence.steps.map((s) => ({ key: s.id, title: s.title }))} currentIndex={sequence.steps.findIndex((s) => s.id === currentId)} />;
}

/** Head of a concept shown under another concept's layer (artisan, science, compare). */
export function LayerConceptHead({
  concept,
  traditionNames,
  pageId,
  relationship,
}: {
  concept: Pick<ConceptRef, "id" | "slug" | "title" | "type" | "traditionSlug">;
  traditionNames: Readonly<Record<string, string>>;
  pageId: string;
  /** The relationship attaching it, logged as followed when the learner goes to its page. */
  relationship: FollowedRelationship | null;
}) {
  return (
    <SharedLayerConceptHead
      concept={{ id: concept.id, title: concept.title, type: concept.type, traditionSlug: concept.traditionSlug }}
      traditionNames={traditionNames}
      renderAction={(content: ReactNode, className: string) => (
        <TrackedLink
          href={href2d.concept(concept.slug)}
          pageId={pageId}
          relationship={relationship ?? undefined}
          item={relationship ? undefined : { conceptId: concept.id, elementKind: "layer_concept" }}
          className={className}
        >
          {content}
        </TrackedLink>
      )}
    />
  );
}

/** "Compared Concepts" and "Similarities and Contrasts" of a comparison concept. */
export function ComparisonBlocks({ comparison, traditionNames }: { comparison: ComparisonView; traditionNames: Readonly<Record<string, string>> }) {
  return (
    <SharedComparisonBlocks
      compares={comparison.compares.map((c) => ({ id: c.id, title: c.title, type: c.type, traditionSlug: c.traditionSlug }))}
      // The source names the sheet shows (`statedBy`: each cited source's label once).
      links={comparison.links.map((l) => ({ relationshipId: l.relationshipId, type: l.type, aTitle: l.a.title, bTitle: l.b.title, explanation: l.explanation, statedBy: [...new Set(l.evidence.map((e) => e.label))] }))}
      traditionNames={traditionNames}
    />
  );
}
