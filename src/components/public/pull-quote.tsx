import { TraditionName } from "@/components/knowledge/tradition-marker";
import { Badge } from "@/components/ui/badge";
import { shortCitationLabel } from "@/features/knowledge/read/view";
import { humanise } from "@/features/learning/labels";
import type { FeaturedClaim } from "@/server/public/dataset-stats";
import { titleCase } from "@/lib/text/title-case";

export function PullQuote({ claim }: { claim: FeaturedClaim }) {
  return (
    <figure data-slot="pull-quote" className="flex flex-col gap-3">
      <blockquote className="bg-vat-2 px-6 py-4 text-[1.75rem] leading-9 font-normal text-lime">
        <p className="-indent-[0.45em]">{`“${claim.text}”`}</p>
      </blockquote>
      <figcaption className="flex flex-col gap-2">
        <p className="t-s text-lime-dim">
          Claim {claim.position + 1} of <TraditionName traditionKey={claim.traditionSlug}>{titleCase(claim.conceptTitle)}</TraditionName>
        </p>
        <p className="t-s text-lime-dim">
          <span className="t-label mr-2">Source</span>
          {shortCitationLabel(claim.citation)}
        </p>
        <Badge variant="neutral">{humanise(claim.conceptState)}</Badge>
      </figcaption>
    </figure>
  );
}
