import Link from "next/link";
import { Suspense } from "react";

import { chartFigureLabel } from "@/components/brand/numbering";
import { DatasetTable } from "@/components/public/dataset-table";
import { FigureOneCountList, FigureOneDiagram } from "@/components/public/figure-one";
import { InstitutionStrip } from "@/components/public/institution-strip";
import { TraditionIndex } from "@/components/public/tradition-plates";
import { Button } from "@/components/ui/button";
import { INSTITUTION } from "@/config/institution";
import { countWord, getDatasetStats, homeDeck } from "@/server/public/dataset-stats";
import { titleCase } from "@/lib/text/title-case";

const LINK =
  "t-label inline-flex min-h-11 items-center text-turmeric underline decoration-1 underline-offset-[0.2em] transition-[text-decoration-thickness] duration-(--dur-1) hover:text-turmeric-hi hover:decoration-2";

async function Deck() {
  const stats = await getDatasetStats();
  if (!stats || stats.traditions.length === 0) return <DeckFallback />;
  return (
    <p className="t-l text-lime-dim max-w-[36rem]" data-live="true">
      {homeDeck(stats.traditions)}
    </p>
  );
}

function DeckFallback() {
  return <p className="t-l text-lime-dim max-w-[36rem]">Traditions of Indian hand-block printing as one cited body of knowledge, and a study of how people learn a craft process from it.</p>;
}

async function FigureOneLive() {
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
      <SectionHead id="traditions-heading" title={`The ${countWord(stats.traditions.length)} Traditions`} />
      <TraditionIndex traditions={stats.traditions} />
    </section>
  );
}

function TraditionsFallback() {
  return (
    <section aria-labelledby="traditions-heading" className="flex flex-col gap-8">
      <SectionHead id="traditions-heading" title="The Traditions" />
      <p className="t-b text-lime-dim">The traditions are read from the database when the page loads.</p>
    </section>
  );
}

async function DatasetLive() {
  const stats = await getDatasetStats();
  if (!stats) return <p className="t-b text-lime-dim">The dataset counts could not be read just now.</p>;
  return <DatasetTable stats={stats} number={1} />;
}

function SectionHead({ id, title, label }: { id: string; title: string; label?: string }) {
  return (
    <div className="flex max-w-[56rem] flex-wrap items-baseline gap-x-4 gap-y-1">
      {label ? <span className="t-label tabular-nums">{label}</span> : null}
      <h2 id={id} className="t-h4 text-lime md:t-h2">
        {titleCase(title)}
      </h2>
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="flex flex-col gap-24 max-xs:gap-16">
      <section aria-labelledby="home-title" className="grid lg:grid-cols-12 lg:gap-x-6">
        <div className="flex flex-col gap-6 pt-4 lg:col-span-7 lg:col-start-1 lg:row-start-1">
          <h1 id="home-title" className="t-h1 text-lime">
            Immersive Episteme
          </h1>
          <Suspense fallback={<DeckFallback />}>
            <Deck />
          </Suspense>
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
            <Button asChild>
              <Link href="/explore">Explore the demo</Link>
            </Button>
            <Link href="/about#method" className={LINK}>
              Read the method
            </Link>
          </div>
        </div>
      </section>

      <section aria-labelledby="model-heading" className="flex flex-col gap-8">
        <SectionHead id="model-heading" label={chartFigureLabel(1)} title="One Cited Body of Knowledge" />
        <figure className="flex flex-col gap-4">
          <Suspense fallback={<FigureOneDiagram counts={null} />}>
            <FigureOneLive />
          </Suspense>
          <figcaption className="t-s text-lime-dim max-w-[48rem]">
            <span className="font-bold text-lime">{chartFigureLabel(1)}.</span> One knowledge model, with its live counts for every tradition in the
            dataset. The study&rsquo;s learning task, its questions and its tasks are compiled from it, and teach only the study traditions named above.
          </figcaption>
        </figure>
      </section>

      <Suspense fallback={<TraditionsFallback />}>
        <TraditionsLive />
      </Suspense>

      <section aria-labelledby="dataset-heading" className="flex flex-col gap-8">
        <SectionHead id="dataset-heading" title="Dataset at a Glance" />
        <div className="max-w-[48rem]">
          <Suspense fallback={<p className="t-b text-lime-dim">Reading the dataset counts…</p>}>
            <DatasetLive />
          </Suspense>
        </div>
      </section>

      <InstitutionStrip institution={INSTITUTION} />
    </div>
  );
}
