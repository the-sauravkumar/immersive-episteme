/**
 * KnowledgeSheet (DESIGN.md 9.11): the ONE container of a concept in both conditions. The 2D page
 * places it centred in the page flow; the 3D information panel docks the same component. Nothing
 * about the sheet's DOM, type or surface depends on the placement (tests/unit/knowledge/
 * knowledge-components.test.tsx renders both and compares), apart from what the placement passes
 * into the reserved action slot (Close in 3D, empty in 2D).
 *
 * In order:
 *  1. Header row: the eyebrow ("Material · Step 3 of 9"), the `text-title` h1, and a reserved
 *     44 x 44 action slot at the top right, so the title wraps identically in both.
 *  2. The reading-progress bar (2 px ink on rule) directly under the header row.
 *  3. The metadata list: Local Terms, Tradition (neutral marker), Category, Status (badge).
 *  4. LayerTabs, when the concept has more than one layer.
 *  5. The field: running head "From the Sources", then the layer's content (ClaimList with figures
 *     and citation notes, comparison blocks).
 *  6. RelatedConcepts, at the end of the column.
 *  7. The pager.
 *
 * Surface: opaque `--ground`, no radius, shadow or blur. Width `min(39.25rem, 100%)`: the 34rem
 * measure plus the 2.25rem hang plus the sheet's own padding (16 px under 520 px, 24 px above),
 * which is also the page gutter, so the 2D column and the full-width 3D panel give the claims the
 * same measure at every width. Region semantics: `<section aria-labelledby>` on the h1.
 * Server-safe: the title, progress bar and layer tabs are client islands.
 */
import type { ReactNode } from "react";

import { TraditionName } from "@/components/knowledge/tradition-marker";
import { Badge } from "@/components/ui/badge";
import { CATEGORY_LABELS, CONCEPT_TYPE_LABELS, humanise, type KnowledgeLayerId } from "@/features/learning/labels";
import { SHEET_TEXT, stepOf } from "@/features/learning/strings";
import { titleCase } from "@/lib/text/title-case";
import type { ConceptType, KnowledgeCategoryCode } from "@/lib/validation/enums";

import { LayeredField, type FieldLayer, type LayeredFieldProps } from "./layer-tabs";
import { SheetProgress, SheetTitle } from "./sheet-parts";

/** The concept facts the sheet header and metadata show (both placements build it the same way). */
export interface SheetConcept {
  id: string;
  title: string;
  type: ConceptType;
  category: KnowledgeCategoryCode;
  localTerms: readonly string[];
  tradition: { slug: string; name: string } | null;
  verificationState: string;
}

export interface KnowledgeSheetProps {
  concept: SheetConcept;
  /** Process stages: the position in the tradition's sequence. */
  step?: { index: number; total: number } | null;
  /** Content of the reserved 44 x 44 action slot (3D: Close). */
  action?: ReactNode;
  /** The concept's layers; when absent, `children` is the field. */
  layers?: readonly FieldLayer[];
  /** Controlled layer selection (3D panel state). */
  layerValue?: KnowledgeLayerId;
  onLayerChange?(layer: KnowledgeLayerId): void;
  layerTelemetry?: LayeredFieldProps["telemetry"];
  children?: ReactNode;
  /** RelatedConcepts, rendered at the end of the column. */
  related?: ReactNode;
  /** Pager, rendered last. */
  pager?: ReactNode;
  /** BCP 47 tag of the local terms when the content declares one. */
  localTermsLang?: string;
  /** Move focus to the h1 when the concept opens (default on; the CMS proof turns it off). */
  autoFocusTitle?: boolean;
  /**
   * Heading level of the concept title: h1 in both learning conditions (the one h1 of a concept
   * view, 9.11); the CMS proof passes "h2" so the editor page keeps a single h1.
   */
  titleAs?: "h1" | "h2";
  /**
   * Where the sheet is placed. It changes NOTHING in the DOM: the reading-progress bar finds its
   * scroll container itself. Kept so call sites state their placement explicitly.
   */
  placement?: "page" | "panel";
}

export const sheetTitleId = (conceptId: string) => `sheet-title-${conceptId}`;

export function KnowledgeSheet({
  concept,
  step,
  action,
  layers,
  layerValue,
  onLayerChange,
  layerTelemetry,
  children,
  related,
  pager,
  localTermsLang,
  autoFocusTitle = true,
  titleAs = "h1",
}: KnowledgeSheetProps) {
  const titleId = sheetTitleId(concept.id);
  const eyebrow = [CONCEPT_TYPE_LABELS[concept.type], step ? stepOf(step.index, step.total) : null].filter(Boolean).join(" · ");
  const head = (
    <h2 id={`${titleId}-field`} className="text-eyebrow mb-4">
      {titleCase(SHEET_TEXT.fieldHeading)}
    </h2>
  );
  return (
    <section aria-labelledby={titleId} data-slot="knowledge-sheet" data-concept-id={concept.id} className="mx-auto w-full max-w-[39.25rem] bg-ground px-4 pt-6 pb-12 text-ink xs:px-6">
      <header className="grid grid-cols-[minmax(0,1fr)_2.75rem] items-start gap-x-3">
        <div className="min-w-0">
          <p className="text-eyebrow tabular-nums">{eyebrow}</p>
          <SheetTitle id={titleId} title={concept.title} focusKey={concept.id} autoFocus={autoFocusTitle} as={titleAs} />
        </div>
        <div data-slot="sheet-action" className="flex size-11 items-center justify-center">
          {action}
        </div>
      </header>
      <SheetProgress className="mt-4" />

      <dl aria-label={SHEET_TEXT.metaLabel} data-slot="sheet-meta" className="mt-6 grid grid-cols-1 gap-x-4 xs:grid-cols-[9rem_minmax(0,1fr)]">
        {concept.localTerms.length > 0 ? (
          <MetaRow label={SHEET_TEXT.meta.localTerms}>
            {concept.localTerms.map((t, i) => (
              <span key={i}>
                {i > 0 ? ", " : null}
                <span lang={localTermsLang}>{t}</span>
              </span>
            ))}
          </MetaRow>
        ) : null}
        {concept.tradition ? (
          <MetaRow label={SHEET_TEXT.meta.tradition}>
            <TraditionName traditionKey={concept.tradition.slug}>{concept.tradition.name}</TraditionName>
          </MetaRow>
        ) : null}
        <MetaRow label={SHEET_TEXT.meta.category}>{CATEGORY_LABELS[concept.category]}</MetaRow>
        <MetaRow label={SHEET_TEXT.meta.status}>
          <Badge variant="neutral">{humanise(concept.verificationState)}</Badge>
        </MetaRow>
      </dl>

      <div className="mt-8" data-slot="sheet-field">
        {layers && layers.length > 0 ? (
          <LayeredField layers={layers} value={layerValue} onValueChange={onLayerChange} head={head} telemetry={layerTelemetry} />
        ) : (
          <>
            {head}
            {children}
          </>
        )}
      </div>

      {related ? <div className="mt-12">{related}</div> : null}
      {pager ? <div className="mt-12">{pager}</div> : null}
    </section>
  );
}

function MetaRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="contents">
      <dt className="text-dl-label pt-1 xs:pt-0.5">{label}</dt>
      <dd className="text-dl-value mb-2 min-w-0 break-words xs:mb-1">{children}</dd>
    </div>
  );
}
