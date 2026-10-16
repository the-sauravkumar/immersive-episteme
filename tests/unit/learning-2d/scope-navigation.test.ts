/**
 * 2D scope (same concept set as the spatial compiler's scope), previous/next order and the
 * visit memory behind revisit and tradition-crossing events.
 */
import { describe, expect, it } from "vitest";

import { byCanonicalTradition, PAGE_TITLES, pagerFor, parentOf, processPager, sectionConcepts, studyBarPlace, type StudyBarIndex } from "@/features/learning-2d/navigation";
import { href2d } from "@/features/learning-2d/routes";
import { STUDY_TRADITION_SLUGS } from "@/features/learning/labels";
import { createScopeChecker, filterAccessible } from "@/features/learning-2d/scope";
import { comparisonMinTraditions, DEFAULT_COMPARISON_MIN_TRADITIONS } from "@/features/spatial/compiler/rules";
import { defaultRuleSetConfig } from "@/features/spatial/compiler/config";
import { exposureLayerOf } from "@/features/learning/labels";
import { EPISTEMIC_SECTIONS, sectionOfType } from "@/features/learning-2d/template";
import { createVisitStore } from "@/features/learning-2d/visit-store";
import type { KnowledgeView } from "@/features/knowledge/read/view";

import { fixtureView } from "./fixtures";

function checker(view: KnowledgeView, slugs: string[], minCompareTraditions = DEFAULT_COMPARISON_MIN_TRADITIONS) {
  return createScopeChecker(slugs, {
    comparesOf: async (id) => view.getConcept(id)?.compares ?? [],
    neighboursOf: async (id) => (view.getRelatedConcepts(id) ?? []).flatMap((g) => g.relations.map((r) => r.concept)),
  }, { minCompareTraditions });
}

describe("2D scope", () => {
  const view = fixtureView();
  const byKey = (k: string) => view.getConcept(k)!;

  it("serves the study's traditions only", async () => {
    const scope = checker(view, ["alpha"]);
    expect(await scope.isAccessible(byKey("alpha.tool.tool-b"))).toBe(true);
    expect(await scope.isAccessible(byKey("beta.tool.tool-b"))).toBe(false);
  });

  it("includes a tradition-less comparison only when it compares at least two selected traditions", async () => {
    const cross = byKey("comparisons.comparison.alpha-beta");
    const single = byKey("comparisons.comparison.alpha-stages");
    expect(await checker(view, ["alpha", "beta"]).isAccessible(cross)).toBe(true);
    expect(await checker(view, ["alpha"]).isAccessible(cross)).toBe(false);
    expect(await checker(view, ["alpha", "beta"]).isAccessible(single)).toBe(false);
  });

  it("takes minTraditions from the rule set (the compiler's source), not a constant", async () => {
    const cross = byKey("comparisons.comparison.alpha-beta");
    const single = byKey("comparisons.comparison.alpha-stages");
    // The default frozen rule set says 2, and the 2D default is that value.
    expect(comparisonMinTraditions(defaultRuleSetConfig())).toBe(2);
    // A rule set asking for 3 traditions drops the two-tradition comparison...
    const strict = defaultRuleSetConfig();
    for (const r of strict.rules) if (r.emit.params?.strategy === "comparison-zone") r.emit.params = { ...r.emit.params, minTraditions: 3 };
    expect(comparisonMinTraditions(strict)).toBe(3);
    expect(await checker(view, ["alpha", "beta"], comparisonMinTraditions(strict)).isAccessible(cross)).toBe(false);
    // ...and one asking for 1 admits a single-tradition comparison.
    expect(await checker(view, ["alpha"], 1).isAccessible(single)).toBe(true);
  });

  it("reaches every in-scope comparison's claims and compared concepts in 2D (DESIGN.md residual risk 11, 2D half)", async () => {
    const scope = checker(view, ["alpha", "beta"]);
    const comparisons = await filterAccessible(scope, view.getComparisons(), (v) => v.concept);
    expect(comparisons.length).toBeGreaterThan(0);
    for (const v of comparisons) {
      // The comparison's own claims are on its concept page (the KnowledgeSheet), which the scope serves.
      expect(await scope.isAccessible(v.concept)).toBe(true);
      expect(view.getConcept(v.concept.id)!.claims.length).toBe(v.claims.length);
      // Each compared concept of a study tradition has its own page.
      for (const c of v.compares.filter((x) => x.traditionSlug && ["alpha", "beta"].includes(x.traditionSlug))) expect(await scope.isAccessible(c)).toBe(true);
    }
  });

  it("drops related links that leave the scope", async () => {
    const scope = checker(view, ["alpha"]);
    const related = view.getRelatedConcepts("alpha.process_stage.stage-one")!.flatMap((g) => g.relations);
    expect(related.some((r) => r.concept.traditionSlug === "beta")).toBe(true);
    const kept = await filterAccessible(scope, related, (r) => r.concept);
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.every((r) => r.concept.traditionSlug === "alpha")).toBe(true);
  });
});

