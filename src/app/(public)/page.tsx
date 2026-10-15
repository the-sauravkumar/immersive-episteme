/**
 * Public home (DESIGN.md 11.1). Full public character: the hero with Plate 1, Figure 1 "One
 * Knowledge Model, Two Conditions" with live counts, the traditions as equal plates, Table 1 of
 * the dataset, and the institution strip (hidden while its fields are null).
 *
 * Every number on this page is read from the database at request time inside <Suspense>
 * (cacheComponents); each fallback is the same layout without numbers, never an invented value.
 * The static parts (h1, Figure 1's frame, the comparison table) prerender into the shell.
 */
import Link from "next/link";
import { Suspense } from "react";

import { chartFigureLabel } from "@/components/brand/numbering";
import { DatasetTable } from "@/components/public/dataset-table";
import { FigureOneCountList, FigureOneDiagram } from "@/components/public/figure-one";
import { IdenticalDiffersTable } from "@/components/public/identical-differs-table";
import { InstitutionStrip } from "@/components/public/institution-strip";
import { INSTITUTION } from "@/config/institution";
import { ClaimSpecimen, Plate } from "@/components/public/plate";
import { TraditionPlates } from "@/components/public/tradition-plates";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { countWord, getDatasetStats, getFeaturedClaim } from "@/server/public/dataset-stats";
import { titleCase } from "@/lib/text/title-case";

const DECK_TAIL = "as one cited body of knowledge, learned two ways.";

