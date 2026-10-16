import type { Metadata } from "next";
import { Suspense } from "react";

import { TraditionName } from "@/components/knowledge/tradition-marker";
import { LearningPage } from "@/components/shell/gates";
import { href2d, pageId2d } from "@/features/learning-2d/routes";
import { loadCatalogue, learning2dContext } from "@/features/learning-2d/server/data";
import { PAGE_TITLES } from "@/features/learning-2d/navigation";
import { NavigationPhase } from "@/features/learning-2d/ui/exposure";
import { PageHeading } from "@/features/learning-2d/ui/page-heading";
import { BrowseTable, PageColumn, PageIntro, PageSkeleton, SectionHeading } from "@/features/learning-2d/ui/page-layout";
import { PageTelemetry } from "@/features/learning-2d/ui/page-telemetry";
import { TrackedLink } from "@/features/learning-2d/ui/tracked-link";
import { titleCase } from "@/lib/text/title-case";

export const metadata: Metadata = { title: "Craft Traditions" };

/** May block: the learning gate verifies the participant session per navigation (see the layout). */
export const instant = false;

/**
 * Catalogue (DESIGN.md 11.5): a column at the sheet width with the study's traditions as equal
 * typographic cards in the canonical order (no image slot, no concept count: the museum shows
 * neither), the knowledge categories as a booktabs table of 44 px row links, and the comparisons
 * as one row link.
 */
export default function Learn2dPage() {
  return (
    <LearningPage condition="2d">
      <Suspense fallback={<PageSkeleton />}>
        <Catalogue />
      </Suspense>
    </LearningPage>
  );
}

async function Catalogue() {
  const result = await learning2dContext();
  if (!result.ok) return null;
  const { traditions, categories } = await loadCatalogue(result.ctx);
  const pageId = pageId2d.catalogue();
  return (
    <PageColumn>
      <PageTelemetry pageId={pageId} />
      <NavigationPhase surface="catalogue" context={{ roomOrPageId: pageId }} />
      <PageIntro
        eyebrow="Learning"
        title={<PageHeading>{PAGE_TITLES.catalogue}</PageHeading>}
        lead="Choose a tradition to read about its context, materials and tools, process, artisan decisions, design, outcomes and science, or browse every tradition by knowledge category."
      />

      <section aria-labelledby="traditions-heading">
        <SectionHeading id="traditions-heading">Traditions</SectionHeading>
        {traditions.length === 0 ? (
          <p className="text-reading mt-4 text-ink-2">No traditions are configured for this session.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {traditions.map((t) => (
              <li key={t.id}>
                {/* Equal cards: the title zone reserves two lines while the column is narrower than the
                    sheet (a long name wraps there), and one line at the full sheet width, where every
                    name fits. The name only: the museum's lobby directory names each wing and shows no
                    region, so a card shows no tradition fact the museum does not (DR-048). */}
                <TrackedLink
                  href={href2d.tradition(t.slug)}
                  pageId={pageId}
                  item={{ traditionId: t.id, elementKind: "tradition_card" }}
                  data-slot="tradition-card"
                  className="flex flex-col gap-2 rounded-card border border-rule-strong bg-ground px-4 py-4 text-ink no-underline hover:bg-sunk xs:px-6"
                >
                  <span className="text-h3 min-h-[2lh] text-indigo min-[39.25rem]:min-h-0 underline decoration-1 underline-offset-[0.2em]">
                    <TraditionName traditionKey={t.slug}>{titleCase(t.name)}</TraditionName>
                  </span>
                </TrackedLink>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="categories-heading" className="mt-12">
        <SectionHeading id="categories-heading">Browse by Knowledge Category</SectionHeading>
        <BrowseTable
          className="mt-4"
          label="Knowledge categories"
          pageId={pageId}
          rows={categories.map((c) => ({ key: c.code, href: href2d.category(c.code), code: c.code }))}
        />
      </section>

      <section aria-labelledby="comparisons-heading" className="mt-12">
        <SectionHeading id="comparisons-heading">Comparisons Across Traditions</SectionHeading>
        <BrowseTable
          className="mt-4"
          label="Comparisons"
          pageId={pageId}
          rows={[{ key: "comparisons", href: href2d.comparisons(), label: PAGE_TITLES.comparisons, description: "How the traditions resemble and differ from each other." }]}
        />
      </section>
    </PageColumn>
  );
}
