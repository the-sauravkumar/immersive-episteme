/**
 * Condition equivalence (DR-015): the information panel shows exactly the read model's claims for
 * the same concept (text, order, citations, locators, quotes), nothing else; each exhibit's
 * disclosure layers come from the manifest; exposure uses the same type -> layer rule as 2D.
 */
import { describe, expect, it } from "vitest";

import type { SourceView } from "@/features/knowledge/read/view";
import { buildPanelModel, exposureFor, toPanelConcept } from "@/features/immersive/panel-content";
import { buildSceneModel } from "@/features/immersive/scene-model";
import { citationOf, type PanelConcept } from "@/features/immersive/types";
import { exposureLayerOf } from "@/features/learning/labels";

import { museumFixture } from "./fixtures";

describe("panel content equals the read model", () => {
  const { manifest, view } = museumFixture();
  const model = buildSceneModel(manifest.manifest);
  const placed = new Set(model.exhibits.map((e) => e.conceptId));
  const sources = new Map<string, SourceView>();
  const comparisons = new Map(view.getComparisons().map((c) => [c.concept.id, c]));
  const concepts: Record<string, PanelConcept> = {};
  for (const id of placed) concepts[id] = toPanelConcept(view.getConcept(id)!, view.getRelatedConcepts(id), sources, comparisons.get(id) ?? null, (c) => placed.has(c));
  const src = Object.fromEntries(sources);

  it("every placed concept exists in the snapshot", () => {
    for (const id of placed) expect(view.getConcept(id), id).not.toBeNull();
  });

  it("claims are identical in text, order, citations, locators and quotes", () => {
    for (const id of placed) {
      const read = view.getConcept(id)!;
      const panel = concepts[id]!;
      expect(panel.claims.map((c) => c.text)).toEqual(read.claims.map((c) => c.text));
      expect(panel.claims.map((c) => c.position)).toEqual(read.claims.map((c) => c.position));
      for (const [i, claim] of panel.claims.entries()) {
        expect(claim.evidence.map((r) => citationOf(r, src))).toEqual(read.claims[i]!.evidence);
      }
      expect(panel.title).toBe(read.title);
    }
  });

  it("carries no text of its own: every title and claim is a read-model string", () => {
    const readStrings = new Set<string>();
    for (const id of placed) {
      const c = view.getConcept(id)!;
      [c.title, ...c.claims.map((x) => x.text)].forEach((x) => readStrings.add(x));
    }
    for (const c of Object.values(concepts)) for (const t of [c.title, ...c.claims.map((x) => x.text)]) expect(readStrings.has(t)).toBe(true);
  });

  it("keeps related concepts inside the study scope, in read-model order", () => {
    for (const id of placed) {
      const read = view.getRelatedConcepts(id) ?? [];
      const expected = read
        .map((g) => ({ semantics: g.semantics, ids: g.relations.filter((r) => placed.has(r.concept.id)).map((r) => r.relationshipId) }))
        .filter((g) => g.ids.length > 0);
      expect(concepts[id]!.related.map((g) => ({ semantics: g.semantics, ids: g.relations.map((r) => r.relationshipId) }))).toEqual(expected);
    }
  });

  it("uses the 2D type -> exposure layer rule", () => {
    for (const c of Object.values(concepts)) expect(exposureFor(c)).toBe(exposureLayerOf(c.type));
  });

  it("builds layers from the manifest: overview first, layers, compare from hotspots, process for stations", () => {
    let withLayers = 0;
    for (const e of model.exhibits) {
      const p = buildPanelModel(model, e, concepts);
      expect(p.tabs[0]!.tab).toBe("overview");
      expect(p.tabs[0]!.entries[0]!.conceptId).toBe(e.conceptId);
      const layerConcepts = new Set(p.tabs.filter((t) => t.tab === "artisan" || t.tab === "science" || t.tab === "process").flatMap((t) => t.entries.map((x) => x.conceptId)));
      for (const l of e.layers) expect(layerConcepts.has(l.conceptId)).toBe(true);
      if (e.layers.length) withLayers++;
      const compare = p.tabs.find((t) => t.tab === "comparison");
      expect((compare?.entries.length ?? 0) > 0).toBe(e.hotspots.some((h) => h.kind === "compare" && !!h.targetElementId));
      expect(!!p.tabs.find((t) => t.tab === "process")).toBe(!!e.sequence);
      if (p.sequence) expect(p.sequence.stops[p.sequence.index]!.elementId).toBe(e.id);
    }
    expect(withLayers).toBeGreaterThan(0);
  });
});

describe("panel layers are the shared knowledge layers (DESIGN.md 9.6, 12.1 rule 2)", () => {
  it("uses the KNOWLEDGE_LAYERS ids in their order, with no labels of its own", async () => {
    const mod = await import("@/features/immersive/panel-content");
    const { KNOWLEDGE_LAYERS } = await import("@/features/learning/labels");
    expect(mod.PANEL_TABS).toEqual(KNOWLEDGE_LAYERS.map((l) => l.id));
    expect("PANEL_TAB_LABELS" in mod).toBe(false);
  });
});

/**
 * DESIGN.md residual risk 11: every comparison the 2D condition can open (the 2D scope rule over
 * the study traditions) is reachable in the museum, as an exhibit whose panel shows the same
 * claims. Comparisons outside the 2D scope are reachable in neither condition.
 */
describe("comparison claims are reachable in both conditions", () => {
  it("every in-scope comparison is an exhibit with the read model's claims", async () => {
    const { createScopeChecker } = await import("@/features/learning-2d/scope");
    const { comparisonMinTraditions, defaultRuleSetConfig } = await import("@/features/spatial/compiler");
    const { TRADITIONS } = await import("./fixtures");
    const { manifest, view } = museumFixture();
    const model = buildSceneModel(manifest.manifest);
    const placed = new Set(model.exhibits.map((e) => e.conceptId));
    const scope = createScopeChecker(
      TRADITIONS,
      {
        comparesOf: async (id) => view.getConcept(id)?.compares ?? [],
        neighboursOf: async (id) => (view.getRelatedConcepts(id) ?? []).flatMap((g) => g.relations.map((r) => r.concept)),
      },
      { minCompareTraditions: comparisonMinTraditions(defaultRuleSetConfig()) },
    );
    const comparisons = view.getComparisons();
    expect(comparisons.length).toBeGreaterThan(0);
    let inScope = 0;
    for (const c of comparisons) {
      const reachable2d = await scope.isAccessible(c.concept);
      if (!reachable2d) continue;
      inScope++;
      expect(placed.has(c.concept.id), c.concept.key).toBe(true);
      const sources = new Map<string, SourceView>();
      const panel = toPanelConcept(view.getConcept(c.concept.id)!, view.getRelatedConcepts(c.concept.id), sources, c, (x) => placed.has(x));
      expect(panel.claims.map((x) => x.text)).toEqual(view.getConcept(c.concept.id)!.claims.map((x) => x.text));
    }
    expect(inScope).toBeGreaterThan(0);
  });
});
