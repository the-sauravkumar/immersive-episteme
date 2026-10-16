import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { LearningPage } from "@/components/shell/gates";
import type { ConceptRef } from "@/features/knowledge/read/view";
import { PAGE_TITLES, sectionConcepts } from "@/features/learning-2d/navigation";
import { href2d, pageId2d } from "@/features/learning-2d/routes";
import { learning2dContext, loadTradition } from "@/features/learning-2d/server/data";
import { EPISTEMIC_SECTIONS } from "@/features/learning-2d/template";
import { ConceptCardList } from "@/features/learning-2d/ui/concept-list";
import { Crumbs } from "@/features/learning-2d/ui/crumbs";
import { DisclosureSection } from "@/features/learning-2d/ui/disclosure-section";
import { NavigationPhase } from "@/features/learning-2d/ui/exposure";
import { PageHeading } from "@/features/learning-2d/ui/page-heading";
import { PageColumn, PageIntro, PageSkeleton } from "@/features/learning-2d/ui/page-layout";
import { PageTelemetry } from "@/features/learning-2d/ui/page-telemetry";
import { ProcessTimeline, RepeatLinks } from "@/features/learning-2d/ui/process-timeline";
import { titleCase } from "@/lib/text/title-case";

export const metadata: Metadata = { title: "Tradition" };

/** May block: the learning gate verifies the participant session per navigation (see the layout). */
export const instant = false;

/**
 * Tradition page (DESIGN.md 11.5): the common epistemic template in fixed order, in the sheet-width
 * column. Every section is a 56 px disclosure of concept links (process stages as an ordered list),
 * with no counts (the museum rooms show none). The page is a navigation surface, as a museum room
 * is: it shows no knowledge of its own (DR-048). The tradition's overview concept is the first link
 * of section 1, Tradition and Context, and opens in the shared KnowledgeSheet, exactly as its
 * exhibit stands first in the museum's Tradition and Context room. The tradition record's
 * alternative names, region, GI status and GI record are not shown here, because the museum shows
 * them nowhere: the sheet's metadata (Tradition, Category, Step, Local terms) is the same in both.
 */
export default function TraditionPage({ params }: PageProps<"/learn/2d/traditions/[traditionKey]">) {
  return (
    <LearningPage condition="2d">
      <Suspense fallback={<PageSkeleton />}>
        <Tradition params={params} />
      </Suspense>
    </LearningPage>
  );
}

async function Tradition({ params }: { params: PageProps<"/learn/2d/traditions/[traditionKey]">["params"] }) {
  const result = await learning2dContext();
  if (!result.ok) return null;
  const { traditionKey } = await params;
  const data = await loadTradition(result.ctx, decodeURIComponent(traditionKey));
  if (!data) notFound();
  const { tradition, chain, comparisons } = data;
  const pageId = pageId2d.tradition(tradition.slug);

  const comparisonConcepts: ConceptRef[] = [
    ...new Map([...(tradition.conceptsByType.comparison ?? []), ...comparisons.map((c) => c.concept)].map((c) => [c.id, c])).values(),
  ];

  return (
    <PageColumn>
      <PageTelemetry pageId={pageId} traditionId={tradition.id} category="tradition_identity" />
      <Crumbs items={[{ label: PAGE_TITLES.catalogue, href: href2d.catalogue() }, { label: tradition.name }]} />
      <NavigationPhase surface="catalogue" context={{ roomOrPageId: pageId, traditionId: tradition.id }} />
      <PageIntro eyebrow="Tradition" title={<PageHeading>{tradition.name}</PageHeading>} />

      <div className="mt-12 border-t border-rule" data-slot="tradition-sections">
        {EPISTEMIC_SECTIONS.map((section) => {
          const common = { sectionId: section.id, title: section.title, pageId, traditionId: tradition.id } as const;
          if (section.id === "process") {
            return (
              <DisclosureSection key={section.id} {...common}>
                {chain && chain.steps.length > 0 ? (
                  <>
                    <ProcessTimeline sequence={chain} pageId={pageId} label={`${titleCase(tradition.name)}: process steps in order`} />
                    <RepeatLinks chain={chain} pageId={pageId} />
                  </>
                ) : (
                  <p className="text-ui flex min-h-11 items-center text-ink-3">No ordered process is recorded.</p>
                )}
                {/* Process stages outside the ordered chain are still listed. */}
                <UnorderedStages all={sectionConcepts(tradition, section)} ordered={chain?.steps ?? []} pageId={pageId} />
              </DisclosureSection>
            );
          }
          if (section.id === "comparisons") {
            return (
              <DisclosureSection key={section.id} {...common}>
                {comparisonConcepts.length > 0 ? (
                  <ConceptCardList concepts={comparisonConcepts} pageId={pageId} />
                ) : (
                  <p className="text-ui flex min-h-11 items-center text-ink-3">No comparisons are recorded.</p>
                )}
              </DisclosureSection>
            );
          }
          const concepts = sectionConcepts(tradition, section);
          const sequences = section.id === "context" ? (chain?.otherSequences ?? []) : [];
          return (
            <DisclosureSection key={section.id} {...common}>
              {sequences.map((s, i) => (
                <div key={s.steps[0]?.id ?? i} className="mb-6">
                  <h3 className="text-label mb-1">{titleCase("Sequence")}</h3>
                  <ProcessTimeline sequence={s} pageId={pageId} label="Ordered sequence" />
                </div>
              ))}
              {concepts.length > 0 ? (
                <ConceptCardList concepts={concepts} pageId={pageId} showType={section.types.length > 1} />
              ) : (
                <p className="text-ui flex min-h-11 items-center text-ink-3">Nothing is recorded in this section.</p>
              )}
            </DisclosureSection>
          );
        })}
      </div>
    </PageColumn>
  );
}

function UnorderedStages({ all, ordered, pageId }: { all: ConceptRef[]; ordered: ConceptRef[]; pageId: string }) {
  const inChain = new Set(ordered.map((c) => c.id));
  const rest = all.filter((c) => !inChain.has(c.id));
  if (rest.length === 0) return null;
  return (
    <div className="mt-6">
      <h3 className="text-label mb-1">{titleCase("Other stages")}</h3>
      <ConceptCardList concepts={rest} pageId={pageId} />
    </div>
  );
}
