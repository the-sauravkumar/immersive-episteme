/**
 * The traditions as an index of equal rows (DESIGN.md 10.1 "The six traditions", 12.3 rules
 * 12-13; DR-022). Public home.
 *
 * One row per tradition in the canonical alphabetical order, every row with the same parts and the
 * same weight: the number, the short name (Title Case, `text-h3`), the dataset's full name and the
 * region. No images (DR-020 keeps the V&A photographs off the home page), no counts, no boxes and
 * no marker: a typographic index, not a grid of cards.
 */
import { titleCase } from "@/lib/text/title-case";

export interface TraditionIndexData {
  slug: string;
  name: string;
  shortName: string;
  region: string | null;
}

export function TraditionIndex({ traditions }: { traditions: readonly TraditionIndexData[] }) {
  return (
    <ol data-slot="tradition-index" className="border-y-[1.5px] border-ink">
      {traditions.map((t, i) => (
        <li
          key={t.slug}
          data-tradition-key={t.slug}
          className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3 gap-y-1 border-b border-rule py-4 last:border-b-0 md:grid-cols-[2.25rem_minmax(0,16rem)_minmax(0,1fr)_minmax(0,16rem)] md:items-baseline md:gap-x-6"
        >
          <span aria-hidden="true" className="text-claim-number text-left">
            {i + 1}
          </span>
          <h3 className="text-h3 text-ink">{titleCase(t.shortName)}</h3>
          <p className="text-body col-start-2 text-ink-2 md:col-start-auto">{t.name !== t.shortName ? t.name : ""}</p>
          <p className="text-body col-start-2 text-ink-2 md:col-start-auto">{t.region ?? ""}</p>
        </li>
      ))}
    </ol>
  );
}
