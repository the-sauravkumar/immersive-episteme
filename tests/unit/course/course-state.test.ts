import { describe, expect, it } from "vitest";

import { closeOpenCourseStop, reopenCourseStop, restoreCourseStop, startCourseSession, stepCourse, suspendCourseClock, type CourseEvent, type CourseSessionModel } from "@/features/course/application/course-session";
import { allStagesVisited, canFinish, canGoBack, canJumpTo, goBack, goNext, hasVisited, isProductPanel, jumpTo, startCourse } from "@/features/course/domain/course-state";
import { captionSize, nameSize, objectColumns, practicePanelModel, productRails, PRACTICE_STEP_COUNT, stagePanelModel } from "@/features/course/domain/panel-model";
import { stillPath } from "@/features/process/domain/asset-catalogue";
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
    expect(step.events[0]).toMatchObject({ type: "left", activeMs: 800 });
    expect(step.model.sinceMs).toBe(1800);
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
    expect(stagePanelModel(template, 0).objects[0]?.stillSrc).toBe(stillPath("carved-block"));
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

describe("course session clock and recovery", () => {
  const types = (events: readonly CourseEvent[]) => events.map((event) => event.type);
  const positioned = (panel: number, tradition = 0, reached: readonly number[] = [panel]) => startCourseSession(tradition === 0 && reached.length === 1 ? [3] : [3, 3], 1000, { tradition, stop: panel, reached }).model;

  it("leaves paused time out of the active time, as Door 2 does", () => {
    const start = startCourseSession([2], 0).model;
    const paused = suspendCourseClock(start, true, 1000);
    const resumed = suspendCourseClock(paused, false, 601000);
    expect(stepCourse(resumed, { type: "next" }, 603000).events[0]).toMatchObject({ type: "left", activeMs: 3000 });
  });

  it("keeps a suspended clock suspended on the next stop", () => {
    const paused = suspendCourseClock(startCourseSession([2], 0).model, true, 100);
    const moved = stepCourse(paused, { type: "next" }, 200).model;
    expect(moved.suspended).toBe(true);
    expect(stepCourse(suspendCourseClock(moved, false, 900), { type: "back" }, 1000).events[0]).toMatchObject({ type: "left", activeMs: 100 });
  });

  it("resumes where the learner stopped without reporting an entry", () => {
    const step = startCourseSession([3, 3], 5, { tradition: 1, stop: 2, reached: [3, 2] });
    expect(step.events).toEqual([]);
    expect(step.model.state).toMatchObject({ tradition: 1, panel: 2, reached: [3, 2] });
    expect(types(stepCourse(step.model, { type: "back" }, 6).events)).toEqual(["left", "back-step", "entered"]);
  });

  it("lets a refused finish be retried and keeps Back working until the server accepts", () => {
    const end = positioned(3);
    const finishing = stepCourse(end, { type: "finish" }, 2000);
    expect(types(finishing.events)).toEqual(["left", "finished"]);
    expect(finishing.model.finishing).toBe(true);
    expect(types(stepCourse(finishing.model, { type: "back" }, 2100).events)).toEqual(["back-step", "entered"]);
    const reopened = reopenCourseStop(finishing.model, 3000);
    expect(reopened.finishing).toBe(false);
    const again = stepCourse(reopened, { type: "finish" }, 3500);
    expect(again.events[0]).toMatchObject({ type: "left", activeMs: 500 });
    expect(types(again.events)).toEqual(["left", "finished"]);
    expect(types(stepCourse(reopenCourseStop(again.model, 3600), { type: "back" }, 3700).events)).toEqual(["left", "back-step", "entered"]);
  });

  it("closes the open stop once, for the cap, a closed tab or an unmount", () => {
    const open = positioned(1);
    const closed = closeOpenCourseStop(open, 1700);
    expect(closed.events).toMatchObject([{ type: "left", activeMs: 700 }]);
    expect(closeOpenCourseStop(closed.model, 1800).events).toEqual([]);
    expect(stepCourse(closed.model, { type: "next" }, 1900).events.map((event) => event.type)).toEqual(["entered"]);
  });

  it("returns a refused learner to the stop the server expects, across traditions", () => {
    const ahead = positioned(2, 1, [3, 2]);
    const restored = restoreCourseStop(ahead, { tradition: 0, stop: 1 }, 2000);
    expect(types(restored.events)).toEqual(["left", "entered"]);
    expect(restored.model.state).toMatchObject({ tradition: 0, panel: 1, reached: [1, -1] });
  });
});
