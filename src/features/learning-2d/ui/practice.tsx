"use client";

/**
 * The 2D familiarisation practice (study decision D5): the real 2D chrome and the REAL concept view
 * around content labelled "Practice". The practice item is the shared KnowledgeSheet placed as on
 * a concept page (the same component the 3D panel places), so a learner practises every control
 * the onboarding explains before the task: the metadata list and step eyebrow, LayerTabs (Overview
 * and Process), a claim's citation marker [1] and its record, the reference list, a figure's Enlarge button and lightbox, the
 * Related Concepts links with their "About these links" disclosure, and the pager. After it come
 * placeholder sections (the tradition page's disclosures and link rows). The layout is the learning
 * pages' spread (DR-021): the shared PlaceRail ("In This Section", listing the practice steps and
 * sections), an index of the practice sections in the field, and the sheet column, with Close in
 * the sheet's action slot, so every navigation control of the task is practised too.
 *
 * No craft content: every text here is interface wording, the source is the platform itself and
 * the diagram shows three practice steps. Links stay on this page (in-page anchors), so practice
 * can never open a learning page or start the learning clock.
 */
import { useMemo, type ReactNode } from "react";

import { ClaimList, SheetReferences } from "@/components/knowledge/claim-list";
import { sheetTitleId } from "@/components/knowledge/knowledge-sheet";
import { Pager } from "@/components/knowledge/pager";
import { RelatedConcepts, type RelatedLink } from "@/components/knowledge/related-concepts";
import { LearningPhaseContent, type LearningPhaseMode } from "@/components/learning/learning-phase";
import { PracticeSession } from "@/components/learning/practice-session";
import type { GuidanceSettings } from "@/features/learning/settings";
import { PRACTICE_TEXT } from "@/features/learning/strings";
import type { LearningTimeBudget } from "@/features/learning/time-budget";
import type { Citation, ClaimView, ConceptRef, DiagramFigure } from "@/features/knowledge/read/view";
import type { TelemetryConfig } from "@/features/telemetry/client/provider";

import { PAGE_TITLES, type IndexTradition, type Rail2dModel, type StudyBarIndex } from "../navigation";
import { href2d, LEARN_2D, pageId2d } from "../routes";
import { createVisitStore } from "../visit-store";

import { ROW_LINK_CLASS } from "./concept-list";
import { ConceptLayersSheet } from "./concept-layers";
import { DisclosureSection } from "./disclosure-section";
import { SequenceList } from "./layer-parts";
import { PageColumn, SectionHeading } from "./page-layout";
import { VisitStoreProvider } from "./session";
import { Learning2dStudyBar, type ContentsGroup } from "./site-header";
import { Learning2dSpread, Rail2dProvider, StudyIndex } from "./spread";
import { TrackedLink } from "./tracked-link";

const SECTIONS = [
  { id: "practice-1", title: "Practice section 1" },
  { id: "practice-2", title: "Practice section 2" },
  { id: "practice-3", title: "Practice section 3" },
] as const;

/** The real Contents labels, pointing at the practice sections. */
const PRACTICE_CONTENTS: readonly ContentsGroup[] = [
  {
    heading: "Browse",
    entries: [
      { label: "Traditions", href: href2d.practice(SECTIONS[0].id) },
      { label: "Categories", href: href2d.practice(SECTIONS[1].id) },
      { label: "Comparisons", href: href2d.practice(SECTIONS[2].id) },
    ],
  },
];

const EMPTY_INDEX: StudyBarIndex = { traditions: [], concepts: {}, parents: [] };

/** The practice rail: the practice steps (the item is the current one), then the practice sections. */
const PRACTICE_RAIL: Rail2dModel = {
  items: [1, 2, 3].map((n) => ({
    key: `practice-step-${n}`,
    title: n === 2 ? "Practice item" : `Practice step ${n}`,
    detail: `Process stage, step ${n} of 3`,
    href: `${LEARN_2D}/practice#${sheetTitleId(ITEM_ID)}`,
    current: n === 2,
    visited: false,
  })),
  destinations: SECTIONS.map((s) => ({ key: s.id, title: s.title, detail: null, href: href2d.practice(s.id), current: false, visited: false })),
};

/** The practice index: the practice sections, numbered as a tradition's sections are. */
const PRACTICE_INDEX: IndexTradition[] = [
  {
    slug: "practice",
    name: "Practice sections",
    href: href2d.practice(),
    current: false,
    sections: SECTIONS.map((s, i) => ({ id: s.id, number: i + 1, title: s.title, href: href2d.practice(s.id), current: false })),
  },
];

const ITEM_ID = "practice-item";

