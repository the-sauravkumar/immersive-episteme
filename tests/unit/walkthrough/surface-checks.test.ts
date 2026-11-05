import { describe, expect, it } from "vitest";
import { clothBodyBoxes, settleCloth } from "@/features/walkthrough/domain/cloth-surface";
import { firstHit, buildTriangleGrid, makeVesselProbe, vertexOutsideVessel, VESSEL_TUCK_METRES } from "@/features/walkthrough/domain/mesh-probe";
import { nearestEye, reachField } from "@/features/walkthrough/domain/reach";
import { checkScene } from "@/features/walkthrough/domain/scene-check";
import { chordSagitta, judgeSurface, rankWorstFirst, roundSegments, screenPixelsPerMetre, tearingFailures, type SurfaceFact } from "@/features/walkthrough/domain/surface-density";
import { BODY_RADIUS, stepWalker } from "@/features/walkthrough/domain/walk-state";
import { buildYardPlan, CLOTH_LINE_X } from "@/features/walkthrough/domain/yard-plan";

function lathe(profile: readonly (readonly [number, number])[], sides = 64): Float32Array {
  const out: number[] = [];
  for (let s = 0; s < sides; s++) {
    const a0 = (s / sides) * Math.PI * 2;
    const a1 = ((s + 1) / sides) * Math.PI * 2;
    for (let i = 0; i + 1 < profile.length; i++) {
      const [r0, y0] = profile[i]!;
      const [r1, y1] = profile[i + 1]!;
      const p = (r: number, y: number, a: number) => [Math.cos(a) * r, y, Math.sin(a) * r];
      out.push(...p(r0, y0, a0), ...p(r0, y0, a1), ...p(r1, y1, a1), ...p(r0, y0, a0), ...p(r1, y1, a1), ...p(r1, y1, a0));
    }
  }
  return Float32Array.from(out);
}

const POT = [[0.0001, 0], [0.08, 0], [0.11, 0.2], [0.104, 0.2], [0.074, 0.012], [0.0001, 0.012]] as const;

describe("vessel probe by raycasting the mesh", () => {
  const probe = makeVesselProbe(lathe(POT), 0, 0, 0.2, 0.012);

  it("finds the nearest surface along a ray", () => {
    const hit = firstHit(buildTriangleGrid(lathe(POT)), [0, 0.1, 0], [1, 0, 0]);
    expect(hit?.distance).toBeCloseTo(0.074 + (0.03 * 0.088) / 0.188, 2);
  });

  it("passes a vertex in the cavity and above the middle", () => {
    expect(vertexOutsideVessel(probe, [0, 0.1, 0], 0.003)).toBe(false);
    expect(vertexOutsideVessel(probe, [0.05, 0.05, 0.02], 0.003)).toBe(false);
    expect(vertexOutsideVessel(probe, [0, 0.26, 0], 0.003)).toBe(false);
  });

  it("fails a vertex beyond the wall, under the floor or in the wall", () => {
    expect(vertexOutsideVessel(probe, [0.2, 0.1, 0], 0.003)).toBe(true);
    expect(vertexOutsideVessel(probe, [0, -0.02, 0], 0.003)).toBe(true);
    expect(vertexOutsideVessel(probe, [0.1015, 0.15, 0], VESSEL_TUCK_METRES)).toBe(true);
  });
});

describe("scene check rules added for overlaps", () => {
  const yard = { min: [-10, -1, -10] as const, max: [10, 10, 10] as const };
  const empty = { fields: [], cloths: [], groundIsOpenAt: () => false };

  it("reports a vessel through its bench", () => {
    const report = checkScene({ ...empty, yard, solids: [{ name: "pot", role: "object", box: { min: [0, 0.3, 0], max: [1, 1, 1] }, restsOn: [], planted: false, standsOnY: 0.38 }] });
    expect(report.problems.map((problem) => problem.rule)).toEqual(["through-bench"]);
  });

  it("reports a mesh nobody registered", () => {
    const report = checkScene({ ...empty, yard, solids: [], unchecked: ["stray mesh"] });
    expect(report.problems).toEqual([{ rule: "unchecked-mesh", subject: "stray mesh", against: "scene check", depthMm: 0 }]);
  });

  it("does not run solid rules on painted and liquid surfaces", () => {
    const report = checkScene({ ...empty, yard, solids: [{ name: "lining", role: "surface", box: { min: [0, -0.7, 0], max: [1, 0, 1] }, restsOn: [], planted: false }] });
    expect(report.problems).toEqual([]);
  });
});

