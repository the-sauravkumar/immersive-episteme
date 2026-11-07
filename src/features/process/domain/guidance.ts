export const HELP_TITLE = "Help";

export interface SessionTime {
  readonly limitMinutes: number | null;
  readonly earlyFinish: boolean;
}

export interface DoorGuidance {
  readonly time: SessionTime;
  readonly hint: string | null;
  readonly stallSeconds: number | null;
}

export const UNTIMED_SESSION: SessionTime = { limitMinutes: null, earlyFinish: true };
export const NO_GUIDANCE: DoorGuidance = { time: UNTIMED_SESSION, hint: null, stallSeconds: null };

const minutes = (count: number): string => `${count} ${count === 1 ? "minute" : "minutes"}`;

function timeLine({ limitMinutes, earlyFinish }: SessionTime): string {
  if (limitMinutes === null) return "There is no time limit. Take the time you need.";
  if (earlyFinish) return `Take the time you need, up to the session limit of ${minutes(limitMinutes)}. The session moves on by itself when the time is up.`;
  return `The session lasts ${minutes(limitMinutes)} and moves on by itself when the time is up.`;
}

export function sessionHelpLines(time: SessionTime): readonly string[] {
  return [
    "Go through every stage, in order. You can go back to any stage you have reached in the tradition you are in.",
    "Each caption has its sources behind it. Open them if you want to see where the words come from.",
    timeLine(time),
  ];
}

export const PRACTICE_HELP_LINES: readonly string[] = [
  "This is practice, with neutral content. Nothing here is part of the test.",
  "There is no time limit here. Go on when you are ready.",
];

export const HINT_TITLE = "Hint";
export const STALL_CUE_TEXT = "A hint is ready if you want one.";
export const OPEN_HINT_LABEL = "Open Hint";
export const DISMISS_CUE_LABEL = "Not Now";
export const HINT_CUE_ID = "hint";
export const STALL_CUE_ID = "stall";

export type GuidanceAction = "shown" | "followed" | "dismissed";
export type GuidanceCueId = typeof HINT_CUE_ID | typeof STALL_CUE_ID;

export const PAUSE_TITLE = "Paused";
export const PAUSE_TEXT = "Take a moment. Your place is kept. If the task has a time limit, it keeps running while you are paused. Press Resume when you are ready.";
export const RESUME_LABEL = "Resume";

export const SOURCES_LABEL = "Sources Behind This Caption";
export const SOURCES_AND_CREDITS_LABEL = "Sources And Credits";
export const QUESTIONS_LABEL = "Questions";
export const FINISH_LABEL = "Finish";
export const PRACTICE_OBJECT_LABEL = "Practice Object";
export const ROLE_LABELS: Readonly<Record<"tool" | "material", string>> = { tool: "Tool", material: "Material" };
export const STAND_IN_MARK = "Stand-In Model";
export const UNSETTLED_COLOUR_MARK = "Colour Not Sourced";
export const PROXY_CLOTH_MARK = "Proxy Cloth State";

export const finishLabel = (studyMode: boolean): string => (studyMode ? QUESTIONS_LABEL : FINISH_LABEL);
