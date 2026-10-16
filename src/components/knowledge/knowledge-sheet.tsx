/**
 * KnowledgeSheet (DESIGN.md 9.11): the ONE container of a concept in both conditions. The 2D page
 * places it in the page flow; the 3D information panel docks the same component. Nothing
 * about the sheet's DOM, type or surface depends on the placement (tests/unit/knowledge/
 * knowledge-components.test.tsx renders both and compares), apart from what the placement passes
 * into the reserved action slot (Close in 3D, empty in 2D).
 *
 * In order:
 *  1. Header row: the `text-title` h1 and the action slot at the top right, holding Close in BOTH
 *     conditions (DR-021 decision 4, P32): the same `SheetCloseContent` in the same 44 px outline
 *     box (`SHEET_CLOSE_CLASS`), so the title wraps identically and the Tab path from the h1 is the
 *     same. 2D Close is a link back to the section view; 3D Close closes the panel. No eyebrow (DR-022).
 *  2. The metadata list (lean, DR-022 and the cognitive-load rule): Tradition (the name only),
 *     Category, Step ("3 of 9", process stages only), Local terms. Labels in sentence case. No
 *     Status row: the notice strip above the sheet already states the verification status of the
 *     content, so a second statement here only competed with the claims.
 *  3. The reading-progress bar (2 px ink on rule).
 *  4. LayerTabs, when the concept has more than one layer.
 *  5. The field: the h2 "From the Sources", then the layer's content (ClaimList with figures and
 *     numbered citation markers, comparison blocks).
 *  6. The ReferenceList of the claims shown (the `references` slot, DR-022 Addendum A): every
 *     cited source once, under the number its markers carry.
 *  7. RelatedConcepts.
 *  8. The pager.
 *
 * Surface: opaque `--ground`, no radius, shadow or blur. Width `min(39.25rem, 100%)`: the 34rem
 * measure plus the 2.25rem hang plus the sheet's own padding (16 px under 520 px, 24 px above),
 * which is also the page gutter, so the 2D column and the full-width 3D panel give the claims the
 * same measure at every width. Region semantics: `<section aria-labelledby>` on the h1.
 * Server-safe: the title, progress bar and layer tabs are client islands.
 */
import { X } from "lucide-react";
import type { ReactNode } from "react";

import { buttonVariants } from "@/components/ui/button";
import { TraditionName } from "@/components/knowledge/tradition-marker";
import { CATEGORY_LABELS, type KnowledgeLayerId } from "@/features/learning/labels";
import { SHEET_TEXT, stepValue } from "@/features/learning/strings";
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
  /** Not shown in the sheet (the notice strip states it); kept so both placements pass the same facts. */
  verificationState: string;
}

export interface KnowledgeSheetProps {
  concept: SheetConcept;
  /** Process stages: the position in the tradition's sequence. */
  step?: { index: number; total: number } | null;
  /** Content of the action slot: Close in both conditions (a link in 2D, a button in 3D). */
  action?: ReactNode;
  /** The concept's layers; when absent, `children` is the field. */
  layers?: readonly FieldLayer[];
  /** Controlled layer selection (3D panel state). */
  layerValue?: KnowledgeLayerId;
  onLayerChange?(layer: KnowledgeLayerId): void;
  layerTelemetry?: LayeredFieldProps["telemetry"];
  children?: ReactNode;
  /** The ReferenceList of the claims shown (`SheetReferences`), after the field. */
  references?: ReactNode;
  /** RelatedConcepts, rendered after the references. */
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
  references,
  related,
  pager,
  localTermsLang,
  autoFocusTitle = true,
  titleAs = "h1",
}: KnowledgeSheetProps) {
  const titleId = sheetTitleId(concept.id);
  const head = (
    <h2 id={`${titleId}-field`} className="text-h2 mb-6 text-ink">
      {titleCase(SHEET_TEXT.fieldHeading)}
    </h2>
  );
  return (
    <section aria-labelledby={titleId} data-slot="knowledge-sheet" data-concept-id={concept.id} className="mx-auto w-full max-w-[39.25rem] bg-ground px-4 pt-6 pb-12 text-ink xs:px-6">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4">
        <div className="min-w-0">
          <SheetTitle id={titleId} title={concept.title} focusKey={concept.id} autoFocus={autoFocusTitle} as={titleAs} />
        </div>
        <div data-slot="sheet-action" className="flex min-h-11 min-w-11 items-center justify-end">
          {action}
        </div>
      </header>
      <dl aria-label={SHEET_TEXT.metaLabel} data-slot="sheet-meta" className="mt-6 grid grid-cols-1 gap-x-4 xs:grid-cols-[9rem_minmax(0,1fr)]">
        {concept.tradition ? (
          <MetaRow label={SHEET_TEXT.meta.tradition}>
            <TraditionName traditionKey={concept.tradition.slug}>{titleCase(concept.tradition.name)}</TraditionName>
          </MetaRow>
        ) : null}
        <MetaRow label={SHEET_TEXT.meta.category}>{CATEGORY_LABELS[concept.category]}</MetaRow>
        {step ? (
          <MetaRow label={SHEET_TEXT.meta.step}>
            <span className="tabular-nums">{stepValue(step.index, step.total)}</span>
          </MetaRow>
        ) : null}
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
      </dl>
      <SheetProgress className="mt-4" />

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

      {references ? <div className="mt-12">{references}</div> : null}
      {related ? <div className="mt-12">{related}</div> : null}
      {pager ? <div className="mt-12">{pager}</div> : null}
    </section>
  );
}

/**
 * The class of the sheet's Close control (link in 2D, button in 3D): the outline button, 44 px,
 * with a visible label, the same box in both conditions (P32).
 */
export const SHEET_CLOSE_CLASS = buttonVariants({ variant: "outline", className: "px-4 no-underline" });

/** What the Close control shows, identical in both conditions: the X glyph and the word "Close". */
export function SheetCloseContent() {
  return (
    <>
      <X aria-hidden="true" />
      {SHEET_TEXT.close}
    </>
  );
}

function MetaRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="contents">
      <dt className="text-label pt-1 xs:pt-[3px]">{label}</dt>
      <dd className="text-value mb-2 min-w-0 break-words xs:mb-1">{children}</dd>
    </div>
  );
}
