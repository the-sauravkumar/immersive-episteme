import type { ReactNode } from "react";
import { TraditionName } from "@/components/knowledge/tradition-marker";
import { CATEGORY_LABELS, type KnowledgeLayerId } from "@/features/learning/labels";
import { SHEET_TEXT, stepValue } from "@/features/learning/strings";
import { titleCase } from "@/lib/text/title-case";
import type { ConceptType, KnowledgeCategoryCode } from "@/lib/validation/enums";

import { LayeredField, type FieldLayer, type LayeredFieldProps } from "./layer-tabs";
import { SheetProgress, SheetTitle } from "./sheet-parts";

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
  step?: { index: number; total: number } | null;
  action?: ReactNode;
  layers?: readonly FieldLayer[];
  layerValue?: KnowledgeLayerId;
  onLayerChange?(layer: KnowledgeLayerId): void;
  layerTelemetry?: LayeredFieldProps["telemetry"];
  children?: ReactNode;
  references?: ReactNode;
  related?: ReactNode;
  localTermsLang?: string;
  autoFocusTitle?: boolean;
  titleAs?: "h1" | "h2";
  placement?: "page" | "panel";
}

const sheetTitleId = (conceptId: string) => `sheet-title-${conceptId}`;

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
  localTermsLang,
  autoFocusTitle = true,
  titleAs = "h1",
}: KnowledgeSheetProps) {
  const titleId = sheetTitleId(concept.id);
  const head = (
    <h2 id={`${titleId}-field`} className="t-h4 mb-6 text-lime">
      {titleCase(SHEET_TEXT.fieldHeading)}
    </h2>
  );
  return (
    <section aria-labelledby={titleId} data-slot="knowledge-sheet" data-concept-id={concept.id} className="mx-auto w-full max-w-[39.25rem] bg-vat px-4 pt-6 pb-12 text-lime xs:px-6">
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
    </section>
  );
}

function MetaRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="contents">
      <dt className="t-label pt-1 xs:pt-[3px]">{label}</dt>
      <dd className="t-b mb-2 min-w-0 break-words xs:mb-1">{children}</dd>
    </div>
  );
}
