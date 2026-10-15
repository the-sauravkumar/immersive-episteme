/**
 * The rendered information panel (DESIGN.md 11.6, WP3): it is a placement of the SHARED
 * `KnowledgeSheet` (no claim, tab or relation markup of its own), shows the read model's claims
 * verbatim and in order through the shared `ClaimList` with one collapsed citation note per
 * citation, reads layer names and order from `KNOWLEDGE_LAYERS`, places Close over the sheet's
 * reserved action slot but after the sheet in the DOM (the slot stays empty, as in 2D, so the tab
 * stops from the h1 to the first citation note are the same: P13), focuses the sheet h1 on open,
 * and Escape closes it (but not from inside a dialog such as the figure lightbox).
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { InfoPanel, type InfoPanelProps } from "@/components/museum/overlays/info-panel";
import { buildPanelModel, toPanelConcept } from "@/features/immersive/panel-content";
import { buildSceneModel } from "@/features/immersive/scene-model";
import type { PanelConcept } from "@/features/immersive/types";
import { diagramFiguresByConcept, type SourceView } from "@/features/knowledge/read/view";
import { KNOWLEDGE_LAYERS, STUDY_TRADITION_SLUGS } from "@/features/learning/labels";
import { titleCase } from "@/lib/text/title-case";

import { museumFixture } from "./fixtures";

describe("InfoPanel", () => {
  const { manifest, view } = museumFixture();
  const model = buildSceneModel(manifest.manifest);
  const placed = new Set(model.exhibits.map((e) => e.conceptId));
  const ids = new Set([...placed, ...model.exhibits.flatMap((e) => e.layers.map((l) => l.conceptId))]);
  const sources = new Map<string, SourceView>();
  const concepts: Record<string, PanelConcept> = {};
  for (const id of ids) {
    const c = view.getConcept(id);
    if (c) concepts[id] = toPanelConcept(c, view.getRelatedConcepts(id), sources, null, (x) => placed.has(x));
  }
  const figures = Object.fromEntries(diagramFiguresByConcept(view, { traditionSlugs: [...STUDY_TRADITION_SLUGS], balanceSlugs: [...STUDY_TRADITION_SLUGS] }));
  const exhibit = model.exhibits.find((e) => concepts[e.conceptId]!.claims.length > 1 && concepts[e.conceptId]!.related.length > 0 && buildPanelModel(model, e, concepts).tabs.length > 1)!;
  const read = view.getConcept(exhibit.conceptId)!;

  function renderPanel(over: Partial<InfoPanelProps> = {}) {
    const props: InfoPanelProps = {
      model,
      exhibit,
      concepts,
      sources: Object.fromEntries(sources),
      traditionNames: { ajrakh: "Ajrakh", sanganeri: "Sanganeri", "machilipatnam-kalamkari": "Machilipatnam Kalamkari" },
      figures,
      tab: "overview",
      conceptId: exhibit.conceptId,
      causal: [],
      docked: true,
      placedConceptIds: placed,
      onTab: vi.fn(),
      onFocusConcept: vi.fn(),
      onClose: vi.fn(),
      onWalkToConcept: vi.fn(),
      onWalkToElement: vi.fn(),
      onFollowCausal: vi.fn(),
      ...over,
    };
    return { props, ...render(<InfoPanel {...props} />) };
  }

  it("is a placement of the shared KnowledgeSheet, with no claim markup of its own", () => {
    const { container } = renderPanel();
    const sheets = container.querySelectorAll("[data-slot=knowledge-sheet]");
    expect(sheets).toHaveLength(1);
    expect(sheets[0]!.getAttribute("data-concept-id")).toBe(exhibit.conceptId);
    // One claim list, from the shared ClaimList, and each claim text rendered exactly once.
    expect(container.querySelectorAll("[data-slot=claims]")).toHaveLength(1);
    const text = container.textContent ?? "";
    for (const c of read.claims) expect(text.split(c.text).length - 1, c.id).toBe(1);
    // The old inline panel markup is gone.
    expect(container.querySelector("#museum-panel-body")).toBeNull();
    expect(container.querySelector("article[data-concept-id]")).toBeNull();
  });

  it("shows the read model's claims verbatim and in order, each with its citations collapsed", () => {
    renderPanel();
    const list = screen.getByRole("list", { name: "Statements" });
    const items = within(list).getAllByRole("listitem");
    expect(items.map((li) => li.querySelector("p")!.textContent)).toEqual(read.claims.map((c) => c.text));
    const notes = within(list).getAllByRole("button", { name: /^Source: / });
    expect(notes.length).toBe(read.claims.reduce((n, c) => n + c.evidence.length, 0));
    for (const b of notes) expect(b.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByRole("heading", { name: "From the Sources" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Related Concepts" })).toBeTruthy();
  });

  it("titles the sheet with the concept h1, focused on open, with Close after the sheet and the slot empty", () => {
    const { container, props } = renderPanel();
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toBe(titleCase(read.title));
    expect(document.activeElement).toBe(h1);
    // The reserved slot is empty, exactly as on the 2D page.
    expect(container.querySelector("[data-slot=sheet-action]")!.childElementCount).toBe(0);
    const sheet = container.querySelector("[data-slot=knowledge-sheet]")!;
    const close = screen.getByRole("button", { name: "Close" });
    expect(sheet.contains(close)).toBe(false);
    // Close follows every focusable of the sheet in document order.
    const focusables = [...container.querySelectorAll("button, a[href], [tabindex='0']")];
    expect(focusables.indexOf(close)).toBe(focusables.length - 1);
    expect(sheet.compareDocumentPosition(close) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(close);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("reads layer names and order from KNOWLEDGE_LAYERS", () => {
    const { props } = renderPanel();
    const tabs = within(screen.getByRole("tablist", { name: "Information layers" })).getAllByRole("tab");
    const expected = KNOWLEDGE_LAYERS.filter((l) => buildPanelModel(model, exhibit, concepts).tabs.some((t) => t.tab === l.id)).map((l) => l.label);
    expect(tabs.map((t) => t.textContent)).toEqual(expected);
    expect(tabs[0]!.getAttribute("aria-selected")).toBe("true");
    fireEvent.click(tabs[1]!);
    expect(props.onTab).toHaveBeenCalledTimes(1);
  });

  it("walks to a related exhibit instead of navigating", () => {
    const { container, props } = renderPanel();
    const related = container.querySelector("[data-slot=related-concepts]") as HTMLElement;
    const walk = within(related).getAllByRole("button").find((b) => b.tagName === "BUTTON" && !b.closest("details"));
    expect(walk).toBeTruthy();
    fireEvent.click(walk!);
    expect(props.onWalkToConcept).toHaveBeenCalledTimes(1);
    expect(related.querySelector("a[href]")).toBeNull();
  });

  it("closes on Escape, but not when Escape is pressed inside a dialog", () => {
    const { props } = renderPanel();
    const panel = screen.getByRole("complementary");
    const dialog = document.createElement("dialog");
    dialog.setAttribute("open", "");
    const inner = document.createElement("button");
    dialog.appendChild(inner);
    panel.appendChild(dialog);
    fireEvent.keyDown(inner, { key: "Escape" });
    expect(props.onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(panel, { key: "Escape" });
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("renders the concept's figure after its anchor claim, as in 2D", () => {
    const withFigure = model.exhibits.find((e) => figures[e.conceptId]?.length && concepts[e.conceptId]);
    expect(withFigure).toBeTruthy();
    const { container } = renderPanel({ exhibit: withFigure!, conceptId: withFigure!.conceptId });
    const fig = container.querySelector("figure");
    expect(fig?.textContent).toContain("Fig. 1");
    const anchor = figures[withFigure!.conceptId]![0]!.anchorClaimIndex;
    const li = container.querySelectorAll("[data-slot=claims] > li")[anchor]!;
    expect(li.contains(fig)).toBe(true);
    expect(screen.getByRole("button", { name: "Enlarge figure 1" })).toBeTruthy();
  });

  it("docks beside the scene at 1024 px and wider and covers it below", () => {
    const docked = renderPanel();
    expect(docked.container.querySelector("[data-slot=museum-info-panel]")!.getAttribute("data-placement")).toBe("docked");
    docked.unmount();
    const full = renderPanel({ docked: false });
    expect(full.container.querySelector("[data-slot=museum-info-panel]")!.getAttribute("data-placement")).toBe("full");
  });
});
