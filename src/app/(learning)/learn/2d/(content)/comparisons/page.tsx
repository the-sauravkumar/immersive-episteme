import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";

import { ClaimList } from "@/components/knowledge";
import { TraditionName } from "@/components/knowledge/tradition-marker";
import { LearningPage } from "@/components/shell/gates";
import type { ConceptRef } from "@/features/knowledge/read/view";
import { PAGE_TITLES } from "@/features/learning-2d/navigation";
import { href2d, pageId2d } from "@/features/learning-2d/routes";
import { learning2dContext, loadComparisons, type ComparisonsPageData } from "@/features/learning-2d/server/data";
import { ROW_LINK_CLASS } from "@/features/learning-2d/ui/concept-list";
import { Crumbs } from "@/features/learning-2d/ui/crumbs";
import { ExposureGroup, ExposureRegion } from "@/features/learning-2d/ui/exposure";
import { PageHeading } from "@/features/learning-2d/ui/page-heading";
import { PageColumn, PageIntro, PageSkeleton, SectionHeading } from "@/features/learning-2d/ui/page-layout";
import { PageTelemetry } from "@/features/learning-2d/ui/page-telemetry";
import { TrackedLink } from "@/features/learning-2d/ui/tracked-link";
import { exposureLayerOf } from "@/features/learning/labels";
import { titleCase } from "@/lib/text/title-case";

export const metadata: Metadata = { title: "Comparisons" };

/** May block: the learning gate verifies the participant session per navigation (see the layout). */
export const instant = false;

/**
 * Comparisons across traditions (DESIGN.md 11.5), at the sheet measure, one block per aspect (a
 * comparison concept): the aspect as an h2 with a link to its own page, then EVERY study tradition
 * in the canonical order as an h3 with the neutral marker, followed by the claims of the concepts
 * of that tradition the comparison compares, through the shared `ClaimList` with their figures and
 * `CitationNote`s, exactly the components the 3D Compare layer uses. No matrix cells and no
 * counts, so all three traditions get the same block, measure and weight.
 *
 * Above the blocks, a one-column list of the aspects (links only, no claim text, 44 px rows) jumps
 * to each block, so the long page stays easy to use; it is the 11.5 overview without the table,
 * which would scroll sideways at 390 px.
 *
 * Exposure (DR-015): every compared concept's claims are their own `ExposureRegion`, attributed to
 * that concept; the page's `ExposureGroup` lets exactly one region count at a time (the in-view
 * one with the most visible height), and counts navigation while none is in view.
 */
export default function ComparisonsPage() {
  return (
    <LearningPage condition="2d">
      <Suspense fallback={<PageSkeleton />}>
        <Comparisons />
      </Suspense>
    </LearningPage>
  );
}

async function Comparisons() {
  const result = await learning2dContext();
  if (!result.ok) return null;
  const data = await loadComparisons(result.ctx);
  const { views, traditions } = data;
  const pageId = pageId2d.comparisons();
  return (
    <PageColumn>
      <PageTelemetry pageId={pageId} category="cross_tradition_comparisons" />
      <Crumbs items={[{ label: PAGE_TITLES.catalogue, href: href2d.catalogue() }, { label: PAGE_TITLES.comparisons }]} />
      <PageIntro eyebrow="Across traditions" title={<PageHeading>{PAGE_TITLES.comparisons}</PageHeading>} lead="How the traditions resemble and differ from each other." />
      {views.length === 0 ? <p className="text-reading text-ink-2">No comparisons are recorded for these traditions.</p> : null}
      {views.length > 1 ? (
        <nav aria-labelledby="aspects-heading" data-slot="comparison-aspects" className="mb-10">
          <h2 id="aspects-heading" className="text-h3 text-ink">
            {titleCase("Aspects compared")}
          </h2>
          <ul className="mt-2 flex flex-col border-t border-rule">
            {views.map((v, i) => (
              <li key={v.concept.id} className="border-b border-rule">
                {/* An in-page jump (the page is not left), so a plain anchor: nothing is selected or entered. */}
                <a href={`#aspect-${i + 1}`} className={`${ROW_LINK_CLASS} w-full py-1`}>
                  {titleCase(v.concept.title)}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
      <ExposureGroup context={{ roomOrPageId: pageId, category: "cross_tradition_comparisons" }}>
        <div className="flex flex-col">
          {views.map((v, i) => {
            const id = `aspect-${i + 1}`;
            const shared = v.compares.filter((c) => !c.traditionSlug);
            return (
              <section key={v.concept.id} aria-labelledby={id} data-slot="comparison-aspect" className="border-t-2 border-ink py-10 first:border-t-0 first:pt-0">
                <SectionHeading id={id}>{v.concept.title}</SectionHeading>
                <TrackedLink
                  href={href2d.concept(v.concept.slug)}
                  pageId={pageId}
                  item={{ conceptId: v.concept.id, elementKind: "comparison_card" }}
                  aria-label={`Read the comparison: ${titleCase(v.concept.title)}`}
                  className={ROW_LINK_CLASS}
                >
                  Read the comparison
                </TrackedLink>
                <div className="mt-6 flex flex-col gap-10">
                  {traditions.map((t) => (
                    <TraditionBlock
                      key={t.slug}
                      headingId={`${id}-${t.slug}`}
                      heading={<TraditionName traditionKey={t.slug}>{titleCase(t.name)}</TraditionName>}
                      traditionSlug={t.slug}
                      concepts={v.compares.filter((c) => c.traditionSlug === t.slug)}
                      compared={data.compared}
                      pageId={pageId}
                    />
                  ))}
                  {shared.length > 0 ? (
                    <TraditionBlock headingId={`${id}-shared`} heading={titleCase("Across traditions")} traditionSlug={null} concepts={shared} compared={data.compared} pageId={pageId} />
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>
      </ExposureGroup>
    </PageColumn>
  );
}

/** One tradition's part of an aspect: the h3, then each compared concept's claims (or "Not compared"). */
function TraditionBlock({
  headingId,
  heading,
  traditionSlug,
  concepts,
  compared,
  pageId,
}: {
  headingId: string;
  heading: ReactNode;
  traditionSlug: string | null;
  concepts: readonly ConceptRef[];
  compared: ComparisonsPageData["compared"];
  pageId: string;
}) {
  return (
    <section aria-labelledby={headingId} data-tradition={traditionSlug ?? undefined} data-slot="comparison-tradition">
      <h3 id={headingId} className="text-h3 text-ink">
        {heading}
      </h3>
      {concepts.length === 0 ? <p className="text-ui flex min-h-11 items-center text-ink-3">Not compared for this tradition.</p> : null}
      {concepts.map((ref) => {
        const loaded = compared[ref.id];
        const titleId = `${headingId}-${ref.id}`;
        return (
          <ExposureRegion
            key={ref.id}
            conceptId={ref.id}
            layer={exposureLayerOf(ref.type)}
            context={{ roomOrPageId: pageId, category: ref.category, ...(ref.traditionId ? { traditionId: ref.traditionId } : {}) }}
            navigationSurface="catalogue"
            className="mt-4"
          >
            <h4 id={titleId} className="text-ui font-semibold text-ink">
              <TrackedLink href={href2d.concept(ref.slug)} pageId={pageId} item={{ conceptId: ref.id, elementKind: "concept_card" }} className={ROW_LINK_CLASS}>
                {titleCase(ref.title)}
              </TrackedLink>
            </h4>
            {loaded ? <ClaimList className="mt-2" conceptId={ref.id} claims={loaded.concept.claims} figures={loaded.figures} /> : null}
          </ExposureRegion>
        );
      })}
    </section>
  );
}
