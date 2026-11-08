import { boxesOverlapDepth, insideDepth, type Box, type Vec3 } from "./geometry";

export type SolidRole = "wall" | "structure" | "object" | "textile" | "frame" | "pole" | "hollow" | "surface";

export interface CheckedSolid {
  readonly name: string;
  readonly role: SolidRole;
  readonly box: Box;
  readonly restsOn: readonly string[];
  readonly planted: boolean;
  readonly standsOnY?: number;
  readonly standsWithin?: Box;
}

export interface SolidField {
  readonly name: string;
  readonly depthAt: (point: Vec3) => number;
}

export interface ClothMesh {
  readonly name: string;
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
}

export interface CheckedSphere {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly r: number;
}

export interface FillAudit {
  readonly name: string;
  readonly points: () => Float32Array;
  readonly vertexOutside: (point: Vec3) => boolean;
  readonly pieces: () => readonly (readonly CheckedSphere[])[];
}

interface SceneProblem {
  readonly rule: "solid-overlap" | "outside-yard" | "below-ground" | "through-wall" | "cloth-penetration" | "fill-outside-vessel" | "fill-overlap" | "through-bench" | "off-bench" | "fill-missing" | "unchecked-mesh";
  readonly subject: string;
  readonly against: string;
  readonly depthMm: number;
  readonly vertices?: number;
}

export interface SceneCheckInput {
  readonly yard: Box;
  readonly solids: readonly CheckedSolid[];
  readonly fields: readonly SolidField[];
  readonly cloths: readonly ClothMesh[];
  readonly groundIsOpenAt: (x: number, z: number) => boolean;
  readonly fills?: readonly FillAudit[];
  readonly unchecked?: readonly string[];
  readonly expectedFills?: number;
}

export interface SceneCheckReport {
  readonly solidsChecked: number;
  readonly clothPointsChecked: number;
  readonly fillPointsChecked: number;
  readonly fillPiecesChecked: number;
  readonly fillsChecked: number;
  readonly problems: readonly SceneProblem[];
}

const TOLERANCE_METRES = 0.004;
const GROUND_ALLOWANCE_METRES = 0.002;
const PLANTED_DEPTH_METRES = 0.12;
const PIECE_TOLERANCE_METRES = 0.0002;

const mm = (metres: number): number => Math.round(metres * 10000) / 10;

function solidProblems(input: SceneCheckInput): SceneProblem[] {
  const problems: SceneProblem[] = [];
  const yard = input.yard;
  const solids = input.solids.filter((solid) => solid.role !== "surface");
  for (const solid of solids) {
    if (solid.standsOnY !== undefined && solid.box.min[1] < solid.standsOnY - TOLERANCE_METRES) problems.push({ rule: "through-bench", subject: solid.name, against: "bench top", depthMm: mm(solid.standsOnY - solid.box.min[1]) });
    if (solid.standsWithin) {
      const past = Math.max(solid.standsWithin.min[0] - solid.box.min[0], solid.box.max[0] - solid.standsWithin.max[0], solid.standsWithin.min[2] - solid.box.min[2], solid.box.max[2] - solid.standsWithin.max[2]);
      if (past > TOLERANCE_METRES) problems.push({ rule: "off-bench", subject: solid.name, against: "bench top", depthMm: mm(past) });
    }
    if (solid.role !== "wall") {
      const beyond = Math.max(yard.min[0] - solid.box.min[0], solid.box.max[0] - yard.max[0], yard.min[2] - solid.box.min[2], solid.box.max[2] - yard.max[2]);
      if (beyond > TOLERANCE_METRES) problems.push({ rule: "outside-yard", subject: solid.name, against: "yard", depthMm: mm(beyond) });
    }
    const belowLimit = solid.planted ? PLANTED_DEPTH_METRES : TOLERANCE_METRES;
    if (solid.box.min[1] < -belowLimit) problems.push({ rule: "below-ground", subject: solid.name, against: "ground", depthMm: mm(-solid.box.min[1]) });
  }
  for (let i = 0; i < solids.length; i++) {
    for (let j = i + 1; j < solids.length; j++) {
      const a = solids[i]!;
      const b = solids[j]!;
      if (a.restsOn.includes(b.name) || b.restsOn.includes(a.name)) continue;
      if (a.role === "wall" && b.role === "wall") continue;
      const depth = boxesOverlapDepth(a.box, b.box);
      if (depth <= TOLERANCE_METRES) continue;
      const rule = a.role === "wall" || b.role === "wall" ? "through-wall" : "solid-overlap";
      problems.push({ rule, subject: a.name, against: b.name, depthMm: mm(depth) });
    }
  }
  return problems;
}

