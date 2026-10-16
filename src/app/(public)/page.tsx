/**
 * Public home (DESIGN.md 10.1, DR-022). In order:
 *  1. the title block, left-aligned on columns 1 to 7: the h1 in Anek Latin `text-display-1`, the
 *     deck, ONE primary action ("Explore the demo") and a text link ("Read the method"). No
 *     eyebrow and no hero card (the "headline + two buttons + card" formula). Beside it on lg and
 *     up, columns 8 to 12: Plate 1, the plan of the compiled demo museum drawn by the 3D plan's
 *     own code, never taller than the title block (DR-058, amends
 *     DR-022 for this block only: data, not decoration). Hidden below lg;
 *  2. Figure 1, "One Knowledge Model, Two Conditions", full grid width on one indigo plate with live
 *     counts: the single place where the public pages spend their boldness. Static. Its text
 *     equivalents follow: the count list, the two conditions as text and the booktabs table;
 *  3. the six traditions as an index of equal rows, without images (DR-020);
 *  4. Table 1, the dataset counts;
 *  5. the latest parity run, or "No parity run recorded yet";
 *  6. the institution strip (hidden while its fields are null).
 *
 * Every number on this page is read from the database at request time inside <Suspense>
 * (cacheComponents); each fallback is the same layout without numbers, never an invented value.
 * The static parts (h1, Figure 1's frame, the comparison table) prerender into the shell.
 */
import Link from "next/link";
import { Suspense } from "react";

import { chartFigureLabel } from "@/components/brand/numbering";
import { EquivalenceMonitor } from "@/components/parity/equivalence-monitor";
import { DatasetTable } from "@/components/public/dataset-table";
import { FigureOneCountList, FigureOneDiagram } from "@/components/public/figure-one";
import { IdenticalDiffersTable } from "@/components/public/identical-differs-table";
import { InstitutionStrip } from "@/components/public/institution-strip";
import { MuseumPlanPlate, MuseumPlanPlateFrame } from "@/components/public/museum-plan-plate";
import { TraditionIndex } from "@/components/public/tradition-plates";
import { Button } from "@/components/ui/button";
import { INSTITUTION } from "@/config/institution";
import { countWord, getDatasetStats, getInterfaceParityReport } from "@/server/public/dataset-stats";
import { titleCase } from "@/lib/text/title-case";

const DECK_TAIL = "as one cited body of knowledge, learned two ways.";

const LINK =
  "text-ui inline-flex min-h-11 items-center text-indigo underline decoration-1 underline-offset-[0.2em] transition-[text-decoration-thickness] duration-(--dur-1) hover:text-indigo-hover hover:decoration-2";

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
      <SectionHead id="traditions-heading" title={`The ${countWord(stats.traditions.length)} Traditions`} />
      <TraditionIndex traditions={stats.traditions} />
    </section>
  );
}

function TraditionsFallback() {
  return (
    <section aria-labelledby="traditions-heading" className="flex flex-col gap-8">
      <SectionHead id="traditions-heading" title="The Traditions" />
      <p className="text-body text-ink-2">The traditions are read from the database when the page loads.</p>
    </section>
  );
}

async function DatasetLive() {
  const stats = await getDatasetStats();
  if (!stats) return <p className="text-body text-ink-2">The dataset counts could not be read just now.</p>;
  return <DatasetTable stats={stats} number={1} />;
}

async function ParityLive() {
  const report = await getInterfaceParityReport();
  return <EquivalenceMonitor interfaceParity={report} tone="neutral" numbers={{ interface: 2 }} />;
}

/**
 * Public section head: Anek Latin `text-display-2` h2 in Title Case, set off by space, not a rule
 * (DR-022). No eyebrow: figure and table numbers live in their captions, so Figure 1 is numbered
 * once.
 */
function SectionHead({ id, title, label }: { id: string; title: string; label?: string }) {
  return (
    <div className="flex max-w-[56rem] flex-wrap items-baseline gap-x-4 gap-y-1">
      {label ? <span className="text-label tabular-nums">{label}</span> : null}
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
      {/* 1. Title block on columns 1-7, left-aligned; Plate 1 on columns 8-12 from lg (DR-058). */}
      <section aria-labelledby="home-title" className="grid lg:grid-cols-12 lg:grid-rows-[auto_auto] lg:gap-x-6">
        <div className="flex flex-col gap-6 pt-4 lg:col-span-7 lg:col-start-1 lg:row-start-1">
          <h1 id="home-title" className="text-display-1 text-ink">
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
        <Suspense fallback={<MuseumPlanPlateFrame plan={null} />}>
          <MuseumPlanPlate />
        </Suspense>
      </section>

      {/* 2. Figure 1 on the indigo plate, then its text equivalents. */}
      <section aria-labelledby="conditions-heading" className="flex flex-col gap-8">
        <SectionHead id="conditions-heading" label={chartFigureLabel(1)} title="One Knowledge Model, Two Conditions" />
        <figure className="flex flex-col gap-4">
          <Suspense fallback={<FigureOneDiagram counts={null} />}>
            <FigureOneLive />
          </Suspense>
          <figcaption className="text-caption max-w-[48rem]">
            <span className="font-bold text-ink">{chartFigureLabel(1)}.</span> One knowledge model, with its live counts, compiled into two learning
            conditions of equal weight: conventional pages and an immersive museum.
          </figcaption>
        </figure>
        <ul className="grid gap-x-6 gap-y-8 md:grid-cols-2" aria-label="The two conditions">
          {CONDITIONS.map((c) => (
            <li key={c.key} className="flex flex-col gap-2 border-t-[1.5px] border-ink pt-4">
              <h3 className="text-h3 text-ink">{titleCase(c.title)}</h3>
              {/* Reserved three lines, so the two links share one baseline (parallel items). */}
              <p className="text-body min-h-[4.875rem] max-w-[34rem] text-ink-2">{c.description}</p>
              <p className="mt-auto">
                <Link href="/explore" className={LINK}>
                  Try it in the demo
                </Link>
              </p>
            </li>
          ))}
        </ul>
        <div className="max-w-[48rem]">
          <IdenticalDiffersTable />
        </div>
      </section>

      {/* 3. The traditions as an index of equal rows, canonical order. */}
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

      {/* 5. The latest parity run, from the stored report only. */}
      <section aria-labelledby="parity-heading" className="flex flex-col gap-8">
        <SectionHead id="parity-heading" title="Equivalence of the Two Conditions" />
        <div className="max-w-[56rem]">
          <Suspense fallback={<p className="text-body text-ink-2">Reading the latest parity run…</p>}>
            <ParityLive />
          </Suspense>
        </div>
      </section>

      {/* 6. Institution strip: renders nothing while every field is null (DESIGN.md 13). */}
      <InstitutionStrip institution={INSTITUTION} />
    </div>
  );
}
