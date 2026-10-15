import type { Metadata } from "next";
import { Suspense } from "react";

import { LearningPage } from "@/components/shell/gates";
import { PAGE_TITLES } from "@/features/learning-2d/navigation";
import { href2d, pageId2d } from "@/features/learning-2d/routes";
import { learning2dContext, loadCatalogue } from "@/features/learning-2d/server/data";
import { Crumbs } from "@/features/learning-2d/ui/crumbs";
import { NavigationPhase } from "@/features/learning-2d/ui/exposure";
import { PageHeading } from "@/features/learning-2d/ui/page-heading";
import { BrowseTable, PageColumn, PageIntro, PageSkeleton } from "@/features/learning-2d/ui/page-layout";
import { PageTelemetry } from "@/features/learning-2d/ui/page-telemetry";

export const metadata: Metadata = { title: "Knowledge Categories" };

/** May block: the learning gate verifies the participant session per navigation (see the layout). */
export const instant = false;

export default function CategoriesPage() {
  return (
    <LearningPage condition="2d">
      <Suspense fallback={<PageSkeleton />}>
        <Categories />
      </Suspense>
    </LearningPage>
  );
}

async function Categories() {
  const result = await learning2dContext();
  if (!result.ok) return null;
  const { categories } = await loadCatalogue(result.ctx);
  const pageId = pageId2d.categories();
  return (
    <PageColumn>
      <PageTelemetry pageId={pageId} />
      <NavigationPhase surface="menu" context={{ roomOrPageId: pageId }} />
      <Crumbs items={[{ label: PAGE_TITLES.catalogue, href: href2d.catalogue() }, { label: PAGE_TITLES.categories }]} />
      <PageIntro eyebrow="Browse" title={<PageHeading>{PAGE_TITLES.categories}</PageHeading>} lead="The same kinds of knowledge across every tradition." />
      <BrowseTable label={PAGE_TITLES.categories} pageId={pageId} rows={categories.map((c) => ({ key: c.code, href: href2d.category(c.code), code: c.code }))} />
    </PageColumn>
  );
}
