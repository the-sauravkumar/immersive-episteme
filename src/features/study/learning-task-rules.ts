export interface LearningExposure {
  readonly minutes?: number;
}

export const LEARNING_TASK_OPENING = "The next part is the learning task. When you continue, the learning environment opens.";

const ROUTE_RULE = "Go through every stop in order. The last stop leads on to the questions.";

const minutesText = (minutes: number) => `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;

export function learningTaskRules(exposure: LearningExposure): string[] {
  if (exposure.minutes === undefined) return [ROUTE_RULE, "Take the time you need. There is no time limit."];
  return [ROUTE_RULE, `Take the time you need, up to ${minutesText(exposure.minutes)}. The time keeps running if you pause, and the questions open by themselves when it is up.`];
}
