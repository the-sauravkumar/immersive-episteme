import { allStagesVisited, canFinish, goBack, goNext, isProductPanel, jumpTo, startCourse, type CourseState } from "../domain/course-state";

export interface CoursePanelRef {
  readonly tradition: number;
  readonly panel: number;
  readonly isProduct: boolean;
}

export type CourseEvent =
  | { readonly type: "entered"; readonly at: CoursePanelRef }
  | { readonly type: "left"; readonly at: CoursePanelRef; readonly dwellMs: number }
  | { readonly type: "back-step"; readonly from: CoursePanelRef; readonly to: CoursePanelRef }
  | { readonly type: "finished"; readonly at: CoursePanelRef };

export type CourseAction = { readonly type: "next" } | { readonly type: "back" } | { readonly type: "jump"; readonly panel: number } | { readonly type: "finish" };

export interface CourseSessionModel {
  readonly state: CourseState;
  readonly enteredAtMs: number;
  readonly finished: boolean;
}

export interface CourseStep {
  readonly model: CourseSessionModel;
  readonly events: readonly CourseEvent[];
}

const panelRef = (state: CourseState): CoursePanelRef => ({ tradition: state.tradition, panel: state.panel, isProduct: isProductPanel(state) });

export function startCourseSession(stageCounts: readonly number[], nowMs: number): CourseStep {
  const state = startCourse(stageCounts);
  return { model: { state, enteredAtMs: nowMs, finished: false }, events: [{ type: "entered", at: panelRef(state) }] };
}

export function stepCourse(model: CourseSessionModel, action: CourseAction, nowMs: number): CourseStep {
  if (model.finished) return { model, events: [] };
  const from = model.state;
  if (action.type === "finish") {
    if (!canFinish(from) || !allStagesVisited(from)) return { model, events: [] };
    return {
      model: { ...model, finished: true },
      events: [
        { type: "left", at: panelRef(from), dwellMs: nowMs - model.enteredAtMs },
        { type: "finished", at: panelRef(from) },
      ],
    };
  }
  const to = action.type === "next" ? goNext(from) : action.type === "back" ? goBack(from) : jumpTo(from, action.panel);
  if (to === from) return { model, events: [] };
  const movedBack = to.tradition === from.tradition && to.panel < from.panel;
  const events: CourseEvent[] = [{ type: "left", at: panelRef(from), dwellMs: nowMs - model.enteredAtMs }];
  if (movedBack) events.push({ type: "back-step", from: panelRef(from), to: panelRef(to) });
  events.push({ type: "entered", at: panelRef(to) });
  return { model: { state: to, enteredAtMs: nowMs, finished: false }, events };
}
