import { titleCase } from "@/lib/text/title-case";

export interface TraditionIndexData {
  slug: string;
  name: string;
  shortName: string;
  region: string | null;
}

export function TraditionIndex({ traditions }: { traditions: readonly TraditionIndexData[] }) {
  return (
    <ol data-slot="tradition-index" className="border-y-[1.5px] border-lime">
      {traditions.map((t, i) => (
        <li
          key={t.slug}
          data-tradition-key={t.slug}
          className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3 gap-y-1 border-b border-line py-4 last:border-b-0 md:grid-cols-[2.25rem_minmax(0,16rem)_minmax(0,1fr)_minmax(0,16rem)] md:items-baseline md:gap-x-6"
        >
          <span aria-hidden="true" className="t-b font-semibold tabular-nums text-lime-dim text-right text-left">
            {i + 1}
          </span>
          <h3 className="t-label text-lime">{titleCase(t.shortName)}</h3>
          <p className="t-b col-start-2 text-lime-dim md:col-start-auto">{t.name !== t.shortName ? t.name : ""}</p>
          <p className="t-b col-start-2 text-lime-dim md:col-start-auto">{t.region ?? ""}</p>
        </li>
      ))}
    </ol>
  );
}
