import { describe, expect, it } from "vitest";

import { AllocationConfigError, auditAllocations, defaultBlockSize, drawCondition, permutedBlock } from "../../../src/server/study/allocation";

const C = [
  { id: "id-3d", code: "immersive", weight: 1 },
  { id: "id-2d", code: "conventional", weight: 1 },
];

describe("seeded permuted-block allocation", () => {
  it("is deterministic and independent of condition order", () => {
    const a = Array.from({ length: 40 }, (_, i) => drawCondition({ algorithm: "block", seed: "s1", conditions: C, index: i }).conditionId);
    const b = Array.from({ length: 40 }, (_, i) => drawCondition({ algorithm: "block", seed: "s1", conditions: [...C].reverse(), index: i }).conditionId);
    expect(a).toEqual(b);
    const other = Array.from({ length: 40 }, (_, i) => drawCondition({ algorithm: "block", seed: "s2", conditions: C, index: i }).conditionId);
    expect(other).not.toEqual(a);
  });

  it("balances every block exactly, including weighted designs", () => {
    expect(defaultBlockSize(C)).toBe(4);
    for (let block = 0; block < 50; block++) {
      const b = permutedBlock("seed", "", block, C);
      expect(b.filter((c) => c.code === "conventional")).toHaveLength(2);
    }
    const weighted = [C[0]!, { ...C[1]!, weight: 2 }];
    const b = permutedBlock("seed", "", 0, weighted, 6);
    expect(b.filter((c) => c.code === "conventional")).toHaveLength(4);
    expect(() => permutedBlock("seed", "", 0, weighted, 4)).toThrow(AllocationConfigError);
  });

  it("does not always use the same order within blocks", () => {
    const orders = new Set(Array.from({ length: 30 }, (_, k) => permutedBlock("seed", "", k, C).map((c) => c.code).join(",")));
    expect(orders.size).toBeGreaterThan(1);
  });

  it("keeps stratum sequences independent and requires a stratum", () => {
    const x = Array.from({ length: 8 }, (_, i) => drawCondition({ algorithm: "stratified_block", seed: "s", conditions: C, index: i, stratum: "lab-a" }).conditionId);
    const y = Array.from({ length: 8 }, (_, i) => drawCondition({ algorithm: "stratified_block", seed: "s", conditions: C, index: i, stratum: "lab-b" }).conditionId);
    expect(x).not.toEqual(y);
    expect(() => drawCondition({ algorithm: "stratified_block", seed: "s", conditions: C, index: 0 })).toThrow(AllocationConfigError);
  });

  it("simple draws follow the weights over many indexes", () => {
    const n = 4000;
    const twoD = Array.from({ length: n }, (_, i) => drawCondition({ algorithm: "simple", seed: "s", conditions: C, index: i })).filter((d) => d.conditionCode === "conventional").length;
    expect(Math.abs(twoD / n - 0.5)).toBeLessThan(0.05);
  });

  it("audits recorded allocations and reports tampering", () => {
    const rows = Array.from({ length: 8 }, (_, i) => ({
      participantId: `p${i}`,
      conditionId: drawCondition({ algorithm: "block", seed: "s", conditions: C, index: i }).conditionId,
      algorithm: "block",
      seed: "s",
      sequenceIndex: i,
      stratum: null,
      period: 1,
    }));
    expect(auditAllocations(rows, C)).toEqual({ checked: 8, skipped: 0, mismatches: [] });
    const tampered = rows.map((r, i) => (i === 3 ? { ...r, conditionId: r.conditionId === "id-2d" ? "id-3d" : "id-2d" } : r));
    expect(auditAllocations(tampered, C).mismatches).toHaveLength(1);
    expect(auditAllocations([...rows, { ...rows[0]!, algorithm: "manual", period: 2 }], C).skipped).toBe(1);
  });
});