/** "A, B and C". */
function listOf(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

async function Deck() {
  const stats = await getDatasetStats();
  if (!stats || stats.traditions.length === 0) return <DeckFallback />;
  const names = stats.traditions.map((t) => t.shortName);
  const lead = countWord(names.length);
  return (
    <p className="text-deck max-w-[36rem]" data-live="true">
      {`${lead.charAt(0).toUpperCase()}${lead.slice(1)} traditions of Indian hand-block printing, ${listOf(names)}, ${DECK_TAIL}`}
    </p>
  );
}

function DeckFallback() {
  return <p className="text-deck max-w-[36rem]">{`Traditions of Indian hand-block printing ${DECK_TAIL}`}</p>;
}

async function SpecimenPlate() {
  const claim = await getFeaturedClaim();
  return (
    <Plate
      number={1}
      caption={claim ? "A claim from the dataset, set as learners read it, with the verbatim passage of its source." : "A claim from the dataset with its source record."}
      credit={claim ? "Typographic specimen: the claim and quotation are the dataset's own text; no photograph." : "Typographic specimen; no photograph."}
    >
      {claim ? <ClaimSpecimen claim={claim} /> : <div className="h-full bg-sunk" />}
    </Plate>
  );
}

async function FigureOneLive() {
  // Sources = the distinct sources the claims cite, the same definition as Table 1's column, so the
  // page never shows two different source totals.
  const stats = await getDatasetStats();
  const counts = stats ? { traditions: stats.totals.traditions, concepts: stats.totals.concepts, relationships: stats.totals.relationships, sources: stats.totals.sourcesCited } : null;
  return (
    <>
      <FigureOneDiagram counts={counts} />
      <FigureOneCountList counts={counts} />
    </>
  );
}

async function TraditionsLive() {
  const stats = await getDatasetStats();
  if (!stats || stats.traditions.length === 0) return <TraditionsFallback />;
  return (
    <section aria-labelledby="traditions-heading" className="flex flex-col gap-8">
      <SectionHead id="traditions-heading" title={`${countWord(stats.traditions.length)} Traditions`} />
      <TraditionPlates traditions={stats.traditions} />
    </section>
  );
}

function TraditionsFallback() {
  return (
    <section aria-labelledby="traditions-heading" className="flex flex-col gap-8">
      <SectionHead id="traditions-heading" title="The Traditions" />
      <div className="aspect-[3/1] w-full bg-sunk" />
    </section>
  );
}

async function DatasetLive() {
  const stats = await getDatasetStats();
  if (!stats) return <p className="text-body text-ink-2">The dataset counts could not be read just now.</p>;
  return <DatasetTable stats={stats} number={1} />;
}

/**
 * Public section head: 2 px madder rule above, display-2 h2 in Title Case. No eyebrow: figure and
 * table numbers live in their captions (9.9, 10), so Figure 1 is numbered once.
 */
function SectionHead({ id, title }: { id: string; title: string }) {
  return (
    <div className="flex max-w-[48rem] flex-col gap-2 border-t-2 border-madder pt-4 hc:border-ink">
      <h2 id={id} className="text-h2 text-ink md:text-display-2">
        {titleCase(title)}
      </h2>
    </div>
  );
}

const CONDITIONS = [
  {
    key: "2d",
    title: "Conventional Pages",
    description: "The knowledge model as pages: each concept a column of numbered claims, each claim with its source.",
  },
  {
    key: "immersive",
    title: "Immersive Museum",
    description: "The same knowledge model as a walkable museum: each tradition a wing, its sections rooms, its concepts exhibits.",
  },
] as const;

export default function HomePage() {
  return (
    <div className="flex flex-col gap-24 max-xs:gap-16">
      {/* 1. Hero: columns 1-7 text, 8-12 Plate 1; stacked under 1024 px with the plate after the deck,
          centred in the column so no 270 px band sits beside it at tablet widths. */}
      <section aria-labelledby="home-title" className="grid gap-12 lg:grid-cols-12 lg:gap-x-6">
        <div className="flex flex-col gap-6 lg:col-span-7 lg:self-center">
          <p className="text-eyebrow text-ochre hc:text-ink">A Research Platform</p>
          <h1 id="home-title" className="text-display-1 text-ink">
            Immersive Episteme
          </h1>
          <Suspense fallback={<DeckFallback />}>
            <Deck />
          </Suspense>
          <div className="flex flex-col gap-3 xs:flex-row">
            <Button asChild className="xs:w-48">
              <Link href="/explore">Explore the demo</Link>
            </Button>
            <Button asChild variant="outline" className="xs:w-48">
              <Link href="/about#method">Read the method</Link>
            </Button>
          </div>
        </div>
        <div className="mx-auto w-full max-w-[28rem] lg:col-span-5 lg:max-w-none">
          <Suspense
            fallback={
              <Plate number={1} caption="A claim from the dataset with its source record." credit="Typographic specimen; no photograph.">
                <div className="h-full bg-sunk" />
              </Plate>
            }
          >
            <SpecimenPlate />
          </Suspense>
        </div>
      </section>

      {/* 2. Figure 1, then its text equivalent: the two conditions, and what is identical. */}
      <section aria-labelledby="conditions-heading" className="flex flex-col gap-8">
        <SectionHead id="conditions-heading" title="One Knowledge Model, Two Conditions" />
        <figure className="flex flex-col gap-4">
          <Suspense fallback={<FigureOneDiagram counts={null} />}>
            <FigureOneLive />
          </Suspense>
          <figcaption className="text-caption max-w-[48rem]">
            <span className="font-semibold text-madder hc:text-ink">{chartFigureLabel(1)}.</span> One knowledge model, with its live counts, compiled into two
            learning conditions of equal weight: conventional pages and an immersive museum.
          </figcaption>
        </figure>
        <ul className="grid gap-6 md:grid-cols-2" aria-label="The two conditions">
          {CONDITIONS.map((c) => (
            <li key={c.key} className="flex">
              {/* Title, reserved description, action. No schematic: Figure 1 above already draws both miniatures. */}
              <Card parallel className="w-full">
                <CardHeader>
                  <CardTitle>
                    <h3>{titleCase(c.title)}</h3>
                  </CardTitle>
                  <CardDescription>{c.description}</CardDescription>
                </CardHeader>
                <CardFooter>
                  <Link
                    href="/explore"
                    className="text-ui inline-flex min-h-11 items-center text-indigo underline decoration-1 underline-offset-[3px] transition-[text-decoration-thickness] duration-(--dur-1) hover:text-indigo-hover hover:decoration-2"
                  >
                    Try it in the demo
                  </Link>
                </CardFooter>
              </Card>
            </li>
          ))}
        </ul>
        <div className="max-w-[48rem]">
          <IdenticalDiffersTable />
        </div>
      </section>

      {/* 3. The traditions as equal plates, canonical order. */}
      <Suspense fallback={<TraditionsFallback />}>
        <TraditionsLive />
      </Suspense>

      {/* 4. Dataset at a glance. */}
      <section aria-labelledby="dataset-heading" className="flex flex-col gap-8">
        <SectionHead id="dataset-heading" title="Dataset at a Glance" />
        <div className="max-w-[48rem]">
          <Suspense fallback={<p className="text-body text-ink-2">Reading the dataset counts…</p>}>
            <DatasetLive />
          </Suspense>
        </div>
      </section>

      {/* 5. Institution strip: renders nothing while every field is null (DESIGN.md 13). */}
      <InstitutionStrip institution={INSTITUTION} />
    </div>
  );
}
