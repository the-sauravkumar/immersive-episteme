import { boxesOverlapDepth, insideDepth, type Box, type Vec3 } from "./geometry";

export type SolidRole = "wall" | "structure" | "object" | "textile" | "frame" | "hollow";

export interface CheckedSolid {
  readonly name: string;
  readonly role: SolidRole;
  readonly box: Box;
  readonly restsOn: readonly string[];
  readonly planted: boolean;
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

export interface SceneProblem {
  readonly rule: "solid-overlap" | "outside-yard" | "below-ground" | "through-wall" | "cloth-penetration";
  readonly subject: string;
  readonly against: string;
  readonly depthMm: number;
}

export interface SceneCheckInput {
  readonly yard: Box;
  readonly solids: readonly CheckedSolid[];
  readonly fields: readonly SolidField[];
  readonly cloths: readonly ClothMesh[];
  readonly groundIsOpenAt: (x: number, z: number) => boolean;
}

export interface SceneCheckReport {
  readonly solidsChecked: number;
  readonly clothPointsChecked: number;
  readonly problems: readonly SceneProblem[];
}

const TOLERANCE_METRES = 0.004;
const GROUND_ALLOWANCE_METRES = 0.002;
const PLANTED_DEPTH_METRES = 0.12;

const mm = (metres: number): number => Math.round(metres * 10000) / 10;

function solidProblems(input: SceneCheckInput): SceneProblem[] {
  const problems: SceneProblem[] = [];
  const { yard, solids } = input;
  for (const solid of solids) {
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
      if (a.role === b.role && (a.role === "wall" || a.role === "frame")) continue;
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
  const blockers = input.solids.filter((solid) => solid.role !== "frame" && solid.role !== "hollow");
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

export function checkScene(input: SceneCheckInput): SceneCheckReport {
  const count = { points: 0 };
  const problems = [...solidProblems(input), ...clothProblems(input, count)];
  return { solidsChecked: input.solids.length, clothPointsChecked: count.points, problems };
}
