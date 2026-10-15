/**
 * RelatedConcepts (DESIGN.md 9.12): the typed links of a concept, at the END of the knowledge
 * column in BOTH conditions (never a 2D side rail). It replaces both copies of `RelationDetails`.
 *
 * Grouped by relation verb, read from the current concept ("Is Affected By", "Precedes",
 * "Follows"): the verb as an h3 in `text-h3`, then the related concepts as 44 px link rows in Inter
 * 15/500 indigo, underlined, then ONE "About these links" disclosure per group with each link's
 * explanation, conditions and the sources stating it. Verbs and explanations come from the
 * snapshot; nothing is written here.
 *
 * How a link acts is the only allowed difference (12.1 rule 3): the 2D page navigates, the museum
 * walks to the exhibit. The placement supplies `renderLink`, which receives the same class names in
 * both, so links look identical; when it returns null (a concept outside the study scope or not
 * placed in the museum) the title is shown as plain text.
 */
import type { ReactNode } from "react";

import type { RelatedConceptGroups, RelationDirection } from "@/features/knowledge/read/view";
import { CONCEPT_TYPE_LABELS } from "@/features/learning/labels";
import { SHEET_TEXT } from "@/features/learning/strings";
import { titleCase } from "@/lib/text/title-case";
import { RELATIONSHIP_SEMANTICS, type ConceptType, type RelationshipSemantics } from "@/lib/validation/enums";

import { RelationGroupDetails } from "./relation-group-details";

/** One related-concept link, in a shape both placements can produce. */
export interface RelatedLink {
  relationshipId: string;
  /** Relationship type code. */
  type: string;
  semantics: RelationshipSemantics;
  direction: RelationDirection;
  /** The verb read from the current concept (type label, or inverse label for incoming links). */
  label: string;
  concept: { id: string; title: string; type: ConceptType; traditionSlug: string | null };
  explanation: string | null;
  conditions: string | null;
  /** Short labels of the sources stating the relationship. */
  statedBy: string[];
}

/** Read-model groups (2D) -> links. */
export function relatedLinksFromGroups(groups: RelatedConceptGroups): RelatedLink[] {
  return groups.flatMap((g) =>
    g.relations.map((r) => ({
      relationshipId: r.relationshipId,
      type: r.type,
      semantics: r.semantics,
      direction: r.direction,
      label: r.label,
      concept: { id: r.concept.id, title: r.concept.title, type: r.concept.type, traditionSlug: r.concept.traditionSlug },
      explanation: r.explanation,
      conditions: r.conditions,
      statedBy: [...new Map(r.evidence.map((e) => [e.id, e.label])).values()],
    })),
  );
}

export interface RelatedLinkGroup {
  key: string;
  label: string;
  type: string;
  direction: RelationDirection;
  links: RelatedLink[];
}

/** Groups by verb (type and direction), in RELATIONSHIP_SEMANTICS order, then first appearance. */
export function groupRelatedLinks(links: readonly RelatedLink[]): RelatedLinkGroup[] {
  const groups = new Map<string, RelatedLinkGroup & { semantics: RelationshipSemantics; first: number }>();
  links.forEach((l, i) => {
    const key = `${l.type}:${l.direction}`;
    const g = groups.get(key) ?? { key, label: l.label, type: l.type, direction: l.direction, links: [], semantics: l.semantics, first: i };
    g.links.push(l);
    groups.set(key, g);
  });
  return [...groups.values()]
    .sort((a, b) => RELATIONSHIP_SEMANTICS.indexOf(a.semantics) - RELATIONSHIP_SEMANTICS.indexOf(b.semantics) || a.first - b.first)
    .map(({ semantics: _s, first: _f, ...g }) => g);
}

/** Class names every placement's link receives (identical look in both conditions). */
export const RELATED_LINK_CLASS = "text-ui inline-flex min-h-11 min-w-11 items-center text-left text-indigo underline decoration-1 underline-offset-[3px] hover:text-indigo-hover hover:decoration-2";

export interface RelatedConceptsProps {
  /** The concept whose links these are (telemetry attribution). */
  conceptId: string;
  traditionSlug: string | null;
  links: readonly RelatedLink[];
  /** Tradition display names by slug, to name a linked concept from another tradition. */
  traditionNames: Readonly<Record<string, string>>;
  /** Renders the link of one related concept, or null when it cannot be followed. */
  renderLink(link: RelatedLink, content: ReactNode, className: string): ReactNode;
  /** Page or room id for the disclosure telemetry. */
  roomOrPageId?: string;
  /** Id of the h2, for aria-labelledby. */
  headingId: string;
}

const layerIdOf = (g: RelatedLinkGroup) => `rels:${g.type}:${g.direction}`.slice(0, 80);

export function RelatedConcepts({ conceptId, traditionSlug, links, traditionNames, renderLink, roomOrPageId, headingId }: RelatedConceptsProps) {
  const groups = groupRelatedLinks(links);
  if (groups.length === 0) return null;
  return (
    <section aria-labelledby={headingId} data-slot="related-concepts">
      <h2 id={headingId} className="text-h2 text-ink">
        {titleCase(SHEET_TEXT.relatedHeading)}
      </h2>
      <div className="mt-4 flex flex-col gap-6">
        {groups.map((g) => (
          <section key={g.key} aria-labelledby={`${headingId}-${g.key}`} data-relationship-type={g.type} data-direction={g.direction}>
            <h3 id={`${headingId}-${g.key}`} className="text-h3 text-ink">
              {titleCase(g.label)}
            </h3>
            <ul className="mt-1">
              {g.links.map((l) => {
                const other = l.concept.traditionSlug && l.concept.traditionSlug !== traditionSlug ? traditionNames[l.concept.traditionSlug] : undefined;
                const title = titleCase(l.concept.title);
                const link = renderLink(l, title, RELATED_LINK_CLASS);
                return (
                  <li key={l.relationshipId} data-relationship-id={l.relationshipId} className="flex flex-wrap items-baseline gap-x-2">
                    {link ?? <span className="text-ui inline-flex min-h-11 items-center text-ink">{title}</span>}
                    <span className="text-credit">{[CONCEPT_TYPE_LABELS[l.concept.type], other].filter(Boolean).join(" · ")}</span>
                  </li>
                );
              })}
            </ul>
            {g.links.some((l) => l.explanation || l.conditions || l.statedBy.length > 0) ? (
              <RelationGroupDetails layerId={layerIdOf(g)} conceptId={conceptId} roomOrPageId={roomOrPageId}>
                <dl className="flex flex-col gap-3 py-1">
                  {g.links.map((l) => (
                    <div key={l.relationshipId}>
                      <dt className="text-dl-value font-medium">{titleCase(l.concept.title)}</dt>
                      {l.explanation ? <dd className="text-dl-value">{l.explanation}</dd> : null}
                      {l.conditions ? (
                        <dd className="text-dl-value">
                          <span className="text-ink-3">{SHEET_TEXT.conditions}</span> {l.conditions}
                        </dd>
                      ) : null}
                      {l.statedBy.length > 0 ? (
                        <dd className="text-credit">
                          {SHEET_TEXT.statedBy} {l.statedBy.join("; ")}
                        </dd>
                      ) : null}
                    </div>
                  ))}
                </dl>
              </RelationGroupDetails>
            ) : null}
          </section>
        ))}
      </div>
    </section>
  );
}
