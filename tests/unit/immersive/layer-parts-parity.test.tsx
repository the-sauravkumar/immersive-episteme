/**
 * Stop-gap for DESIGN.md 12.1 rule 1 until WP0 moves the layer parts into src/components/knowledge:
 * the 3D panel's `SequenceList`, `LayerConceptHead` and `ComparisonBlocks`
 * (src/components/museum/overlays/info-panel.tsx) and their 2D copies
 * (src/features/learning-2d/ui/layer-parts.tsx) must render the SAME DOM from equivalent data.
 * The only allowed difference is the head's action (12.1 rule 3): it walks to the exhibit in 3D
 * and navigates to the concept page in 2D, with the same label and icon. It is removed before the
 * comparison and checked separately.
 */
import { cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The 2D head's TrackedLink needs the 2D session stores; a plain anchor keeps the markup.
vi.mock("@/features/learning-2d/ui/tracked-link", () => ({
  TrackedLink: ({ href, className, children }: { href: string; className?: string; children: ReactNode }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

import * as Museum from "@/components/museum/overlays/info-panel";
import type { PanelConcept } from "@/features/immersive/types";
import type { ComparisonView, ConceptRef, ProcessSequence } from "@/features/knowledge/read/view";
import * as TwoD from "@/features/learning-2d/ui/layer-parts";

afterEach(cleanup);

const TRADITIONS = { ajrakh: "Ajrakh", sanganeri: "Sanganeri", "machilipatnam-kalamkari": "Machilipatnam Kalamkari" };

function ref(id: string, title: string, traditionSlug: string | null = "ajrakh"): ConceptRef {
  return { id, key: id, slug: id, type: "process_stage", category: "process", title, summary: "", traditionId: null, traditionSlug, verificationState: "draft" } as unknown as ConceptRef;
}

const A = ref("c-a", "first stage of a fixture");
const B = ref("c-b", "second stage of a fixture");
const C = ref("c-c", "third stage of a fixture", "sanganeri");

function panelConcept(r: ConceptRef): PanelConcept {
  return { id: r.id, key: r.key, title: r.title, type: r.type, category: r.category, traditionSlug: r.traditionSlug } as unknown as PanelConcept;
}

function html(node: ReactNode, strip?: string): string {
  const { container } = render(<>{node}</>);
  if (strip) for (const el of container.querySelectorAll(strip)) el.remove();
  const out = container.innerHTML;
  cleanup();
  return out;
}

describe("Layer parts render the same DOM in both conditions", () => {
  it("SequenceList", () => {
    const concepts = Object.fromEntries([A, B, C].map((r) => [r.id, panelConcept(r)]));
    const museum = html(<Museum.SequenceList sequence={{ stops: [A, B, C].map((r) => ({ elementId: `exhibit:${r.id}`, conceptId: r.id })), index: 1 }} concepts={concepts} />);
    const sequence = { steps: [A, B, C], links: [], continuous: true } as unknown as ProcessSequence;
    const twoD = html(<TwoD.SequenceList sequence={sequence} currentId={B.id} />);
    expect(museum).toBe(twoD);
  });

  it("LayerConceptHead, apart from its action (same label and icon; walk vs navigate)", () => {
    const walk = vi.fn();
    const museumFull = render(<Museum.LayerConceptHead concept={panelConcept(C)} traditionNames={TRADITIONS} walk={walk} />);
    const museumAction = museumFull.container.querySelector("[data-slot=layer-concept-action]")!;
    const museumLabel = museumAction.textContent;
    const museumIcon = museumAction.querySelector("svg")?.getAttribute("class");
    cleanup();
    const twoDFull = render(<TwoD.LayerConceptHead concept={C} traditionNames={TRADITIONS} pageId="page" relationship={null} />);
    const twoDAction = twoDFull.container.querySelector("[data-slot=panel-layer-concept] > a")!;
    expect(twoDAction.textContent).toBe(museumLabel);
    expect(twoDAction.querySelector("svg")?.getAttribute("class")).toBe(museumIcon);
    cleanup();

    const museum = html(<Museum.LayerConceptHead concept={panelConcept(C)} traditionNames={TRADITIONS} walk={walk} />, "[data-slot=layer-concept-action]");
    const twoD = html(<TwoD.LayerConceptHead concept={C} traditionNames={TRADITIONS} pageId="page" relationship={null} />, "[data-slot=panel-layer-concept] > a");
    expect(museum).toBe(twoD);
  });

  it("ComparisonBlocks", () => {
    const links = [
      { relationshipId: "r1", type: "SIMILAR_TO", a: A, b: C, explanation: "An explanation from the fixture.", evidence: [{ label: "Source One 2020" }, { label: "Source Two 2021" }, { label: "Source One 2020" }] },
      { relationshipId: "r2", type: "CONTRASTS_WITH", a: B, b: C, explanation: null, evidence: [] },
    ];
    const view = { concept: A, compares: [A, C], claims: [], links } as unknown as ComparisonView;
    const panel = {
      compares: [A, C].map((r) => ({ id: r.id, title: r.title, type: r.type, traditionSlug: r.traditionSlug })),
      links: links.map((l) => ({ relationshipId: l.relationshipId, type: l.type, aTitle: l.a.title, bTitle: l.b.title, explanation: l.explanation, statedBy: [...new Set(l.evidence.map((e) => e.label))] })),
    };
    const museum = html(<Museum.ComparisonBlocks comparison={panel} traditionNames={TRADITIONS} />);
    const twoD = html(<TwoD.ComparisonBlocks comparison={view} traditionNames={TRADITIONS} />);
    expect(museum).toBe(twoD);
  });
});
