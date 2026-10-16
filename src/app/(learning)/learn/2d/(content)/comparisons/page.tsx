import type { Metadata } from "next";
import { Suspense } from "react";

import { LearningPage } from "@/components/shell/gates";
import { PAGE_TITLES } from "@/features/learning-2d/navigation";
import { href2d, pageId2d } from "@/features/learning-2d/routes";
import { learning2dContext, loadComparisons } from "@/features/learning-2d/server/data";
import { ConceptCardList } from "@/features/learning-2d/ui/concept-list";
import { Crumbs } from "@/features/learning-2d/ui/crumbs";
import { NavigationPhase } from "@/features/learning-2d/ui/exposure";
import { PageHeading } from "@/features/learning-2d/ui/page-heading";
import { PageColumn, PageIntro, PageSkeleton, SectionHeading } from "@/features/learning-2d/ui/page-layout";
import { PageTelemetry } from "@/features/learning-2d/ui/page-telemetry";

export const metadata: Metadata = { title: "Comparisons" };

/** May block: the learning gate verifies the participant session per navigation (see the layout). */
export const instant = false;

/**
 * Comparisons across traditions (DESIGN.md 11.5; DR-049): the 2D counterpart of the museum's
 * Comparison Hall. It lists the aspects compared (the comparison concepts, 44 px row links, no
 * claim text, no counts, no tradition headings), and each opens its comparison concept in the
 * shared KnowledgeSheet, exactly as a hall exhibit opens its sheet in 3D. There the sheet shows the
 * comparison's own claims and the shared "Compared Concepts" block; the compared concepts' claims
 * are one concept at a time, through the Compare layer or a link, in both conditions. The page shows
 * no knowledge of its own, so it is a navigation surface for as long as it is shown.
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
  const { views } = await loadComparisons(result.ctx);
  const pageId = pageId2d.comparisons();
  return (
    <PageColumn>
      <PageTelemetry pageId={pageId} category="cross_tradition_comparisons" />
      <NavigationPhase surface="catalogue" context={{ roomOrPageId: pageId }} />
      <Crumbs items={[{ label: PAGE_TITLES.catalogue, href: href2d.catalogue() }, { label: PAGE_TITLES.comparisons }]} />
      <PageIntro eyebrow="Across traditions" title={<PageHeading>{PAGE_TITLES.comparisons}</PageHeading>} lead="How the traditions resemble and differ from each other." />
      {views.length === 0 ? (
        <p className="text-reading text-ink-2">No comparisons are recorded for these traditions.</p>
      ) : (
        <section aria-labelledby="aspects-heading" data-slot="comparison-aspects">
          <SectionHeading id="aspects-heading">Aspects Compared</SectionHeading>
          <ConceptCardList className="mt-4 border-t border-rule" concepts={views.map((v) => v.concept)} pageId={pageId} label="Aspects compared" />
        </section>
      )}
    </PageColumn>
  );
}
