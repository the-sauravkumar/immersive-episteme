/**
 * The shared knowledge components (DESIGN.md 9.6-9.14, 9.17, 9.20; 12.1 rule 1): both conditions
 * render the SAME components, so given the same props they must produce the same DOM.
 *
 *  - KnowledgeSheet: identical DOM in `placement="page"` and `placement="panel"`, apart from the
 *    reserved action slot (WP0 acceptance), with the header, progress bar, metadata, field,
 *    related and pager in the specified order; focus moves to the h1 on open (P27).
 *  - ClaimList: numbered claims with a hidden hang number, one numbered citation marker per
 *    citation inside the claim, the figure right after its anchor claim, one reference list.
 *  - CitedClaim / CitationRecord: one activation to the record in place, Escape returns focus.
 *  - KnowledgeFigure: the 3:2 slot, "Fig. n", one Enlarge control, an opaque lightbox and focus
 *    return; diagrams render only graph text.
 *  - LayerTabs: canonical names and order, arrow keys, Home and End.
 *  - RelatedConcepts: grouped by verb with one "About these links" disclosure per group.
 *  - StudyBar: the shared group is identical whatever the condition group holds.
 *  - Onboarding: the same screen apart from the movement step, whose two versions differ by at
 *    most 10% in words (P23).
 * Fixtures are the placeholder knowledge-graph fixtures (no craft facts).
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { ClaimList, KnowledgeSheet, LayeredField, Pager, RelatedConcepts, relatedLinksFromGroups, SheetReferences, type SheetConcept } from "@/components/knowledge";
import { GuidanceProvider, LearningPhaseProvider, Onboarding, onboardingSteps, StallCue, StudyBar, StudyBarButton } from "@/components/learning";
import { diagramCredit, diagramFigureOf, referenceNumbers, type ConceptDetail, type DiagramFigure } from "@/features/knowledge/read/view";
import { KNOWLEDGE_LAYERS } from "@/features/learning/labels";
import type { GuidanceSettings } from "@/features/learning/settings";
import { ONBOARDING_TEXT } from "@/features/learning/strings";
import type { LearningTimeBudget } from "@/features/learning/time-budget";

import { fixtureView, renderWithTelemetry } from "../learning-2d/harness";

vi.mock("next/navigation", () => ({ usePathname: () => "/learn/2d", useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a> }));

const view = fixtureView();
const concept = view.getConcept("alpha.process_stage.stage-two")!;
const sheetConcept = (c: ConceptDetail): SheetConcept => ({
  id: c.id,
  title: c.title,
  type: c.type,
  category: c.category,
  localTerms: c.localTerms,
  tradition: c.tradition ? { slug: c.tradition.slug, name: c.tradition.name } : null,
  verificationState: c.verificationState,
});
const diagrams = view.structureDiagrams("alpha");
const figureFor = (c: ConceptDetail): DiagramFigure[] =>
  diagrams.filter((d) => d.anchor.conceptId === c.id).map((d) => diagramFigureOf(d, diagramCredit(view.info().versionLabel)));

/** Normalises React's generated ids (useId) so two renders can be compared. */
function normalise(html: string): string {
  const ids = new Map<string, string>();
  return html.replace(/(«r[0-9a-z]+»|_r_[0-9a-z]+_|:r[0-9a-z]+:|r[0-9a-z]+(?=-arrow))/g, (m) => {
    if (!ids.has(m)) ids.set(m, `ID${ids.size}`);
    return ids.get(m)!;
  });
}

function Sheet({ c, placement, action }: { c: ConceptDetail; placement: "page" | "panel"; action?: ReactNode }) {
  const related = view.getRelatedConcepts(c.id) ?? [];
  return (
    <KnowledgeSheet
      concept={sheetConcept(c)}
      placement={placement}
      step={{ index: 2, total: 3 }}
      action={action}
      related={<RelatedConcepts conceptId={c.id} traditionSlug={c.traditionSlug} links={relatedLinksFromGroups(related)} traditionNames={{ alpha: "Alpha", beta: "Beta" }} headingId="related" renderLink={(l, content, className) => <a href={`#${l.concept.id}`} className={className}>{content}</a>} />}
      pager={<Pager prev={{ conceptId: "p", title: "previous concept" }} next={{ conceptId: "n", title: "next concept" }} renderLink={(item, _dir, content, className) => <a href={`#${item.conceptId}`} className={className}>{content}</a>} />}
    >
      <ClaimList conceptId={c.id} claims={c.claims} figures={figureFor(c)} />
    </KnowledgeSheet>
  );
}

