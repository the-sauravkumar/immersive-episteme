/**
 * 2D components: concept access and typed related links (the shared RelatedConcepts with the 2D
 * link behaviour), citation disclosure on every claim (the shared ClaimList), exposure intervals
 * under the "content in view" rule (mocked IntersectionObserver), page telemetry (entries, exits,
 * revisits, tradition crossings), disclosed sections, the 2D StudyBar group (Contents, Search only
 * when enabled, "Up to <parent>"), the shared learning-task prompts and the shared learning-phase
 * hand-back.
 */
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ClaimList, groupRelatedLinks, RelatedConcepts, relatedLinksFromGroups } from "@/components/knowledge";
import { GuidanceProvider } from "@/components/learning/guidance";
import { LearningPhaseContent, LearningPhaseProvider, LearningTimer, formatRemaining } from "@/components/learning/learning-phase";
import { LearningTaskPrompts } from "@/components/learning/learning-task-prompts";
import type { GuidanceSettings } from "@/features/learning/settings";
import type { LearningTimeBudget } from "@/features/learning/time-budget";
import type { StudyBarIndex } from "@/features/learning-2d/navigation";
import { href2d } from "@/features/learning-2d/routes";
import { EPISTEMIC_SECTIONS } from "@/features/learning-2d/template";
import { createVisitStore } from "@/features/learning-2d/visit-store";
import { DisclosureSection } from "@/features/learning-2d/ui/disclosure-section";
import { ConceptLayersSheet } from "@/features/learning-2d/ui/concept-layers";
import { ChromeOverlayProvider, ExposureGroup, ExposureRegion, pickActiveRegion, rectInView } from "@/features/learning-2d/ui/exposure";
import { LearningPromptsSlot } from "@/features/learning-2d/ui/session";
import { PageTelemetry } from "@/features/learning-2d/ui/page-telemetry";
import { Learning2dStudyBar } from "@/features/learning-2d/ui/site-header";
import { TrackedLink } from "@/features/learning-2d/ui/tracked-link";
import { telemetryEventSchema } from "@/features/telemetry/contracts";
import { titleCase } from "@/lib/text/title-case";

import { MockIntersectionObserver, fixtureView, renderWithTelemetry } from "./harness";

const nav = vi.hoisted(() => ({ pathname: "/learn/2d" }));
const replace = vi.fn();
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname, useRouter: () => ({ replace, push: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, onClick, ...rest }: { href: string; children: ReactNode; onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void }) => (
    <a
      href={href}
      {...rest}
      onClick={(e) => {
        onClick?.(e);
        e.preventDefault();
      }}
    >
      {children}
    </a>
  ),
}));
vi.mock("next/form", () => ({ default: ({ children, ...rest }: { children: ReactNode }) => <form {...rest}>{children}</form> }));

const view = fixtureView();

