import { EASE_BELOW_FIELD_METRES, settledClothSteps } from "@/features/walkthrough/domain/cloth-surface";
import { describe, expect, it } from "vitest";
import type { ProductImage, StationKind } from "@/features/process/domain/stage-template";
import { checkScene } from "@/features/walkthrough/domain/scene-check";
import { layoutTextiles } from "@/features/walkthrough/domain/route-plan";
import { buildYardPlan, CLOTH_LINE_X, YARD_HALF_WIDTH, type YardStage } from "@/features/walkthrough/domain/yard-plan";
import { stepWalker, type Walker } from "@/features/walkthrough/domain/walk-state";

function settle<T>(steps: Generator<void, T>): T {
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}

const KINDS: readonly StationKind[] = ["table", "vat", "boil", "wash", "soak", "dry", "carve", "finish"];
const stage = (kind: StationKind, index: number): YardStage => ({ number: index + 1, name: "Stage", localName: null, caption: "Caption", kind, items: [], next: { number: index + 2, name: "Next" }, index });

describe("cloth settles on what it touches", () => {
  for (const kind of KINDS) {
    for (const index of [0, 1]) {
      it(`${kind} yard ${index}`, () => {
        const plan = buildYardPlan(stage(kind, index));
        for (const surface of settle(settledClothSteps(plan.cloth.map((piece) => piece.spec)))) {
          const p = surface.positions;
          for (let k = 0; k < p.length; k += 3) {
            const floor = plan.heightField(p[k]!, p[k + 2]!, p[k + 1]!);
            expect(p[k + 1]!).toBeGreaterThanOrEqual(floor - EASE_BELOW_FIELD_METRES - 1e-4);
          }
        }
      });
    }
  }
});

describe("scene check", () => {
  const yard = { min: [-10, -1, -10] as const, max: [10, 10, 10] as const };
  const empty = { fields: [], cloths: [], groundIsOpenAt: () => false };

  it("reports a textile through a boundary wall", () => {
    const report = checkScene({
      ...empty,
      yard,
      solids: [
        { name: "wall", role: "wall", box: { min: [10, 0, -10], max: [10.3, 3, 10] }, restsOn: [], planted: false },
        { name: "textile", role: "textile", box: { min: [8, 0, 0], max: [12, 3, 0.1] }, restsOn: [], planted: false },
      ],
    });
    expect(report.problems.map((problem) => problem.rule).sort()).toEqual(["outside-yard", "through-wall"]);
  });

  it("reports cloth under the ground and inside a solid", () => {
    const positions = new Float32Array([0, -0.05, 0, 1, 0.5, 1, 2, 0.5, 2]);
    const report = checkScene({
      yard,
      fields: [],
      groundIsOpenAt: () => false,
      solids: [{ name: "crate", role: "structure", box: { min: [0.5, 0, 0.5], max: [1.5, 1, 1.5] }, restsOn: [], planted: false }],
      cloths: [{ name: "cloth", positions, indices: new Uint32Array([0, 1, 2]) }],
    });
    expect(report.problems.map((problem) => problem.against).sort()).toEqual(["crate", "ground"]);
  });

  it("accepts a declared contact", () => {
    const report = checkScene({
      ...empty,
      yard,
      solids: [
        { name: "bench", role: "structure", box: { min: [0, 0, 0], max: [1, 0.4, 1] }, restsOn: ["bowl"], planted: false },
        { name: "bowl", role: "object", box: { min: [0.2, 0.3, 0.2], max: [0.8, 0.6, 0.8] }, restsOn: ["bench"], planted: false },
      ],
    });
    expect(report.problems).toEqual([]);
  });
});

describe("product hall layout", () => {
  const products: ProductImage[] = Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, file: "", name: "Name", holder: "Holder", widthPx: 1400, heightPx: 1000, record: `https://example.org/${i}` }));

  it("keeps every textile inside the walls and clear of its neighbours", () => {
    const placed = layoutTextiles(products);
    for (const textile of placed) {
      expect(textile.x + textile.width / 2).toBeLessThan(CLOTH_LINE_X + YARD_HALF_WIDTH);
      expect(textile.x - textile.width / 2).toBeGreaterThan(CLOTH_LINE_X + 1);
      expect(textile.z).toBeGreaterThan(-21);
    }
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i]!;
        const b = placed[j]!;
        if (a.z === b.z) expect(Math.abs(a.x - b.x)).toBeGreaterThan((a.width + b.width) / 2);
      }
    }
  });
});

describe("walking", () => {
  const walker: Walker = { x: 0, z: 5, yaw: 0, pitch: 0, walked: 0 };

  it("stops at a solid", () => {
    const wall = [{ min: [-5, 0, 3] as const, max: [5, 3, 4] as const }];
    let state = walker;
    for (let i = 0; i < 200; i++) state = stepWalker(state, { forward: 1, strafe: 0, lookX: 0, lookY: 0 }, 0.05, wall, 0);
    expect(state.z).toBeGreaterThan(4);
  });

  it("walks freely and records distance", () => {
    const state = stepWalker(walker, { forward: 1, strafe: 0, lookX: 0, lookY: 0 }, 1, [], 0);
    expect(state.z).toBeLessThan(5);
    expect(state.walked).toBeGreaterThan(1);
  });
});
