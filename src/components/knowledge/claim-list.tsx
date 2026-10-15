/**
 * ClaimList (DESIGN.md 9.10): the numbered claims of a concept, the same component in the 2D
 * concept page and the 3D information panel (it replaces the 2D claim list and the inline claim
 * markup of the panel).
 *
 * `<ol>` of claims. Each `<li>`: the hanging number (`text-claim-number`, right-aligned in the
 * 2.25rem hang, `aria-hidden` because the list already numbers for assistive technology), then the
 * shared `CitedClaim`: the claim `<p class="text-reading">` ending in one quiet numbered marker
 * "[n]" per citation, and the records those markers expand in place (DR-022 Addendum A); then the
 * figure anchored to that claim, if any. The marker numbers come from `referencesOf` over these
 * claims, so they match the ReferenceList of the same claims. 32 px of space between claims and no
 * hairline (DR-022: rules are not the universal separator). Server-safe: the claims and figures are
 * client islands.
 *
 * References: by default the list is followed by its own `ReferenceList` (standalone use: the 2D
 * comparisons and tradition pages, practice, CMS). Inside a KnowledgeSheet the placement passes
 * `references="sheet"` and puts the same list in the sheet's `references` slot instead, at the end
 * of the field (identical in both conditions).
 */
import { CitedClaim } from "@/components/citations/citation-disclosure";
import { ReferenceList } from "@/components/citations/reference-list";
import { claimNumber } from "@/components/brand/numbering";
import { referencesOf, type ClaimView, type KnowledgeFigureData } from "@/features/knowledge/read/view";
import { SHEET_TEXT } from "@/features/learning/strings";
import { cn } from "@/lib/utils";

import { KnowledgeFigure } from "./knowledge-figure";

export interface ClaimListProps {
  conceptId: string;
  claims: readonly ClaimView[];
  /** Figures of this concept view, each rendered right after its anchor claim (at most one per claim). */
  figures?: readonly KnowledgeFigureData[];
  /** Figure numbering continues from here when a view holds several claim lists (default 0). */
  figureOffset?: number;
  /**
   * Where the deduplicated reference list goes: "after" this list (default, standalone use) or
   * "sheet" (the placement renders `SheetReferences` in the KnowledgeSheet's `references` slot).
   */
  references?: "after" | "sheet";
  className?: string;
}

/** The id of a claim list's reference heading (one list per concept view). */
export const referencesHeadingId = (conceptId: string) => `references-${conceptId}`;

export function ClaimList({ conceptId, claims, figures = [], figureOffset = 0, references = "after", className }: ClaimListProps) {
  if (claims.length === 0) return <p className="text-reading text-ink-3">{SHEET_TEXT.noClaims}</p>;
  // Figures in claim order, numbered per concept view ("Fig. n").
  const placed = [...figures].filter((f) => f.anchorClaimIndex >= 0 && f.anchorClaimIndex < claims.length).sort((a, b) => a.anchorClaimIndex - b.anchorClaimIndex);
  const byClaim = new Map<number, { figure: KnowledgeFigureData; number: number }>();
  placed.forEach((f, i) => {
    if (!byClaim.has(f.anchorClaimIndex)) byClaim.set(f.anchorClaimIndex, { figure: f, number: figureOffset + i + 1 });
  });
  const sources = referencesOf(claims);
  const numberOf = new Map(sources.map((s, i) => [s.id, i + 1]));
  return (
    <>
      <ol aria-label={SHEET_TEXT.claimsLabel} data-slot="claims" className={cn("list-none", className)}>
        {claims.map((claim, i) => {
          const fig = byClaim.get(i);
          return (
            <li key={claim.id} data-claim-id={claim.id} className="grid grid-cols-[var(--hang)_minmax(0,1fr)] pb-8 last:pb-0">
              <span aria-hidden="true" className="text-claim-number pr-3">
                {claimNumber(i)}
              </span>
              <div className="min-w-0">
                <CitedClaim text={claim.text} citations={claim.evidence.map((c) => ({ citation: c, number: numberOf.get(c.id)! }))} conceptId={conceptId} claimIndex={claim.position} />
                {fig ? <KnowledgeFigure figure={fig.figure} number={fig.number} first={fig.number === figureOffset + 1} /> : null}
              </div>
            </li>
          );
        })}
      </ol>
      {references === "after" ? <ReferenceList className="mt-8" sources={sources} headingId={referencesHeadingId(conceptId)} /> : null}
    </>
  );
}

/**
 * The reference list of a concept view for the KnowledgeSheet's `references` slot (both
 * placements build it from the same claims they pass to ClaimList with `references="sheet"`).
 */
export function SheetReferences({ conceptId, claims }: { conceptId: string; claims: readonly Pick<ClaimView, "evidence">[] }) {
  return <ReferenceList sources={referencesOf(claims)} headingId={referencesHeadingId(conceptId)} />;
}
