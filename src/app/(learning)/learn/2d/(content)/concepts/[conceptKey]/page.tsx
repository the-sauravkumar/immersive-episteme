import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { ClaimList, Pager, RelatedConcepts, relatedLinksFromGroups, SheetReferences } from "@/components/knowledge";
import { LearningPage } from "@/components/shell/gates";
import type { Pager as PagerData } from "@/features/learning-2d/navigation";
import { href2d, pageId2d } from "@/features/learning-2d/routes";
import { learning2dContext, loadConcept, type LayerEntryData } from "@/features/learning-2d/server/data";
import { ConceptLayersSheet, type LayerEntryView } from "@/features/learning-2d/ui/concept-layers";
import { ExposureRegion } from "@/features/learning-2d/ui/exposure";
import { ComparisonBlocks, LayerConceptHead, SequenceList } from "@/features/learning-2d/ui/layer-parts";
import { PageSkeleton } from "@/features/learning-2d/ui/page-layout";
import { PageTelemetry } from "@/features/learning-2d/ui/page-telemetry";
import { StudyBarLocation } from "@/features/learning-2d/ui/session";
import { TrackedLink } from "@/features/learning-2d/ui/tracked-link";
import { exposureLayerOf, type KnowledgeLayerId } from "@/features/learning/labels";

export const metadata: Metadata = { title: "Concept" };

/** May block: the learning gate verifies the participant session per navigation (see the layout). */
export const instant = false;

/**
 * Concept page (DESIGN.md 11.5; DR-021): the shared KnowledgeSheet (9.11) in the sheet column,
 * docked right at the 3D panel's x, width and top from 1024 px, with no breadcrumb: Close, in the
 * sheet's action slot as in 3D, returns to the section view; the rail ("In This Section") and the
 * index sit to its left. The sheet is the SAME component the 3D information panel places, with the same layers (LayerTabs:
 * the same layer list, concepts and order as the panel, DR-034), claims, figures, citations,
 * related concepts and pager (a sequence pager for a station only, as in the panel); only how a
 * link acts differs (here it navigates).
 *
 * Every (layer, concept) view is pre-rendered here and one is shown at a time. The shown concept is
 * exposed while the sheet is open (the shared rule, DR-050: wherever the sheet is scrolled, and
 * not while Contents or Search covers it), attributed to that concept and its exposure layer, as
 * in 3D.
 */
export default function ConceptPage({ params }: PageProps<"/learn/2d/concepts/[conceptKey]">) {
  return (
    <LearningPage condition="2d">
      <Suspense fallback={<PageSkeleton />}>
        <Concept params={params} />
      </Suspense>
    </LearningPage>
  );
}

