/**
 * The 3D familiarisation practice room (D5): compiled from a fixed practice graph by the same
 * compiler and rule set as the museum, deterministic, and free of craft content.
 */
import { describe, expect, it } from "vitest";

import { buildPracticeRoom, PRACTICE_CLAIMS, practiceMuseumPayload } from "@/features/immersive/practice-room";

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

  it("carries no craft content: every title says Practice, every text is the practice wording, no sources", () => {
    const p = practiceMuseumPayload(settings);
    expect(p.sources).toEqual({});
    for (const c of Object.values(p.concepts)) {
      expect(c.title).toMatch(/^Practice /);
      expect(c.claims.map((x) => x.text)).toEqual([...PRACTICE_CLAIMS]);
      expect(c.claims.every((x) => x.evidence.length === 0)).toBe(true);
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
