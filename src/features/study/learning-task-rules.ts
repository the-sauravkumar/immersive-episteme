export interface LearningExposure {
  readonly minutes?: number;
  readonly allowEarlyFinish: boolean;
}

export const LEARNING_TASK_OPENING = "The next part is the learning task. When you continue, the learning environment opens.";

const ROUTE_RULE = "Go through every stop in order. The last stop leads on to the questions.";

const minutesText = (minutes: number) => `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;

export function learningTaskRules(exposure: LearningExposure): string[] {
  if (exposure.minutes === undefined) return [ROUTE_RULE, "Take the time you need. There is no time limit."];
  const limit = minutesText(exposure.minutes);
  if (exposure.allowEarlyFinish) {
    return [ROUTE_RULE, `Take the time you need, up to ${limit}. The time keeps running if you pause, and the questions open by themselves when it is up.`];
  }
  return [
    "Go through every stop in order. You can go back to any stop you have visited.",
    `The learning task lasts ${limit}. The time keeps running if you pause, and the questions open when it is up, not before.`,
  ];
}
