import { z } from "zod";

export const LEARNING_PROGRESS_ENDPOINT = "/api/study/learning-progress";

const code = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/);

export const stageRefSchema = z.object({ traditionKey: code, stageKey: code, stageNumber: z.number().int().positive().max(1000) });
export type StageRef = z.infer<typeof stageRefSchema>;

export const learningProgressRequestSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("stage_entered"), stage: stageRefSchema }),
  z.object({ kind: z.literal("stage_left"), stage: stageRefSchema, activeMs: z.number().int().nonnegative().max(86_400_000) }),
  z.object({ kind: z.literal("finish") }),
]);
export type LearningProgressRequest = z.infer<typeof learningProgressRequestSchema>;

export type StageEntryOutcome =
  | { readonly ok: true; readonly persisted: boolean; readonly visitCount: number; readonly backStep: boolean; readonly complete: boolean; readonly unvisited: number }
  | { readonly ok: false; readonly reason: "stop_ahead" | "unknown_stop" | "not_learning" | "unavailable"; readonly expected: { readonly traditionKey: string; readonly stageKey: string } | null };

export type FinishOutcome =
  | { readonly ok: true; readonly next: string }
  | { readonly ok: false; readonly reason: "stages_unvisited" | "not_learning" | "unavailable"; readonly unvisited: readonly { readonly traditionKey: string; readonly stageKey: string; readonly stageNumber: number }[] };

export interface ObjectDwell {
  readonly objectKey: string;
  readonly dwellMs: number;
  readonly closestM: number;
}

type TelemetrySink = (type: string, input: { metadata: Record<string, unknown>; roomOrPageId?: string; target?: string }) => unknown;

let sink: TelemetrySink | null = null;

export function bindLearningTelemetry(next: TelemetrySink | null): void {
  sink = next;
}

export function unbindLearningTelemetry(bound: TelemetrySink): void {
  if (sink === bound) sink = null;
}

let openStopCloser: (() => void) | null = null;

export function registerOpenStop(close: () => void): () => void {
  openStopCloser = close;
  return () => {
    if (openStopCloser === close) openStopCloser = null;
  };
}

export function closeOpenStop(): void {
  openStopCloser?.();
}

const stagePage = (stage: Pick<StageRef, "traditionKey" | "stageKey">) => `stage:${stage.traditionKey}:${stage.stageKey}`;

let lastPost: Promise<unknown> = Promise.resolve();
let inFlight = 0;

async function send<T>(body: LearningProgressRequest, keepalive: boolean): Promise<T | null> {
  try {
    const response = await fetch(LEARNING_PROGRESS_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive, credentials: "same-origin" });
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function post<T>(body: LearningProgressRequest, keepalive = false): Promise<T | null> {
  inFlight += 1;
  const next = (inFlight === 1 ? send<T>(body, keepalive) : lastPost.then(() => send<T>(body, keepalive))).finally(() => {
    inFlight -= 1;
  });
  lastPost = next;
  return next;
}

export async function reportStageEntered(stage: StageRef): Promise<StageEntryOutcome> {
  const outcome = await post<StageEntryOutcome | { readonly error: string }>({ kind: "stage_entered", stage });
  if (outcome === null) return { ok: false, reason: "unavailable", expected: null };
  if ("error" in outcome) return { ok: false, reason: "not_learning", expected: null };
  if (outcome.ok) sink?.("stage_entered", { metadata: { ...stage, visitCount: outcome.visitCount, backStep: outcome.backStep }, roomOrPageId: stagePage(stage) });
  return outcome;
}

const wholeMs = (activeMs: number): number => Math.max(0, Math.round(activeMs));

export function logStageLeft(stage: StageRef, activeMs: number): void {
  sink?.("stage_left", { metadata: { ...stage, activeMs: wholeMs(activeMs) }, roomOrPageId: stagePage(stage) });
}

export async function sendStageLeft(stage: StageRef, activeMs: number): Promise<boolean> {
  return (await post({ kind: "stage_left", stage, activeMs: wholeMs(activeMs) }, true)) !== null;
}

export function reportSourceOpened(stage: StageRef): void {
  sink?.("source_opened", { metadata: { ...stage }, roomOrPageId: stagePage(stage) });
}

export function reportObjectDwell(stage: StageRef, dwell: ObjectDwell): void {
  sink?.("object_dwell", { metadata: { ...stage, objectKey: dwell.objectKey, dwellMs: Math.round(dwell.dwellMs), closestM: dwell.closestM }, roomOrPageId: stagePage(stage), target: dwell.objectKey });
}

export function reportPathSample(traditionKey: string, segment: string, points: readonly (readonly [number, number, number])[]): void {
  if (points.length > 0) sink?.("path_sampled", { metadata: { traditionKey, segment, points } });
}

export function reportViewpointChanges(stage: Pick<StageRef, "traditionKey" | "stageKey">, count: number): void {
  if (count > 0) sink?.("viewpoint_changed", { metadata: { traditionKey: stage.traditionKey, stageKey: stage.stageKey, count }, roomOrPageId: stagePage(stage) });
}

export function reportWrongTurn(stage: Pick<StageRef, "traditionKey" | "stageKey">): void {
  sink?.("wrong_turn", { metadata: { traditionKey: stage.traditionKey, stageKey: stage.stageKey }, roomOrPageId: stagePage(stage) });
}

export function reportMovement(stage: Pick<StageRef, "traditionKey" | "stageKey">, walkingMs: number, viewingMs: number): void {
  sink?.("movement_summary", { metadata: { traditionKey: stage.traditionKey, stageKey: stage.stageKey, walkingMs: Math.round(walkingMs), viewingMs: Math.round(viewingMs) }, roomOrPageId: stagePage(stage) });
}

export async function finishLearning(): Promise<FinishOutcome> {
  return (await post<FinishOutcome>({ kind: "finish" })) ?? { ok: false, reason: "unavailable", unvisited: [] };
}