/** The practice "source": the platform itself, so nothing about the craft is stated or cited. */
const PRACTICE_SOURCE: Citation = {
  id: "practice-source",
  label: "Immersive Episteme",
  kind: "unverified",
  title: "Practice source (not part of the learning content)",
  author: null,
  publisher: "Immersive Episteme",
  year: null,
  url: null,
  accessedOn: null,
  reliability: null,
  verificationState: "draft",
  locator: "Practice page",
  quote: "Practice quotation. In the learning task, this box shows the source's own words for the statement above it.",
  passages: [],
};

const claim = (id: string, position: number, text: string): ClaimView => ({ id, position, text, quote: null, evidence: [PRACTICE_SOURCE] });

const OVERVIEW_CLAIMS: ClaimView[] = [
  claim("practice-claim-1", 0, "Practice statement. In the learning task, each numbered statement says what the sources say. Select the number in brackets after it, [1], to see where it comes from."),
  claim("practice-claim-2", 1, "Practice statement. Some statements have a figure after them. Use “Enlarge” to see it larger, and “Close” or Escape to return."),
];
const PROCESS_CLAIMS: ClaimView[] = [claim("practice-claim-3", 0, "Practice statement. The Process layer lists the steps in order and marks this one.")];

const STEPS: ConceptRef[] = [1, 2, 3].map((n) => ({
  id: n === 2 ? ITEM_ID : `practice-step-${n}`,
  key: `practice.step-${n}`,
  slug: `practice-step-${n}`,
  type: "process_stage",
  category: "process_stages",
  title: n === 2 ? "Practice item" : `Practice step ${n}`,
  summary: "",
  traditionId: null,
  traditionSlug: null,
  verificationState: "draft",
}));

/** A practice diagram in the figure frame every study diagram uses: three practice steps in order. */
const PRACTICE_FIGURE: DiagramFigure = {
  kind: "diagram",
  id: "practice-diagram",
  conceptId: ITEM_ID,
  anchorClaimIndex: 1,
  caption: "Practice diagram: three practice steps in order, pointing to the second statement.",
  alt: "Practice step 1 precedes Practice Item, which precedes Practice step 3.",
  credit: "Practice figure (not part of the learning content)",
  diagram: {
    id: "practice:diagram",
    type: "process-sequence",
    traditionSlug: "practice",
    traditionName: "Practice",
    section: "process",
    anchor: { conceptId: ITEM_ID, conceptKey: "practice.step-2", claimIndex: 1 },
    width: 576,
    height: 384,
    fontSize: 14,
    lineHeight: 18,
    labelSize: 12,
    nodes: STEPS.map((s, i) => ({ id: s.id, key: s.key, title: s.title, type: s.type, current: s.id === ITEM_ID, x: 20 + i * 198, y: 170, w: 140, h: 36, lines: [s.id === ITEM_ID ? "Practice Item" : `Practice Step ${i + 1}`] })),
    edges: [0, 1].map((i) => ({
      relationshipId: `practice-edge-${i}`,
      type: "PRECEDES",
      label: "precedes",
      source: STEPS[i]!.id,
      target: STEPS[i + 1]!.id,
      d: `M${160 + i * 198} 188 L${218 + i * 198} 188`,
      labelAt: { x: 189 + i * 198, y: 172, anchor: "middle" as const },
    })),
    bands: [],
    alt: "Practice step 1 precedes Practice Item, which precedes Practice step 3.",
    caption: "Practice diagram: three practice steps in order, pointing to the second statement.",
  },
};

/**
 * Practice related links: in-page anchors to the practice sections. They are typed as explanations,
 * not process stages, so they never read as the steps the eyebrow, the diagram and the pager name.
 */
const PRACTICE_LINKS: RelatedLink[] = SECTIONS.slice(0, 2).map((s, i) => ({
  relationshipId: `practice-link-${i}`,
  type: "RELATED_TO",
  semantics: "associative",
  direction: "outgoing",
  label: "is related to",
  concept: { id: s.id, title: s.title, type: "explanation", traditionSlug: null },
  explanation: i === 0 ? "Practice explanation. In the learning task, this says how the two are linked." : null,
  conditions: null,
  statedBy: [PRACTICE_SOURCE.label],
}));

