import { CLOTH_AFTER_LABEL, type StageItem, type StationKind } from "@/features/process/domain/stage-template";
import { cosineFall, smoothstep, type Box, type Vec3 } from "./geometry";
import { settleCloth, type ClothSurface, type HeightField } from "./cloth-surface";

export const CLOTH_LINE_X = 3;
export const RAIL_HEIGHT = 4.5;
export const CLOTH_WIDTH = 1.5;
export const YARD_FRONT_Z = 18;
export const FAR_WALL_Z = -21;
export const NEXT_YARD_OFFSET = 44;
export const GAP_WIDTH = 3.6;
export const WALL_HEIGHT = 2.6;
export const EYE_HEIGHT = 1.6;
export const YARD_HALF_WIDTH = 24;

export type WorkStructure =
  | { readonly type: "ring"; readonly z: number; readonly radius: number; readonly rim: number; readonly curb: number; readonly level: number; readonly finish: "lime" | "copper" }
  | { readonly type: "tank"; readonly z: number; readonly halfX: number; readonly halfZ: number; readonly rim: number; readonly curb: number; readonly level: number }
  | { readonly type: "table"; readonly top: number; readonly width: number; readonly z0: number; readonly z1: number; readonly stackZ: number; readonly stackTop: number }
  | { readonly type: "open" };

export interface PaintedWords {
  readonly lines: readonly string[];
  readonly at: Vec3;
  readonly facing: number;
  readonly height: number;
  readonly align: "left" | "center" | "right";
  readonly colour: "ink" | "lime" | "caption" | "sample";
  readonly weight: number;
  readonly family: "Eczar" | "Mukta";
  readonly pixelsPerMetre: number;
  readonly wear: number;
  readonly lineHeight: number;
  readonly maxWidth?: number | null;
}

export interface CurvedWords {
  readonly lines: readonly string[];
  readonly centre: readonly [number, number];
  readonly radius: number;
  readonly y: number;
  readonly angle: number;
  readonly height: number;
}

export interface PlacedItem {
  readonly item: StageItem;
  readonly x: number;
  readonly z: number;
  readonly surfaceTop: number;
  readonly onBench: boolean;
  readonly benchLabel: PaintedWords | null;
  readonly benchLength: number;
}

export interface ClothPiece {
  readonly name: string;
  readonly state: "before" | "after";
  readonly surface: ClothSurface;
}

export interface YardPlan {
  readonly side: 1 | -1;
  readonly yard: Box;
  readonly work: WorkStructure;
  readonly shed: { readonly x0: number; readonly x1: number; readonly z: number; readonly height: number; readonly doorX: number };
  readonly rails: readonly number[];
  readonly items: readonly PlacedItem[];
  readonly words: readonly PaintedWords[];
  readonly curvedWords: readonly CurvedWords[];
  readonly cloth: readonly ClothPiece[];
  readonly pins: readonly (readonly [number, number])[];
  readonly standpoint: { readonly from: Vec3; readonly to: Vec3 };
  readonly readingSpot: { readonly from: Vec3; readonly to: Vec3 };
  readonly tie: { readonly x: number; readonly z0: number; readonly z1: number; readonly y: number } | null;
  readonly heightField: HeightField;
  readonly walkLine: readonly (readonly [number, number])[];
}

export interface YardStage {
  readonly number: number | string;
  readonly name: string;
  readonly localName: string | null;
  readonly caption: string;
  readonly kind: StationKind;
  readonly items: readonly StageItem[];
  readonly next: { readonly number: number | string; readonly name: string } | null;
  readonly index: number;
}

const VAT_Z = 4.6;

