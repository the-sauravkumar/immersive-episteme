/**
 * The parts of a concept's layer view beyond the claims (DESIGN.md 9.6, 9.11; 12.1 rule 1): the
 * Process layer's sequence list, the head of a concept shown under another concept's layer, and
 * the comparison blocks of a comparison concept. ONE copy, imported by both conditions (the 2D
 * concept page and the 3D information panel), so the field reads the same in both by
 * construction. The client-side concept chooser is in ./concept-chooser.tsx.
 *
 * The only allowed difference is how the head's action acts (12.1 rule 3): it navigates to the
 * concept's page in 2D and walks to its exhibit in 3D. The caller supplies that element through
 * `renderAction`, with the shared content and class names, exactly as RelatedConcepts and Pager
 * take `renderLink`. Inputs are plain data so neither condition's view model leaks in.
 *
 * Server-safe (no hooks). Wording from LAYER_TEXT in src/features/learning/strings.ts (P20).
 */
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

import { TraditionName } from "@/components/knowledge/tradition-marker";
import { buttonVariants } from "@/components/ui/button";
import { CONCEPT_TYPE_LABELS } from "@/features/learning/labels";
import { LAYER_TEXT, SHEET_TEXT } from "@/features/learning/strings";
import type { ConceptType } from "@/lib/validation/enums";
import { titleCase } from "@/lib/text/title-case";
import { cn } from "@/lib/utils";

/** A concept as the layer parts show it. */
export interface LayerPartConcept {
  id: string;
  title: string;
  type: ConceptType;
  traditionSlug: string | null;
}

function TypeAndTradition({ type, traditionSlug, traditionNames }: { type: ConceptType; traditionSlug: string | null; traditionNames: Readonly<Record<string, string>> }) {
  return (
    <>
      {CONCEPT_TYPE_LABELS[type]}
      {traditionSlug ? (
        <>
          {" · "}
          <TraditionName traditionKey={traditionSlug}>{traditionNames[traditionSlug] ?? traditionSlug}</TraditionName>
        </>
      ) : null}
    </>
  );
}

/** Process layer of a station: the ordered stops of its sequence, the current one marked. */
export function SequenceList({ steps, currentIndex }: { steps: readonly { key: string; title: string }[]; currentIndex: number }) {
  return (
    <section aria-labelledby="layer-sequence" className="mb-8" data-slot="panel-sequence">
      <h3 id="layer-sequence" className="text-h3 text-ink">
        {titleCase(LAYER_TEXT.sequence)}
      </h3>
      <ol className="mt-2 list-none">
        {steps.map((s, i) => {
          const current = i === currentIndex;
          return (
            <li key={s.key} aria-current={current ? "step" : undefined} className="grid grid-cols-[var(--hang)_minmax(0,1fr)] py-1">
              <span aria-hidden="true" className="pr-3 text-right text-[0.9375rem] leading-6 text-ink-3 tabular-nums">
                {i + 1}
              </span>
              <span className={cn("text-[0.9375rem] leading-6", current ? "font-semibold text-ink" : "text-ink-2")}>
                {titleCase(s.title)}
                {current ? <span className="text-credit ml-2 font-normal">{LAYER_TEXT.thisConcept}</span> : null}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Class names of the head's action (an outline button, link or button element). */
export const LAYER_CONCEPT_ACTION_CLASS = cn(buttonVariants({ variant: "outline" }), "mt-3 no-underline");

/**
 * Head of a concept shown under another concept's layer (artisan, science, compare). The action
 * (navigate in 2D, walk in 3D) comes from `renderAction`; returning null leaves the head without
 * one (a concept the museum does not place).
 */
export function LayerConceptHead({
  concept,
  traditionNames,
  renderAction,
}: {
  concept: LayerPartConcept;
  traditionNames: Readonly<Record<string, string>>;
  renderAction?: (content: ReactNode, className: string) => ReactNode;
}) {
  const content = (
    <>
      <ArrowRight aria-hidden="true" />
      {LAYER_TEXT.open}
    </>
  );
  return (
    <div className="mb-6" data-slot="panel-layer-concept">
      <p className="text-eyebrow">
        <TypeAndTradition type={concept.type} traditionSlug={concept.traditionSlug} traditionNames={traditionNames} />
      </p>
      <h3 className="text-h2 mt-1 text-ink">{titleCase(concept.title)}</h3>
      {renderAction ? renderAction(content, LAYER_CONCEPT_ACTION_CLASS) : null}
    </div>
  );
}

/** A SIMILAR_TO / CONTRASTS_WITH link of a comparison, with the sources stating it. */
export interface ComparisonLinkPart {
  relationshipId: string;
  type: string;
  aTitle: string;
  bTitle: string;
  explanation: string | null;
  /** Each cited source's label once, in citation order. */
  statedBy: readonly string[];
}

/** "Compared Concepts" and "Similarities and Contrasts" of a comparison concept. */
export function ComparisonBlocks({
  compares,
  links,
  traditionNames,
}: {
  compares: readonly LayerPartConcept[];
  links: readonly ComparisonLinkPart[];
  traditionNames: Readonly<Record<string, string>>;
}) {
  return (
    <div className="mt-8 flex flex-col gap-8" data-slot="panel-comparison">
      {compares.length > 0 ? (
        <section aria-labelledby="layer-compares">
          <h3 id="layer-compares" className="text-h3 text-ink">
            {titleCase(LAYER_TEXT.compared)}
          </h3>
          <ul className="mt-2 list-none">
            {compares.map((c) => (
              <li key={c.id} className="border-t border-rule py-2 first:border-t-0">
                <p className="text-dl-value font-medium text-ink">{titleCase(c.title)}</p>
                <p className="text-credit">
                  <TypeAndTradition type={c.type} traditionSlug={c.traditionSlug} traditionNames={traditionNames} />
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {links.length > 0 ? (
        <section aria-labelledby="layer-similarities">
          <h3 id="layer-similarities" className="text-h3 text-ink">
            {titleCase(LAYER_TEXT.similarities)}
          </h3>
          <ul className="mt-2 list-none">
            {links.map((l) => (
              <li key={l.relationshipId} className="border-t border-rule py-3 first:border-t-0">
                <p className="text-dl-value text-ink">
                  <span className="font-medium">{titleCase(l.aTitle)}</span>
                  <span className="text-ink-3"> {l.type === "SIMILAR_TO" ? LAYER_TEXT.similarTo : LAYER_TEXT.contrastsWith} </span>
                  <span className="font-medium">{titleCase(l.bTitle)}</span>
                </p>
                {l.explanation ? <p className="mt-1 text-[0.9375rem] leading-6 text-ink-2">{l.explanation}</p> : null}
                {l.statedBy.length > 0 ? (
                  <p className="text-credit mt-1">
                    {SHEET_TEXT.statedBy} {l.statedBy.join("; ")}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