export function Practice2d({
  telemetry,
  budget,
  mode,
  guidance,
  searchEnabled = false,
}: {
  telemetry: Pick<TelemetryConfig, "sessionId" | "contentVersion" | "appBuild" | "mode">;
  budget: LearningTimeBudget;
  mode: LearningPhaseMode;
  guidance: GuidanceSettings;
  /**
   * The protocol's Search setting, as on the task pages (`PracticeContext.features.search`, passed
   * by the practice page). Off when absent, which is the study default (DR-019).
   */
  searchEnabled?: boolean;
}) {
  const visits = useMemo(() => createVisitStore(telemetry.sessionId), [telemetry.sessionId]);
  const pageId = pageId2d.practice();
  const link = (sectionId: string, content: ReactNode, className: string) => (
    <TrackedLink href={href2d.practice(sectionId)} pageId={pageId} className={className}>
      {content}
    </TrackedLink>
  );
  return (
    <PracticeSession telemetry={telemetry} budget={budget} mode={mode} guidance={guidance}>
      <VisitStoreProvider value={visits}>
        <Rail2dProvider>
        <Learning2dStudyBar index={EMPTY_INDEX} searchEnabled={searchEnabled} contents={PRACTICE_CONTENTS} location={PAGE_TITLES.practice} />
        <LearningPhaseContent>
          <Learning2dSpread index={EMPTY_INDEX} prompts={null} railOverride={PRACTICE_RAIL} fieldOverride={<StudyIndex traditions={PRACTICE_INDEX} pathname={href2d.practice()} />}>
            <ConceptLayersSheet
              concept={{ id: ITEM_ID, title: "Practice item", type: "process_stage", category: "process_stages", localTerms: [], tradition: null, verificationState: "practice" }}
              step={{ index: 2, total: 3 }}
              pageId={pageId}
              closeHref={href2d.practice(SECTIONS[0].id)}
              layers={[
                {
                  id: "overview",
                  entries: [
                    {
                      conceptId: ITEM_ID,
                      title: "Practice item",
                      category: "process_stages",
                      traditionId: null,
                      view: <ClaimList conceptId={ITEM_ID} claims={OVERVIEW_CLAIMS} figures={[PRACTICE_FIGURE]} references="sheet" />,
                      references: <SheetReferences conceptId={ITEM_ID} claims={OVERVIEW_CLAIMS} />,
                    },
                  ],
                },
                {
                  id: "process",
                  entries: [
                    {
                      conceptId: ITEM_ID,
                      title: "Practice item",
                      category: "process_stages",
                      traditionId: null,
                      view: (
                        <>
                          <SequenceList sequence={{ steps: STEPS, links: [], continuous: true }} currentId={ITEM_ID} />
                          <ClaimList conceptId={ITEM_ID} claims={PROCESS_CLAIMS} references="sheet" />
                        </>
                      ),
                      references: <SheetReferences conceptId={ITEM_ID} claims={PROCESS_CLAIMS} />,
                    },
                  ],
                },
              ]}
              relatedByConcept={{
                [ITEM_ID]: (
                  <RelatedConcepts
                    conceptId={ITEM_ID}
                    traditionSlug={null}
                    links={PRACTICE_LINKS}
                    traditionNames={{}}
                    roomOrPageId={pageId}
                    headingId="practice-related"
                    renderLink={(l, content, className) => link(l.concept.id, content, className)}
                  />
                ),
              }}
              pager={
                // The step pager names the steps before and after this one ("Step 2 of 3", as the
                // eyebrow and the diagram show). Practice has no step pages, so a move returns to the
                // item's title, as a real move opens the next concept at its title.
                <Pager
                  prev={{ conceptId: STEPS[0]!.id, title: STEPS[0]!.title }}
                  next={{ conceptId: STEPS[2]!.id, title: STEPS[2]!.title }}
                  renderLink={(_item, _dir, content, className) => (
                    <TrackedLink href={`${LEARN_2D}/practice#${sheetTitleId(ITEM_ID)}`} pageId={pageId} className={className}>
                      {content}
                    </TrackedLink>
                  )}
                />
              }
            />
            <PageColumn className="pt-0">
              <section aria-labelledby="practice-sections-heading" className="border-t border-rule-strong pt-8">
                <SectionHeading id="practice-sections-heading">Practice sections</SectionHeading>
                <p className="text-reading mt-4 text-ink-2">{PRACTICE_TEXT.tryControls["2d"]}</p>
                <div className="mt-8 border-t border-rule">
                  {SECTIONS.map((s) => (
                    <DisclosureSection key={s.id} sectionId={s.id} title={s.title} pageId={pageId}>
                      <ul className="flex flex-col">
                        {["A", "B"].map((x) => (
                          <li key={x}>
                            <TrackedLink href={href2d.practice()} pageId={pageId} className={ROW_LINK_CLASS}>
                              Practice item {x}
                            </TrackedLink>
                          </li>
                        ))}
                      </ul>
                    </DisclosureSection>
                  ))}
                </div>
              </section>
            </PageColumn>
          </Learning2dSpread>
        </LearningPhaseContent>
        </Rail2dProvider>
      </VisitStoreProvider>
    </PracticeSession>
  );
}
