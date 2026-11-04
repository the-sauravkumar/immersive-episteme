/**
 * Assessment items as delivered by the study engine: parsing item configuration, validating a
 * submitted answer against it, and scoring objective items. Pure (no database).
 *
 * Supported item kinds: single_choice, multiple_choice, short_text, long_text, likert, numeric,
 * ranking (sequence cards), matching (cloth state images to stages) and sketch (layout strokes).
 * concept_map is not delivered here: it belongs to the reconstruction page.
 *
 * Answers are stored and scored in the shared format of src/features/assessment/responses.ts
 * (answer keys { optionId } | { optionIds } | { value, tolerance }, as the assessment authoring
 * console writes them). long_text and ratings are never scored automatically; short_text has no
 * automatic key either (rubric scoring).
 * An item without a usable key is not scored (and is not counted as wrong).
 */
import { createHash } from "node:crypto";

import { keyMatch, type ResponseRaw } from "@/features/assessment/responses";
import { itemConfigSchema, type ItemConfig } from "@/features/research/contracts";
import { DONT_KNOW_OPTION } from "@/features/study/test-items";

export const DELIVERABLE_ITEM_KINDS = ["single_choice", "multiple_choice", "short_text", "long_text", "likert", "numeric", "ranking", "matching", "sketch"] as const;
export type DeliverableItemKind = (typeof DELIVERABLE_ITEM_KINDS)[number];

export interface DeliveredItem {
  id: string;
  itemKey: string;
  position: number;
  kind: string;
  prompt: string;
  config: unknown;
  answerKey: unknown;
}

export type AnswerValue = string | string[] | number;

export type ParsedAnswer =
  | { status: "answered"; value: AnswerValue }
  | { status: "skipped" }
  | { status: "invalid"; message: string };

export function isDeliverable(kind: string): kind is DeliverableItemKind {
  return (DELIVERABLE_ITEM_KINDS as readonly string[]).includes(kind);
}

/** The item's validated configuration, or null when it is malformed or not deliverable. */
export function itemConfig(item: Pick<DeliveredItem, "kind" | "config">): ItemConfig | null {
  if (!isDeliverable(item.kind)) return null;
  const parsed = itemConfigSchema.safeParse(item.config);
  if (!parsed.success || parsed.data.kind !== item.kind) return null;
  return parsed.data;
}

/**
 * Option order shown to this session: canonical, or a per-session permutation when the item
 * asks for `shuffle` (seeded by session and item, so a reload shows the same order).
 */
export function optionOrder(sessionId: string, item: Pick<DeliveredItem, "id" | "kind" | "config">): string[] {
  const cfg = itemConfig(item);
  if (!cfg || (cfg.kind !== "single_choice" && cfg.kind !== "multiple_choice" && cfg.kind !== "ranking" && cfg.kind !== "matching")) return [];
  const ids = cfg.options.map((o) => o.id);
  if (cfg.kind !== "ranking" && !cfg.shuffle) return ids;
  const answers = ids.filter((id) => id !== DONT_KNOW_OPTION.id);
  return [...seededShuffle(answers, `${sessionId}|${item.id}`), ...ids.filter((id) => id === DONT_KNOW_OPTION.id)];
}

export function pairOrder(sessionId: string, item: Pick<DeliveredItem, "id" | "kind" | "config">): string[] {
  const cfg = itemConfig(item);
  if (!cfg || cfg.kind !== "matching") return [];
  return seededShuffle(cfg.pairs.map((p) => p.id), `${sessionId}|${item.id}|pairs`);
}

function seededShuffle(input: readonly string[], seed: string): string[] {
  const ids = [...input];
  for (let i = ids.length - 1; i > 0; i--) {
    const h = createHash("sha256").update(`${seed}|${i}`).digest("hex");
    const j = Math.floor((parseInt(h.slice(0, 8), 16) / 4294967296) * (i + 1));
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
  }
  return ids;
}

function validStrokes(text: string, maxStrokes: number): boolean {
  let strokes: unknown;
  try {
    strokes = JSON.parse(text);
  } catch {
    return false;
  }
  if (!Array.isArray(strokes) || strokes.length > maxStrokes) return false;
  return strokes.every((stroke) => Array.isArray(stroke) && stroke.every((p) => Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1000)));
}