describe("2D previous / next", () => {
  const view = fixtureView();

  it("follows the process order with the PRECEDES relationship of each move", () => {
    const chain = view.getProcessChain("alpha")!;
    const two = view.getConcept("alpha.process_stage.stage-two")!;
    const pager = processPager(chain, two.id)!;
    expect(pager).toMatchObject({ kind: "process", index: 2, total: 3 });
    expect(pager.prev?.concept.key).toBe("alpha.process_stage.stage-one");
    expect(pager.next?.concept.key).toBe("alpha.process_stage.stage-three");
    const link = chain.links.find((l) => l.from.id === two.id)!;
    expect(pager.next?.relationshipId).toBe(link.relationshipId);
  });

  it("gives a pager only to a station of an ordered sequence, as the 3D panel (DR-034)", () => {
    const tradition = view.getTradition("alpha")!;
    const chain = view.getProcessChain("alpha")!;
    const material = view.getConcept("alpha.material.material-a")!;
    expect(pagerFor(material, chain)).toBeNull();
    expect(pagerFor(material, null)).toBeNull();
    // The materials section still lists its concepts in display order (tradition page, not a pager).
    expect(sectionConcepts(tradition, EPISTEMIC_SECTIONS.find((s) => s.id === "materials-tools")!).map((c) => c.key)).toEqual(["alpha.material.material-a", "alpha.tool.tool-b"]);
    const two = view.getConcept("alpha.process_stage.stage-two")!;
    expect(pagerFor(two, chain)).toMatchObject({ kind: "process", index: 2, total: 3 });
  });

  it("orders the template sections and maps types to sections and exposure layers", () => {
    expect(EPISTEMIC_SECTIONS.map((s) => s.id)).toEqual(["context", "materials-tools", "process", "artisan", "design", "outcomes", "science", "environment", "comparisons", "open-questions"]);
    expect(sectionOfType("tradition").id).toBe("context");
    expect(sectionOfType("scientific_mechanism").id).toBe("science");
    expect(exposureLayerOf("artisan_decision")).toBe("artisan");
    expect(exposureLayerOf("process_stage")).toBe("process");
    expect(exposureLayerOf("explanation")).toBe("science");
    expect(exposureLayerOf("material")).toBe("overview");
    expect(exposureLayerOf("comparison")).toBe("comparison");
  });
});

