/**
 * Layer parity (DESIGN.md 9.6, 9.11 item 3, 12.1 rule 1; DR-021): for every concept the 3D museum
 * places, the 2D concept page builds the SAME LayerTabs, with the same concepts under each layer
 * in the same order, as the 3D information panel. 3D: the curated content compiled into a
 * manifest and read by `buildPanelModel`. 2D: `conceptLayers` over the read model of the same
 * snapshot, reduced to the same study scope.
 */
import { describe, expect, it } from "vitest";

import type { SourceView } from "@/features/knowledge/read/view";
import { buildPanelModel, toPanelConcept } from "@/features/immersive/panel-content";
import { buildSceneModel } from "@/features/immersive/scene-model";
import type { PanelConcept } from "@/features/immersive/types";
import { byCanonicalTradition, conceptLayers, pagerFor, sequenceOf, sharedSequenceOf } from "@/features/learning-2d/navigation";

import { museumFixture, TRADITIONS } from "../immersive/fixtures";

describe("the 2D concept page has the 3D panel's layers", () => {
  const { manifest, view } = museumFixture();
  const model = buildSceneModel(manifest.manifest);
  const placed = new Set(model.exhibits.map((e) => e.conceptId));
  const sources = new Map<string, SourceView>();
  const comparisons = new Map(view.getComparisons().map((c) => [c.concept.id, c]));
  const concepts: Record<string, PanelConcept> = {};
  for (const id of placed) concepts[id] = toPanelConcept(view.getConcept(id)!, view.getRelatedConcepts(id), sources, comparisons.get(id) ?? null, (c) => placed.has(c));
  const chains = new Map(TRADITIONS.map((slug) => [slug, view.getProcessChain(slug)]));

  const layers2d = async (conceptId: string) => {
    const concept = view.getConcept(conceptId)!;
    const related = (view.getRelatedConcepts(conceptId) ?? [])
      .map((g) => ({ semantics: g.semantics, relations: g.relations.filter((r) => placed.has(r.concept.id)) }))
      .filter((g) => g.relations.length > 0);
    const cmp = comparisons.get(conceptId);
    const chain = concept.traditionSlug ? chains.get(concept.traditionSlug) : null;
    return conceptLayers({
      concept,
      related,
      comparison: cmp ? { compares: cmp.compares.filter((c) => placed.has(c.id)) } : null,
      inSequence:
        sequenceOf(chain ?? null, conceptId) !== null ||
        (!concept.traditionSlug && (await sharedSequenceOf(concept, async (id) => view.getRelatedConcepts(id))) !== null),
    }).map((l) => ({ id: l.id, entries: l.entries.map((e) => e.concept.id) }));
  };

  it("covers concepts with attached layers (the test is not vacuous)", () => {
    const withTabs = model.exhibits.filter((e) => buildPanelModel(model, e, concepts).tabs.length > 1);
    expect(withTabs.length).toBeGreaterThan(10);
  });

  // The Compare layer lists its concepts in the canonical tradition order (DR-019) in both
  // conditions; the helper re-sorts a list, so a sorted 3D list passes through unchanged.
  const canonicalCompare = (tab: string, ids: string[]) =>
    tab === "comparison" ? byCanonicalTradition(ids, (id) => view.getConcept(id)?.traditionSlug ?? null) : ids;

  it("gives every placed concept the same layer ids, entries and order in both conditions", async () => {
    const mismatches: string[] = [];
    for (const exhibit of model.exhibits) {
      const panel = buildPanelModel(model, exhibit, concepts);
      const three = panel.tabs.map((t) => ({ id: t.tab, entries: canonicalCompare(t.tab, t.entries.map((e) => e.conceptId)) }));
      const two = await layers2d(exhibit.conceptId);
      if (JSON.stringify(three) !== JSON.stringify(two)) mismatches.push(`${exhibit.conceptId}: 3D ${JSON.stringify(three)} 2D ${JSON.stringify(two)}`);
    }
    expect(mismatches).toEqual([]);
  });

  it("gives every station the same ordered sequence (Process layer list, step n of N, pager) in both conditions", async () => {
    const mismatches: string[] = [];
    for (const exhibit of model.exhibits) {
      const panel = buildPanelModel(model, exhibit, concepts);
      if (!panel.sequence) continue;
      const concept = view.getConcept(exhibit.conceptId)!;
      const chain = concept.traditionSlug ? (chains.get(concept.traditionSlug) ?? null) : null;
      const seq = sequenceOf(chain, concept.id) ?? (await sharedSequenceOf(concept, async (id) => view.getRelatedConcepts(id)));
      const three = { stops: panel.sequence.stops.map((s) => s.conceptId), index: panel.sequence.index };
      const two = { stops: seq?.steps.map((s) => s.id) ?? [], index: seq?.steps.findIndex((s) => s.id === concept.id) ?? -1 };
      if (JSON.stringify(three) !== JSON.stringify(two)) mismatches.push(`${concept.key}: 3D ${JSON.stringify(three)} 2D ${JSON.stringify(two)}`);
    }
    expect(mismatches).toEqual([]);
  });

  it("the 3D Compare layer lists its concepts in the canonical tradition order", () => {
    const unsorted = model.exhibits.filter((exhibit) =>
      buildPanelModel(model, exhibit, concepts).tabs.some((t) => {
        const ids = t.entries.map((e) => e.conceptId);
        return t.tab === "comparison" && JSON.stringify(ids) !== JSON.stringify(canonicalCompare(t.tab, ids));
      }),
    );
    expect(unsorted).toEqual([]);
  });

  it("gives a concept a pager in 2D exactly when the 3D panel has one, with the same targets (DR-021)", async () => {
    const mismatches: string[] = [];
    let withPager = 0;
    for (const exhibit of model.exhibits) {
      const panel = buildPanelModel(model, exhibit, concepts);
      const seq = panel.sequence;
      const stop = (i: number) => (seq ? (seq.stops[i]?.conceptId ?? null) : null);
      const prev3 = seq ? stop(seq.index - 1) : null;
      const next3 = seq ? stop(seq.index + 1) : null;
      const three = prev3 || next3 ? { prev: prev3, next: next3 } : null;
      const concept = view.getConcept(exhibit.conceptId)!;
      const chain = concept.traditionSlug ? (chains.get(concept.traditionSlug) ?? null) : null;
      const shared = !sequenceOf(chain, concept.id) && !concept.traditionSlug ? await sharedSequenceOf(concept, async (id) => view.getRelatedConcepts(id)) : null;
      const pager = pagerFor(concept, chain, shared);
      const two = pager ? { prev: pager.prev?.concept.id ?? null, next: pager.next?.concept.id ?? null } : null;
      if (three) withPager += 1;
      if (JSON.stringify(three) !== JSON.stringify(two)) mismatches.push(`${concept.key}: 3D ${JSON.stringify(three)} 2D ${JSON.stringify(two)}`);
    }
    expect(withPager).toBeGreaterThan(5);
    expect(withPager).toBeLessThan(model.exhibits.length);
    expect(mismatches).toEqual([]);
  });
});
