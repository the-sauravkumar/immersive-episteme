import { canFinish, goBack, goNext, isProductPanel, jumpTo, placeCourse, startCourse, type CoursePosition, type CourseResume, type CourseState } from "../domain/course-state";

export interface CoursePanelRef {
  readonly tradition: number;
  readonly panel: number;
  readonly isProduct: boolean;
}

export type CourseEvent =
  | { readonly type: "entered"; readonly at: CoursePanelRef }
  | { readonly type: "left"; readonly at: CoursePanelRef; readonly activeMs: number }
  | { readonly type: "back-step"; readonly from: CoursePanelRef; readonly to: CoursePanelRef }
  | { readonly type: "finished"; readonly at: CoursePanelRef };

export type CourseAction = { readonly type: "next" } | { readonly type: "back" } | { readonly type: "jump"; readonly panel: number } | { readonly type: "finish" };

export interface CourseSessionModel {
  readonly state: CourseState;
  readonly activeMs: number;
  readonly sinceMs: number;
  readonly suspended: boolean;
  readonly exited: boolean;
  readonly finishing: boolean;
}

export interface CourseStep {
  readonly model: CourseSessionModel;
  readonly events: readonly CourseEvent[];
}

const panelRef = (state: CourseState): CoursePanelRef => ({ tradition: state.tradition, panel: state.panel, isProduct: isProductPanel(state) });

const activeMsOf = (model: CourseSessionModel, nowMs: number): number => model.activeMs + (model.suspended || model.exited ? 0 : nowMs - model.sinceMs);

const freshClock = (model: CourseSessionModel, nowMs: number) => ({ activeMs: 0, sinceMs: nowMs, suspended: model.suspended, exited: false, finishing: false });

const leftEvents = (model: CourseSessionModel, nowMs: number): CourseEvent[] => (model.exited ? [] : [{ type: "left", at: panelRef(model.state), activeMs: activeMsOf(model, nowMs) }]);

export function startCourseSession(stageCounts: readonly number[], nowMs: number, resume: CourseResume | null = null): CourseStep {
  const state = resume ? placeCourse(stageCounts, resume) : startCourse(stageCounts);
  const model: CourseSessionModel = { state, activeMs: 0, sinceMs: nowMs, suspended: false, exited: false, finishing: false };
  return { model, events: resume ? [] : [{ type: "entered", at: panelRef(state) }] };
}

export function stepCourse(model: CourseSessionModel, action: CourseAction, nowMs: number): CourseStep {
  const from = model.state;
  if (action.type === "finish") {
    if (model.finishing || !canFinish(from)) return { model, events: [] };
    return {
      model: { ...model, activeMs: 0, exited: true, finishing: true },
      events: [...leftEvents(model, nowMs), { type: "finished", at: panelRef(from) }],
    };
  }
  const to = action.type === "next" ? goNext(from) : action.type === "back" ? goBack(from) : jumpTo(from, action.panel);
  if (to === from) return { model, events: [] };
  const movedBack = to.tradition === from.tradition && to.panel < from.panel;
  const events = leftEvents(model, nowMs);
  if (movedBack) events.push({ type: "back-step", from: panelRef(from), to: panelRef(to) });
  events.push({ type: "entered", at: panelRef(to) });
  return { model: { ...freshClock(model, nowMs), state: to }, events };
}

export function suspendCourseClock(model: CourseSessionModel, suspended: boolean, nowMs: number): CourseSessionModel {
  if (model.suspended === suspended) return model;
  return { ...model, activeMs: activeMsOf(model, nowMs), sinceMs: nowMs, suspended };
}

export function closeOpenCourseStop(model: CourseSessionModel, nowMs: number): CourseStep {
  if (model.exited) return { model, events: [] };
  return { model: { ...model, activeMs: 0, exited: true }, events: leftEvents(model, nowMs) };
}

export function reopenCourseStop(model: CourseSessionModel, nowMs: number): CourseSessionModel {
  return model.exited ? { ...model, ...freshClock(model, nowMs) } : model;
}

export function restoreCourseStop(model: CourseSessionModel, position: CoursePosition, nowMs: number): CourseStep {
  const reached = model.state.stageCounts.map((count, tradition) => (tradition < position.tradition ? count : tradition === position.tradition ? position.stop : -1));
  const state = placeCourse(model.state.stageCounts, { ...position, reached });
  return { model: { ...freshClock(model, nowMs), state }, events: [...leftEvents(model, nowMs), { type: "entered", at: panelRef(state) }] };
}
