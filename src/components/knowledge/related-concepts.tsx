import type { ReactNode } from "react";

import type { RelatedConceptGroups, RelationDirection } from "@/features/knowledge/read/view";
import { CONCEPT_TYPE_LABELS } from "@/features/learning/labels";
import { SHEET_TEXT } from "@/features/learning/strings";
import { titleCase } from "@/lib/text/title-case";
import { RELATIONSHIP_SEMANTICS, type ConceptType, type RelationshipSemantics } from "@/lib/validation/enums";

import { RelationGroupDetails } from "./relation-group-details";

export interface RelatedLink {
  relationshipId: string;
  type: string;
  semantics: RelationshipSemantics;
  direction: RelationDirection;
  label: string;
  concept: { id: string; title: string; type: ConceptType; traditionSlug: string | null };
  explanation: string | null;
  conditions: string | null;
  statedBy: string[];
}

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

function groupRelatedLinks(links: readonly RelatedLink[]): RelatedLinkGroup[] {
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

const RELATED_LINK_CLASS = "t-label inline-flex min-h-11 min-w-11 items-center text-left text-turmeric underline decoration-1 underline-offset-[0.2em] hover:text-turmeric-hi hover:decoration-2";

export interface RelatedConceptsProps {
  conceptId: string;
  traditionSlug: string | null;
  links: readonly RelatedLink[];
  traditionNames: Readonly<Record<string, string>>;
  renderLink(link: RelatedLink, content: ReactNode, className: string): ReactNode;
  roomOrPageId?: string;
  headingId: string;
}

const layerIdOf = (g: RelatedLinkGroup) => `rels:${g.type}:${g.direction}`.slice(0, 80);

export function RelatedConcepts({ conceptId, traditionSlug, links, traditionNames, renderLink, roomOrPageId, headingId }: RelatedConceptsProps) {
  const groups = groupRelatedLinks(links);
  if (groups.length === 0) return null;
  return (
    <section aria-labelledby={headingId} data-slot="related-concepts">
      <h2 id={headingId} className="t-h4 text-lime">
        {titleCase(SHEET_TEXT.relatedHeading)}
      </h2>
      <div className="mt-4 flex flex-col gap-6">
        {groups.map((g) => (
          <section key={g.key} aria-labelledby={`${headingId}-${g.key}`} data-relationship-type={g.type} data-direction={g.direction}>
            <h3 id={`${headingId}-${g.key}`} className="t-label text-lime">
              {titleCase(g.label)}
            </h3>
            <ul className="mt-1">
              {g.links.map((l) => {
                const other = l.concept.traditionSlug && l.concept.traditionSlug !== traditionSlug ? traditionNames[l.concept.traditionSlug] : undefined;
                const title = titleCase(l.concept.title);
                const link = renderLink(l, title, RELATED_LINK_CLASS);
                return (
                  <li key={l.relationshipId} data-relationship-id={l.relationshipId} className="flex flex-wrap items-baseline gap-x-2">
                    {link ?? <span className="t-label inline-flex min-h-11 items-center text-lime">{title}</span>}
                    <span className="t-s text-lime-dim">{[CONCEPT_TYPE_LABELS[l.concept.type], other].filter(Boolean).join(", ")}</span>
                  </li>
                );
              })}
            </ul>
            {g.links.some((l) => l.explanation || l.conditions || l.statedBy.length > 0) ? (
              <RelationGroupDetails layerId={layerIdOf(g)} conceptId={conceptId} roomOrPageId={roomOrPageId}>
                <dl className="flex flex-col gap-3 py-1">
                  {g.links.map((l) => (
                    <div key={l.relationshipId}>
                      <dt className="t-b font-medium">{titleCase(l.concept.title)}</dt>
                      {l.explanation ? <dd className="t-b">{l.explanation}</dd> : null}
                      {l.conditions ? (
                        <dd className="t-b">
                          <span className="text-lime-dim">{SHEET_TEXT.conditions}</span> {l.conditions}
                        </dd>
                      ) : null}
                      {l.statedBy.length > 0 ? (
                        <dd className="t-s text-lime-dim">
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