export function structureFor(kind: StationKind): WorkStructure {
  switch (kind) {
    case "vat":
      return { type: "ring", z: VAT_Z, radius: 1.12, rim: 1.32, curb: 0.36, level: 0.12, finish: "lime" };
    case "soak":
      return { type: "ring", z: VAT_Z, radius: 1.0, rim: 1.18, curb: 0.5, level: 0.32, finish: "lime" };
    case "boil":
      return { type: "ring", z: VAT_Z, radius: 1.0, rim: 1.09, curb: 0.78, level: 0.6, finish: "copper" };
    case "wash":
      return { type: "tank", z: VAT_Z, halfX: 1.2, halfZ: 2.1, rim: 0.22, curb: 0.5, level: 0.32 };
    case "table":
    case "carve":
    case "finish":
      return { type: "table", top: 0.86, width: 1.84, z0: -0.9, z1: 10, stackZ: 11.25, stackTop: 0.37 };
    case "dry":
      return { type: "open" };
  }
}

const groundHeight = (x: number, z: number): number => 0.012 + 0.0022 * (1 + Math.sin(x * 7.3 + z * 2.1) * Math.sin(z * 6.1 - x * 1.7));

export function heightFieldFor(work: WorkStructure, rails: readonly number[]): HeightField {
  return (x, z, y) => {
    let h = groundHeight(x, z);
    if (work.type === "ring") {
      const r = Math.hypot(x - CLOTH_LINE_X, z - work.z);
      const top = work.curb + 0.016;
      if (r >= work.radius - 0.02 && r <= work.rim + 0.03) h = top;
      else if (r > work.rim + 0.03 && r < work.rim + 0.03 + work.curb * 1.6) h = Math.max(h, h + (top - h) * cosineFall((r - work.rim - 0.03) / (work.curb * 1.6)));
      else if (r < work.radius - 0.02) {
        const t = (work.radius - 0.02 - r) / 0.42;
        h = t >= 1 ? -9 : work.level - 0.25 + (top - work.level + 0.25) * cosineFall(t);
      }
    }
    if (work.type === "tank") {
      const dx = Math.abs(x - CLOTH_LINE_X);
      const dz = Math.abs(z - work.z);
      const outerX = work.halfX + work.rim;
      const outerZ = work.halfZ + work.rim;
      const top = work.curb + 0.016;
      const inner = dx < work.halfX - 0.02 && dz < work.halfZ - 0.02;
      if (inner) {
        const t = Math.min(work.halfZ - 0.02 - dz, 0.42) / 0.42;
        h = t >= 1 ? -9 : work.level - 0.25 + (top - work.level + 0.25) * cosineFall(t);
      } else if (dx <= outerX + 0.03 && dz <= outerZ + 0.03) h = top;
      else if (dx <= outerX + 0.03 && dz < outerZ + 0.03 + work.curb * 1.6) h = Math.max(h, h + (top - h) * cosineFall((dz - outerZ - 0.03) / (work.curb * 1.6)));
    }
    if (work.type === "table" && Math.abs(x - CLOTH_LINE_X) < work.width / 2 + 0.02) {
      const top = work.top + 0.012;
      if (z <= work.z1 && z >= work.z0) h = top;
      else if (z > work.z1 && z < work.z1 + 0.5) h = Math.max(h, h + (top - h) * cosineFall((z - work.z1) / 0.5));
      else if (z < work.z0 && z > work.z0 - 0.5) h = Math.max(h, h + (top - h) * cosineFall((work.z0 - z) / 0.5));
      if (Math.abs(z - work.stackZ) < 0.52) h = Math.max(h, work.stackTop);
    }
    for (const rail of rails) {
      if (Math.abs(x - CLOTH_LINE_X) < 1.13 && Math.abs(z - rail) < 0.075 && y > RAIL_HEIGHT - 0.25) {
        h = Math.max(h, RAIL_HEIGHT + 0.066 - (Math.abs(z - rail) / 0.075) ** 2 * 0.05);
      }
    }
    return h;
  };
}

