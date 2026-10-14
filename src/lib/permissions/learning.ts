/** The two experimental learning conditions. Dependency-free (shared by server and client). */
export const LEARNING_CONDITIONS = ["2d", "immersive"] as const;

export type LearningCondition = (typeof LEARNING_CONDITIONS)[number];

export function isLearningCondition(value: unknown): value is LearningCondition {
  return typeof value === "string" && (LEARNING_CONDITIONS as readonly string[]).includes(value);
}

export const LEARNING_PERMISSION = {
  "2d": "learn.2d",
  immersive: "learn.immersive",
} as const;

export const LEARNING_ROUTE = {
  "2d": "/learn/2d",
  immersive: "/learn/immersive",
} as const satisfies Record<LearningCondition, string>;