describe("KnowledgeSheet: one container, two placements", () => {
  it("renders the same DOM as a page and as a panel, apart from the reserved action slot", () => {
    const page = render(<Sheet c={concept} placement="page" />);
    const pageHtml = normalise(page.container.innerHTML);
    page.unmount();
    const panel = render(<Sheet c={concept} placement="panel" action={<button type="button" aria-label="Close">x</button>} />);
    const slot = panel.container.querySelector("[data-slot=sheet-action]")!;
    expect(within(slot as HTMLElement).getByRole("button", { name: "Close" })).toBeInTheDocument();
    slot.innerHTML = "";
    expect(normalise(panel.container.innerHTML)).toBe(pageHtml);
  });

  it("orders header, metadata, progress, field, related concepts and pager, and focuses the h1", () => {
    render(<Sheet c={concept} placement="page" />);
    const sheet = screen.getByRole("region", { name: /stage two/i });
    const h1 = within(sheet).getByRole("heading", { level: 1 });
    expect(h1).toHaveFocus();
    expect(h1).toHaveAttribute("tabindex", "-1");
    const order = ["sheet-action", "sheet-meta", "reading-progress", "sheet-field", "related-concepts", "pager"].map((s) => sheet.querySelector(`[data-slot=${s}]`)!);
    for (let i = 1; i < order.length; i++) expect(order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Step is a metadata row, not an eyebrow (DR-022).
    const meta = sheet.querySelector("[data-slot=sheet-meta]")!;
    expect(within(meta as HTMLElement).getByText("Step")).toBeInTheDocument();
    expect(within(meta as HTMLElement).getByText("2 of 3")).toBeInTheDocument();
    // Lean metadata (cognitive-load rule): no Status row; the notice strip states the status.
    expect(Array.from(meta.querySelectorAll("dt")).map((d) => d.textContent)).not.toContain("Status");
    expect(within(sheet).getByRole("progressbar", { name: "Reading progress" })).toHaveAttribute("aria-valuenow");
    // No tradition marker on any key (P17, DR-022): the tradition is named in words only.
    expect(sheet.querySelector("[data-slot=tradition-marker]")).toBeNull();
    expect(sheet.querySelector("[data-slot=tradition-name]")).not.toBeNull();
    expect(within(sheet).getByRole("heading", { level: 2, name: "From the Sources" })).toBeInTheDocument();
  });
});

describe("ClaimList and the numbered citation markers", () => {
  it("numbers the claims, hides the hang number and gives every citation its own marker and record", async () => {
    const h = renderWithTelemetry(<ClaimList conceptId={concept.id} claims={concept.claims} />);
    const list = screen.getByRole("list", { name: "Statements" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(concept.claims.length);
    expect(items[0]!.querySelector("[aria-hidden=true]")!.textContent).toBe("1");
    const markers = within(list).getAllByRole("button", { name: /^Source \d+: / });
    expect(markers).toHaveLength(concept.claims.flatMap((c) => c.evidence).length);
    // Every marker sits inside its claim paragraph, collapsed by default.
    for (const m of markers) {
      expect(m.closest("[data-slot=claim]")).not.toBeNull();
      expect(m).toHaveAttribute("aria-expanded", "false");
    }
    // Numbers follow the deduplicated reference list of these claims.
    const numbers = referenceNumbers(concept.claims);
    const expected = concept.claims.flatMap((c) => c.evidence.map((e) => String(numbers.get(e.id))));
    expect(markers.map((m) => m.getAttribute("data-citation-number"))).toEqual(expected);
    // One activation reaches the record, in place; Escape returns to the marker.
    await userEvent.click(markers[0]!);
    expect(markers[0]).toHaveAttribute("aria-expanded", "true");
    const record = screen.getByRole("region", { name: /^Source 1: / });
    expect(markers[0]!.closest("li")!.contains(record)).toBe(true);
    fireEvent.keyDown(record, { key: "Escape" });
    expect(markers[0]).toHaveAttribute("aria-expanded", "false");
    expect(markers[0]).toHaveFocus();
    expect((await h.events()).map((e) => e.type)).toEqual(expect.arrayContaining(["citation_opened", "citation_closed"]));
    // Standalone, the list is followed by ONE deduplicated reference list.
    const refs = screen.getByRole("region", { name: "References" });
    expect(within(refs).getAllByRole("listitem")).toHaveLength(numbers.size);
  });

  it("leaves the reference list to the sheet's slot when placed in a KnowledgeSheet", () => {
    render(
      <KnowledgeSheet concept={sheetConcept(concept)} autoFocusTitle={false} references={<SheetReferences conceptId={concept.id} claims={concept.claims} />}>
        <ClaimList conceptId={concept.id} claims={concept.claims} references="sheet" />
      </KnowledgeSheet>,
    );
    const lists = screen.getAllByRole("region", { name: "References" });
    expect(lists).toHaveLength(1);
    // At the end of the field, before Related Concepts and the pager.
    const field = document.querySelector("[data-slot=sheet-field]")!;
    expect(field.contains(lists[0]!)).toBe(false);
    expect(field.compareDocumentPosition(lists[0]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("KnowledgeFigure", () => {
  const anchored = view.getConcept(diagrams[0]!.anchor.conceptId)!;
  const figures = figureFor(anchored);

  it("renders a generated diagram after its anchor claim, in a 3:2 slot, with one Enlarge control", async () => {
    expect(figures).toHaveLength(1);
    render(<ClaimList conceptId={anchored.id} claims={anchored.claims} figures={figures} />);
    const items = screen.getAllByRole("listitem");
    const figure = items[figures[0]!.anchorClaimIndex]!.querySelector("figure")!;
    expect(figure).not.toBeNull();
    expect(figure.querySelector("[data-slot=figure-slot]")!.className).toContain("aspect-[3/2]");
    expect(within(figure).getByText("Fig. 1")).toBeInTheDocument();
    expect(within(figure).getByText(figures[0]!.credit)).toBeInTheDocument();
    const svg = within(figure).getByRole("img");
    expect(svg).toHaveAttribute("aria-label", figures[0]!.alt);
    // The SVG text is exactly the node labels and the edge and band labels from the graph.
    const d = figures[0]!.diagram;
    const allowed = new Set([...d.nodes.flatMap((n) => n.lines), ...d.edges.map((e) => e.label), ...d.bands.map((b) => b.label)]);
    for (const t of svg.querySelectorAll("tspan, text")) {
      if (t.tagName.toLowerCase() === "text" && t.querySelector("tspan")) continue;
      expect(allowed.has(t.textContent!)).toBe(true);
    }
    const enlarge = within(figure).getByRole("button", { name: "Enlarge figure 1" });
    expect(within(figure).getAllByRole("button")).toHaveLength(1);

    await userEvent.click(enlarge);
    const dialog = figure.querySelector("dialog")!;
    expect(dialog).toHaveAttribute("open");
    expect(dialog.className).toContain("bg-ground");
    expect(dialog.className).toContain("backdrop:bg-ground");
    const close = within(dialog).getByRole("button", { name: "Close" });
    expect(close).toHaveFocus();
    await userEvent.click(close);
    expect(dialog).not.toHaveAttribute("open");
    expect(enlarge).toHaveFocus();
  });
});

describe("LayerTabs", () => {
  it("shows the canonical names in the canonical order and moves with arrow keys, Home and End", async () => {
    const layers = [...KNOWLEDGE_LAYERS].reverse().map((l) => ({ id: l.id, content: <p>{`${l.id} content`}</p> }));
    render(<LayeredField layers={layers} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(KNOWLEDGE_LAYERS.map((l) => l.label));
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("overview content");
    act(() => tabs[0]!.focus());
    await userEvent.keyboard("{ArrowRight}");
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
    expect(tabs[1]).toHaveFocus();
    expect(screen.getByRole("tabpanel")).toHaveTextContent("artisan content");
    await userEvent.keyboard("{End}");
    expect(tabs[4]).toHaveFocus();
    await userEvent.keyboard("{Home}");
    expect(tabs[0]).toHaveFocus();
    expect(tabs.every((t) => t.className.includes("min-h-11"))).toBe(true);
  });
});

describe("RelatedConcepts", () => {
  it("groups by relation verb with one About these links disclosure per group", () => {
    const groups = view.getRelatedConcepts(concept.id)!;
    const links = relatedLinksFromGroups(groups);
    render(<RelatedConcepts conceptId={concept.id} traditionSlug="alpha" links={links} traditionNames={{ alpha: "Alpha" }} headingId="rel" renderLink={(l, content, className) => <a href={`#${l.concept.id}`} className={className}>{content}</a>} />);
    const verbs = new Set(links.map((l) => `${l.type}:${l.direction}`));
    const h3 = screen.getAllByRole("heading", { level: 3 });
    expect(h3).toHaveLength(verbs.size);
    const withDetails = [...verbs].filter((v) => links.some((l) => `${l.type}:${l.direction}` === v && (l.explanation || l.conditions || l.statedBy.length)));
    expect(screen.queryAllByText("About these links")).toHaveLength(withDetails.length);
    expect(screen.getAllByRole("link")).toHaveLength(links.length);
  });
});

const HYBRID: GuidanceSettings = { policy: "hybrid", cueEnabled: true, stallSeconds: 10, hintText: "Researcher hint for the test." };
const FIXED: LearningTimeBudget = {
  mode: "fixed_time",
  budgetSeconds: 1200,
  allowEarlyFinish: true,
  startedAt: "2026-01-01T00:00:00.000Z",
  endsAt: "2026-01-01T00:20:00.000Z",
  endedAt: null,
  serverNow: "2026-01-01T00:00:00.000Z",
  persisted: false,
};

describe("StudyBar", () => {
  const bar = (nav: ReactNode, locationAs: "text" | "h1") =>
    renderWithTelemetry(
      <LearningPhaseProvider budget={FIXED} mode="demo">
        <GuidanceProvider guidance={HYBRID}>
          <StudyBar location="a location" locationAs={locationAs} skipTargetId="content" conditionNav={nav} />
          <StallCue />
        </GuidanceProvider>
      </LearningPhaseProvider>,
    );

  it("renders the same skip link, wordmark and shared controls whatever the condition group holds", () => {
    const a = bar(<StudyBarButton icon={<span />} label="Contents" />, "text");
    const sharedA = normalise(a.container.querySelector("[data-slot=study-bar-shared]")!.outerHTML);
    const skipA = a.container.querySelector("[data-slot=study-skip-link]")!.outerHTML;
    expect(screen.getByRole("button", { name: "Hint" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Finish learning" })).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveAccessibleName(/^Learning time left: /);
    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveAttribute("href", "#content");
    a.unmount();
    const b = bar(
      <>
        <StudyBarButton icon={<span />} label="Plan" />
        <StudyBarButton icon={<span />} label="Pause" />
      </>,
      "h1",
    );
    expect(normalise(b.container.querySelector("[data-slot=study-bar-shared]")!.outerHTML)).toBe(sharedA);
    expect(b.container.querySelector("[data-slot=study-skip-link]")!.outerHTML).toBe(skipA);
    expect(screen.getByRole("heading", { level: 1, name: "A Location" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Plan" })).toHaveAttribute("title", "Plan");
  });
});

describe("Onboarding", () => {
  const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

  it("writes the two movement steps to the same length (within 10% of words)", () => {
    const a = words(ONBOARDING_TEXT.movement["2d"]);
    const b = words(ONBOARDING_TEXT.movement.immersive);
    expect(Math.abs(a - b) / Math.max(a, b)).toBeLessThanOrEqual(0.1);
  });

  it("shows the same screen in both conditions apart from the movement step", () => {
    const opts = { minutes: 20, hintAvailable: true } as const;
    const twoD = onboardingSteps({ condition: "2d", ...opts });
    const threeD = onboardingSteps({ condition: "immersive", ...opts });
    expect(twoD.map((s) => s.id)).toEqual(threeD.map((s) => s.id));
    expect(twoD.filter((s) => s.id !== "movement")).toEqual(threeD.filter((s) => s.id !== "movement"));

    const first = render(<Onboarding condition="2d" {...opts} onStart={() => {}} />);
    const htmlA = first.container.innerHTML.replace(ONBOARDING_TEXT.movement["2d"], "MOVEMENT");
    expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();
    first.unmount();
    const second = render(<Onboarding condition="immersive" {...opts} onStart={() => {}} />);
    expect(second.container.innerHTML.replace(ONBOARDING_TEXT.movement.immersive, "MOVEMENT")).toBe(htmlA);
    expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
  });
});