export const foldAmount = (p: Vec3): number => {
  const low = smoothstep(0.55, 1.5, p[1]);
  const high = 1 - smoothstep(RAIL_HEIGHT - 1.1, RAIL_HEIGHT - 0.2, p[1]);
  return Math.max(p[1] > 0.5 ? 0.08 : 0, low * high);
};

function festoonPoints(rails: readonly number[]): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i < rails.length - 1; i++) {
    const a = rails[i]!;
    const b = rails[i + 1]!;
    const mid = (a + b) / 2;
    const low = i % 2 ? 0.56 : 0.76;
    out.push([CLOTH_LINE_X, RAIL_HEIGHT - 0.3, a - 0.18], [CLOTH_LINE_X, 2.6, a - 0.46], [CLOTH_LINE_X, low + 0.28, mid + 0.22], [CLOTH_LINE_X, low, mid], [CLOTH_LINE_X, low + 0.28, mid - 0.22], [CLOTH_LINE_X, 2.6, b + 0.46], [CLOTH_LINE_X, RAIL_HEIGHT - 0.3, b + 0.18], [CLOTH_LINE_X, RAIL_HEIGHT + 0.07, b]);
  }
  return out;
}

function awayPoints(lastRail: number): Vec3[] {
  return [
    [CLOTH_LINE_X, RAIL_HEIGHT - 0.25, lastRail - 0.8],
    [CLOTH_LINE_X, 3.65, lastRail - 3.4],
    [CLOTH_LINE_X, 3.2, FAR_WALL_Z + 3],
    [CLOTH_LINE_X, 3.05, FAR_WALL_Z],
    [CLOTH_LINE_X, 1.9, FAR_WALL_Z - 2.6],
    [CLOTH_LINE_X, 0.3, FAR_WALL_Z - 4.2],
    [CLOTH_LINE_X, 0.012, YARD_FRONT_Z - NEXT_YARD_OFFSET],
  ];
}

function incomingGround(toZ: number): Vec3[] {
  return [
    [CLOTH_LINE_X, 0.012, YARD_FRONT_Z],
    [CLOTH_LINE_X, 0.012, 14],
    [CLOTH_LINE_X, 0.012, 10],
    [CLOTH_LINE_X, 0.012, toZ],
  ];
}

const paintedFacing = (side: 1 | -1): number => (side === 1 ? -Math.PI / 2 : Math.PI / 2);

function benchWords(item: StageItem, x: number, z: number, y: number, side: 1 | -1): PaintedWords {
  return {
    lines: [item.localName ? `${item.label} (${item.localName})` : item.label],
    at: [x, y, z],
    facing: paintedFacing(side),
    height: 0.078,
    align: "center",
    colour: "lime",
    weight: 700,
    family: "Eczar",
    pixelsPerMetre: 2000,
    wear: 0.6,
    lineHeight: 1.14,
  };
}

const NAME_HEIGHT = 0.34;
const WORD_COLUMN_WIDTH = 3.2;

function linesNeeded(text: string, height: number): number {
  const perLine = Math.floor(WORD_COLUMN_WIDTH / (height * 0.53));
  let lines = 1;
  let used = 0;
  for (const word of text.split(" ")) {
    if (used > 0 && used + 1 + word.length > perLine) {
      lines++;
      used = word.length;
    } else used += word.length + (used > 0 ? 1 : 0);
  }
  return lines;
}

