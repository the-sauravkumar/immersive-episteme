"use client";

/**
 * `useLearningTimeBudget(budget)`: the same countdown in both conditions. Pass the
 * `learningTime` object from the learning context (server component -> client prop). The clock
 * is the server's (`serverNow`) advanced by the monotonic time since mount, so a wrong device
 * clock cannot stretch or shorten the budget. Updates once per second.
 */
import { useEffect, useState } from "react";

import { learningTimeState, type LearningTimeBudget, type LearningTimeState } from "./time-budget";

export function useLearningTimeBudget(budget: LearningTimeBudget): LearningTimeState {
  const [state, setState] = useState(() => learningTimeState(budget, Date.parse(budget.serverNow)));
  useEffect(() => {
    const server = Date.parse(budget.serverNow);
    const mono = performance.now();
    const id = setInterval(() => setState(learningTimeState(budget, server + (performance.now() - mono))), 1000);
    return () => clearInterval(id);
  }, [budget]);
  return state;
}
