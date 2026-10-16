/**
 * The familiarisation practice diagram (study decision D5), ONE definition for both conditions: the
 * 2D practice sheet and the 3D practice room's step-2 exhibit show the same figure, in the same
 * shared KnowledgeFigure frame, after the same practice statement, so a participant of either
 * condition has used Enlarge and the lightbox before the task (final review
 * equivalence-practice-sheet-controls). No craft content: three practice steps in order.
 * Client-safe (pure data).
 */
import type { DiagramFigure } from "@/features/knowledge/read/view";
import type { ConceptType } from "@/lib/validation/enums";

export interface PracticeFigureStep {
  id: string;
  key: string;
  title: string;
  type: ConceptType;
  /** The node's lettering (Title Case). */
  line: string;
}

const CAPTION = "Practice diagram: three practice steps in order, pointing to the second statement.";

/** The practice diagram for `steps` (three, in order), anchored to statement `anchorClaimIndex` of `conceptId` (the middle step). */
export function practiceDiagramFigure(steps: readonly [PracticeFigureStep, PracticeFigureStep, PracticeFigureStep], conceptId: string, anchorClaimIndex: number): DiagramFigure {
  const alt = `${steps[0].line.replace("Step", "step")} precedes ${steps[1].line}, which precedes ${steps[2].line.replace("Step", "step")}.`;
  return {
    kind: "diagram",
    id: "practice-diagram",
    conceptId,
    anchorClaimIndex,
    caption: CAPTION,
    alt,
    credit: "Practice figure (not part of the learning content)",
    diagram: {
      id: "practice:diagram",
      type: "process-sequence",
      traditionSlug: "practice",
      traditionName: "Practice",
      section: "process",
      anchor: { conceptId, conceptKey: steps[1].key, claimIndex: anchorClaimIndex },
      width: 576,
      height: 384,
      fontSize: 14,
      lineHeight: 18,
      labelSize: 12,
      nodes: steps.map((s, i) => ({ id: s.id, key: s.key, title: s.title, type: s.type, current: s.id === conceptId, x: 20 + i * 198, y: 170, w: 140, h: 36, lines: [s.line] })),
      edges: [0, 1].map((i) => ({
        relationshipId: `practice-edge-${i}`,
        type: "PRECEDES",
        label: "precedes",
        source: steps[i]!.id,
        target: steps[i + 1]!.id,
        d: `M${160 + i * 198} 188 L${218 + i * 198} 188`,
        labelAt: { x: 189 + i * 198, y: 172, anchor: "middle" as const },
      })),
      bands: [],
      alt,
      caption: CAPTION,
    },
  };
}