function stationWords(stage: YardStage, shedX: (x: number) => number, shedZ: number): PaintedWords[] {
  const base = { facing: 0, align: "left" as const, family: "Eczar" as const, weight: 700, wear: 0.4, lineHeight: 1.14, maxWidth: null };
  const z = shedZ + 0.004;
  const left = shedX(-6.75);
  const words: PaintedWords[] = [{ ...base, align: "right", lines: [String(stage.number)], at: [shedX(-6.95), 1.6, z], height: 1.6, colour: "ink", weight: 800, pixelsPerMetre: 560 }];
  let top = 3.5;
  const nameLines = linesNeeded(stage.name, NAME_HEIGHT);
  words.push({ ...base, lines: [stage.name], at: [left, top, z], height: NAME_HEIGHT, colour: "ink", pixelsPerMetre: 800, lineHeight: 1.1, maxWidth: WORD_COLUMN_WIDTH });
  top -= nameLines * NAME_HEIGHT * 1.1 + 0.14;
  if (stage.localName) {
    words.push({ ...base, lines: [stage.localName], at: [left, top, z], height: 0.16, colour: "ink", weight: 600, pixelsPerMetre: 1400, wear: 0.2, maxWidth: WORD_COLUMN_WIDTH });
    top -= linesNeeded(stage.localName, 0.16) * 0.16 * 1.14 + 0.1;
  }
  words.push({ ...base, lines: [stage.caption], at: [left, top, z], height: 0.13, colour: "caption", family: "Mukta", weight: 600, pixelsPerMetre: 1400, wear: 0, lineHeight: 1.3, maxWidth: WORD_COLUMN_WIDTH });
  return words;
}

