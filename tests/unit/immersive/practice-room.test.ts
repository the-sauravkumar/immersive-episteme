/**
 * The 3D familiarisation practice room (D5): compiled from a fixed practice graph by the same
 * compiler and rule set as the museum, deterministic, and free of craft content.
 */
import { describe, expect, it } from "vitest";

import { buildPracticeRoom, PRACTICE_CLAIMS, PRACTICE_SOURCE_ID, practiceMuseumPayload } from "@/features/immersive/practice-room";
import { PRACTICE_TEXT } from "@/features/learning/strings";

const settings = { minimap: "toggle", webglFailurePolicy: "retry" } as const;

describe("practice room", () => {
  it("is a small room of practice exhibits from the same scene model", () => {
    const p = practiceMuseumPayload(settings);
    expect(p.missingConceptIds).toEqual([]);
    expect(p.scene.exhibits.length).toBeGreaterThanOrEqual(3);
    expect(p.scene.rooms.length).toBeGreaterThanOrEqual(1);
    for (const e of p.scene.exhibits) expect(p.concepts[e.conceptId]).toBeDefined();
    // A walkable sequence path, so the path and "next step" controls can be practised.
    expect(p.scene.exhibits.some((e) => e.sequence)).toBe(true);
    expect(p.settings).toEqual(settings);
  });

  it("carries no craft content: every title says Practice, every text is the practice wording, only the practice source", () => {
    const p = practiceMuseumPayload(settings);
    expect(Object.keys(p.sources)).toEqual([PRACTICE_SOURCE_ID]);
    expect(p.sources[PRACTICE_SOURCE_ID]!.title).toMatch(/^Practice source/);
    expect(PRACTICE_CLAIMS[0]).toBe(PRACTICE_TEXT.tryControls.immersive);
    for (const c of Object.values(p.concepts)) {
      expect(c.title).toMatch(/^Practice /);
      expect(c.claims.map((x) => x.text)).toEqual([...PRACTICE_CLAIMS]);
      // The instruction has no citation; every practice statement cites the practice source only.
      expect(c.claims[0]!.evidence).toEqual([]);
      expect(c.claims.slice(1).every((x) => x.evidence.length === 1 && x.evidence[0]!.sourceId === PRACTICE_SOURCE_ID)).toBe(true);
      for (const g of c.related) for (const r of g.relations) expect(r.conceptTitle).toMatch(/^Practice /);
    }
    for (const e of p.scene.exhibits) expect(e.label).toMatch(/^Practice /);
  });

  it("is deterministic (a fixed manifest)", () => {
    const a = buildPracticeRoom();
    const b = buildPracticeRoom();
    expect(a.manifestHash).toMatch(/^[0-9a-f]{64}$/);
    expect(b).toEqual(a);
  });
});
