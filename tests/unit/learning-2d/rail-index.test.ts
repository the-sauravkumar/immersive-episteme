/**
 * DR-021: the 2D place (tradition and section), the shared PlaceRail's 2D rows ("In This Section")
 * and the index field, from the layout's StudyBarIndex. Interface words only; the concepts are
 * placeholders (no craft facts).
 */
import { describe, expect, it } from "vitest";

import { index2d, place2d, rail2d, SHARED_SECTIONS, type StudyBarIndex } from "@/features/learning-2d/navigation";
import { href2d, pageId2d } from "@/features/learning-2d/routes";
import { EPISTEMIC_SECTIONS } from "@/features/learning-2d/template";

const entry = (slug: string, title: string, type: "process_stage" | "material" | "comparison", step: [number, number] | null = null) => ({ slug, key: slug.replace(/-/g, "."), title, type, step });

const index: StudyBarIndex = {
  traditions: [
    { slug: "alpha", name: "Alpha" },
    { slug: "beta", name: "Beta" },
  ],
  concepts: {},
  parents: [],
  sections: {
    alpha: {
      process: [entry("alpha-s1", "Step one", "process_stage", [1, 2]), entry("alpha-s2", "Step two", "process_stage", [2, 2])],
      "materials-tools": [entry("alpha-m1", "Material one", "material")],
    },
    beta: { "materials-tools": [entry("beta-m1", "Material b", "material")] },
    [SHARED_SECTIONS]: { comparisons: [entry("shared-c1", "Comparison one", "comparison")] },
  },
};

describe("place2d", () => {
  it("places a concept in its tradition's section, a tradition page by its section hash, and the index pages nowhere", () => {
    expect(place2d(href2d.concept("alpha-s2"), "", index)).toEqual({ traditionSlug: "alpha", sectionId: "process", conceptSlug: "alpha-s2" });
    expect(place2d(href2d.concept("shared-c1"), "", index)).toEqual({ traditionSlug: null, sectionId: "comparisons", conceptSlug: "shared-c1" });
    expect(place2d(href2d.tradition("beta"), "#section-materials-tools", index)).toEqual({ traditionSlug: "beta", sectionId: "materials-tools", conceptSlug: null });
    expect(place2d(href2d.tradition("beta"), "#section-nonsense", index).sectionId).toBeNull();
    expect(place2d(href2d.tradition("gamma"), "", index)).toEqual({ traditionSlug: null, sectionId: null, conceptSlug: null });
    expect(place2d(href2d.catalogue(), "", index)).toEqual({ traditionSlug: null, sectionId: null, conceptSlug: null });
  });
});

describe("rail2d (In This Section)", () => {
  it("lists the section's concepts with type and step, marks the current one, then leads to the other sections", () => {
    const visited = new Set([pageId2d.concept("alpha.s1")]);
    const rail = rail2d(place2d(href2d.concept("alpha-s2"), "", index), index, visited);
    expect(rail.items.map((r) => [r.title, r.detail, r.current, r.visited])).toEqual([
      ["Step one", "Process stage, step 1 of 2", false, true],
      ["Step two", "Process stage, step 2 of 2", true, false],
    ]);
    expect(rail.items[0]!.href).toBe(href2d.concept("alpha-s1"));
    expect(rail.destinations.map((d) => d.href)).toEqual([href2d.traditionSection("alpha", "materials-tools")]);
  });

  it("never marks the current row visited, and carries titles, types and steps only (P29)", () => {
    const rail = rail2d(place2d(href2d.concept("alpha-s2"), "", index), index, new Set([pageId2d.concept("alpha.s2")]));
    expect(rail.items.find((r) => r.current)!.visited).toBe(false);
    for (const r of [...rail.items, ...rail.destinations]) expect(Object.keys(r).sort()).toEqual(["current", "detail", "href", "key", "title", "visited"]);
  });

  it("on a shared comparison lists the shared comparisons and leads to the traditions", () => {
    const rail = rail2d(place2d(href2d.concept("shared-c1"), "", index), index, new Set());
    expect(rail.items.map((r) => r.title)).toEqual(["Comparison one"]);
    expect(rail.destinations.map((d) => d.title)).toEqual(["Alpha", "Beta"]);
  });

  it("outside a section has no rows: a tradition page leads to the other traditions (its sections are on the page and in the index), the index pages to the traditions", () => {
    const tradition = rail2d(place2d(href2d.tradition("alpha"), "", index), index, new Set());
    expect(tradition.items).toEqual([]);
    expect(tradition.destinations.map((d) => d.key)).toEqual(["tradition:beta"]);
    const catalogue = rail2d(place2d(href2d.catalogue(), "", index), index, new Set());
    expect(catalogue.items).toEqual([]);
    expect(catalogue.destinations.map((d) => d.href)).toEqual([href2d.tradition("alpha"), href2d.tradition("beta")]);
  });
});

describe("index2d (the field)", () => {
  it("lists every tradition with its numbered sections and marks the current section", () => {
    const idx = index2d(place2d(href2d.tradition("beta"), "#section-process", index), index);
    expect(idx.map((t) => t.name)).toEqual(["Alpha", "Beta"]);
    expect(idx.every((t) => t.sections.length === EPISTEMIC_SECTIONS.length)).toBe(true);
    expect(idx[1]!.sections.map((s) => s.number)).toEqual(EPISTEMIC_SECTIONS.map((_, i) => i + 1));
    expect(idx[1]!.sections.filter((s) => s.current).map((s) => s.id)).toEqual(["process"]);
    expect(idx[0]!.sections.some((s) => s.current)).toBe(false);
  });

  it("recedes while a concept is open: the traditions and only the concept's own section (one focus)", () => {
    const idx = index2d(place2d(href2d.concept("alpha-m1"), "", index), index);
    expect(idx.map((t) => t.sections.length)).toEqual([1, 0]);
    expect(idx[0]!.sections.map((s) => [s.id, s.number, s.current])).toEqual([["materials-tools", 2, true]]);
    const shared = index2d(place2d(href2d.concept("shared-c1"), "", index), index);
    expect(shared.map((t) => t.sections.length)).toEqual([0, 0]);
  });
});