async function Concept({ params }: { params: PageProps<"/learn/2d/concepts/[conceptKey]">["params"] }) {
  const result = await learning2dContext();
  if (!result.ok) return null;
  const { conceptKey } = await params;
  const data = await loadConcept(result.ctx, decodeURIComponent(conceptKey));
  if (!data) notFound();
  const { concept, related, pager, sequence, layers, traditionNames, parent } = data;
  const pageId = pageId2d.concept(concept.key);
  // How each attached concept hangs off this one (logged when the learner goes to its page).
  const attachment = new Map(related.flatMap((g) => g.relations).map((r) => [r.relationshipId, r]));

  const viewOf = (layer: KnowledgeLayerId, e: LayerEntryData) => {
    const c = e.concept;
    const rel = e.relationshipId ? attachment.get(e.relationshipId) : undefined;
    return (
      <>
        {layer === "process" && sequence ? <SequenceList sequence={sequence} currentId={concept.id} /> : null}
        {c.id !== concept.id ? (
          <LayerConceptHead
            concept={c}
            traditionNames={traditionNames}
            pageId={pageId}
            relationship={
              rel
                ? { relationshipId: rel.relationshipId, typeCode: rel.type, fromConceptId: concept.id, toConceptId: c.id, direction: rel.direction === "incoming" ? "inverse" : "forward" }
                : null
            }
          />
        ) : null}
        <ExposureRegion
          conceptId={c.id}
          layer={exposureLayerOf(c.type)}
          context={{ roomOrPageId: pageId, category: c.category, ...(c.traditionId ? { traditionId: c.traditionId } : {}) }}
        >
          <ClaimList conceptId={c.id} claims={c.claims} figures={e.figures} references="sheet" />
          {e.comparison ? <ComparisonBlocks comparison={e.comparison} traditionNames={traditionNames} /> : null}
        </ExposureRegion>
      </>
    );
  };

  const shownConcepts = new Map(layers.flatMap((l) => l.entries).map((e) => [e.concept.id, e]));
  const relatedByConcept = Object.fromEntries(
    [...shownConcepts.values()].map((e) => [e.concept.id, e.related.length > 0 ? <ConceptRelated entry={e} traditionNames={traditionNames} pageId={pageId} /> : null]),
  );
  const layerViews = layers.map((l) => ({
    id: l.id,
    entries: l.entries.map(
      (e): LayerEntryView => ({
        conceptId: e.concept.id,
        title: e.concept.title,
        category: e.concept.category,
        traditionId: e.concept.traditionId,
        view: viewOf(l.id, e),
        references: <SheetReferences conceptId={e.concept.id} claims={e.concept.claims} />,
      }),
    ),
  }));

  return (
    <div>
      <PageTelemetry pageId={pageId} conceptId={concept.id} traditionId={concept.traditionId ?? undefined} category={concept.category} />
      <StudyBarLocation location={concept.title} parent={parent} />
      <ConceptLayersSheet
        concept={{
          id: concept.id,
          title: concept.title,
          type: concept.type,
          category: concept.category,
          localTerms: concept.localTerms,
          tradition: concept.tradition ? { slug: concept.tradition.slug, name: concept.tradition.name } : null,
          verificationState: concept.verificationState,
        }}
        step={pager?.kind === "process" ? { index: pager.index, total: pager.total } : null}
        layers={layerViews}
        relatedByConcept={relatedByConcept}
        pager={pager ? <ConceptPager pager={pager} conceptId={concept.id} pageId={pageId} /> : null}
        pageId={pageId}
        closeHref={parent?.href ?? href2d.catalogue()}
      />
    </div>
  );
}

/** Related Concepts of the concept shown (the page's own, or a layer concept's, as in the panel). */
function ConceptRelated({ entry, traditionNames, pageId }: { entry: LayerEntryData; traditionNames: Record<string, string>; pageId: string }) {
  const c = entry.concept;
  const slugOf = new Map(entry.related.flatMap((g) => g.relations).map((r) => [r.concept.id, r.concept.slug]));
  return (
    <RelatedConcepts
      conceptId={c.id}
      traditionSlug={c.traditionSlug}
      links={relatedLinksFromGroups(entry.related)}
      traditionNames={traditionNames}
      roomOrPageId={pageId}
      headingId={`related-heading-${c.id}`}
      renderLink={(link, content, className) => (
        <TrackedLink
          href={href2d.concept(slugOf.get(link.concept.id) ?? link.concept.id)}
          pageId={pageId}
          relationship={{
            relationshipId: link.relationshipId,
            typeCode: link.type,
            fromConceptId: c.id,
            toConceptId: link.concept.id,
            direction: link.direction === "incoming" ? "inverse" : "forward",
          }}
          className={className}
        >
          {content}
        </TrackedLink>
      )}
    />
  );
}

/**
 * Previous / next along the ordered sequence a station belongs to, through the shared Pager with
 * its default label, as the panel's. Only stations have one (`pagerFor`, DR-034). A move logs the
 * followed PRECEDES relationship; a move without one (a shared sequence step whose link is out of
 * scope) logs the pager item.
 */
function ConceptPager({ pager, conceptId, pageId }: { pager: PagerData; conceptId: string; pageId: string }) {
  const target = (dir: "prev" | "next") => (dir === "prev" ? pager.prev : pager.next);
  const item = (dir: "prev" | "next") => {
    const t = target(dir);
    return t ? { conceptId: t.concept.id, title: t.concept.title } : null;
  };
  return (
    <Pager
      prev={item("prev")}
      next={item("next")}
      renderLink={(_item, dir, content, className) => {
        const t = target(dir)!;
        return (
          <TrackedLink
            href={href2d.concept(t.concept.slug)}
            pageId={pageId}
            rel={dir}
            source="pager"
            relationship={
              t.relationshipId
                ? { relationshipId: t.relationshipId, typeCode: "PRECEDES", fromConceptId: conceptId, toConceptId: t.concept.id, direction: dir === "next" ? "forward" : "inverse" }
                : undefined
            }
            item={t.relationshipId ? undefined : { conceptId: t.concept.id, elementKind: "pager" }}
            className={className}
          >
            {content}
          </TrackedLink>
        );
      }}
    />
  );
}