function clothProblems(input: SceneCheckInput, count: { points: number }): SceneProblem[] {
  const worst = new Map<string, SceneProblem>();
  const note = (subject: string, against: string, depth: number) => {
    const key = `${subject}|${against}`;
    const known = worst.get(key);
    if (!known || known.depthMm < mm(depth)) worst.set(key, { rule: "cloth-penetration", subject, against, depthMm: mm(depth) });
  };
  const blockers = input.solids.filter((solid) => solid.role !== "pole" && solid.role !== "hollow" && solid.role !== "surface");
  const test = (name: string, p: Vec3) => {
    count.points++;
    if (p[1] < GROUND_ALLOWANCE_METRES && !input.groundIsOpenAt(p[0], p[2])) note(name, "ground", GROUND_ALLOWANCE_METRES - p[1]);
    for (const solid of blockers) {
      const depth = insideDepth(solid.box, p);
      if (depth > TOLERANCE_METRES) note(name, solid.name, depth);
    }
    for (const field of input.fields) {
      const depth = field.depthAt(p);
      if (depth > TOLERANCE_METRES) note(name, field.name, depth);
    }
  };
  for (const mesh of input.cloths) {
    const p = mesh.positions;
    for (let k = 0; k < p.length; k += 3) test(mesh.name, [p[k]!, p[k + 1]!, p[k + 2]!]);
    for (let t = 0; t < mesh.indices.length; t += 3) {
      const a = mesh.indices[t]! * 3;
      const b = mesh.indices[t + 1]! * 3;
      const c = mesh.indices[t + 2]! * 3;
      test(mesh.name, [(p[a]! + p[b]! + p[c]!) / 3, (p[a + 1]! + p[b + 1]! + p[c + 1]!) / 3, (p[a + 2]! + p[b + 2]! + p[c + 2]!) / 3]);
    }
  }
  return [...worst.values()];
}

function piecesOverlapDepth(a: readonly CheckedSphere[], b: readonly CheckedSphere[]): number {
  let deepest = 0;
  for (const one of a) {
    for (const other of b) deepest = Math.max(deepest, one.r + other.r - Math.hypot(one.x - other.x, one.y - other.y, one.z - other.z));
  }
  return deepest;
}

function fillProblems(input: SceneCheckInput, count: { fillPoints: number; fillPieces: number }): SceneProblem[] {
  const problems: SceneProblem[] = [];
  for (const fill of input.fills ?? []) {
    let outside = 0;
    const p = fill.points();
    for (let k = 0; k < p.length; k += 3) {
      count.fillPoints++;
      if (fill.vertexOutside([p[k]!, p[k + 1]!, p[k + 2]!])) outside++;
    }
    if (outside > 0) problems.push({ rule: "fill-outside-vessel", subject: fill.name, against: "vessel", depthMm: 0, vertices: outside });
    const pieces = fill.pieces();
    count.fillPieces += pieces.length;
    let overlap = 0;
    for (let i = 0; i < pieces.length; i++) {
      for (let j = i + 1; j < pieces.length; j++) overlap = Math.max(overlap, piecesOverlapDepth(pieces[i]!, pieces[j]!));
    }
    if (overlap > PIECE_TOLERANCE_METRES) problems.push({ rule: "fill-overlap", subject: fill.name, against: "another piece", depthMm: mm(overlap) });
  }
  return problems;
}

export function checkScene(input: SceneCheckInput): SceneCheckReport {
  const count = { points: 0, fillPoints: 0, fillPieces: 0 };
  const unchecked = (input.unchecked ?? []).map((name): SceneProblem => ({ rule: "unchecked-mesh", subject: name, against: "scene check", depthMm: 0 }));
  const seenFills = input.fills?.length ?? 0;
  const missing = input.expectedFills !== undefined && seenFills !== input.expectedFills ? [{ rule: "fill-missing" as const, subject: `${seenFills} fills`, against: `${input.expectedFills} in the plan`, depthMm: 0 }] : [];
  const problems = [...solidProblems(input), ...clothProblems(input, count), ...fillProblems(input, count), ...unchecked, ...missing];
  return { solidsChecked: input.solids.length, clothPointsChecked: count.points, fillPointsChecked: count.fillPoints, fillPiecesChecked: count.fillPieces, fillsChecked: input.fills?.length ?? 0, problems };
}