/** Validates the raw form values of one item (`values` = all values posted for it). */
export function parseAnswer(item: DeliveredItem, values: readonly string[]): ParsedAnswer {
  const cfg = itemConfig(item);
  if (!cfg) return { status: "invalid", message: "This question cannot be answered here." };
  const nonEmpty = values.map((v) => v.trim()).filter((v) => v.length > 0);
  if (nonEmpty.length === 0) return { status: "skipped" };
  switch (cfg.kind) {
    case "single_choice": {
      if (nonEmpty.length !== 1 || !cfg.options.some((o) => o.id === nonEmpty[0])) return { status: "invalid", message: "Choose one of the options." };
      return { status: "answered", value: nonEmpty[0]! };
    }
    case "multiple_choice": {
      const set = [...new Set(nonEmpty)];
      if (set.some((v) => !cfg.options.some((o) => o.id === v))) return { status: "invalid", message: "Choose from the options shown." };
      if (cfg.maxSelections !== undefined && set.length > cfg.maxSelections) {
        return { status: "invalid", message: `Choose at most ${cfg.maxSelections}.` };
      }
      return { status: "answered", value: set.sort() };
    }
    case "short_text":
    case "long_text": {
      // Keep exactly what was typed (apart from the empty check above); only bound the length.
      const text = values.join("\n");
      if (text.length > cfg.maxLength) return { status: "invalid", message: `Use at most ${cfg.maxLength} characters.` };
      return { status: "answered", value: text };
    }
    case "likert": {
      const n = Number(nonEmpty[0]);
      if (nonEmpty.length !== 1 || !Number.isInteger(n) || n < cfg.min || n > cfg.min + cfg.points - 1) return { status: "invalid", message: "Choose one point on the scale." };
      return { status: "answered", value: n };
    }
    case "ranking": {
      const known = new Set(cfg.options.map((o) => o.id));
      if (nonEmpty.length !== known.size || new Set(nonEmpty).size !== known.size || nonEmpty.some((v) => !known.has(v))) return { status: "invalid", message: "Put every card in order." };
      return { status: "answered", value: [...nonEmpty] };
    }
    case "matching": {
      const pairs = new Set(cfg.pairs.map((p) => p.id));
      const options = new Set(cfg.options.map((o) => o.id));
      const seen = new Set<string>();
      for (const value of nonEmpty) {
        const [pairId, optionId, extra] = value.split("=");
        if (!pairId || !optionId || extra !== undefined || !pairs.has(pairId) || !options.has(optionId) || seen.has(pairId)) return { status: "invalid", message: "Choose a stage from the list for each image." };
        seen.add(pairId);
      }
      return { status: "answered", value: [...nonEmpty].sort() };
    }
    case "sketch": {
      const text = nonEmpty[0]!;
      if (nonEmpty.length !== 1 || text.length > cfg.maxBytes || !validStrokes(text, cfg.maxStrokes)) return { status: "invalid", message: "The sketch could not be saved. Clear it and draw it again." };
      return text === "[]" ? { status: "skipped" } : { status: "answered", value: text };
    }
    case "numeric": {
      const n = Number(nonEmpty[0]);
      if (nonEmpty.length !== 1 || !Number.isFinite(n)) return { status: "invalid", message: "Enter a number." };
      if ((cfg.min !== undefined && n < cfg.min) || (cfg.max !== undefined && n > cfg.max)) return { status: "invalid", message: "Enter a number in the allowed range." };
      return { status: "answered", value: n };
    }
    default:
      return { status: "invalid", message: "This question cannot be answered here." };
  }
}

/** The stored raw answer (shared format, src/features/assessment/responses.ts). */
export function toResponseRaw(item: Pick<DeliveredItem, "kind">, value: AnswerValue, assessmentVersion: number): ResponseRaw {
  return { value, itemKind: item.kind, assessmentVersion };
}

/** Does the item carry an answer key the shared rule scores (single/multiple choice, numeric)? */
export function isKeyedItem(item: Pick<DeliveredItem, "kind" | "answerKey">): boolean {
  return (item.kind === "single_choice" || item.kind === "multiple_choice" || item.kind === "numeric" || item.kind === "ranking" || item.kind === "matching") && item.answerKey !== null && item.answerKey !== undefined;
}

export function scoreItem(item: DeliveredItem, answer: ParsedAnswer, assessmentVersion = 1): number | null {
  if (answer.status !== "answered") return null;
  if (!isKeyedItem(item)) return null;
  return keyMatch(item.answerKey, toResponseRaw(item, answer.value, assessmentVersion)).value;
}
