/**
 * Pull-quote (DESIGN.md 11.2): a real cited claim from the dataset, set in Source Serif 4 at
 * 28 px with a 3 px `--madder` left bar (public pages only), followed by its source line and the
 * claim's real curator status. The claim is quoted exactly as stored; nothing is paraphrased.
 */
import { TraditionName } from "@/components/knowledge/tradition-marker";
import { Badge } from "@/components/ui/badge";
import { shortCitationLabel } from "@/features/knowledge/read/view";
import { humanise } from "@/features/learning/labels";
import type { FeaturedClaim } from "@/server/public/dataset-stats";
import { titleCase } from "@/lib/text/title-case";

export function PullQuote({ claim }: { claim: FeaturedClaim }) {
  return (
    <figure data-slot="pull-quote" className="flex flex-col gap-3 border-l-[3px] border-madder pl-5 hc:border-ink">
      <blockquote className="font-serif text-[1.75rem] leading-9 font-normal text-ink">{claim.text}</blockquote>
      <figcaption className="flex flex-col gap-2">
        <p className="text-source">
          Claim {claim.position + 1} of <TraditionName traditionKey={claim.traditionSlug}>{titleCase(claim.conceptTitle)}</TraditionName>
        </p>
        <p className="text-source">
          <span className="text-eyebrow mr-2">Source</span>
          {shortCitationLabel(claim.citation)}
        </p>
        <Badge variant="neutral">{humanise(claim.conceptState)}</Badge>
      </figcaption>
    </figure>
  );
}