beforeEach(() => {
  MockIntersectionObserver.observers = [];
  vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
  replace.mockReset();
  nav.pathname = "/learn/2d";
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("concept content and citations", () => {
  it("renders every claim with a collapsed citation per source, and opening one logs citation_opened", async () => {
    const concept = view.getConcept("alpha.tool.tool-b")!;
    const h = renderWithTelemetry(<ClaimList conceptId={concept.id} claims={concept.claims} />);
    const items = within(screen.getByRole("list", { name: "Statements" })).getAllByRole("listitem");
    expect(items).toHaveLength(concept.claims.length);
    const buttons = screen.getAllByRole("button", { name: /^Source \d+:/ });
    expect(buttons).toHaveLength(concept.claims.flatMap((c) => c.evidence).length);
    expect(buttons.every((b) => b.getAttribute("aria-expanded") === "false")).toBe(true);
    await userEvent.click(buttons[0]!);
    expect(buttons[0]).toHaveAttribute("aria-expanded", "true");
    const events = await h.events();
    expect(events.find((e) => e.type === "citation_opened")).toMatchObject({ conceptId: concept.id, metadata: { claimIndex: 0 } });
  });

  it("groups related concepts by relation verb (shared RelatedConcepts) and logs the followed relationship with its direction", async () => {
    const stageTwo = view.getConcept("alpha.process_stage.stage-two")!;
    const groups = view.getRelatedConcepts(stageTwo.id)!;
    const links = relatedLinksFromGroups(groups);
    const slugOf = new Map(groups.flatMap((g) => g.relations).map((r) => [r.concept.id, r.concept.slug]));
    const h = renderWithTelemetry(
      <RelatedConcepts
        conceptId={stageTwo.id}
        traditionSlug="alpha"
        links={links}
        traditionNames={{ alpha: "Alpha" }}
        roomOrPageId="concept:x"
        headingId="related-heading"
        renderLink={(link, content, className) => (
          <TrackedLink
            href={href2d.concept(slugOf.get(link.concept.id)!)}
            pageId="concept:x"
            relationship={{ relationshipId: link.relationshipId, typeCode: link.type, fromConceptId: stageTwo.id, toConceptId: link.concept.id, direction: link.direction === "incoming" ? "inverse" : "forward" }}
            className={className}
          >
            {content}
          </TrackedLink>
        )}
      />,
    );
    // One h3 per verb, read from the current concept, in Title Case: "Precedes" and "Follows" are separate groups.
    for (const g of groupRelatedLinks(links)) expect(screen.getByRole("heading", { level: 3, name: titleCase(g.label) })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Precedes" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Follows" })).toBeInTheDocument();

    const incoming = groups.flatMap((g) => g.relations).find((r) => r.type === "PRECEDES" && r.direction === "incoming")!;
    await userEvent.click(screen.getByRole("link", { name: titleCase(incoming.concept.title) }));
    const followed = (await h.events()).find((e) => e.type === "relationship_followed")!;
    expect(followed.metadata).toEqual({
      relationshipId: incoming.relationshipId,
      relationshipTypeCode: "PRECEDES",
      fromConceptId: stageTwo.id,
      toConceptId: incoming.concept.id,
      direction: "inverse",
    });
    expect(h.visits.read().pendingVia).toBe("link");
  });
});

describe("exposure under the content-in-view rule", () => {
  const conceptId = view.getConcept("alpha.process_stage.stage-one")!.id;
  const region = () => (
    <ExposureRegion conceptId={conceptId} layer="process" context={{ roomOrPageId: "concept:s1" }}>
      <p>claims</p>
    </ExposureRegion>
  );
  const kinds = async (h: { events(): Promise<{ type: string }[]> }) => (await h.events()).map((e) => e.type).filter((t) => t.startsWith("exposure") || t.startsWith("navigation"));

  it("starts exposure at >= 50% visible and ends it when the region leaves; navigation otherwise", async () => {
    const h = renderWithTelemetry(region());
    const io = MockIntersectionObserver.observers[0]!;
    expect(await kinds(h)).toEqual(["navigation_started"]);

    act(() => io.fire(0.3));
    expect(await kinds(h)).toEqual(["navigation_started"]);

    act(() => io.fire(0.6));
    act(() => io.fire(0.1));
    const events = await h.events();
    expect(events.map((e) => e.type).filter((t) => /^(exposure|navigation)/.test(t))).toEqual([
      "navigation_started",
      "navigation_ended",
      "exposure_started",
      "exposure_ended",
      "navigation_started",
    ]);
    const started = events.find((e) => e.type === "exposure_started")!;
    expect(started).toMatchObject({ conceptId, roomOrPageId: "concept:s1", metadata: { layer: "process" } });
    for (const e of events) expect(telemetryEventSchema.safeParse(e).success, e.type).toBe(true);
  });

  it("counts a region taller than the viewport as in view when it fills half the viewport", async () => {
    const h = renderWithTelemetry(region());
    const io = MockIntersectionObserver.observers[0]!;
    // 3000 px region, 800 px viewport: 20% of the region = 600 px on screen (75% of the viewport).
    act(() => io.fire(0.2, { element: 3000, viewport: 800 }));
    expect(await kinds(h)).toContain("exposure_started");
    expect(rectInView({ top: -2000, bottom: 300, height: 2300 }, 800)).toBe(false);
    expect(rectInView({ top: -100, bottom: 700, height: 800 }, 800)).toBe(true);
  });

  it("closes the exposure interval when the page unmounts", async () => {
    const h = renderWithTelemetry(region());
    act(() => MockIntersectionObserver.observers[0]!.fire(1));
    h.rerender(<p>another page</p>);
    const ended = (await h.events()).filter((e) => e.type === "exposure_ended");
    expect(ended).toHaveLength(1);
    expect(ended[0]!.metadata).toMatchObject({ reason: "closed", layer: "process" });
  });
});

