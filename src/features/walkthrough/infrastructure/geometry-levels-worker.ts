import { MeshoptSimplifier } from "three/examples/jsm/libs/meshopt_simplifier.module.js";
import { ATTRIBUTE_WEIGHT, keepsLevel } from "../domain/geometry-levels";

export interface LevelAttribute {
  readonly array: ArrayLike<number> & { readonly BYTES_PER_ELEMENT: number };
  readonly itemSize: number;
  readonly normalized: boolean;
}

export interface LevelJob {
  readonly id: number;
  readonly positions: Float32Array;
  readonly attributes: readonly LevelAttribute[];
  readonly parts: readonly (Uint32Array | Uint16Array)[];
  readonly errors: readonly number[];
}

export interface LevelPart {
  readonly indices: (Uint32Array | Uint16Array)[];
  readonly errors: number[];
}

export type LevelReply = { readonly id: number; readonly parts: LevelPart[] } | { readonly id: number; readonly failed: string };

const FLAGS: ("ErrorAbsolute" | "Sparse")[] = ["ErrorAbsolute", "Sparse"];
const NORMALISED_RANGE: Readonly<Record<number, number>> = { 1: 255, 2: 65535 };

function interleaved(attributes: readonly LevelAttribute[], vertices: number): { values: Float32Array; stride: number } {
  const stride = attributes.reduce((sum, attribute) => sum + attribute.itemSize, 0);
  const values = new Float32Array(stride * vertices);
  let offset = 0;
  for (const { array, itemSize, normalized } of attributes) {
    const range = normalized ? (NORMALISED_RANGE[array.BYTES_PER_ELEMENT] ?? 1) : 1;
    for (let v = 0; v < vertices; v++) for (let c = 0; c < itemSize; c++) values[v * stride + offset + c] = array[v * itemSize + c]! / range;
    offset += itemSize;
  }
  return { values, stride };
}

function sharedVertices(parts: readonly ArrayLike<number>[], vertices: number): Uint8Array | null {
  if (parts.length < 2) return null;
  const owner = new Int32Array(vertices).fill(-1);
  const lock = new Uint8Array(vertices);
  parts.forEach((part, p) => {
    for (let i = 0; i < part.length; i++) {
      const vertex = part[i]!;
      if (owner[vertex] === -1) owner[vertex] = p;
      else if (owner[vertex] !== p) lock[vertex] = 1;
    }
  });
  return lock;
}

function levelsOf(job: LevelJob): LevelPart[] {
  const vertices = job.positions.length / 3;
  const { values, stride } = interleaved(job.attributes, vertices);
  const weights = job.attributes.flatMap((attribute) => Array<number>(attribute.itemSize).fill(ATTRIBUTE_WEIGHT));
  const lock = sharedVertices(job.parts, vertices);
  return job.parts.map((part) => {
    const indices: (Uint32Array | Uint16Array)[] = [];
    const errors: number[] = [];
    let current = part instanceof Uint32Array ? part : new Uint32Array(part);
    let reached = 0;
    for (const target of job.errors) {
      if (target <= reached) continue;
      const [simplified, error] = MeshoptSimplifier.simplifyWithAttributes(current, job.positions, 3, values, stride, weights, lock, 0, target - reached, FLAGS);
      if (!keepsLevel(current.length, simplified.length) || simplified.length === 0) continue;
      reached += error;
      current = simplified;
      indices.push(part instanceof Uint16Array ? new Uint16Array(simplified) : simplified);
      errors.push(reached);
    }
    return { indices, errors };
  });
}

self.onmessage = async (event: MessageEvent<LevelJob>) => {
  const job = event.data;
  try {
    await MeshoptSimplifier.ready;
    const parts = levelsOf(job);
    const reply: LevelReply = { id: job.id, parts };
    (self as unknown as Worker).postMessage(reply, parts.flatMap((part) => part.indices.map((indices) => indices.buffer as ArrayBuffer)));
  } catch (error) {
    const reply: LevelReply = { id: job.id, failed: String(error) };
    (self as unknown as Worker).postMessage(reply);
  }
};
