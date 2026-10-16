/**
 * The interchange-format contract (content/FORMAT.md v1, `contentPackageFileSchema`) on
 * SYNTHETIC fixtures, so the application's own test run guards the format without depending on
 * the separately curated files in content/ (those are checked by `npm run test:content`).
 * Fixture text is placeholder only ("Demo:" titles, demo-* keys): no craft facts.
 */
import { describe, expect, it } from "vitest";

import { checkCrossFileReferences, contentPackageFileSchema } from "@/features/knowledge/contracts";

const source = { id: "S1", kind: "historical_documentation", title: "Demo: placeholder source", reliability: "medium" };

const stepOne = {
  key: "demo-fixture-a.process_stage.step-one",
  type: "process_stage",
  category: "process_stages",
  title: "Demo: step one",
  local_terms: ["demo-term"],
  provenance_kind: "historical_documentation",
  verification_state: "under_review",
  claims: [{ text: "Demo: placeholder claim.", source_ids: ["S1"], quote: "a short placeholder quote" }],
};

const fileA = {
  format_version: 1,
  slug: "demo-fixture-a",
  name: "Demo: fixture A",
  region: { place: null, state: null, country: null, lat: null, lon: null },
  gi: { registered: false, source_ids: ["S1"] },
  sources: [source],
  concepts: [
    stepOne,
    {
      key: "demo-fixture-a.process_stage.step-two",
      type: "process_stage",
      category: "process_stages",
      title: "Demo: step two",
      provenance_kind: "historical_documentation",
      verification_state: "needs_evidence",
      claims: [{ text: "Demo: another placeholder claim.", source_ids: ["S1"] }],
    },
  ],
  relationships: [
    {
      source: "demo-fixture-a.process_stage.step-one",
      target: "demo-fixture-a.process_stage.step-two",
      type: "PRECEDES",
      ordinal: 1,
      provenance_kind: "historical_documentation",
      verification_state: "under_review",
      source_ids: ["S1"],
    },
  ],
  media_candidates: [
    { url: "https://example.org/placeholder.jpg", title: "Demo: placeholder", depicts: "demo-fixture-a.process_stage.step-one" },
  ],
};

const withStepOne = (patch: Record<string, unknown>) => ({ ...fileA, concepts: [{ ...stepOne, ...patch }] });