describe("page telemetry", () => {
  const alpha = view.getTradition("alpha")!;
  const beta = view.getTradition("beta")!;

  it("logs entry, concept encounter, revisit, tradition crossing and exit", async () => {
    const visits = createVisitStore("s", null);
    visits.enter("tradition:beta", beta.id);
    visits.enter("concept:alpha.tool.tool-b", alpha.id);
    visits.setPendingVia("link");
    const concept = view.getConcept("alpha.tool.tool-b")!;
    const h = renderWithTelemetry(<PageTelemetry pageId="concept:alpha.tool.tool-b" conceptId={concept.id} traditionId={alpha.id} category="tools" />, { visits });
    // The learner saw beta, then this concept, and now returns to it through a link.
    h.unmount();
    await new Promise((r) => setTimeout(r, 5));
    const events = await h.outbox.list("0190f0a0-0000-7000-8000-000000000001");
    const types = events.map((e) => e.type);
    expect(types).toEqual(["page_entered", "concept_encountered", "item_revisited", "page_exited"]);
    expect(events[0]).toMatchObject({ roomOrPageId: "concept:alpha.tool.tool-b", metadata: { via: "link", fromId: "concept:alpha.tool.tool-b" } });
    expect(events[2]!.metadata).toEqual({ itemKind: "concept", visitCount: 2 });
    expect(events[3]!.metadata).toMatchObject({ dwellMs: expect.any(Number) });
  });

  it("logs a tradition crossing when the learner moves to another tradition", async () => {
    const visits = createVisitStore("s", null);
    visits.enter("tradition:alpha", alpha.id);
    const h = renderWithTelemetry(<PageTelemetry pageId="tradition:beta" traditionId={beta.id} />, { visits });
    const crossed = (await h.events()).find((e) => e.type === "tradition_crossed")!;
    expect(crossed.metadata).toEqual({ fromTraditionId: alpha.id, toTraditionId: beta.id });
  });
});

