/**
 * In-world text placement and legibility (lead requirement; checks P1-P8 in
 * src/features/immersive/placement.ts), measured on the manifest compiled from the curated content.
 * The numbers are printed so the results document can cite this test.
 */
import { describe, expect, it } from "vitest";

import { CollisionWorld } from "@/features/immersive/navigation";
import { doorSigns, MIN_TEXT_ANGLE, pixelAngle, placementReport } from "@/features/immersive/placement";
import { buildSceneModel } from "@/features/immersive/scene-model";

import { museumFixture } from "./fixtures";

describe("in-world text placement", () => {
  const model = buildSceneModel(museumFixture().manifest.manifest);
  const report = placementReport(model, new CollisionWorld(model.colliders));

  it("prints the measured placement numbers", () => {
    console.log(JSON.stringify(report, null, 1));
    expect(report.textPlanes.panels).toBe(model.exhibits.length);
  });

  it("uses the 16 px at 1280x800 / 62 degree reference angle", () => {
    expect(MIN_TEXT_ANGLE).toBeCloseTo(pixelAngle(16, 800, 62), 12);
    expect(MIN_TEXT_ANGLE).toBeGreaterThan(0.02);
  });

  it("P1-P3: one eye-height band for panels and one for signage, one offset, a shared baseline per wall", () => {
    expect(report.panelBands).toHaveLength(1);
    expect(report.sharedBaseline.failing).toEqual([]);
    expect(report.offsets.every((o) => o > 0.0015)).toBe(true);
  });

  it("P4: panels are evenly spaced along every run of wall between doorways", () => {
    expect(report.spacing.maxSpreadWithinWall).toBeLessThan(0.01);
    expect(report.spacing.minGap).toBeGreaterThan(1);
  });

  it("P5: no text overlaps text, an exhibit or a doorway, or clips into geometry", () => {
    expect(report.overlaps).toEqual([]);
  });

  it("P6: every panel faces its approach point (no grazing-angle reading)", () => {
    expect(report.maxFacingAngleDeg).toBeLessThanOrEqual(30);
  });

  it("P7: every line of panel lettering subtends at least the reference angle at the approach point", () => {
    expect(report.legibility.failing).toEqual([]);
    expect(report.legibility.minKickerAngleRad).toBeGreaterThanOrEqual(MIN_TEXT_ANGLE - 1e-9);
  });

  it("P8: every doorway is signed on both sides with where it leads, readable from 2.5 m", () => {
    expect(report.doorSignage.signed).toBe(report.doorSignage.sides);
    expect(report.doorSignage.failing).toEqual([]);
    for (const s of doorSigns(model)) expect(s.toRoomId).not.toBe(s.roomId);
  });
});

describe("wayfinding order against the 2D pathway", () => {
  it("prints each wing's rooms in doorway-hop order next to the 2D section order", async () => {
    const { EPISTEMIC_SECTIONS } = await import("@/features/learning-2d/template");
    const GROUP_SECTION: Record<string, string> = {
      tradition_context: "context",
      materials_tools: "materials-tools",
      process_sequence: "process",
      artisan_decisions: "artisan",
      design_outcomes: "design",
      science_technology: "science",
      open_questions: "open-questions",
    };
    const order = EPISTEMIC_SECTIONS.map((s) => s.id as string);
    const rooms = museumFixture().manifest.manifest.elements.filter((e) => e.kind === "room" && e.roomKind === "wing-room");
    const wings = new Map<string, { group: string; hops: number }[]>();
    for (const r of rooms) (wings.get(String(r.traditionSlug)) ?? wings.set(String(r.traditionSlug), []).get(String(r.traditionSlug))!).push({ group: String(r.group), hops: Number(r.doorHopsFromEntrance) });
    const report: Record<string, unknown> = {};
    let inversions = 0;
    let pairs = 0;
    for (const [wing, list] of wings) {
      const sorted = [...list].sort((a, b) => a.hops - b.hops || order.indexOf(GROUP_SECTION[a.group]!) - order.indexOf(GROUP_SECTION[b.group]!));
      for (let i = 0; i < sorted.length; i++)
        for (let j = i + 1; j < sorted.length; j++) {
          if (sorted[i]!.hops === sorted[j]!.hops) continue;
          pairs++;
          if (order.indexOf(GROUP_SECTION[sorted[i]!.group]!) > order.indexOf(GROUP_SECTION[sorted[j]!.group]!)) inversions++;
        }
      report[wing] = sorted.map((x) => `${x.hops}:${x.group}`);
    }
    console.log(JSON.stringify({ sectionOrder: order, wings: report, orderedPairs: pairs, inversions }, null, 1));
    expect(pairs).toBeGreaterThan(0);
    // Rule layout.template-order: walking outward from a wing's entrance meets the sections in
    // the 2D page order.
    expect(inversions).toBe(0);
  });
});
