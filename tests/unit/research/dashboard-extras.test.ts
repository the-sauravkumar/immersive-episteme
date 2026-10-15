/**
 * Dashboard row 4 (DESIGN.md 11.9): dwell time per layer and per-item statistics are aggregated
 * only from stored derived values, in the canonical layer order, conditions in the order given
 * (the page passes 2D first). No value is imputed: a session without a layer contributes 0
 * minutes to it, an undefined score is counted apart, and a condition without data is null.
 */
import { describe, expect, it } from "vitest";

import { itemStatistics, LAYER_COLUMNS, layerDwell, traditionGains, type TraditionItemRow } from "@/app/(research)/research/dashboard/_components/dashboard-extras";
import { KNOWLEDGE_LAYERS } from "@/features/learning/labels";

describe("layer columns", () => {
  it("follow the one canonical layer order, then the citation layer telemetry records", () => {
    expect(LAYER_COLUMNS.map((c) => c.id)).toEqual([...KNOWLEDGE_LAYERS.map((l) => l.id), "citation"]);
    expect(LAYER_COLUMNS.map((c) => c.label)).toEqual(["Overview", "Artisan", "Process", "Science", "Compare", "Citation"]);
  });
});

describe("layerDwell", () => {
  it("averages active minutes per session per layer, by condition", () => {
    const d = layerDwell(
      [
        { conditionId: "c2d", sessionId: "s1", metricVersion: "1.0.0", byLayer: { overview: 120_000, science: 60_000 } },
        { conditionId: "c2d", sessionId: "s2", metricVersion: "1.0.0", byLayer: { overview: 60_000 } },
        { conditionId: "c3d", sessionId: "s3", metricVersion: "1.0.0", byLayer: { process: 30_000, citation: 6_000 } },
        { conditionId: "other", sessionId: "s4", metricVersion: "1.0.0", byLayer: { overview: 999_999 } },
      ],
      ["c2d", "c3d"],
    );
    expect(d.n).toEqual([2, 1]);
    expect(d.versions).toEqual(["1.0.0"]);
    const col = (id: string) => LAYER_COLUMNS.findIndex((c) => c.id === id);
    expect(d.meanMinutes[0]![col("overview")]).toBeCloseTo(1.5);
    expect(d.meanMinutes[0]![col("science")]).toBeCloseTo(0.5);
    expect(d.meanMinutes[0]![col("process")]).toBe(0);
    expect(d.meanMinutes[1]![col("process")]).toBeCloseTo(0.5);
    expect(d.meanMinutes[1]![col("citation")]).toBeCloseTo(0.1);
  });

  it("is null, not zero, for a condition with no session", () => {
    const d = layerDwell([{ conditionId: "c2d", sessionId: "s1", metricVersion: "1.0.0", byLayer: null }], ["c2d", "c3d"]);
    expect(d.n).toEqual([1, 0]);
    expect(d.meanMinutes[0]!.every((v) => v === 0)).toBe(true);
    expect(d.meanMinutes[1]!.every((v) => v === null)).toBe(true);
  });
});

describe("itemStatistics", () => {
  const row = (conditionId: string, kind: string, code: string, itemKey: string, position: number, value: number | null) => ({
    conditionId,
    assessmentCode: code,
    assessmentVersion: 1,
    assessmentKind: kind,
    itemKey,
    position,
    value,
  });

  it("gives the proportion correct per item and condition, pre-test items first", () => {
    const stats = itemStatistics(
      [
        row("c3d", "posttest", "post", "post.q1", 1, 1),
        row("c2d", "pretest", "pre", "pre.q2", 2, 0),
        row("c2d", "pretest", "pre", "pre.q1", 1, 1),
        row("c2d", "pretest", "pre", "pre.q1", 1, 0),
        row("c3d", "pretest", "pre", "pre.q1", 1, 1),
        row("c3d", "pretest", "pre", "pre.q1", 1, null),
      ],
      ["c2d", "c3d"],
    );
    expect(stats.map((s) => s.itemKey)).toEqual(["pre.q1", "pre.q2", "post.q1"]);
    expect(stats[0]!.byCondition).toEqual([
      { n: 2, undefined: 0, correct: 0.5 },
      { n: 1, undefined: 1, correct: 1 },
    ]);
    expect(stats[1]!.byCondition[1]).toEqual({ n: 0, undefined: 0, correct: null });
    expect(stats[2]!.assessment).toBe("post v1");
  });
});

describe("traditionGains (11.9 Figure 3)", () => {
  const row = (sessionId: string, conditionId: string, slug: string, name: string, kind: string, value: number | null): TraditionItemRow => ({
    sessionId,
    conditionId,
    traditionSlug: slug,
    traditionName: name,
    kind,
    value,
  });

  it("is post minus pre proportion correct per session and tradition, traditions in the canonical order", () => {
    const g = traditionGains(
      [
        // s1 (2D): Sanganeri pre 1/2, post 2/2 -> +0.5; Ajrakh pre 0/1, post 1/1 -> +1
        row("s1", "c2d", "sanganeri", "Sanganeri", "pretest", 1),
        row("s1", "c2d", "sanganeri", "Sanganeri", "pretest", 0),
        row("s1", "c2d", "sanganeri", "Sanganeri", "posttest", 1),
        row("s1", "c2d", "sanganeri", "Sanganeri", "posttest", 1),
        row("s1", "c2d", "ajrakh", "Ajrakh", "pretest", 0),
        row("s1", "c2d", "ajrakh", "Ajrakh", "posttest", 1),
        // s2 (3D): Sanganeri pre 1/1, post 0/1 -> -1; Ajrakh only a pre-test answer -> not counted
        row("s2", "c3d", "sanganeri", "Sanganeri", "pretest", 1),
        row("s2", "c3d", "sanganeri", "Sanganeri", "posttest", 0),
        row("s2", "c3d", "ajrakh", "Ajrakh", "pretest", 1),
        // ignored: transfer items, undefined scores, sessions of other conditions
        row("s2", "c3d", "sanganeri", "Sanganeri", "transfer", 1),
        row("s2", "c3d", "sanganeri", "Sanganeri", "posttest", null),
        row("s9", "other", "ajrakh", "Ajrakh", "pretest", 0),
        row("s9", "other", "ajrakh", "Ajrakh", "posttest", 1),
      ],
      ["c2d", "c3d"],
    );
    expect(g.map((t) => t.slug)).toEqual(["ajrakh", "sanganeri"]);
    expect(g[0]!.gains).toEqual([[1], []]);
    expect(g[1]!.gains[0]).toEqual([0.5]);
    expect(g[1]!.gains[1]).toEqual([-1]);
  });

  it("is empty with no linked items", () => {
    expect(traditionGains([], ["c2d", "c3d"])).toEqual([]);
  });
});
