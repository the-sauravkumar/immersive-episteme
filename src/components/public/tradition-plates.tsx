/**
 * The traditions as equal plates (DESIGN.md 11.1 "Six Traditions", 12.3 rules 12-13). Public home.
 *
 * A 3 x 2 grid (2 columns from 520 px, 1 below) in the canonical alphabetical order. Each plate
 * has the same parts and the same weight: a 3:2 slot, the neutral marker, the short display name
 * in Source Serif 4 600 24 px (a two-line title zone, so a one-line name leaves no gap), the region
 * in `text-eyebrow`, then the dataset's full name in `text-credit` (last, so its length never
 * moves the aligned rows above it).
 *
 * All-or-none photographs: photographs are shown only when EVERY tradition has an approved,
 * licensed image; otherwise every plate shows the same typographic plate (the short name on
 * `--sunk`). There is never a mix of photographs and typographic plates.
 */
import Image from "next/image";

import { TraditionMarker } from "@/components/knowledge/tradition-marker";
import { titleCase } from "@/lib/text/title-case";

export interface PlatePhoto {
  src: string;
  width: number;
  height: number;
  alt: string;
  credit: string;
}

export interface TraditionPlateData {
  slug: string;
  name: string;
  shortName: string;
  region: string | null;
  photo?: PlatePhoto | null;
}

/** True only when every tradition has a photograph (the all-or-none rule). */
export function photosForAll(traditions: readonly TraditionPlateData[]): boolean {
  return traditions.length > 0 && traditions.every((t) => !!t.photo);
}

export function TraditionPlates({ traditions }: { traditions: readonly TraditionPlateData[] }) {
  const photos = photosForAll(traditions);
  return (
    <ul data-slot="tradition-plates" data-plates={photos ? "photo" : "typographic"} className="grid gap-x-6 gap-y-10 xs:grid-cols-2 lg:grid-cols-3">
      {traditions.map((t) => (
        <li key={t.slug} data-tradition-key={t.slug} className="row-span-3 grid grid-rows-subgrid gap-3">
          <div className="relative aspect-[3/2] w-full overflow-hidden border border-rule bg-sunk">
            {photos && t.photo ? (
              <Image
                src={t.photo.src}
                width={t.photo.width}
                height={t.photo.height}
                alt={t.photo.alt}
                sizes="(min-width: 1024px) 400px, (min-width: 520px) 50vw, 100vw"
                className="h-full w-full object-cover"
              />
            ) : (
              // Typographic plate: the name set on the sunk mat. Decorative (the heading below names it).
              <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center p-4 text-center font-serif text-[1.75rem] leading-9 text-ink-2">
                {t.shortName}
              </span>
            )}
          </div>
          {/* Three subgrid rows (plate, title, notes): the title row takes the height of the tallest
              title in its visual row, so the eyebrows of a row share one top without reserving a
              blank two-line zone where no title wraps (and none in the single column at 390 px). */}
          <h3 className="font-serif text-2xl leading-8 font-semibold text-ink">
            <TraditionMarker traditionKey={t.slug} />
            {titleCase(t.shortName)}
          </h3>
          <div className="flex flex-col gap-3">
            {t.region ? <p className="text-eyebrow">{t.region}</p> : null}
            {t.name !== t.shortName ? <p className="text-credit">{t.name}</p> : null}
            {photos && t.photo ? <p className="text-credit">{t.photo.credit}</p> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
