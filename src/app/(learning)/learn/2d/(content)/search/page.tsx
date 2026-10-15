import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { TraditionName } from "@/components/knowledge/tradition-marker";
import { LearningPage } from "@/components/shell/gates";
import type { ConceptRef } from "@/features/knowledge/read/view";
import { PAGE_TITLES } from "@/features/learning-2d/navigation";
import { href2d, pageId2d } from "@/features/learning-2d/routes";
import { learning2dContext, loadCatalogue, runSearch } from "@/features/learning-2d/server/data";
import { CONCEPT_TYPE_LABELS } from "@/features/learning/labels";
import { ROW_LINK_CLASS } from "@/features/learning-2d/ui/concept-list";
import { Crumbs } from "@/features/learning-2d/ui/crumbs";
import { NavigationPhase } from "@/features/learning-2d/ui/exposure";
import { PageHeading } from "@/features/learning-2d/ui/page-heading";
import { PageColumn, PageIntro, PageSkeleton, SectionHeading } from "@/features/learning-2d/ui/page-layout";
import { PageTelemetry } from "@/features/learning-2d/ui/page-telemetry";
import { SearchTelemetry } from "@/features/learning-2d/ui/search-telemetry";
import { TrackedLink } from "@/features/learning-2d/ui/tracked-link";
import { titleCase } from "@/lib/text/title-case";

export const metadata: Metadata = { title: "Search" };

/** May block: the learning gate verifies the participant session per navigation (see the layout). */
export const instant = false;

/**
 * Search results. Exists only when the study enables search (`ctx.features.search`, off in study
 * builds of both conditions, DR-019); otherwise this route is a 404 and no search control is
 * rendered. Results are grouped by tradition in the canonical order (as on the index and the
 * comparisons page), the ranking kept within each tradition.
 */
export default function SearchPage({ searchParams }: PageProps<"/learn/2d/search">) {
  return (
    <LearningPage condition="2d">
      <Suspense fallback={<PageSkeleton />}>
        <Search searchParams={searchParams} />
      </Suspense>
    </LearningPage>
  );
}

async function Search({ searchParams }: { searchParams: PageProps<"/learn/2d/search">["searchParams"] }) {
  const result = await learning2dContext();
  if (!result.ok) return null;
  const { q } = await searchParams;
  const query = typeof q === "string" ? q : "";
  const [data, catalogue] = await Promise.all([runSearch(result.ctx, query), loadCatalogue(result.ctx)]);
  if (!data) notFound();
  const pageId = pageId2d.search();
  const groups = new Map<string | null, ConceptRef[]>();
  for (const c of data.hits) groups.set(c.traditionSlug, [...(groups.get(c.traditionSlug) ?? []), c]);
  const names = new Map(catalogue.traditions.map((t) => [t.slug, t.name]));
  return (
    <PageColumn>
      <PageTelemetry pageId={pageId} />
      <NavigationPhase surface="search" context={{ roomOrPageId: pageId }} />
      <SearchTelemetry key={data.query} queryLength={data.query.length} resultCount={data.hits.length} />
      <Crumbs items={[{ label: PAGE_TITLES.catalogue, href: href2d.catalogue() }, { label: PAGE_TITLES.search }]} />
      <PageIntro
        eyebrow="Search"
        title={<PageHeading verbatim={data.query ? `“${data.query}”` : undefined}>{data.query ? "Results for" : PAGE_TITLES.search}</PageHeading>}
        lead={data.query.length >= 2 ? `${data.hits.length} ${data.hits.length === 1 ? "concept" : "concepts"} found.` : "Use Search in the top bar, with at least two characters."}
      />
      <div className="flex flex-col gap-12">
        {[...groups.entries()].map(([slug, hits]) => {
          const id = `results-${slug ?? "shared"}`;
          return (
            <section key={slug ?? "shared"} aria-labelledby={id}>
              <SectionHeading id={id}>{slug ? <TraditionName traditionKey={slug}>{titleCase(names.get(slug) ?? slug)}</TraditionName> : "Across traditions"}</SectionHeading>
              <ol data-slot="concept-list" className="mt-2 flex flex-col">
                {hits.map((c) => (
                  <li key={c.id} className="flex flex-col items-start pb-2">
                    <TrackedLink href={href2d.concept(c.slug)} pageId={pageId} via="search" item={{ conceptId: c.id, elementKind: "search_result" }} className={`${ROW_LINK_CLASS} py-3`}>
                      {titleCase(c.title)}
                    </TrackedLink>
                    <span className="text-credit -mt-2">{CONCEPT_TYPE_LABELS[c.type]}</span>
                  </li>
                ))}
              </ol>
            </section>
          );
        })}
      </div>
    </PageColumn>
  );
}