describe("how near the camera can reach", () => {
  const wall = { min: [-5, 0, 3] as const, max: [5, 3, 4] as const };
  const field = reachField({ minX: -8, maxX: 8, minZ: -8, maxZ: 8 }, [wall], [0, 0]);

  it("stops the eye one body radius short of a collider", () => {
    const reached = nearestEye(field, [0, 1.6, 3]);
    expect(reached.distance).toBeCloseTo(BODY_RADIUS, 1);
    expect(reached.eye[2]).toBeLessThan(3);
  });

  it("does not count ground behind the wall as reachable from the seed side", () => {
    const shut = reachField({ minX: -5, maxX: 5, minZ: -8, maxZ: 8 }, [wall], [0, 0]);
    expect(nearestEye(shut, [0, 1.6, 7]).eye[2]).toBeLessThan(3);
  });

  it("lets the walker pass under a high rail and stops it at a low one", () => {
    const start = { x: 0, z: 5, yaw: 0, pitch: 0, walked: 0 };
    const high = [{ min: [-5, 4.4, 3] as const, max: [5, 4.6, 3.1] as const }];
    const low = [{ min: [-5, 0.5, 3] as const, max: [5, 0.6, 3.1] as const }];
    let underHigh = start;
    let atLow = start;
    for (let i = 0; i < 80; i++) {
      underHigh = stepWalker(underHigh, { forward: 1, strafe: 0, lookX: 0, lookY: 0 }, 0.05, high, 0);
      atLow = stepWalker(atLow, { forward: 1, strafe: 0, lookX: 0, lookY: 0 }, 0.05, low, 0);
    }
    expect(underHigh.z).toBeLessThan(2);
    expect(atLow.z).toBeGreaterThan(3);
  });
});

const fact: SurfaceFact = {
  label: "surface",
  surfaceClass: "model",
  colourPerMetre: 4000,
  normalPerMetre: 4000,
  roughnessPerMetre: 4000,
  detailColourPerMetre: null,
  detailNormalPerMetre: null,
  smallestMap: 2048,
  textHeightMetres: null,
  reachMetres: 0.6,
  facetSagittaMetres: 0,
  facetsAreReal: false,
  hardCurveShare: 0,
};

describe("texel density and facets", () => {
  it("needs 3456 pixels a metre at 0.6 m at 3840 by 2160", () => {
    expect(screenPixelsPerMetre(0.6)).toBeCloseTo(3456, -1);
  });

  it("passes a dense surface and fails a coarse one", () => {
    expect(judgeSurface(fact).failures).toEqual([]);
    expect(judgeSurface({ ...fact, colourPerMetre: 500, normalPerMetre: 500 }).failures.join()).toContain("texels");
  });

  it("counts a fine detail layer towards density", () => {
    expect(judgeSurface({ ...fact, colourPerMetre: 1024, normalPerMetre: 1024, detailColourPerMetre: 5000, detailNormalPerMetre: 5000 }).failures).toEqual([]);
  });

  it("fails a wall under the 1000 px/m floor whatever its detail layer", () => {
    expect(judgeSurface({ ...fact, surfaceClass: "wall", colourPerMetre: 800, detailColourPerMetre: 5000, detailNormalPerMetre: 5000 }).failures.join()).toContain("under 1000");
  });

  it("applies the cloth floors", () => {
    expect(judgeSurface({ ...fact, surfaceClass: "cloth", colourPerMetre: 400, detailColourPerMetre: 8000, normalPerMetre: 7600 }).failures.join()).toContain("cloth state");
    expect(judgeSurface({ ...fact, surfaceClass: "cloth", colourPerMetre: 890, detailColourPerMetre: 8000, normalPerMetre: 7600 }).failures).toEqual([]);
  });

  it("fails a camera that gets nearer than the body allows", () => {
    expect(judgeSurface({ ...fact, reachMetres: 0.2 }).failures.join()).toContain("camera can reach");
  });

  it("fails a surface with no texture unless it is a smooth liquid", () => {
    expect(judgeSurface({ ...fact, colourPerMetre: null, normalPerMetre: null }).failures).toContain("no texture");
    expect(judgeSurface({ ...fact, surfaceClass: "smooth", colourPerMetre: null, normalPerMetre: null }).failures).toEqual([]);
  });

  it("judges facets by their sagitta in pixels at 0.6 m", () => {
    const radius = 0.2;
    const turning = (Math.PI * 2) / 8;
    const chord = 2 * radius * Math.sin(turning / 2);
    const sagitta = chordSagitta(chord, turning);
    expect(sagitta).toBeCloseTo(radius * (1 - Math.cos(turning / 2)), 4);
    expect(judgeSurface({ ...fact, facetSagittaMetres: sagitta }).failures.join()).toContain("facets");
    expect(judgeSurface({ ...fact, facetSagittaMetres: sagitta, facetsAreReal: true, hardCurveShare: 1 }).failures).toEqual([]);
  });

  it("gives round things enough sides to stay under a pixel at 0.6 m", () => {
    for (const radius of [0.008, 0.034, 0.065, 0.3]) {
      const sides = roundSegments(radius);
      const sagitta = radius * (1 - Math.cos(Math.PI / sides));
      expect(sagitta * screenPixelsPerMetre(0.6)).toBeLessThan(1);
    }
  });

  it("ranks failures first and then the thinnest density", () => {
    const rows = rankWorstFirst([judgeSurface({ ...fact, label: "fine" }), judgeSurface({ ...fact, label: "thin", colourPerMetre: 3500 }), judgeSurface({ ...fact, label: "bad", colourPerMetre: 100 })]);
    expect(rows.map((row) => row.label)).toEqual(["bad", "thin", "fine"]);
  });
});