describe("interchange format contract (synthetic fixtures)", () => {
  it("accepts a complete file losslessly (keys, local terms, sourced claims with quotes, GI, media)", () => {
    const r = contentPackageFileSchema.safeParse(fileA);
    if (!r.success) throw new Error(JSON.stringify(r.error.issues, null, 2));
    expect(r.data.concepts[0]!.claims[0]).toEqual({
      text: "Demo: placeholder claim.",
      source_ids: ["S1"],
      quote: "a short placeholder quote",
      evidence: [],
    });
    expect(r.data.concepts[0]!.local_terms).toEqual(["demo-term"]);
    expect(r.data.sources[0]!.reliability).toBe("medium");
    expect(r.data.gi).toEqual({ registered: false, source_ids: ["S1"] });
    expect(r.data.media_candidates).toHaveLength(1);
  });

  it.each([
    ["a claim without a source", withStepOne({ claims: [{ text: "x", source_ids: [] }] })],
    ["an unknown source id", withStepOne({ claims: [{ text: "x", source_ids: ["S9"] }] })],
    ["a verified state (imports are never verified)", withStepOne({ verification_state: "verified" })],
    ["a quote longer than 25 words", withStepOne({ claims: [{ text: "x", source_ids: ["S1"], quote: "w ".repeat(26) }] })],
    ["a key whose type segment disagrees", withStepOne({ type: "material" })],
  ])("rejects %s", (_label, file) => {
    expect(contentPackageFileSchema.safeParse(file).success).toBe(false);
  });

  it("resolves concept keys across files", () => {
    const a = contentPackageFileSchema.parse(fileA);
    const b = contentPackageFileSchema.parse({
      format_version: 1,
      slug: "demo-fixture-b",
      name: "Demo: fixture B",
      sources: [source],
      concepts: [],
      relationships: [
        {
          source: "demo-fixture-a.process_stage.step-one",
          target: "demo-fixture-b.process_stage.missing",
          type: "SIMILAR_TO",
          provenance_kind: "historical_documentation",
          verification_state: "under_review",
          source_ids: ["S1"],
        },
      ],
    });
    expect(checkCrossFileReferences([a])).toEqual([]);
    expect(checkCrossFileReferences([a, b])).toEqual([
      "demo-fixture-b: relationship demo-fixture-a.process_stage.step-one -SIMILAR_TO-> demo-fixture-b.process_stage.missing references unknown concept demo-fixture-b.process_stage.missing",
    ]);
  });

  it("accepts located evidence only from the claim's own sources", () => {
    const withEvidence = (sid: string) => ({
      ...fileA,
      concepts: [
        {
          ...stepOne,
          claims: [{ text: "Demo: placeholder claim.", source_ids: ["S1"], evidence: [{ source_id: sid, locator: "PDF p. 1", quote: "a placeholder passage" }] }],
        },
      ],
      relationships: [],
    });
    const ok = contentPackageFileSchema.safeParse(withEvidence("S1"));
    expect(ok.success).toBe(true);
    expect(ok.data?.concepts[0]?.claims[0]?.evidence).toEqual([{ source_id: "S1", locator: "PDF p. 1", quote: "a placeholder passage" }]);
    const bad = contentPackageFileSchema.safeParse(withEvidence("S2"));
    expect(bad.success).toBe(false);
    expect(bad.error?.issues.map((i) => i.message)).toContain("Evidence cites S2, which the claim does not cite");
  });

  describe("relationship evidence", () => {
    const relWith = (evidence: unknown, sourceIds = ["S1"]) => ({
      ...fileA,
      relationships: [{ ...fileA.relationships[0]!, source_ids: sourceIds, evidence }],
    });
    const messages = (file: unknown) => {
      const r = contentPackageFileSchema.safeParse(file);
      return r.success ? [] : r.error.issues.map((i) => i.message);
    };

    it("is optional: a relationship without it parses with []", () => {
      expect(contentPackageFileSchema.parse(fileA).relationships[0]!.evidence).toEqual([]);
    });

    it("keeps a located verbatim passage from one of the relationship's own sources", () => {
      const r = contentPackageFileSchema.parse(relWith([{ source_id: "S1", locator: "PDF p. 1", quote: "a placeholder passage" }]));
      expect(r.relationships[0]!.evidence).toEqual([{ source_id: "S1", locator: "PDF p. 1", quote: "a placeholder passage" }]);
    });

    it("refuses a passage from a source the relationship does not cite", () => {
      expect(messages(relWith([{ source_id: "S2", locator: "PDF p. 1", quote: "a placeholder passage" }]))).toContain(
        "Evidence cites S2, which the relationship does not cite",
      );
    });

    it("refuses two passages for one source (a citation holds one locator and one quote)", () => {
      const twice = [
        { source_id: "S1", locator: "PDF p. 1", quote: "a placeholder passage" },
        { source_id: "S1", locator: "PDF p. 2", quote: "another placeholder passage" },
      ];
      expect(messages(relWith(twice))).toContain("Evidence for S1 is given twice; a relationship citation holds one locator and one quote");
    });

    it.each([
      ["a quote longer than 25 words", { source_id: "S1", locator: "PDF p. 1", quote: "w ".repeat(26) }],
      ["a blank quote", { source_id: "S1", locator: "PDF p. 1", quote: "  " }],
      ["a blank locator", { source_id: "S1", locator: " ", quote: "a placeholder passage" }],
      ["a locator over 200 characters", { source_id: "S1", locator: "p".repeat(201), quote: "a placeholder passage" }],
      ["a missing locator", { source_id: "S1", quote: "a placeholder passage" }],
      ["a note (no column to store it)", { source_id: "S1", locator: "PDF p. 1", quote: "a placeholder passage", note: "check by hand" }],
    ])("refuses %s", (_label, entry) => {
      expect(contentPackageFileSchema.safeParse(relWith([entry])).success).toBe(false);
    });
  });
});
