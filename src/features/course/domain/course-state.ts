export interface CourseState {
  readonly stageCounts: readonly number[];
  readonly tradition: number;
  readonly panel: number;
  readonly reached: readonly number[];
}

export function startCourse(stageCounts: readonly number[]): CourseState {
  if (stageCounts.length === 0 || stageCounts.some((count) => count < 1)) throw new Error("A course needs at least one stage per tradition");
  return { stageCounts, tradition: 0, panel: 0, reached: stageCounts.map((_, index) => (index === 0 ? 0 : -1)) };
}

const stageCount = (state: CourseState): number => state.stageCounts[state.tradition]!;

export const isProductPanel = (state: CourseState): boolean => state.panel === stageCount(state);
export const isLastTradition = (state: CourseState): boolean => state.tradition === state.stageCounts.length - 1;
export const canGoBack = (state: CourseState): boolean => state.panel > 0;
export const canFinish = (state: CourseState): boolean => isProductPanel(state) && isLastTradition(state) && allStagesVisited(state);
export const canGoNext = (state: CourseState): boolean => !isProductPanel(state) || !isLastTradition(state);
export const reachedPanel = (state: CourseState): number => state.reached[state.tradition]!;
export const canJumpTo = (state: CourseState, panel: number): boolean => panel >= 0 && panel <= reachedPanel(state) && panel !== state.panel;

export function hasVisited(state: CourseState, tradition: number, stageIndex: number): boolean {
  return stageIndex <= state.reached[tradition]!;
}

export function allStagesVisited(state: CourseState): boolean {
  return state.stageCounts.every((count, tradition) => state.reached[tradition]! >= count - 1);
}

function moveTo(state: CourseState, tradition: number, panel: number): CourseState {
  return {
    ...state,
    tradition,
    panel,
    reached: state.reached.map((furthest, index) => (index === tradition ? Math.max(furthest, panel) : furthest)),
  };
}

export function goNext(state: CourseState): CourseState {
  if (!canGoNext(state)) return state;
  return isProductPanel(state) ? moveTo(state, state.tradition + 1, 0) : moveTo(state, state.tradition, state.panel + 1);
}

export function goBack(state: CourseState): CourseState {
  return canGoBack(state) ? moveTo(state, state.tradition, state.panel - 1) : state;
}

export function jumpTo(state: CourseState, panel: number): CourseState {
  return canJumpTo(state, panel) ? moveTo(state, state.tradition, panel) : state;
}
