import { createHash } from "node:crypto";

export interface AllocatableCondition {
  id: string;
  code: string;
  weight: number;
}

export type DrawAlgorithm = "block" | "stratified_block" | "simple";

export interface AllocationDraw {
  conditionId: string;
  conditionCode: string;
  blockIndex: number | null;
  positionInBlock: number | null;
}

export class AllocationConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AllocationConfigError";
  }
}

function uniform(seed: string, stratum: string, block: number | string, draw: number): number {
  const hex = createHash("sha256").update(`${seed}|${stratum}|${block}|${draw}`, "utf8").digest("hex");
  return parseInt(hex.slice(0, 8), 16) / 4294967296;
}

function canonical(conditions: readonly AllocatableCondition[]): AllocatableCondition[] {
  if (conditions.length < 2) throw new AllocationConfigError("allocation needs at least two conditions");
  for (const c of conditions) {
    if (!Number.isInteger(c.weight) || c.weight < 1) throw new AllocationConfigError(`condition ${c.code} has an invalid weight`);
  }
  return [...conditions].sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
}

export function defaultBlockSize(conditions: readonly AllocatableCondition[]): number {
  return 2 * conditions.reduce((n, c) => n + c.weight, 0);
}

export function permutedBlock(
  seed: string,
  stratum: string,
  blockIndex: number,
  conditions: readonly AllocatableCondition[],
  blockSize = defaultBlockSize(conditions),
): AllocatableCondition[] {
  const sorted = canonical(conditions);
  const total = sorted.reduce((n, c) => n + c.weight, 0);
  if (!Number.isInteger(blockSize) || blockSize < total || blockSize % total !== 0) {
    throw new AllocationConfigError(`block size ${blockSize} must be a positive multiple of the total weight ${total}`);
  }
  const reps = blockSize / total;
  const block: AllocatableCondition[] = [];
  for (const c of sorted) for (let i = 0; i < c.weight * reps; i++) block.push(c);
  for (let i = block.length - 1; i > 0; i--) {
    const j = Math.floor(uniform(seed, stratum, blockIndex, block.length - 1 - i) * (i + 1));
    [block[i], block[j]] = [block[j]!, block[i]!];
  }
  return block;
}

export function drawCondition(input: {
  algorithm: DrawAlgorithm;
  seed: string;
  conditions: readonly AllocatableCondition[];
  index: number;
  stratum?: string | null;
  blockSize?: number;
}): AllocationDraw {
  const { algorithm, seed, conditions, index } = input;
  if (!Number.isInteger(index) || index < 0) throw new AllocationConfigError("sequence index must be a non-negative integer");
  if (algorithm === "simple") {
    const sorted = canonical(conditions);
    const total = sorted.reduce((n, c) => n + c.weight, 0);
    let u = uniform(seed, "", "simple", index) * total;
    for (const c of sorted) {
      if (u < c.weight) return { conditionId: c.id, conditionCode: c.code, blockIndex: null, positionInBlock: null };
      u -= c.weight;
    }
    const last = sorted[sorted.length - 1]!;
    return { conditionId: last.id, conditionCode: last.code, blockIndex: null, positionInBlock: null };
  }
  const stratum = algorithm === "stratified_block" ? (input.stratum ?? "") : "";
  if (algorithm === "stratified_block" && !stratum) throw new AllocationConfigError("stratified_block allocation needs a stratum");
  const size = input.blockSize ?? defaultBlockSize(conditions);
  const blockIndex = Math.floor(index / size);
  const position = index % size;
  const chosen = permutedBlock(seed, stratum, blockIndex, conditions, size)[position]!;
  return { conditionId: chosen.id, conditionCode: chosen.code, blockIndex, positionInBlock: position };
}

function permutationsOf<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  return items.flatMap((item, index) => permutationsOf([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [item, ...rest]));
}

export function drawTraditionOrder(input: { seed: string; traditions: readonly string[]; conditionCode: string; stratum?: string | null; index: number }): string[] {
  const { seed, traditions, conditionCode, index } = input;
  if (!Number.isInteger(index) || index < 0) throw new AllocationConfigError("order index must be a non-negative integer");
  if (traditions.length < 2) return [...traditions];
  const orders = permutationsOf([...traditions].sort());
  const stratum = `order:${conditionCode}:${input.stratum ?? ""}`;
  const blockIndex = Math.floor(index / orders.length);
  const block = [...orders];
  for (let i = block.length - 1; i > 0; i--) {
    const j = Math.floor(uniform(seed, stratum, blockIndex, block.length - 1 - i) * (i + 1));
    [block[i], block[j]] = [block[j]!, block[i]!];
  }
  return block[index % orders.length]!;
}

export interface RecordedAllocation {
  participantId: string;
  conditionId: string;
  algorithm: string;
  seed: string;
  sequenceIndex: number;
  stratum: string | null;
  period: number;
}

export interface AllocationAuditResult {
  checked: number;
  skipped: number;
  mismatches: { participantId: string; sequenceIndex: number; recorded: string; expected: string }[];
}

export function auditAllocations(
  rows: readonly RecordedAllocation[],
  conditions: readonly AllocatableCondition[],
  opts: { blockSize?: number } = {},
): AllocationAuditResult {
  const drawn = rows.filter((r) => r.period === 1 && (r.algorithm === "block" || r.algorithm === "simple" || r.algorithm === "stratified_block"));
  const byStratum = new Map<string, number>();
  const result: AllocationAuditResult = { checked: 0, skipped: rows.length - drawn.length, mismatches: [] };
  for (const r of [...drawn].sort((a, b) => a.sequenceIndex - b.sequenceIndex)) {
    let index = r.sequenceIndex;
    if (r.algorithm === "stratified_block") {
      const key = r.stratum ?? "";
      index = byStratum.get(key) ?? 0;
      byStratum.set(key, index + 1);
    }
    const expected = drawCondition({
      algorithm: r.algorithm as DrawAlgorithm,
      seed: r.seed,
      conditions,
      index,
      stratum: r.stratum,
      blockSize: opts.blockSize,
    });
    result.checked++;
    if (expected.conditionId !== r.conditionId) {
      result.mismatches.push({ participantId: r.participantId, sequenceIndex: r.sequenceIndex, recorded: r.conditionId, expected: expected.conditionId });
    }
  }
  return result;
}
