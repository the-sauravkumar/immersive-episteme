import { describe, expect, it } from "vitest";

import { answerKeySchema } from "@/features/assessment/responses";
import { assessmentItemInputSchema } from "@/features/research/contracts";
import { DESIGNED_TEST_BATTERY } from "@/server/study/test-battery";
import { itemFromForm } from "@/server/assessment/forms";

function form(fields: Record<string, string>): FormData {
  const d = new FormData();
  for (const [k, v] of Object.entries(fields)) d.set(k, v);
  return d;
}

function saved(fields: Record<string, string>) {
  const r = itemFromForm(form(fields));
  if (!r.ok) throw new Error(r.error);
  const parsed = assessmentItemInputSchema.parse({ ...r.item, answerKey: undefined });
  return { item: parsed, answerKey: r.item.answerKey === undefined ? undefined : answerKeySchema.parse(r.item.answerKey) };
}

describe("research console item form: every item kind the study uses", () => {
  it("saves a matching item with its images and answer key (cloth state)", () => {
    const { item, answerKey } = saved({
      kind: "matching",
      itemKey: "cloth.a",
      position: "0",
      prompt: "Choose the stage for each image.",
      pairs: "p1 | /walkthrough/cloth/ajrakh-01.jpg | The cloth after a stage\r\np3 | /walkthrough/cloth/ajrakh-03.jpg | The cloth after a stage",
      options: "s1: Washing\ns3: Printing\ns5: Dyeing",
      matches: "p1: s1\np3: s3",
      shuffle: "on",
      targetTradition: "ajrakh",
    });
    expect(item.config).toMatchObject({
      kind: "matching",
      pairs: [
        { id: "p1", image: { path: "/walkthrough/cloth/ajrakh-01.jpg", alt: "The cloth after a stage" } },
        { id: "p3", image: { path: "/walkthrough/cloth/ajrakh-03.jpg", alt: "The cloth after a stage" } },
      ],
      shuffle: true,
      target: { tradition: "ajrakh" },
      sampleText: false,
    });
    expect(answerKey).toEqual({ matches: { p1: "s1", p3: "s3" } });
  });

  it("saves a sketch item (layout sketch) with default or set limits", () => {
    expect(saved({ kind: "sketch", itemKey: "layout.sketch", position: "0", prompt: "Sketch the layout." }).item.config).toEqual({ kind: "sketch", maxStrokes: 600, maxBytes: 200_000 });
    expect(saved({ kind: "sketch", itemKey: "layout.sketch", position: "0", prompt: "Sketch the layout.", maxStrokes: "300", maxBytes: "100000" }).item.config).toEqual({ kind: "sketch", maxStrokes: 300, maxBytes: 100_000 });
  });

  it("saves a ranking answer key and a transfer account (sequence and transfer items)", () => {
    const { item, answerKey } = saved({
      kind: "ranking",
      itemKey: "transfer.x.order",
      position: "0",
      prompt: "Predict the order of these stages.",
      options: "s1: First\ns2: Second\ns3: Third",
      answerKey: "s1, s2, s3",
      account: "A tradition you have not seen.\r\nIts stages are listed.",
      sampleText: "on",
      targetTradition: "x",
    });
    expect(answerKey).toEqual({ order: ["s1", "s2", "s3"] });
    expect(item.config).toMatchObject({ account: "A tradition you have not seen.\nIts stages are listed.", sampleText: true, target: { tradition: "x" } });
  });

  it("saves an image and a target on a single-choice item (identification, attribution)", () => {
    const { item, answerKey } = saved({
      kind: "single_choice",
      itemKey: "attr.a",
      position: "1",
      prompt: "Which tradition does this textile come from?",
      options: "ajrakh: Ajrakh\nsanganeri: Sanganeri",
      answerKey: "ajrakh",
      imagePath: "/walkthrough/products/ajrakh.jpg",
      imageAlt: "A finished textile",
      targetTradition: "ajrakh",
      targetStage: "printing",
      targetObject: "block",
    });
    expect(item.config).toMatchObject({ image: { path: "/walkthrough/products/ajrakh.jpg", alt: "A finished textile" }, target: { tradition: "ajrakh", stageKey: "printing", objectKey: "block" } });
    expect(answerKey).toEqual({ optionId: "ajrakh" });
  });

  it("refuses an image without alt text and a stage target without a tradition", () => {
    expect(itemFromForm(form({ kind: "single_choice", options: "a: A\nb: B", imagePath: "/x.jpg" }))).toMatchObject({ ok: false, error: expect.stringMatching(/alt text/) });
    expect(itemFromForm(form({ kind: "ranking", options: "a: A\nb: B", targetStage: "s1" }))).toMatchObject({ ok: false, error: expect.stringMatching(/tradition/) });
    expect(itemFromForm(form({ kind: "matching", options: "a: A\nb: B", pairs: "p1 /x.jpg" }))).toMatchObject({ ok: false });
  });

  it("can re-create every designed battery item kind through the form", () => {
    const kinds = new Set(DESIGNED_TEST_BATTERY.flatMap((a) => a.items.map((i) => i.kind)));
    expect([...kinds].sort()).toEqual(["concept_map", "matching", "ranking", "single_choice", "sketch"]);
    for (const kind of kinds) {
      const r = itemFromForm(form({ kind }));
      expect(r.ok ? null : r.error).not.toBe("Choose an item kind.");
    }
  });
});
