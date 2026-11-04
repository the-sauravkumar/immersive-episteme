import { describe, expect, it } from "vitest";

import { startCourseSession, stepCourse, type CourseEvent, type CourseSessionModel } from "@/features/course/application/course-session";
import { allStagesVisited, canFinish, canGoBack, canJumpTo, goBack, goNext, hasVisited, isProductPanel, jumpTo, startCourse } from "@/features/course/domain/course-state";
import { captionSize, nameSize, objectColumns, practicePanelModel, productRails, PRACTICE_STEP_COUNT, stagePanelModel } from "@/features/course/domain/panel-model";
import type { StageTemplate } from "@/features/process/domain/stage-template";

function walk(steps: number, counts: readonly number[] = [3, 2]) {
  let state = startCourse(counts);
  for (let index = 0; index < steps; index += 1) state = goNext(state);
  return state;
}

describe("course state", () => {
  it("starts at the first stage with back disabled", () => {
    const state = startCourse([3, 2]);
    expect(state.panel).toBe(0);
    expect(canGoBack(state)).toBe(false);
    expect(goBack(state)).toBe(state);
  });

  it("refuses an empty course", () => {
    expect(() => startCourse([])).toThrow();
    expect(() => startCourse([0])).toThrow();
  });

  it("cannot jump ahead of the furthest stage reached", () => {
    const state = walk(1);
    expect(canJumpTo(state, 2)).toBe(false);
    expect(jumpTo(state, 2)).toBe(state);
    expect(canJumpTo(state, 0)).toBe(true);
    expect(jumpTo(state, 0).panel).toBe(0);
  });

  it("keeps the furthest stage after going back, and may return to it", () => {
    const back = goBack(walk(2));
    expect(back.panel).toBe(1);
    expect(hasVisited(back, 0, 2)).toBe(true);
    expect(jumpTo(back, 2).panel).toBe(2);
  });

  it("ends each tradition on its product panel, then opens the next tradition at Stage 1", () => {
    const product = walk(3);
    expect(isProductPanel(product)).toBe(true);
    const nextTradition = goNext(product);
    expect(nextTradition.tradition).toBe(1);
    expect(nextTradition.panel).toBe(0);
    expect(canGoBack(nextTradition)).toBe(false);
  });

  it("completes only when every stage of every tradition was visited", () => {
    expect(allStagesVisited(walk(3))).toBe(false);
    expect(canFinish(walk(3))).toBe(false);
    const end = walk(6);
    expect(isProductPanel(end)).toBe(true);
    expect(allStagesVisited(end)).toBe(true);
    expect(canFinish(end)).toBe(true);
    expect(goNext(end)).toBe(end);
  });

  it("does not treat a tradition never opened as visited", () => {
    expect(hasVisited(startCourse([3, 2]), 1, 0)).toBe(false);
  });
});

describe("course session events", () => {
  const types = (events: readonly CourseEvent[]) => events.map((event) => event.type);

  function advance(model: CourseSessionModel, count: number, now: number): CourseSessionModel {
    let current = model;
    for (let index = 0; index < count; index += 1) current = stepCourse(current, { type: "next" }, now).model;
    return current;
  }

  it("enters the first panel on start", () => {
    expect(types(startCourseSession([2], 5).events)).toEqual(["entered"]);
  });

  it("reports dwell time when leaving", () => {
    const start = startCourseSession([2], 1000).model;
    const step = stepCourse(start, { type: "next" }, 1800);
    expect(types(step.events)).toEqual(["left", "entered"]);
    expect(step.events[0]).toMatchObject({ type: "left", dwellMs: 800 });
    expect(step.model.enteredAtMs).toBe(1800);
  });

  it("reports a back-step for back and for a jump to an earlier stage", () => {
    const at2 = advance(startCourseSession([3], 0).model, 2, 0);
    expect(types(stepCourse(at2, { type: "back" }, 1).events)).toEqual(["left", "back-step", "entered"]);
    expect(types(stepCourse(at2, { type: "jump", panel: 0 }, 1).events)).toEqual(["left", "back-step", "entered"]);
  });

  it("emits nothing for a refused move", () => {
    const start = startCourseSession([3], 0).model;
    const refused = stepCourse(start, { type: "jump", panel: 2 }, 1);
    expect(refused.events).toEqual([]);
    expect(refused.model).toBe(start);
  });

  it("finishes only at the last product panel, once", () => {
    const start = startCourseSession([1, 1], 0).model;
    expect(stepCourse(start, { type: "finish" }, 1).events).toEqual([]);
    const end = advance(start, 3, 0);
    const finished = stepCourse(end, { type: "finish" }, 9);
    expect(types(finished.events)).toEqual(["left", "finished"]);
    expect(stepCourse(finished.model, { type: "finish" }, 10).events).toEqual([]);
    expect(stepCourse(finished.model, { type: "back" }, 10).events).toEqual([]);
  });
});

describe("panel model", () => {
  const stage = (number: number) => ({
    number,
    key: `t.${number}`,
    sourceStageKeys: [],
    name: `Stage ${number}`,
    localName: null,
    kind: "table" as const,
    caption: { text: "Words.", sources: [] },
    items: [{ key: "k", role: "tool" as const, label: "Block", localName: null, modelId: "carved-block" }],
    clothStateId: `ajrakh-0${number}`,
  });
  const template: StageTemplate = { tradition: "ajrakh", traditionName: "Ajrakh", rawClothStateId: "ajrakh-raw", stages: [stage(1), stage(2)], products: [] };

  it("uses the raw cloth before Stage 1 and the previous state afterwards", () => {
    expect(stagePanelModel(template, 0).clothBeforeSrc).toContain("ajrakh-raw");
    expect(stagePanelModel(template, 1).clothBeforeSrc).toContain("ajrakh-01");
    expect(stagePanelModel(template, 1).clothAfterSrc).toContain("ajrakh-02");
  });

  it("resolves objects through the shared still path", () => {
    expect(stagePanelModel(template, 0).objects[0]?.stillSrc).toBe("/walkthrough/stills/carved-block.jpg");
  });

  it("writes the kicker in Title Case with the true count", () => {
    expect(stagePanelModel(template, 1).kicker).toBe("Ajrakh, Stage 2 Of 2");
  });

  it("keeps practice neutral, on the raw cloth, with one object and three steps", () => {
    expect(PRACTICE_STEP_COUNT).toBe(3);
    const practice = practicePanelModel(0);
    expect(practice.numeral).toBe("P");
    expect(practice.objects).toHaveLength(1);
    expect(practice.sources).toEqual([]);
    expect(practice.clothAfterSrc).toContain("-raw");
    expect(() => practicePanelModel(3)).toThrow();
  });

  it("splits product rails by photograph count", () => {
    expect(productRails(3)).toEqual([{ start: 0, end: 3 }]);
    expect(productRails(6)).toEqual([
      { start: 0, end: 3 },
      { start: 3, end: 6 },
    ]);
    expect(productRails(4)).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 4 },
    ]);
  });

  it("sets long words and long captions smaller", () => {
    expect(nameSize("Red Dyeing")).toBe("large");
    expect(nameSize("Yellow Dyeing And Alum Post-Mordanting")).toBe("small");
    expect(captionSize("x".repeat(100))).toBe("large");
    expect(captionSize("x".repeat(280))).toBe("small");
    expect(objectColumns(3)).toBe(1);
    expect(objectColumns(4)).toBe(2);
  });
});