describe("tearing limits", () => {
  const clean = { label: "x", distance: 1, visiblePixels: 5000, fightingPercent: 0, colourFlickerPercent: 0, crackPixels: 0, backFacePercent: 0, openWork: false };

  it("passes a clean figure and fails each fault", () => {
    expect(tearingFailures(clean)).toEqual([]);
    expect(tearingFailures({ ...clean, fightingPercent: 2 }).join()).toContain("depth fight");
    expect(tearingFailures({ ...clean, colourFlickerPercent: 3 }).join()).toContain("flicker");
    expect(tearingFailures({ ...clean, crackPixels: 40 }).join()).toContain("crack");
    expect(tearingFailures({ ...clean, backFacePercent: 50 }).join()).toContain("missing face");
  });

  it("allows gaps in woven and piled things, and ignores an object barely in view", () => {
    expect(tearingFailures({ ...clean, crackPixels: 40, openWork: true })).toEqual([]);
    expect(tearingFailures({ ...clean, visiblePixels: 20, fightingPercent: 50 })).toEqual([]);
  });
});

describe("cloth", () => {
  const stage = { number: 1, name: "Stage", localName: null, caption: "Caption", items: [], next: { number: 2, name: "A Very Long Station Name That Runs On And On Past Any Pier" }, index: 0 } as const;

  it("adds rows only where it bends, without moving the ends", () => {
    const flat = settleCloth({ points: [[0, 0.1, 0], [0, 0.1, 2], [0, 0.1, 4]], width: 1, metresPerRepeat: 3, fold: 0, foldFrequency: 1, step: 0.05, columns: 8, foldAmount: () => 0, field: () => 0 });
    const bent = settleCloth({ points: [[0, 0.1, 0], [0, 1.2, 0.8], [0, 0.1, 1.6], [0, 1.2, 2.4], [0, 0.1, 3.2]], width: 1, metresPerRepeat: 3, fold: 0, foldFrequency: 1, step: 0.05, columns: 8, foldAmount: () => 0, field: () => 0 });
    const length = 4 / 0.05;
    expect(flat.rows).toBeLessThan(length * 1.2);
    expect(bent.rows).toBeGreaterThan(flat.rows);
    expect(bent.positions[1]).toBeCloseTo(0.1, 3);
  });

  it("gives a body-height box only where the cloth is at body height", () => {
    const surface = settleCloth({ points: [[0, 0.01, 0], [0, 0.01, 2], [0, 1, 3], [0, 3, 4], [0, 3, 6]], width: 1, metresPerRepeat: 3, fold: 0, foldFrequency: 1, step: 0.05, columns: 8, foldAmount: () => 0, field: () => 0 });
    const boxes = clothBodyBoxes(surface);
    expect(boxes.length).toBe(1);
    expect(boxes[0]!.min[2]).toBeGreaterThan(1);
    expect(boxes[0]!.max[2]).toBeLessThan(5);
  });

  it("keeps a long next-station name on the wall, clear of the gap", () => {
    const plan = buildYardPlan({ ...stage, kind: "dry" });
    const word = plan.words.find((candidate) => candidate.lines[0]!.startsWith("2  "))!;
    const halfWidth = word.lines[0]!.length * word.height * 0.3;
    expect(Math.abs(word.at[0] - CLOTH_LINE_X) - halfWidth).toBeGreaterThan(1.8 + 0.21);
  });
});
