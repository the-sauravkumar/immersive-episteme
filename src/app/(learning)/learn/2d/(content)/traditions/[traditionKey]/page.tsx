import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { ClaimList } from "@/components/knowledge";
import { LearningPage } from "@/components/shell/gates";
import type { ConceptRef } from "@/features/knowledge/read/view";
import { PAGE_TITLES, sectionConcepts } from "@/features/learning-2d/navigation";
import { href2d, pageId2d } from "@/features/learning-2d/routes";
import { learning2dContext, loadTradition } from "@/features/learning-2d/server/data";
import { EPISTEMIC_SECTIONS } from "@/features/learning-2d/template";
import { ConceptCardList } from "@/features/learning-2d/ui/concept-list";
import { Crumbs } from "@/features/learning-2d/ui/crumbs";
import { DisclosureSection } from "@/features/learning-2d/ui/disclosure-section";
import { ExposureRegion, NavigationPhase } from "@/features/learning-2d/ui/exposure";
import { PageHeading } from "@/features/learning-2d/ui/page-heading";
import { PageColumn, PageIntro, PageMeta, PageSkeleton, SectionHeading } from "@/features/learning-2d/ui/page-layout";
import { PageTelemetry } from "@/features/learning-2d/ui/page-telemetry";
import { ProcessTimeline, RepeatLinks } from "@/features/learning-2d/ui/process-timeline";
import { titleCase } from "@/lib/text/title-case";

export const metadata: Metadata = { title: "Tradition" };

/** May block: the learning gate verifies the participant session per navigation (see the layout). */
export const instant = false;

/**
 * Tradition page (DESIGN.md 11.5): the common epistemic template in fixed order, in the sheet-width
 * column. The header carries a labelled metadata list (Also known as, Region, GI status; labels in
 * sentence case, as the sheet's "Local terms"). The
 * tradition's overview concept (its sourced claims, through the shared ClaimList) is the page's one
 * content region, with its Geographical Indication record as a list, not a run-on line. Every
 * other section is a 56 px disclosure of concept links (process stages as an ordered list), with no
 * counts (the museum rooms show none).
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

const giStatus = (registered: boolean | null) => (registered === null ? "Not recorded" : registered ? "Registered" : "Not registered");

async function Tradition({ params }: { params: PageProps<"/learn/2d/traditions/[traditionKey]">["params"] }) {
  const result = await learning2dContext();
  if (!result.ok) return null;
  const { traditionKey } = await params;
  const data = await loadTradition(result.ctx, decodeURIComponent(traditionKey));
  if (!data) notFound();
  const { tradition, overview, overviewFigures, chain, comparisons } = data;
  const pageId = pageId2d.tradition(tradition.slug);
  const region = [tradition.region.place, tradition.region.district, tradition.region.state, tradition.region.country].filter(Boolean).join(", ");
  const gi = tradition.gi;

  const comparisonConcepts: ConceptRef[] = [
    ...new Map([...(tradition.conceptsByType.comparison ?? []), ...comparisons.map((c) => c.concept)].map((c) => [c.id, c])).values(),
  ];

  return (
    <PageColumn>
      <PageTelemetry pageId={pageId} traditionId={tradition.id} category="tradition_identity" />
      <Crumbs items={[{ label: PAGE_TITLES.catalogue, href: href2d.catalogue() }, { label: tradition.name }]} />
      <PageIntro
        eyebrow="Tradition"
        title={<PageHeading>{tradition.name}</PageHeading>}
        meta={
          <PageMeta
            label="About this tradition"
            rows={[
              { label: "Also known as", values: tradition.altNames },
              { label: "Region", values: region ? [region] : [] },
              { label: "GI status", values: gi ? [giStatus(gi.registered)] : [] },
            ]}
          />
        }
      />

      {overview ? (
        <ExposureRegion
          conceptId={overview.id}
          layer="overview"
          context={{ roomOrPageId: pageId, traditionId: tradition.id, category: overview.category }}
          navigationSurface="catalogue"
        >
          <SectionHeading id="overview-heading">Overview</SectionHeading>
          <ClaimList className="mt-6" conceptId={overview.id} claims={overview.claims} figures={overviewFigures} />
          {gi && (gi.applicationNo || gi.year || gi.sources.length > 0) ? (
            <div className="mt-8 border-t border-rule pt-6">
              <PageMeta
                label="Geographical Indication record"
                rows={[
                  { label: "GI application", values: gi.applicationNo ? [gi.applicationNo] : [] },
                  { label: "GI year", values: gi.year ? [<span key="y" className="tabular-nums">{gi.year}</span>] : [] },
                  // The full source title (a short label would cut it mid-word, 9.8).
                  { label: "GI source", values: gi.sources.map((s) => (s.year ? `${s.title} (${s.year})` : s.title)) },
                ]}
              />
            </div>
          ) : null}
        </ExposureRegion>
      ) : (
        <NavigationPhase surface="catalogue" context={{ roomOrPageId: pageId, traditionId: tradition.id }} />
      )}

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
