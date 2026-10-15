/**
 * Condition allocation: pure, seeded and reproducible. Given the study seed, the conditions and
 * the participant's sequence index, the assigned condition can be recomputed by anyone holding
 * the allocation records, which is what `auditAllocations` does.
 *
 * Algorithms (studies.config.allocation.algorithm):
 *  - `block` (default): permuted blocks. Each block holds every condition `weight × k` times
 *    (block size = config.blockSize, default 2 × total weight) in an order shuffled by
 *    Fisher–Yates with a stream derived from (seed, stratum, block index). Balance is exact at
 *    every block boundary.
 *  - `stratified_block`: the same, with an independent block sequence per stratum.
 *  - `simple`: an independent weighted draw per sequence index (no balance guarantee).
 *  - `counterbalanced` (within-subjects period orders) and `manual` are not drawn here:
 *    counterbalancing is not implemented (between-subjects only, Q-R3); manual is the
 *    reassignment path with a recorded reason.
 *
 * Randomness: u = first 32 bits of sha256("<seed>|<stratum>|<block>|<draw>") / 2^32. sha256 is
 * a deterministic, platform-independent stream; it is not used for secrecy. Allocation
 * concealment comes from keeping the seed in the (staff-only) study config.
 */
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
  /** Block number within the stratum sequence (null for simple). */
  blockIndex: number | null;
  /** Position inside the block (null for simple). */
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

/** Canonical order (by code) so the result never depends on database row order. */
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

/** The shuffled content of one block. */
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
  // Fisher–Yates, from the end.
  for (let i = block.length - 1; i > 0; i--) {
    const j = Math.floor(uniform(seed, stratum, blockIndex, block.length - 1 - i) * (i + 1));
    [block[i], block[j]] = [block[j]!, block[i]!];
  }
  return block;
}

/**
 * The condition for the `index`-th participant of a stratum sequence (0-based). For `block` the
 * stratum is always "" and `index` is the study-wide sequence index; for `stratified_block` it
 * is the index within the stratum.
 */
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

export interface RecordedAllocation {
  participantId: string;
  conditionId: string;
  algorithm: string;
  seed: string;
  sequenceIndex: number;
  /** Index within the stratum sequence (stratified) — recomputed from order when absent. */
  stratum: string | null;
  period: number;
}

export interface AllocationAuditResult {
  checked: number;
  skipped: number;
  mismatches: { participantId: string; sequenceIndex: number; recorded: string; expected: string }[];
}

/**
 * Recomputes every drawn (non-manual) period-1 allocation from its recorded seed and index and
 * reports any record whose condition differs. Rows must be the study's allocations.
 */
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
