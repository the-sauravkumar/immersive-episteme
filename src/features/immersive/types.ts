/**
 * Serialisable data the immersive museum receives from the server (client-safe types).
 *
 * Content is claims-only and comes from the same read model the 2D condition uses
 * (getConcept / getRelatedConcepts by `ctx.snapshotId`); space comes only from the stored
 * manifest (getManifest(ctx.manifestId)), mapped by `buildSceneModel`.
 *
 * Citations are sent once per source (`sources`) and rebuilt into the read model's `Citation`
 * shape on the client (`citationOf`), so the payload does not repeat source records per claim.
 */
import type { ConceptType, KnowledgeCategoryCode, RelationshipSemantics } from "@/lib/validation/enums";
import type { Citation, ClaimView, KnowledgeFigureData, RelationDirection, SourceView } from "@/features/knowledge/read/view";

import type { SceneModel } from "./scene-model";

/** A claim's citation: the source id (the read model's `Citation.id`) plus this citation's locator and quote. */
export interface PanelCitationRef {
  sourceId: string;
  locator: string | null;
  quote: string | null;
  /** The same located passages the 2D citation shows (condition equivalence). */
  passages: Citation["passages"];
}

export interface PanelClaim {
  id: string;
  position: number;
  text: string;
  evidence: PanelCitationRef[];
}

export interface PanelRelation {
  relationshipId: string;
  type: string;
  semantics: RelationshipSemantics;
  direction: RelationDirection;
  label: string;
  conceptId: string;
  conceptTitle: string;
  conceptType: ConceptType;
  conceptTraditionSlug: string | null;
  explanation: string | null;
  conditions: string | null;
  /** Labels of the sources stating the relationship ("Stated by"), as in the 2D page. */
  statedBy: string[];
}

export interface PanelComparison {
  compares: { id: string; title: string; type: ConceptType; traditionSlug: string | null }[];
  links: { relationshipId: string; type: string; aTitle: string; bTitle: string; explanation: string | null; statedBy: string[] }[];
}

export interface PanelConcept {
  id: string;
  key: string;
  title: string;
  type: ConceptType;
  category: KnowledgeCategoryCode;
  traditionId: string | null;
  traditionSlug: string | null;
  localTerms: string[];
  verificationState: string;
  claims: PanelClaim[];
  /** Comparison concepts: the compared concepts and the cross-tradition links (as on the 2D page). */
  comparison: PanelComparison | null;
  /** Typed relations grouped like the 2D page (RELATIONSHIP_SEMANTICS order). */
  related: { semantics: RelationshipSemantics; relations: PanelRelation[] }[];
}

export interface MuseumTradition {
  id: string;
  slug: string;
  name: string;
}

export interface ImmersiveSettings {
  minimap: "on" | "off" | "toggle";
  webglFailurePolicy: "exclude" | "retry" | "reassign";
}

export interface MuseumPayload {
  manifestId: string;
  manifestHash: string;
  snapshotId: string;
  scene: SceneModel;
  concepts: Record<string, PanelConcept>;
  sources: Record<string, SourceView>;
  traditions: MuseumTradition[];
  settings: ImmersiveSettings;
  /** Concept ids referenced by the manifest that the snapshot does not contain (should be empty). */
  missingConceptIds: string[];
  /**
   * Knowledge figures by concept id (DESIGN.md 9.9, DR-018): the same resolution the 2D concept
   * page uses (`getFiguresByConcept` with the learning context's tradition scope and the protocol's
   * structure-diagram switch), so a concept shows the same figure in both conditions. Absent in the
   * practice room, which has no craft content.
   */
  figures?: Record<string, KnowledgeFigureData[]>;
}

export function citationOf(ref: PanelCitationRef, sources: Readonly<Record<string, SourceView>>): Citation | null {
  const s = sources[ref.sourceId];
  if (!s) return null;
  return { ...s, locator: ref.locator, quote: ref.quote, passages: ref.passages };
}

/**
 * A panel concept's claims in the read model's `ClaimView` shape, for the shared `ClaimList`
 * (the same component the 2D concept page renders). Text, order and citations are copied
 * unchanged; a citation whose source is missing from the payload is dropped, as before.
 */
export function claimViewsOf(claims: readonly PanelClaim[], sources: Readonly<Record<string, SourceView>>): ClaimView[] {
  return claims.map((c) => ({
    id: c.id,
    position: c.position,
    text: c.text,
    quote: null,
    evidence: c.evidence.map((ref) => citationOf(ref, sources)).filter((x): x is Citation => x !== null),
  }));
}
