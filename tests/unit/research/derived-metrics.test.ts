import { describe, expect, it } from "vitest";

import { computeMapCorrespondence } from "@/server/research/metrics/correspondence";
import { computeNavigationMetrics, stopSequence, type NavEvent } from "@/server/research/metrics/navigation";
import { computeSessionMetrics, metricInputHash } from "@/server/research/metrics/session";

const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "bbbbbbbb-0000-4000-8000-000000000002";
const C = "cccccccc-0000-4000-8000-000000000003";
const R_AB = "abababab-0000-4000-8000-000000000001";

const relationships = [{ id: R_AB, sourceId: A, targetId: B, type: "PRECEDES", directed: true }];

let seq = 0;
const ev = (type: string, conceptId: string | null = null, metadata: Record<string, unknown> = {}): NavEvent & { eventId: string } => ({
  eventId: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
  seq: seq++,
  type,
  conceptId,
  metadata,
});
const start = (id: string, c: string, layer: string) => ev("exposure_started", c, { intervalId: id, layer, startMonoMs: 0 });
const end = (id: string, c: string, layer: string, activeMs: number) => ev("exposure_ended", c, { intervalId: id, layer, startMonoMs: 0, endMonoMs: activeMs, activeMs, pausedMs: 0, reason: "switched" });

const events = [
  ev("session_started"),
  ev("navigation_started", null, { intervalId: "n1", surface: "catalogue", startMonoMs: 0 }),
  ev("navigation_ended", null, { intervalId: "n1", surface: "catalogue", startMonoMs: 0, endMonoMs: 1000, activeMs: 1000, pausedMs: 0, reason: "switched" }),
  start("e1", A, "overview"),
  ev("concept_encountered", A, { mode: "opened" }),
  end("e1", A, "overview", 2000),
  start("e2", A, "science"),
  end("e2", A, "science", 1000),
  ev("relationship_followed", null, { relationshipId: R_AB, relationshipTypeCode: "PRECEDES", fromConceptId: A, toConceptId: B }),
  start("e3", B, "overview"),
  end("e3", B, "overview", 3000),
  start("e4", C, "science"),
  end("e4", C, "science", 1000),
  start("e5", A, "overview"),
  end("e5", A, "overview", 500),
  start("e6", B, "overview"),
];

const byName = (vals: { metricName: string; value: number | null; details: Record<string, unknown> }[]) => Object.fromEntries(vals.map((v) => [v.metricName, v]));

const enter = (tradition: string, stage: number) => ev("stage_entered", null, { traditionKey: tradition, stageKey: `s${stage}`, stageNumber: stage, visitCount: 1, backStep: false });

describe("navigation metrics v2", () => {
  it("builds the visit sequence from stop entries, collapsing consecutive repeats", () => {
    const stops = [enter("ajrakh", 1), enter("ajrakh", 1), enter("ajrakh", 2), enter("bagru", 1), enter("ajrakh", 2)];
    expect(stopSequence(stops).map((v) => v.stop)).toEqual(["ajrakh:s1", "ajrakh:s2", "bagru:s1", "ajrakh:s2"]);
    expect(stopSequence([...stops].reverse()).map((v) => v.stop)).toEqual(["ajrakh:s1", "ajrakh:s2", "bagru:s1", "ajrakh:s2"]);
  });

  it("computes path length, breadth, revisits, cross-tradition moves and entropy from stops", () => {
    const m = byName(computeNavigationMetrics([enter("ajrakh", 1), enter("ajrakh", 2), enter("bagru", 1), enter("ajrakh", 2), enter("bagru", 1)]));
    expect(m["nav.path_length"]!.value).toBe(5);
    expect(m["nav.breadth"]!.value).toBe(3);
    expect(m["nav.breadth"]!.details).toEqual({ traditions: 2 });
    expect(m["nav.revisit_rate"]!.value).toBeCloseTo(0.4, 9);
    expect(m["nav.cross_domain_transitions"]!.value).toBe(3);
    expect(m["nav.path_entropy"]!.value).toBe(0);
  });

  it("gives null rather than zero for what the stop doors do not record", () => {
    const m = byName(computeNavigationMetrics([ev("session_started"), enter("ajrakh", 1)]));
    expect(m["nav.path_length"]!.value).toBe(1);
    expect(m["nav.revisit_rate"]!.value).toBe(0);
    expect(m["nav.depth"]!.value).toBeNull();
    expect(m["nav.science_layer_engagement"]!.value).toBeNull();
    expect(m["nav.relationships_followed"]!.value).toBeNull();
    expect(m["nav.path_entropy"]!.value).toBeNull();
  });
});

describe("session metrics (timing + navigation + correspondence)", () => {
  it("measures time from the stops and leaves concept-level intervals out", () => {
    const out = computeSessionMetrics({ events, relationships, map: null });
    const m = byName(out.values);
    expect(m["time.exposure_total_ms"]!.value).toBeNull();
    expect(m["time.navigation_ms"]!.value).toBeNull();
    expect(m["nav.map_correspondence"]!.value).toBeNull();
    expect(out.inputEventCount).toBe(events.length);
    expect(out.inputSha256).toBe(metricInputHash([...events].reverse(), null));
  });

  it("compares navigation with the post-learning concept map", () => {
    const map = [
      { sourceConceptId: A, targetConceptId: B, relationshipTypeCode: "PRECEDES", directed: true },
      { sourceConceptId: B, targetConceptId: C, relationshipTypeCode: "CAUSES", directed: true },
    ];
    const r = computeMapCorrespondence(events, map, relationships);
    expect(r.value).toBeCloseTo(2 / 3, 6);
    expect(r.details).toMatchObject({
      conceptsExposed: 3,
      conceptsInspected: 3,
      relationshipsFollowed: 1,
      reconstructedCorrect: 1,
      reconstructedIncorrect: 1,
      correctAndFollowed: 1,
      correctWithBothEndpointsInspected: 1,
      incorrectWithBothEndpointsInspected: 1,
      mapConcepts: 3,
    });
    const reversed = computeMapCorrespondence(events, [{ sourceConceptId: B, targetConceptId: A, relationshipTypeCode: null, directed: true }], relationships);
    expect(reversed.details.reconstructedIncorrect).toBe(1);
    const undirected = computeMapCorrespondence(events, [{ sourceConceptId: B, targetConceptId: A, relationshipTypeCode: null, directed: false }], relationships);
    expect(undirected.details.reconstructedCorrect).toBe(1);
  });
});
