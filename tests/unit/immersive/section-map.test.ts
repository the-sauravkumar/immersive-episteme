/**
 * One section map for both conditions (DR-024; review finding spatial-1, parity check P29): the
 * 2D tradition page, index and rail and the museum's wing rooms use the SAME sections, in the same
 * order, with the same names and numbers, and every concept of the curated content is in the same
 * section in both. Measured on the study manifest compiled from content/ (the default rule set).
 */
import { describe, expect, it } from "vitest";

import { planOrder, planRoomName, roomNumbers } from "@/components/museum/overlays/minimap";
import { buildSceneModel } from "@/features/immersive/scene-model";
import { KNOWLEDGE_SECTIONS, sectionOfType, sectionOfZoneGroup } from "@/features/learning/sections";
import { index2d, sectionConcepts } from "@/features/learning-2d/navigation";
import { EPISTEMIC_SECTIONS } from "@/features/learning-2d/template";
import { DEFAULT_ZONE_GROUPS } from "@/features/spatial/compiler";
import { CONCEPT_TYPES } from "@/lib/validation/enums";

import { museumFixture, TRADITIONS } from "./fixtures";

describe("the shared section map", () => {
  it("is the 2D template and the source of the museum's zone groups (one table, same order and names)", () => {
    expect(EPISTEMIC_SECTIONS).toBe(KNOWLEDGE_SECTIONS);
    expect(DEFAULT_ZONE_GROUPS.map((g) => [g.id, g.label, g.scope])).toEqual(KNOWLEDGE_SECTIONS.map((s) => [s.zoneGroup, s.title, s.scope]));
    expect(KNOWLEDGE_SECTIONS.map((s) => s.number)).toEqual(KNOWLEDGE_SECTIONS.map((_, i) => i + 1));
    for (const key of ["id", "title", "zoneGroup"] as const) expect(new Set(KNOWLEDGE_SECTIONS.map((s) => s[key])).size).toBe(KNOWLEDGE_SECTIONS.length);
    // The tradition's own sections come first and without a gap; the cross-tradition section (the hall) is last.
    expect(KNOWLEDGE_SECTIONS.map((s) => s.scope)).toEqual([...Array(KNOWLEDGE_SECTIONS.length - 1).fill("wing"), "hall"]);
  });

  it("places every concept type in exactly one zone group, the group of its 2D section", () => {
    for (const t of CONCEPT_TYPES) {
      const groups = DEFAULT_ZONE_GROUPS.filter((g) => (g.types as readonly string[]).includes(t));
      expect(groups.map((g) => g.id), t).toEqual([sectionOfType(t).zoneGroup]);
    }
  });
});

