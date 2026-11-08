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
  figures?: readonly KnowledgeFigureData[];
  figureOffset?: number;
  references?: "after" | "sheet";
  className?: string;
}

const referencesHeadingId = (conceptId: string) => `references-${conceptId}`;

export function ClaimList({ conceptId, claims, figures = [], figureOffset = 0, references = "after", className }: ClaimListProps) {
  if (claims.length === 0) return <p className="t-b text-lime-dim">{SHEET_TEXT.noClaims}</p>;
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
              <span aria-hidden="true" className="t-b font-semibold tabular-nums text-lime-dim text-right pr-3">
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

export function SheetReferences({ conceptId, claims }: { conceptId: string; claims: readonly Pick<ClaimView, "evidence">[] }) {
  return <ReferenceList sources={referencesOf(claims)} headingId={referencesHeadingId(conceptId)} />;
}
