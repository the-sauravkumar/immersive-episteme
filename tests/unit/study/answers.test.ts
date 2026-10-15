import { describe, expect, it } from "vitest";

import { keyMatch, responseRawSchema } from "../../../src/features/assessment/responses";
import { optionOrder, parseAnswer, scoreItem, toResponseRaw, type DeliveredItem } from "../../../src/server/study/answers";

const item = (kind: string, config: unknown, answerKey: unknown = null): DeliveredItem => ({ id: "i1", itemKey: "k", position: 0, kind, prompt: "p", config, answerKey });
const opts = [
  { id: "a", label: "A" },
  { id: "b", label: "B" },
  { id: "c", label: "C" },
];

describe("answer parsing", () => {
  it("validates choices against the configured options", () => {
    const sc = item("single_choice", { kind: "single_choice", options: opts });
    expect(parseAnswer(sc, ["b"])).toEqual({ status: "answered", value: "b" });
    expect(parseAnswer(sc, [])).toEqual({ status: "skipped" });
    expect(parseAnswer(sc, ["x"]).status).toBe("invalid");
    expect(parseAnswer(sc, ["a", "b"]).status).toBe("invalid");
    const mc = item("multiple_choice", { kind: "multiple_choice", options: opts, maxSelections: 2 });
    expect(parseAnswer(mc, ["c", "a", "a"])).toEqual({ status: "answered", value: ["a", "c"] });
    expect(parseAnswer(mc, ["a", "b", "c"]).status).toBe("invalid");
  });

  it("keeps free text exactly as typed and bounds its length", () => {
    const lt = item("long_text", { kind: "long_text", maxLength: 10 });
    expect(parseAnswer(lt, ["  Why? x "])).toEqual({ status: "answered", value: "  Why? x " });
    expect(parseAnswer(lt, ["   "])).toEqual({ status: "skipped" });
    expect(parseAnswer(lt, ["x".repeat(11)]).status).toBe("invalid");
  });

  it("checks likert points and numeric ranges; refuses kinds it cannot deliver", () => {
    const zero = item("likert", { kind: "likert", points: 11, min: 0 });
    expect(parseAnswer(zero, ["0"])).toEqual({ status: "answered", value: 0 });
    expect(parseAnswer(zero, ["10"])).toEqual({ status: "answered", value: 10 });
    expect(parseAnswer(zero, ["11"]).status).toBe("invalid");
    const lk = item("likert", { kind: "likert", points: 7 });
    expect(parseAnswer(lk, ["7"])).toEqual({ status: "answered", value: 7 });
    expect(parseAnswer(lk, ["8"]).status).toBe("invalid");
    expect(parseAnswer(lk, ["0"]).status).toBe("invalid");
    const nm = item("numeric", { kind: "numeric", min: 0, max: 10 });
    expect(parseAnswer(nm, ["2.5"])).toEqual({ status: "answered", value: 2.5 });
    expect(parseAnswer(nm, ["11"]).status).toBe("invalid");
    expect(parseAnswer(item("concept_map", { kind: "concept_map", conceptKeys: ["a.b.c", "a.b.d"] }), ["x"]).status).toBe("invalid");
    expect(parseAnswer(item("single_choice", { kind: "likert", points: 5 }), ["1"]).status).toBe("invalid");
  });
});

describe("objective scoring (shared key rule)", () => {
  it("scores the console's answer-key format; never free text, short text or ratings", () => {
    const sc = item("single_choice", { kind: "single_choice", options: opts }, { optionId: "b" });
    expect(scoreItem(sc, { status: "answered", value: "b" })).toBe(1);
    expect(scoreItem(sc, { status: "answered", value: "a" })).toBe(0);
    expect(scoreItem(sc, { status: "skipped" })).toBeNull();
    const mc = item("multiple_choice", { kind: "multiple_choice", options: opts }, { optionIds: ["c", "a"] });
    expect(scoreItem(mc, { status: "answered", value: ["a", "c"] })).toBe(1);
    expect(scoreItem(mc, { status: "answered", value: ["a"] })).toBe(0);
    const nm = item("numeric", { kind: "numeric" }, { value: 10, tolerance: 0.5 });
    expect(scoreItem(nm, { status: "answered", value: 10.4 })).toBe(1);
    expect(scoreItem(item("short_text", { kind: "short_text" }, { optionId: "x" }), { status: "answered", value: "x" })).toBeNull();
    expect(scoreItem(item("long_text", { kind: "long_text" }, { optionId: "x" }), { status: "answered", value: "x" })).toBeNull();
    expect(scoreItem(item("likert", { kind: "likert", points: 5 }, { value: 5 }), { status: "answered", value: 5 })).toBeNull();
    expect(scoreItem(item("single_choice", { kind: "single_choice", options: opts }), { status: "answered", value: "a" })).toBeNull();
  });

  it("stores answers in the one shared raw format that the assessment scorer reads", () => {
    const mc = item("multiple_choice", { kind: "multiple_choice", options: opts });
    const raw = toResponseRaw(mc, ["a", "c"], 3);
    expect(responseRawSchema.parse(raw)).toEqual({ value: ["a", "c"], itemKind: "multiple_choice", assessmentVersion: 3 });
    // The assessment module's re-run (scoreKeyedItems) uses the same rule on the stored row.
    expect(keyMatch({ optionIds: ["c", "a"] }, raw)).toEqual({ value: 1 });
    expect(keyMatch({ optionId: "b" }, toResponseRaw(mc, "b", 1))).toEqual({ value: 1 });
    expect(keyMatch({ value: 4, tolerance: 0 }, toResponseRaw(mc, 4, 1))).toEqual({ value: 1 });
    expect(keyMatch({ correct: "b" }, raw)).toEqual({ value: null, reason: "no_answer_key" });
  });

  it("shuffles options per session reproducibly only when asked", () => {
    const plain = { id: "i1", kind: "single_choice", config: { kind: "single_choice", options: opts } };
    expect(optionOrder("s1", plain)).toEqual(["a", "b", "c"]);
    const shuffled = { ...plain, config: { kind: "single_choice", options: opts, shuffle: true } };
    expect(optionOrder("s1", shuffled)).toEqual(optionOrder("s1", shuffled));
    expect([...optionOrder("s1", shuffled)].sort()).toEqual(["a", "b", "c"]);
    const orders = new Set(Array.from({ length: 20 }, (_, i) => optionOrder(`s${i}`, shuffled).join("")));
    expect(orders.size).toBeGreaterThan(1);
  });
});