describe("every concept is in the same section in both conditions (study manifest)", () => {
  const { manifest, view } = museumFixture();
  const elements = manifest.manifest.elements;
  const byId = new Map(elements.map((e) => [e.id, e]));
  const exhibits = elements.filter((e) => e.kind === "exhibit" || e.kind === "station");
  const keyOf = new Map(view.conceptRefsById(exhibits.map((e) => String(e.conceptId))).map((c) => [c.id, c.key]));

  it("passes the compiler's rules.sections check with no issue", () => {
    const check = manifest.validation.checks.find((c) => c.id === "rules.sections");
    expect(check?.details).toMatchObject({ severity: "error", issueCount: 0 });
    expect(manifest.validation.passed).toBe(true);
  });

  it("each wing room holds exactly the concepts of the 2D section of the same tradition", () => {
    let compared = 0;
    for (const slug of TRADITIONS) {
      const tradition = view.getTradition(slug)!;
      for (const section of KNOWLEDGE_SECTIONS.filter((s) => s.scope === "wing")) {
        const room = byId.get(`room:${slug}:${section.zoneGroup}`);
        const in3d = exhibits.filter((e) => e.parentId === room?.id).map((e) => keyOf.get(String(e.conceptId))!);
        // The tradition concept is the 2D tradition page itself and the first exhibit of the context room.
        const in2d = sectionConcepts(tradition, section).map((c) => c.key);
        const expected = section.id === "context" ? [...in2d, ...(tradition.conceptsByType.tradition ?? []).map((c) => c.key)] : in2d;
        expect([...in3d].sort(), `${slug} ${section.id}`).toEqual([...expected].sort());
        if (in2d.length > 0) expect(room?.label, `${slug} ${section.id}`).toBe(`${tradition.name}: ${section.title}`);
        compared += in3d.length;
      }
    }
    console.log(JSON.stringify({ wingExhibitsCompared: compared, exhibits: exhibits.length }));
    expect(compared).toBeGreaterThan(150);
  });

  it("the comparison hall holds the comparisons and nothing else; no tradition concept leaves its wing", () => {
    const hall = exhibits.filter((e) => byId.get(String(e.parentId))?.roomKind === "hall");
    expect(hall.length).toBeGreaterThan(0);
    for (const e of hall) expect(sectionOfType(String(e.conceptType) as never).scope, keyOf.get(String(e.conceptId))).toBe("hall");
    for (const v of view.getComparisons()) {
      if (!keyOf.has(v.concept.id)) continue;
      expect(byId.get(String(exhibits.find((e) => e.conceptId === v.concept.id)?.parentId))?.roomKind, v.concept.key).toBe("hall");
    }
  });

  it("the four concepts the review found split (spatial-1) now sit in their 2D section's room", () => {
    const roomOfKey = (key: string) => String(exhibits.find((e) => keyOf.get(String(e.conceptId)) === key)?.parentId);
    expect(roomOfKey("machilipatnam-kalamkari.historical_context.srikalahasti-style")).toBe("room:machilipatnam-kalamkari:tradition_context");
    expect(roomOfKey("machilipatnam-kalamkari.explanation.producer-communities-and-karkhanas")).toBe("room:machilipatnam-kalamkari:science_technology");
    expect(roomOfKey("sanganeri.historical_context.chhipa-community")).toBe("room:sanganeri:tradition_context");
    expect(roomOfKey("sanganeri.historical_context.kharadi-block-makers")).toBe("room:sanganeri:tradition_context");
  });
});

describe("the museum plan numbers and names rooms as the 2D index numbers and names sections", () => {
  const model = buildSceneModel(museumFixture().manifest.manifest);
  const numbers = roomNumbers(model);
  const index = index2d(
    { traditionSlug: null, sectionId: null, conceptSlug: null },
    { traditions: TRADITIONS.map((slug) => ({ slug, name: slug })), concepts: {}, parents: [] },
  );

  it("every wing room and the hall carry their section's number and title, in the 2D index's order", () => {
    for (const t of index) {
      const rooms = planOrder(model).filter((r) => r.traditionSlug === t.slug);
      expect(rooms.length, t.slug).toBeGreaterThan(0);
      const plan = rooms.map((r) => ({ number: numbers.get(r.id), title: planRoomName(r, () => r.label) }));
      // The plan lists the wing's rooms in section order, each as the 2D index lists that section.
      expect(plan.map((p) => p.number)).toEqual([...plan.map((p) => p.number)].sort((a, b) => a! - b!));
      for (const p of plan) expect(t.sections.find((s) => s.number === p.number)?.title, `${t.slug} room ${p.number}`).toBe(p.title);
    }
    const hall = model.rooms.find((r) => r.roomKind === "hall")!;
    const hallSection = KNOWLEDGE_SECTIONS.find((s) => s.scope === "hall")!;
    expect([numbers.get(hall.id), planRoomName(hall, () => hall.label)]).toEqual([hallSection.number, hallSection.title]);
    for (const t of index) expect(t.sections.find((s) => s.number === hallSection.number)?.title).toBe(hallSection.title);
  });

  it("the lobby and the shared commons are no section and carry no number; the entrance is listed first", () => {
    for (const r of model.rooms) expect(numbers.has(r.id), r.id).toBe(sectionOfZoneGroup(r.group) !== null);
    expect(model.rooms.filter((r) => !numbers.has(r.id)).map((r) => r.roomKind).sort()).toEqual(model.rooms.some((r) => r.roomKind === "commons") ? ["commons", "lobby"] : ["lobby"]);
    expect(planOrder(model)[0]!.roomKind).toBe("lobby");
  });
});
