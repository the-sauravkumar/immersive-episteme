/**
 * Derived navigation, timing and correspondence metrics on a hand-computed fixture event stream
 * (src/server/research/metrics/*). Expected values are worked out in the comments.
 */
import { describe, expect, it } from "vitest";

import { computeMapCorrespondence } from "@/server/research/metrics/correspondence";
import { computeNavigationMetrics, visitSequence, type NavEvent } from "@/server/research/metrics/navigation";
import { computeSessionMetrics, metricInputHash } from "@/server/research/metrics/session";

const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "bbbbbbbb-0000-4000-8000-000000000002";
const C = "cccccccc-0000-4000-8000-000000000003";
const T1 = "11111111-0000-4000-8000-000000000001";
const R_AB = "abababab-0000-4000-8000-000000000001";

const concepts = new Map([
  [A, { traditionId: T1, category: "materials" }],
  [B, { traditionId: T1, category: "process_stages" }],
  [C, { traditionId: null, category: "scientific_mechanisms" }],
]);
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

// Visits A, (A again: collapsed), B, C, A, B  ->  A B C A B
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
  start("e6", B, "overview"), // never ended: unterminated, excluded from sums
];

const byName = (vals: { metricName: string; value: number | null; details: Record<string, unknown> }[]) => Object.fromEntries(vals.map((v) => [v.metricName, v]));

describe("navigation metrics v1", () => {
  it("builds the visit sequence from exposure starts, collapsing consecutive repeats", () => {
    expect(visitSequence(events).map((v) => v.conceptId)).toEqual([A, B, C, A, B]);
    // order-independent: shuffled input gives the same sequence
    expect(visitSequence([...events].reverse()).map((v) => v.conceptId)).toEqual([A, B, C, A, B]);
  });

  it("computes path length, breadth, depth, revisits, cross-domain transitions, science engagement, entropy", () => {
    const m = byName(computeNavigationMetrics(events, concepts));
    expect(m["nav.path_length"]!.value).toBe(5);
    expect(m["nav.breadth"]!.value).toBe(3);
    expect(m["nav.breadth"]!.details).toEqual({ traditions: 2, categories: 3 });
    // A: {overview, science}, B: {overview}, C: {science} -> 4 / 3
    expect(m["nav.depth"]!.value).toBeCloseTo(4 / 3, 6);
    // (5 visits - 3 distinct) / 5
    expect(m["nav.revisit_rate"]!.value).toBeCloseTo(0.4, 9);
    // A>B (T1>T1), B>C (T1>shared), C>A (shared>T1), A>B  -> 2 cross-domain, 4 cross-category
    expect(m["nav.cross_domain_transitions"]!.value).toBe(2);
    expect(m["nav.cross_domain_transitions"]!.details).toMatchObject({ crossCategory: 4, transitions: 4 });
    // science 1000 + 1000 of 7500 completed exposure ms
    expect(m["nav.science_layer_engagement"]!.value).toBeCloseTo(2000 / 7500, 6);
    // every concept has a single successor: H(next|current) = 0; visit distribution (2,2,1)/5
    expect(m["nav.path_entropy"]!.value).toBe(0);
    expect(m["nav.path_entropy"]!.details.visitEntropy).toBeCloseTo(-(2 * 0.4 * Math.log2(0.4) + 0.2 * Math.log2(0.2)), 6);
    expect(m["nav.relationships_followed"]!.value).toBe(1);
    expect(m["nav.sequence_patterns"]!.value).toBeGreaterThan(0);
  });

  it("gives null rather than guessing when there are no visits or too few transitions", () => {
    const m = byName(computeNavigationMetrics([ev("session_started")], concepts));
    expect(m["nav.path_length"]!.value).toBe(0);
    expect(m["nav.revisit_rate"]!.value).toBeNull();
    expect(m["nav.depth"]!.value).toBeNull();
    expect(m["nav.science_layer_engagement"]!.value).toBeNull();
    expect(m["nav.path_entropy"]!.value).toBeNull();
  });

  it("measures branching with conditional entropy", () => {
    // A>B, A>C, A>B... : from A two successors with equal counts -> 1 bit; B>A, C>A -> 0
    seq = 1000;
    const branchy = [start("x1", A, "overview"), start("x2", B, "overview"), start("x3", A, "overview"), start("x4", C, "overview"), start("x5", A, "overview")];
    const m = byName(computeNavigationMetrics(branchy, concepts));
    // transitions: A>B, B>A, A>C, C>A. From A: {B:1, C:1} weight 2/4 * 1 bit = 0.5
    expect(m["nav.path_entropy"]!.value).toBeCloseTo(0.5, 9);
  });
});

describe("session metrics (timing + navigation + correspondence)", () => {
  it("keeps exposure and navigation time separate and counts the unterminated interval", () => {
    const out = computeSessionMetrics({ events, concepts, relationships, map: null });
    const m = byName(out.values);
    expect(m["time.exposure_total_ms"]!.value).toBe(7500);
    expect(m["time.exposure_total_ms"]!.details).toEqual({ unterminated: 1 });
    expect(m["time.navigation_ms"]!.value).toBe(1000);
    expect(m["time.navigation_share"]!.value).toBeCloseTo(1000 / 8500, 9);
    expect(m["nav.map_correspondence"]!.value).toBeNull();
    expect(out.inputEventCount).toBe(events.length);
    expect(out.inputSha256).toBe(metricInputHash([...events].reverse(), null));
  });

  it("compares navigation with the post-learning concept map", () => {
    const map = [
      { sourceConceptId: A, targetConceptId: B, relationshipTypeCode: "PRECEDES", directed: true }, // in the snapshot: correct
      { sourceConceptId: B, targetConceptId: C, relationshipTypeCode: "CAUSES", directed: true }, // not in the snapshot: incorrect
    ];
    const r = computeMapCorrespondence(events, map, relationships);
    // navigated pairs {AB, BC, CA}; map pairs {AB, BC}: 2 / 3
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
    // a reversed directed edge is not correct
    const reversed = computeMapCorrespondence(events, [{ sourceConceptId: B, targetConceptId: A, relationshipTypeCode: null, directed: true }], relationships);
    expect(reversed.details.reconstructedIncorrect).toBe(1);
    // an undirected map edge matches either direction
    const undirected = computeMapCorrespondence(events, [{ sourceConceptId: B, targetConceptId: A, relationshipTypeCode: null, directed: false }], relationships);
    expect(undirected.details.reconstructedCorrect).toBe(1);
  });
});