describe("canonical order, parents and the StudyBar location", () => {
  const view = fixtureView();

  it("orders items by the canonical tradition order (alphabetical), tradition-less last, stable within a tradition", () => {
    const items = [
      { id: "s1", t: "sanganeri" },
      { id: "x", t: null },
      { id: "m1", t: "machilipatnam-kalamkari" },
      { id: "a1", t: "ajrakh" },
      { id: "s2", t: "sanganeri" },
      { id: "a2", t: "ajrakh" },
    ];
    expect(byCanonicalTradition(items, (i) => i.t).map((i) => i.id)).toEqual(["a1", "a2", "m1", "s1", "s2", "x"]);
    // The study traditions' slugs are already in that order, so the order is the same on every page.
    expect(byCanonicalTradition([...STUDY_TRADITION_SLUGS].reverse(), (s) => s)).toEqual([...STUDY_TRADITION_SLUGS]);
  });

  it("leads a concept page up to its section on the tradition page, or to the comparisons page", () => {
    const tradition = view.getTradition("alpha")!;
    expect(parentOf(view.getConcept("alpha.process_stage.stage-one")!, tradition)).toEqual({ label: "Process Sequence", href: href2d.traditionSection("alpha", "process") });
    expect(parentOf(view.getConcept("alpha.tool.tool-b")!, tradition)).toEqual({ label: "Materials and Tools", href: href2d.traditionSection("alpha", "materials-tools") });
    expect(parentOf(view.getConcept("comparisons.comparison.alpha-beta")!, null)).toEqual({ label: "Comparisons", href: href2d.comparisons() });
    // A concept of another tradition than the one given has no parent here.
    expect(parentOf(view.getConcept("beta.tool.tool-b")!, tradition)).toBeNull();
  });

  it("names the current page from the URL alone", () => {
    const stage = view.getConcept("alpha.process_stage.stage-one")!;
    const index: StudyBarIndex = {
      traditions: [{ slug: "alpha", name: "Alpha" }],
      concepts: { [stage.slug]: [stage.title, 0] },
      parents: [{ label: "Process Sequence", href: href2d.traditionSection("alpha", "process") }],
    };
    expect(studyBarPlace(href2d.catalogue(), index)).toEqual({ location: PAGE_TITLES.catalogue, parent: null, conceptPage: false });
    expect(studyBarPlace(href2d.tradition("alpha"), index).location).toBe("Alpha");
    expect(studyBarPlace(href2d.concept(stage.slug), index)).toEqual({ location: stage.title, parent: index.parents[0], conceptPage: true });
    expect(studyBarPlace(href2d.concept("unknown"), index)).toEqual({ location: "", parent: null, conceptPage: true });
    expect(studyBarPlace(href2d.categories(), index).location).toBe(PAGE_TITLES.categories);
    expect(studyBarPlace(href2d.category("tools"), index).location).toBe("Tools");
    expect(studyBarPlace(href2d.category("nonsense" as never), index).location).toBe("");
    expect(studyBarPlace(href2d.comparisons(), index).location).toBe(PAGE_TITLES.comparisons);
    expect(studyBarPlace("/learn/immersive", index).location).toBe("");
  });
});

describe("visit memory", () => {
  function storage() {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  }

  it("marks the first entry as start, link entries as link, and counts revisits", () => {
    const s = createVisitStore("s1", storage());
    expect(s.enter("catalogue", null)).toMatchObject({ via: "start", visitCount: 1, fromId: null });
    s.setPendingVia("link");
    expect(s.enter("concept:a", "t1")).toMatchObject({ via: "link", visitCount: 1, fromId: "catalogue" });
    expect(s.enter("catalogue", null)).toMatchObject({ via: "navigation", visitCount: 2 });
  });

  it("treats a reload of the current page as a resumption, not a revisit, and survives the reload", () => {
    const store = storage();
    createVisitStore("s1", store).enter("concept:a", "t1");
    const again = createVisitStore("s1", store).enter("concept:a", "t1");
    expect(again).toMatchObject({ via: "resume", visitCount: 1 });
  });

  it("reports a tradition crossing only between two different traditions", () => {
    const s = createVisitStore("s1", null);
    expect(s.enter("tradition:a", "t1").crossedFrom).toBeNull();
    expect(s.enter("catalogue", null).crossedFrom).toBeNull();
    expect(s.enter("concept:x", "t1").crossedFrom).toBeNull();
    expect(s.enter("concept:y", "t2").crossedFrom).toBe("t1");
  });
});