describe("disclosed sections", () => {
  it("toggles with the keyboard, shows no count and logs information_layer_opened / closed", async () => {
    const h = renderWithTelemetry(
      <DisclosureSection sectionId="process" title="Process sequence" pageId="tradition:alpha">
        <p>steps</p>
      </DisclosureSection>,
    );
    const button = screen.getByRole("button", { name: "Process Sequence" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button.textContent).toBe("Process Sequence");
    expect(screen.getByText("steps")).not.toBeVisible();
    button.focus();
    await userEvent.keyboard("{Enter}");
    expect(screen.getByText("steps")).toBeVisible();
    await userEvent.keyboard(" ");
    const layer = (await h.events()).filter((e) => e.type.startsWith("information_layer"));
    expect(layer.map((e) => [e.type, e.metadata.layerId])).toEqual([
      ["information_layer_opened", "section:process"],
      ["information_layer_closed", "section:process"],
    ]);
  });
});

describe("the 2D StudyBar group", () => {
  const budget: LearningTimeBudget = { mode: "self_paced", budgetSeconds: null, allowEarlyFinish: false, startedAt: null, endsAt: null, endedAt: null, serverNow: "2026-01-01T00:00:00.000Z", persisted: false };
  const guidance: GuidanceSettings = { policy: "none", cueEnabled: false, stallSeconds: 60, hintText: null };
  const stageOne = view.getConcept("alpha.process_stage.stage-one")!;
  const index: StudyBarIndex = {
    traditions: [
      { slug: "alpha", name: "Alpha" },
      { slug: "beta", name: "Beta" },
    ],
    concepts: { [stageOne.slug]: [stageOne.title, 0] },
    parents: [{ label: "Process Sequence", href: href2d.traditionSection("alpha", "process") }],
  };
  const bar = (searchEnabled: boolean, extra: ReactNode = null) => (
    <LearningPhaseProvider budget={budget} mode="demo">
      <GuidanceProvider guidance={guidance}>
        <ChromeOverlayProvider>
          <Learning2dStudyBar index={index} searchEnabled={searchEnabled} />
          {extra}
        </ChromeOverlayProvider>
      </GuidanceProvider>
    </LearningPhaseProvider>
  );

  it("offers Search only when the study enables it, as a sheet with a 44 px field", async () => {
    const off = renderWithTelemetry(bar(false));
    expect(screen.queryByRole("button", { name: "Search" })).toBeNull();
    expect(screen.queryByRole("search")).toBeNull();
    off.unmount();
    renderWithTelemetry(bar(true));
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    const dialog = screen.getByRole("dialog", { name: "Search" });
    expect(within(dialog).getByRole("search")).toBeInTheDocument();
    expect(within(dialog).getByRole("searchbox", { name: "Search concepts" })).toHaveClass("h-11");
  });

  it("names the page from the URL and has no 'Up to <parent>' (Close in the sheet replaces it, DR-021)", () => {
    const index2d = renderWithTelemetry(bar(false));
    expect(document.querySelector("[data-slot=study-bar]")!).toHaveTextContent("Craft Traditions");
    expect(screen.queryByRole("link", { name: /^Up to/ })).toBeNull();
    index2d.unmount();
    nav.pathname = href2d.concept(stageOne.slug);
    renderWithTelemetry(bar(false));
    expect(document.querySelector("[data-slot=study-bar]")!).toHaveTextContent(titleCase(stageOne.title));
    expect(screen.queryByRole("link", { name: /^Up to/ })).toBeNull();
  });

  it("lists the traditions in the given order with their sections in Contents, and counts navigation while it is open", async () => {
    const conceptId = stageOne.id;
    const h = renderWithTelemetry(
      bar(
        false,
        <ExposureRegion conceptId={conceptId} layer="process" context={{ roomOrPageId: "concept:s1" }}>
          <p>claims</p>
        </ExposureRegion>,
      ),
    );
    act(() => MockIntersectionObserver.observers[0]!.fire(1));
    await userEvent.click(screen.getByRole("button", { name: "Contents" }));
    const dialog = screen.getByRole("dialog", { name: "Contents" });
    const traditionLinks = within(dialog)
      .getAllByRole("link")
      .filter((a) => /\/traditions\/[^#]+$/.test(a.getAttribute("href") ?? ""));
    expect(traditionLinks.map((a) => a.textContent)).toEqual(["Alpha", "Beta"]);
    // One link per section of the shared section map (DR-024).
    expect(within(dialog).getByRole("list", { name: "Alpha" }).querySelectorAll("a")).toHaveLength(EPISTEMIC_SECTIONS.length);
    await userEvent.keyboard("{Escape}");
    const kinds = (await h.events()).map((e) => e.type).filter((t) => /^(exposure|navigation)/.test(t));
    expect(kinds).toEqual(["navigation_started", "navigation_ended", "exposure_started", "exposure_ended", "navigation_started", "navigation_ended", "exposure_started"]);
  });
});

describe("shared learning-task prompts", () => {
  it("renders nothing without protocol prompts and the prompts verbatim otherwise", async () => {
    const { container } = render(<LearningTaskPrompts prompts={[]} />);
    expect(container).toBeEmptyDOMElement();
    const h = renderWithTelemetry(<LearningTaskPrompts prompts={[{ id: "p1", text: "Prompt one" }]} />);
    expect(screen.getByText("Prompt one")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: /Your Learning Task/ }));
    expect((await h.events()).map((e) => e.type)).toContain("information_layer_closed");
  });
});

describe("shared learning phase", () => {
  const base: LearningTimeBudget = {
    mode: "fixed_time",
    budgetSeconds: 600,
    allowEarlyFinish: false,
    startedAt: "2026-01-01T00:00:00.000Z",
    endsAt: "2026-01-01T00:10:00.000Z",
    endedAt: null,
    serverNow: "2026-01-01T00:05:00.000Z",
    persisted: true,
  };

  it("shows the remaining time and no finish control when early finish is not allowed", () => {
    renderWithTelemetry(
      <LearningPhaseProvider budget={base} mode="study">
        <LearningTimer />
        <LearningPhaseContent>
          <p>content</p>
        </LearningPhaseContent>
      </LearningPhaseProvider>,
    );
    expect(screen.getByRole("timer")).toHaveTextContent("5:00");
    expect(screen.queryByRole("button", { name: /Finish/ })).toBeNull();
    expect(screen.getByText("content")).toBeVisible();
    expect(formatRemaining(3725)).toBe("1:02:05");
  });

  it("when time is up: ends the open interval with budget_ended, hides the content and hands back to the study flow", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "performance"] });
    try {
      const conceptId = view.getConcept("alpha.tool.tool-b")!.id;
      const h = renderWithTelemetry(
        <LearningPhaseProvider budget={{ ...base, serverNow: "2026-01-01T00:09:59.000Z" }} mode="study">
          <LearningPhaseContent>
            <ExposureRegion conceptId={conceptId} layer="overview" context={{ roomOrPageId: "concept:t" }}>
              <p>content</p>
            </ExposureRegion>
          </LearningPhaseContent>
        </LearningPhaseProvider>,
      );
      act(() => MockIntersectionObserver.observers[0]!.fire(1));
      expect(screen.getByText("content")).toBeVisible();
      act(() => vi.advanceTimersByTime(2000));
      vi.useRealTimers();
      expect(screen.queryByText("content")).toBeNull();
      expect(screen.getByRole("heading", { name: "The Learning Time Is Over" })).toHaveFocus();
      expect(replace).toHaveBeenCalledWith("/study/session");
      const ended = (await h.events()).filter((e) => e.type === "exposure_ended");
      expect(ended.map((e) => e.metadata.reason)).toEqual(["budget_ended"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("offers a confirmed finish when the budget allows it (self-paced)", async () => {
    renderWithTelemetry(
      <LearningPhaseProvider budget={{ ...base, mode: "self_paced", budgetSeconds: null, endsAt: null }} mode="demo">
        <LearningTimer />
        <LearningPhaseContent>
          <p>content</p>
        </LearningPhaseContent>
      </LearningPhaseProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Finish learning" }));
    expect(screen.getByText("content")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Confirm: finish learning" }));
    expect(screen.getByRole("heading", { name: "You Have Finished Learning" })).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("several concepts on one page (comparisons): one exposure region counts at a time", () => {
  it("picks the in-view region with the most visible height, the first on a tie, none when none is in view", () => {
    const vh = 800;
    expect(pickActiveRegion([{ id: "a", top: 0, bottom: 300, height: 300 }, { id: "b", top: 300, bottom: 800, height: 500 }], vh)).toBe("b");
    expect(pickActiveRegion([{ id: "a", top: 0, bottom: 400, height: 400 }, { id: "b", top: 400, bottom: 800, height: 400 }], vh)).toBe("a");
    expect(pickActiveRegion([{ id: "a", top: 900, bottom: 1300, height: 400 }], vh)).toBeNull();
  });

  it("opens exposure for one concept only, and navigation while none counts", async () => {
    const a = view.getConcept("alpha.process_stage.stage-one")!.id;
    const b = view.getConcept("beta.process_stage.stage-one")!.id;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0) as unknown as number);
    vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
    const frame = () => new Promise((r) => setTimeout(r, 5));
    const rects: Record<string, { top: number; bottom: number }> = { [a]: { top: 0, bottom: 250 }, [b]: { top: 250, bottom: 750 } };
    const spy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const r = rects[this.dataset.exposureConcept ?? ""] ?? { top: 2000, bottom: 2000 };
      return { top: r.top, bottom: r.bottom, height: r.bottom - r.top, left: 0, right: 0, width: 0, x: 0, y: r.top, toJSON: () => ({}) } as DOMRect;
    });
    try {
      const h = renderWithTelemetry(
        <ExposureGroup context={{ roomOrPageId: "comparisons" }}>
          <ExposureRegion conceptId={a} layer="overview" context={{ roomOrPageId: "comparisons" }}>
            <p>claims a</p>
          </ExposureRegion>
          <ExposureRegion conceptId={b} layer="overview" context={{ roomOrPageId: "comparisons" }}>
            <p>claims b</p>
          </ExposureRegion>
        </ExposureGroup>,
      );
      await act(async () => {
        window.dispatchEvent(new Event("scroll"));
        await frame();
      });
      const started = (await h.events()).filter((e) => e.type === "exposure_started");
      expect(started.map((e) => e.conceptId)).toEqual([b]);
      rects[a] = { top: 3000, bottom: 3300 };
      rects[b] = { top: 3300, bottom: 3800 };
      await act(async () => {
        window.dispatchEvent(new Event("scroll"));
        await frame();
      });
      const kinds = (await h.events()).map((e) => e.type).filter((t) => /^(exposure|navigation)/.test(t));
      expect(kinds.slice(-2)).toEqual(["exposure_ended", "navigation_started"]);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("learning-task prompts never stack above a concept's sheet", () => {
  it("renders the prompts after the content on concept pages and before it elsewhere", () => {
    nav.pathname = "/learn/2d/concepts/some-concept";
    const { rerender } = render(
      <>
        <LearningPromptsSlot position="before">
          <p>prompt before</p>
        </LearningPromptsSlot>
        <LearningPromptsSlot position="after">
          <p>prompt after</p>
        </LearningPromptsSlot>
      </>,
    );
    expect(screen.queryByText("prompt before")).toBeNull();
    expect(screen.getByText("prompt after")).toBeInTheDocument();
    nav.pathname = "/learn/2d/traditions/alpha";
    rerender(
      <>
        <LearningPromptsSlot position="before">
          <p>prompt before</p>
        </LearningPromptsSlot>
        <LearningPromptsSlot position="after">
          <p>prompt after</p>
        </LearningPromptsSlot>
      </>,
    );
    expect(screen.getByText("prompt before")).toBeInTheDocument();
    expect(screen.queryByText("prompt after")).toBeNull();
  });
});

describe("concept layers in 2D (LayerTabs, as the 3D panel)", () => {
  const [c1, s1, s2] = ["alpha.process_stage.stage-one", "beta.process_stage.stage-one", "alpha.process_stage.stage-two"].map((k) => view.getConcept(k)?.id ?? k);
  const sheet = (
    <ConceptLayersSheet
      concept={{ id: c1!, title: "Concept one", type: "material", category: "materials", localTerms: [], tradition: null, verificationState: "draft" }}
      step={null}
      pageId="concept:c1"
      layers={[
        { id: "overview", entries: [{ conceptId: c1!, title: "Concept one", category: "materials", traditionId: null, view: <p>own claims</p> }] },
        {
          id: "science",
          entries: [
            { conceptId: s1!, title: "Science one", category: "scientific_mechanisms", traditionId: null, view: <p>science one claims</p> },
            { conceptId: s2!, title: "Science two", category: "scientific_mechanisms", traditionId: null, view: <p>science two claims</p> },
          ],
        },
      ]}
      relatedByConcept={{ [c1!]: <p>related of c1</p>, [s1!]: <p>related of s1</p>, [s2!]: null }}
      pager={null}
      closeHref={href2d.traditionSection("alpha", "materials-tools")}
    />
  );

  it("shows LayerTabs, one layer and one concept at a time, with Related Concepts following the concept shown", async () => {
    renderWithTelemetry(sheet);
    const tabs = screen.getAllByRole("tab").map((t) => t.textContent);
    expect(tabs).toEqual(["Overview", "Science"]);
    expect(screen.getByText("own claims")).toBeInTheDocument();
    expect(screen.getByText("related of c1")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Science" }));
    expect(screen.queryByText("own claims")).toBeNull();
    expect(screen.getByText("science one claims")).toBeInTheDocument();
    expect(screen.getByText("related of s1")).toBeInTheDocument();
    const chooser = screen.getByRole("group", { name: "Concepts in this layer" });
    await userEvent.click(within(chooser).getByRole("button", { name: /Science Two/ }));
    expect(screen.getByText("science two claims")).toBeInTheDocument();
    expect(screen.queryByText(/related of/)).toBeNull();
  });

  it("logs layer and concept changes as the panel does", async () => {
    const h = renderWithTelemetry(sheet);
    await userEvent.click(screen.getByRole("tab", { name: "Science" }));
    const events = (await h.events()).filter((e) => /information_layer|knowledge_layer|concept_encountered/.test(e.type));
    expect(events.map((e) => [e.type, e.metadata])).toEqual([
      ["information_layer_closed", expect.objectContaining({ layerId: "overview" })],
      ["information_layer_opened", { layerId: "science" }],
      ["knowledge_layer_selected", { layer: "science" }],
      ["concept_encountered", { mode: "opened" }],
    ]);
    expect(events.at(-1)).toMatchObject({ conceptId: s1!, roomOrPageId: "concept:c1" });
    for (const e of events) expect(telemetryEventSchema.safeParse(e).success, e.type).toBe(true);
  });
});
