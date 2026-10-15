/**
 * ClaimList (DESIGN.md 9.10): the numbered claims of a concept, the same component in the 2D
 * concept page and the 3D information panel (it replaces the 2D claim list and the inline claim
 * markup of the panel).
 *
 * `<ol>` of claims. Each `<li>`: the hanging number (`text-claim-number`, right-aligned in the
 * 2.25rem hang, `aria-hidden` because the list already numbers for assistive technology), the claim
 * `<p class="text-reading">`, one `CitationNote` per citation (every claim its own notes, also for
 * a repeated source), then the figure anchored to that claim, if any. 24 px between claims with a
 * 1 px `--rule` between them. Server-safe: the notes and figures are client islands.
 */
import { claimNumber } from "@/components/brand/numbering";
import { CitationNote } from "@/components/citations/citation-disclosure";
import type { ClaimView, KnowledgeFigureData } from "@/features/knowledge/read/view";
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
  className?: string;
}

export function ClaimList({ conceptId, claims, figures = [], figureOffset = 0, className }: ClaimListProps) {
  if (claims.length === 0) return <p className="text-reading text-ink-3">{SHEET_TEXT.noClaims}</p>;
  // Figures in claim order, numbered per concept view ("Fig. n").
  const placed = [...figures].filter((f) => f.anchorClaimIndex >= 0 && f.anchorClaimIndex < claims.length).sort((a, b) => a.anchorClaimIndex - b.anchorClaimIndex);
  const byClaim = new Map<number, { figure: KnowledgeFigureData; number: number }>();
  placed.forEach((f, i) => {
    if (!byClaim.has(f.anchorClaimIndex)) byClaim.set(f.anchorClaimIndex, { figure: f, number: figureOffset + i + 1 });
  });
  return (
    <ol aria-label={SHEET_TEXT.claimsLabel} data-slot="claims" className={cn("list-none", className)}>
      {claims.map((claim, i) => {
        const fig = byClaim.get(i);
        return (
          <li key={claim.id} data-claim-id={claim.id} className="grid grid-cols-[var(--hang)_minmax(0,1fr)] border-t border-rule py-6 first:border-t-0 first:pt-0 last:pb-0">
            <span aria-hidden="true" className="text-claim-number pr-3">
              {claimNumber(i)}
            </span>
            <div className="min-w-0">
              <p className="text-reading text-ink">{claim.text}</p>
              {claim.evidence.length > 0 ? (
                <div className="flex flex-col">
                  {claim.evidence.map((c, j) => (
                    <CitationNote key={`${c.id}-${j}`} citation={c} conceptId={conceptId} claimIndex={claim.position} />
                  ))}
                </div>
              ) : null}
              {fig ? <KnowledgeFigure figure={fig.figure} number={fig.number} first={fig.number === figureOffset + 1} /> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