export function buildYardPlan(stage: YardStage): YardPlan {
  const side: 1 | -1 = stage.index % 2 === 0 ? 1 : -1;
  const X = (x: number) => CLOTH_LINE_X + side * (x - CLOTH_LINE_X);
  const work = structureFor(stage.kind);
  const after: readonly number[] = work.type === "table" ? [-3.2, -5.2, -7.2] : work.type === "open" ? [-1.5, -3.5, -5.5] : work.type === "tank" ? [1.6, -0.4, -2.4, -4.4, -6.4, -8.4] : [2.5, 0.5, -1.5, -3.5, -5.5, -7.5];
  const rails = after;
  const field = heightFieldFor(work, rails);
  const shedZ = -4.5;
  const shed = { x0: Math.min(X(-19), X(-0.6)), x1: Math.max(X(-19), X(-0.6)), z: shedZ, height: 3.7, doorX: side === 1 ? X(-1.8) : 16 };
  const shedWordX = (x: number) => (side === 1 ? x : x + 18);
  const words: PaintedWords[] = stationWords(stage, shedWordX, shedZ);
  const curvedWords: CurvedWords[] = [];
  const specOf = (points: readonly Vec3[], name: string, state: "before" | "after", fold: number): ClothPiece => ({
    name,
    state,
    surface: settleCloth({ points, width: CLOTH_WIDTH, metresPerRepeat: 3.46, fold, foldFrequency: 3.1, step: 0.05, columns: 44, foldAmount, field }),
  });
  const cloth: ClothPiece[] = [];
  let lastGround = 6;
  const start = rails[0]!;
  const toFirstRail: Vec3 = [CLOTH_LINE_X, RAIL_HEIGHT + 0.07, start];
  const festoon = festoonPoints(rails);
  const away = awayPoints(rails[rails.length - 1]!);
  if (work.type === "ring" || work.type === "tank") {
    const reach = work.type === "ring" ? work.rim + work.curb * 1.6 + 0.2 : work.halfZ + work.rim + work.curb * 1.6 + 0.2;
    const inside = work.type === "ring" ? work.radius - 0.72 : work.halfZ - 0.72;
    lastGround = work.z + reach;
    cloth.push(specOf([...incomingGround(lastGround + 1), [CLOTH_LINE_X, 0.012, lastGround], [CLOTH_LINE_X, 0.012, work.z + inside + 0.5], [CLOTH_LINE_X, -0.1, work.z + inside + 0.1], [CLOTH_LINE_X, -0.3, work.z + inside - 0.2]], "cloth-in", "before", 0.004));
    cloth.push(specOf([[CLOTH_LINE_X, -0.3, work.z - inside + 0.2], [CLOTH_LINE_X, work.level + 0.03, work.z - inside], [CLOTH_LINE_X, work.curb + 1, Math.min(3.5, work.z - inside - 0.7)], [CLOTH_LINE_X, 3.2, start + 0.45], [CLOTH_LINE_X, RAIL_HEIGHT - 0.2, start + 0.18], toFirstRail, ...festoon, ...away], "cloth-out", "after", 0.07));
  } else if (work.type === "table") {
    const boundary = 3.4;
    cloth.push(specOf([[CLOTH_LINE_X, 0.012, YARD_FRONT_Z], [CLOTH_LINE_X, 0.012, work.stackZ + 2], [CLOTH_LINE_X, 0.2, work.stackZ + 0.95], [CLOTH_LINE_X, work.stackTop, work.stackZ + 0.3], [CLOTH_LINE_X, work.stackTop, work.stackZ - 0.25], [CLOTH_LINE_X, 0.6, work.z1 + 0.6], [CLOTH_LINE_X, work.top + 0.012, work.z1], [CLOTH_LINE_X, work.top + 0.012, boundary]], "cloth-in", "before", 0.003));
    cloth.push(specOf([[CLOTH_LINE_X, work.top + 0.012, boundary], [CLOTH_LINE_X, work.top + 0.012, work.z0 + 0.5], [CLOTH_LINE_X, work.top + 0.1, work.z0 - 0.1], [CLOTH_LINE_X, 1.6, -1.7], [CLOTH_LINE_X, 3.3, -2.5], [CLOTH_LINE_X, RAIL_HEIGHT - 0.2, start + 0.25], toFirstRail, ...festoon, ...away], "cloth-out", "after", 0.07));
  } else {
    cloth.push(specOf([...incomingGround(4), [CLOTH_LINE_X, 0.012, 0.8]], "cloth-in", "before", 0.004));
    cloth.push(specOf([[CLOTH_LINE_X, 0.012, 0.8], [CLOTH_LINE_X, 0.03, 0.2], [CLOTH_LINE_X, 1.4, -0.45], [CLOTH_LINE_X, 3.3, -0.85], [CLOTH_LINE_X, RAIL_HEIGHT - 0.2, start + 0.2], toFirstRail, ...festoon, ...away], "cloth-out", "after", 0.07));
  }
  const pins: (readonly [number, number])[] = [];
  const pinStart = work.type === "table" ? work.stackZ + 2.2 : work.type === "open" ? 1.8 : lastGround + 1;
  for (let z = pinStart; z < YARD_FRONT_Z - 0.6; z += 2.1) {
    pins.push([CLOTH_LINE_X - CLOTH_WIDTH / 2 + 0.02, z]);
    pins.push([CLOTH_LINE_X + CLOTH_WIDTH / 2 - 0.02, z + 0.3]);
  }
  const benchX = CLOTH_LINE_X - side * 2.75;
  const benchFront = benchX - side * 0.2505;
  const placed: PlacedItem[] = [];
  const integralWords: string[] = [];
  let slotZ = 9.2;
  for (const item of stage.items) {
    const integralHere = (item.modelId === "printing-table" && work.type === "table") || (item.modelId === "dye-vat" && work.type === "ring") || (item.modelId === "boiling-vessel" && work.type === "ring") || (item.modelId === "wash-tank" && work.type === "tank");
    if (integralHere) {
      integralWords.push(item.localName ? `${item.label} (${item.localName})` : item.label);
      continue;
    }
    const words = item.localName ? `${item.label} (${item.localName})` : item.label;
    const benchLength = Math.max(1.3, words.length * 0.078 * 0.53 + 0.3);
    const centre = slotZ - benchLength / 2;
    placed.push({ item, x: benchX, z: centre, surfaceTop: 0.38, onBench: true, benchLabel: benchWords(item, benchFront, centre, 0.33, side), benchLength });
    slotZ -= benchLength + 0.3;
  }
  if (work.type === "ring" && integralWords.length > 0) {
    curvedWords.push({ lines: integralWords, centre: [CLOTH_LINE_X, work.z], radius: work.rim + 0.003, y: work.curb / 2, angle: -side * 1.38, height: Math.min(0.095, (work.curb * 0.7) / (integralWords.length * 1.2)) });
  }
  if (work.type === "tank" && integralWords.length > 0) {
    const faceX = CLOTH_LINE_X - side * (work.halfX + work.rim + 0.002);
    words.push({ lines: integralWords, at: [faceX, work.curb / 2, work.z], facing: paintedFacing(side), height: 0.1, align: "center", colour: "ink", weight: 700, family: "Eczar", pixelsPerMetre: 1800, wear: 0.6, lineHeight: 1.14 });
  }
  if (work.type === "table") {
    const apronX = CLOTH_LINE_X - side * (work.width / 2 + 0.0015);
    const names = integralWords.length > 0 ? integralWords.join(", ") : null;
    if (names) words.push({ lines: [names], at: [apronX, work.top - 0.1, 6.8], facing: paintedFacing(side), height: 0.1, align: "center", colour: "lime", weight: 700, family: "Eczar", pixelsPerMetre: 1500, wear: 0.6, lineHeight: 1.14 });
    words.push({ lines: [CLOTH_AFTER_LABEL], at: [apronX, work.top - 0.1, 1.6], facing: paintedFacing(side), height: 0.1, align: "center", colour: "lime", weight: 700, family: "Eczar", pixelsPerMetre: 1500, wear: 0.6, lineHeight: 1.14 });
  }
  const tie = work.type === "table" ? null : { x: CLOTH_LINE_X - side * 1.22, z0: rails[rails.length - 1]! - 0.1, z1: rails[0]! + 0.15, y: 1.3 };
  if (tie) words.push({ lines: [CLOTH_AFTER_LABEL], at: [CLOTH_LINE_X - side * 1.2465, 1.3, (tie.z0 + tie.z1) / 2 + 1], facing: paintedFacing(side), height: 0.128, align: "center", colour: "lime", weight: 700, family: "Eczar", pixelsPerMetre: 1500, wear: 0.6, lineHeight: 1.14 });
  if (stage.next) {
    const toward = CLOTH_LINE_X - side * (GAP_WIDTH / 2 + 3.4);
    words.push({ lines: [`${stage.next.number}  ${stage.next.name}`], at: [toward, 1.55, FAR_WALL_Z + 0.156], facing: 0, height: 0.42, align: "center", colour: "lime", weight: 800, family: "Eczar", pixelsPerMetre: 900, wear: 0.8, lineHeight: 1.1 });
  }
  const standX = CLOTH_LINE_X - side * 5.8;
  const standpoint = work.type === "table"
    ? { from: [CLOTH_LINE_X - side * 6.9, EYE_HEIGHT, 10.2] as Vec3, to: [CLOTH_LINE_X - side * 2.9, 1.25, -1.5] as Vec3 }
    : { from: [standX, EYE_HEIGHT, 11.2] as Vec3, to: [CLOTH_LINE_X - side * 0.7, 1.55, -3] as Vec3 };
  const readX = shedWordX(-5.3);
  return {
    side,
    yard: { min: [CLOTH_LINE_X - YARD_HALF_WIDTH, -1, FAR_WALL_Z - 0.2], max: [CLOTH_LINE_X + YARD_HALF_WIDTH, 12, YARD_FRONT_Z] },
    work,
    shed,
    rails,
    items: placed,
    words,
    curvedWords,
    cloth,
    pins,
    standpoint,
    readingSpot: { from: [readX, EYE_HEIGHT, -0.9], to: [readX, 1.72, shedZ] },
    tie,
    heightField: field,
    walkLine: [
      [standX, 11.2],
      [CLOTH_LINE_X - side * 1.85, 10.4],
      [CLOTH_LINE_X - side * 1.85, -10],
      [CLOTH_LINE_X, -14],
      [CLOTH_LINE_X, -25.9],
    ],
  };
}
