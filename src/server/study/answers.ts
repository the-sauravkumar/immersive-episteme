/**
 * Assessment items as delivered by the study engine: parsing item configuration, validating a
 * submitted answer against it, and scoring objective items. Pure (no database).
 *
 * Supported item kinds: single_choice, multiple_choice, short_text, long_text (the free-text
 * "why?" explanation), likert (also rendered as a semantic differential, see `presentation`)
 * and numeric. ranking and concept_map are not delivered here (concept maps belong to the
 * reconstruction page of the assessment module).
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

export const DELIVERABLE_ITEM_KINDS = ["single_choice", "multiple_choice", "short_text", "long_text", "likert", "numeric"] as const;
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
  if (!cfg || (cfg.kind !== "single_choice" && cfg.kind !== "multiple_choice")) return [];
  const ids = cfg.options.map((o) => o.id);
  if (!cfg.shuffle) return ids;
  for (let i = ids.length - 1; i > 0; i--) {
    const h = createHash("sha256").update(`${sessionId}|${item.id}|${i}`).digest("hex");
    const j = Math.floor((parseInt(h.slice(0, 8), 16) / 4294967296) * (i + 1));
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
  }
  return ids;
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

/**
 * Objective score of an answered item: the shared key rule (`keyMatch`, metric
 * `item.key_match`), so the engine's immediate score and a later console re-run agree.
 * null when the item is not auto-scorable (no key, free text, ratings).
 */
export function scoreItem(item: DeliveredItem, answer: ParsedAnswer, assessmentVersion = 1): 0 | 1 | null {
  if (answer.status !== "answered") return null;
  if (item.kind !== "single_choice" && item.kind !== "multiple_choice" && item.kind !== "numeric") return null;
  if (item.answerKey === null || item.answerKey === undefined) return null;
  const m = keyMatch(item.answerKey, toResponseRaw(item, answer.value, assessmentVersion));
  return m.value === 1 ? 1 : m.value === 0 ? 0 : null;
}
