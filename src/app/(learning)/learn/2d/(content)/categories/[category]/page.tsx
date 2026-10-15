import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { TraditionName } from "@/components/knowledge/tradition-marker";
import { LearningPage } from "@/components/shell/gates";
import { PAGE_TITLES } from "@/features/learning-2d/navigation";
import { href2d, pageId2d } from "@/features/learning-2d/routes";
import { isCategoryCode, learning2dContext, loadCategory } from "@/features/learning-2d/server/data";
import { CATEGORY_LABELS } from "@/features/learning/labels";
import { ConceptCardList } from "@/features/learning-2d/ui/concept-list";
import { Crumbs } from "@/features/learning-2d/ui/crumbs";
import { NavigationPhase } from "@/features/learning-2d/ui/exposure";
import { PageHeading } from "@/features/learning-2d/ui/page-heading";
import { PageColumn, PageIntro, PageSkeleton, SectionHeading } from "@/features/learning-2d/ui/page-layout";
import { PageTelemetry } from "@/features/learning-2d/ui/page-telemetry";
import { titleCase } from "@/lib/text/title-case";

export const metadata: Metadata = { title: "Knowledge Category" };

/** May block: the learning gate verifies the participant session per navigation (see the layout). */
export const instant = false;

/** One knowledge category across the study's traditions, grouped by tradition in the canonical order. */
export default function CategoryPage({ params }: PageProps<"/learn/2d/categories/[category]">) {
  return (
    <LearningPage condition="2d">
      <Suspense fallback={<PageSkeleton />}>
        <Category params={params} />
      </Suspense>
    </LearningPage>
  );
}

async function Category({ params }: { params: PageProps<"/learn/2d/categories/[category]">["params"] }) {
  const result = await learning2dContext();
  if (!result.ok) return null;
  const { category } = await params;
  if (!isCategoryCode(category)) notFound();
  const { groups } = await loadCategory(result.ctx, category);
  const pageId = pageId2d.category(category);
  const label = CATEGORY_LABELS[category];
  return (
    <PageColumn>
      <PageTelemetry pageId={pageId} category={category} />
      <NavigationPhase surface="catalogue" context={{ roomOrPageId: pageId, category }} />
      <Crumbs items={[{ label: PAGE_TITLES.catalogue, href: href2d.catalogue() }, { label: PAGE_TITLES.categories, href: href2d.categories() }, { label }]} />
      <PageIntro eyebrow="Knowledge category" title={<PageHeading>{label}</PageHeading>} />
      {groups.length === 0 ? <p className="text-reading text-ink-2">Nothing is recorded in this category.</p> : null}
      <div className="flex flex-col gap-12">
        {groups.map((g) => {
          const id = `group-${g.tradition?.slug ?? "shared"}`;
          return (
            <section key={g.tradition?.id ?? "shared"} aria-labelledby={id}>
              <SectionHeading id={id}>
                {g.tradition ? <TraditionName traditionKey={g.tradition.slug}>{titleCase(g.tradition.name)}</TraditionName> : "Across traditions"}
              </SectionHeading>
              <ConceptCardList className="mt-2" concepts={g.concepts} pageId={pageId} showType />
            </section>
          );
        })}
      </div>
    </PageColumn>
  );
}
