import type { Pool, PoolClient } from "pg";

import type { DoorGuidance } from "@/features/process/domain/guidance";
import { studyConfigSchema, type StudyConfig } from "@/features/study/contracts";
import type { LearningCondition } from "@/lib/permissions/learning";
import type { LearningTimeBudget } from "@/features/learning/time-budget";
import type { LearningAccess } from "@/server/auth/learning-decision";
import { nameBasedUuid } from "@/features/knowledge/graph/hash";
import { nodeSha256 } from "@/features/knowledge/graph/hash-node";

type Q = Pick<Pool | PoolClient, "query">;

export type LearningMode = "study" | "demo" | "preview";

export interface LearningContext {
  mode: LearningMode;
  condition: LearningCondition;
  contentVersion: string;
  sessionId: string | null;
  telemetrySessionId: string;
  appBuild: string;
  learningTime: LearningTimeBudget;
  guidance: DoorGuidance;
  contentUnderReview: boolean;
}

export class LearningContextUnavailableError extends Error {
  constructor(readonly reason: "no_review_snapshot" | "session_not_found" | "study_has_no_snapshot") {
    super(
      reason === "no_review_snapshot"
        ? "No review snapshot exists yet. Run `npm run dev:bootstrap` (or `npm run content:import`)."
        : reason === "session_not_found"
          ? "The study session no longer exists."
          : "The study has no content snapshot.",
    );
    this.name = "LearningContextUnavailableError";
  }
}

export interface StudySessionContextRow {
  sessionId: string;
  studyConfig: unknown;
  snapshotId: string | null;
  snapshotLabel: string | null;
  includesUnverified: boolean;
}

export interface PreviewContentRow {
  snapshotLabel: string;
  studyConfig: unknown;
  includesUnverified: boolean;
}

export interface LearningClockRow {
  startedAt: string | null;
  budgetSeconds: number | null;
  endsAt: string | null;
  endedAt: string | null;
  serverNow: string;
}

export interface LearningContextData {
  startLearningClock(sessionId: string): Promise<LearningClockRow>;
  findStudySession(sessionId: string): Promise<StudySessionContextRow | null>;
  findPreviewContent(): Promise<PreviewContentRow | null>;
}

export function pgLearningContextData(q: Q): LearningContextData {
  return {
    async findStudySession(sessionId) {
      const r = await q.query<{ session_id: string; config: unknown; snapshot_id: string | null; version_label: string | null; includes_unverified: boolean | null }>(
        `SELECT ss.id AS session_id, st.config, ss.snapshot_id, cs.version_label, cs.includes_unverified
           FROM study_sessions ss
           JOIN studies st ON st.id = ss.study_id
           LEFT JOIN content_snapshots cs ON cs.id = ss.snapshot_id
          WHERE ss.id = $1`,
        [sessionId],
      );
      const row = r.rows[0];
      return row ? { sessionId: row.session_id, studyConfig: row.config, snapshotId: row.snapshot_id, snapshotLabel: row.version_label, includesUnverified: row.includes_unverified === true } : null;
    },
    async startLearningClock(sessionId) {
      await q.query("UPDATE study_sessions SET learning_started_at = now() WHERE id = $1 AND learning_started_at IS NULL", [sessionId]);
      return readClock(q, sessionId);
    },
    async findPreviewContent() {
      const r = await q.query<{ version_label: string; config: unknown; includes_unverified: boolean }>(
        `SELECT s.version_label, st.config, s.includes_unverified
           FROM content_snapshots s
           LEFT JOIN LATERAL (SELECT config FROM studies WHERE is_demo AND snapshot_id = s.id ORDER BY created_at DESC, id DESC LIMIT 1) st ON true
          WHERE s.kind = 'review' AND NOT s.is_demo
          ORDER BY s.created_at DESC, s.id DESC
          LIMIT 1`,
      );
      const row = r.rows[0];
      return row ? { snapshotLabel: row.version_label, studyConfig: row.config ?? {}, includesUnverified: row.includes_unverified } : null;
    },
  };
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

async function readClock(q: Q, sessionId: string): Promise<LearningClockRow> {
  const r = await q.query<{ learning_started_at: Date | null; learning_budget_seconds: number | null; learning_ends_at: Date | null; learning_ended_at: Date | null; now: Date }>(
    "SELECT learning_started_at, learning_budget_seconds, learning_ends_at, learning_ended_at, now() AS now FROM study_sessions WHERE id = $1",
    [sessionId],
  );
  const row = r.rows[0];
  if (!row) throw new LearningContextUnavailableError("session_not_found");
  return {
    startedAt: iso(row.learning_started_at),
    budgetSeconds: row.learning_budget_seconds,
    endsAt: iso(row.learning_ends_at),
    endedAt: iso(row.learning_ended_at),
    serverNow: row.now.toISOString(),
  };
}

export class LearningFinishRefusedError extends Error {
  constructor() {
    super("The learning time budget has not run out and this study does not allow finishing early.");
    this.name = "LearningFinishRefusedError";
  }
}

export async function recordLearningEnded(q: Q, sessionId: string): Promise<LearningClockRow> {
  const r = await q.query<{ ended: boolean; allowed: boolean }>(
    `SELECT ss.learning_ended_at IS NOT NULL AS ended,
            (ss.learning_ends_at IS NULL OR now() >= ss.learning_ends_at
             OR coalesce((st.config #>> '{exposure,allowEarlyFinish}')::boolean, false)) AS allowed
       FROM study_sessions ss JOIN studies st ON st.id = ss.study_id WHERE ss.id = $1`,
    [sessionId],
  );
  const row = r.rows[0];
  if (!row) throw new LearningContextUnavailableError("session_not_found");
  if (!row.ended) {
    if (!row.allowed) throw new LearningFinishRefusedError();
    await q.query("UPDATE study_sessions SET learning_ended_at = LEAST(now(), learning_ends_at) WHERE id = $1 AND learning_ended_at IS NULL AND learning_started_at IS NOT NULL", [sessionId]);
  }
  return readClock(q, sessionId);
}

export function nonStudyTelemetrySessionId(kind: "demo" | "preview", id: string): string {
  return nameBasedUuid(nodeSha256, "telemetry-session", kind, id);
}

function configOf(raw: unknown): StudyConfig {
  const parsed = studyConfigSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : studyConfigSchema.parse({});
}

export function doorGuidanceOf(config: StudyConfig, time: LearningTimeBudget): DoorGuidance {
  const hint = config.guidance.cueEnabled ? (config.guidance.hintText ?? null) : null;
  const limitSeconds = time.endsAt !== null ? time.budgetSeconds : null;
  return {
    time: { limitMinutes: limitSeconds === null ? null : Math.round(limitSeconds / 60), earlyFinish: limitSeconds === null || time.allowEarlyFinish },
    hint,
    stallSeconds: hint === null ? null : config.guidance.stallSeconds,
  };
}

export async function resolveLearningContext(
  access: LearningAccess,
  deps: { data: LearningContextData; appBuild: string; now?: () => string },
): Promise<LearningContext> {
  if (access.kind === "participant") {
    const s = await deps.data.findStudySession(access.sessionId);
    if (!s) throw new LearningContextUnavailableError("session_not_found");
    if (!s.snapshotId || !s.snapshotLabel) throw new LearningContextUnavailableError("study_has_no_snapshot");
    const cfg = configOf(s.studyConfig);
    const clock = await deps.data.startLearningClock(s.sessionId);
    const learningTime: LearningTimeBudget = {
      mode: cfg.exposure.mode,
      budgetSeconds: clock.budgetSeconds,
      allowEarlyFinish: cfg.exposure.allowEarlyFinish,
      startedAt: clock.startedAt,
      endsAt: clock.endsAt,
      endedAt: clock.endedAt,
      serverNow: clock.serverNow,
      persisted: true,
    };
    return {
      mode: "study",
      condition: access.condition,
      contentVersion: s.snapshotLabel,
      sessionId: s.sessionId,
      telemetrySessionId: s.sessionId,
      learningTime,
      guidance: doorGuidanceOf(cfg, learningTime),
      contentUnderReview: s.includesUnverified,
      appBuild: deps.appBuild,
    };
  }

  const preview = await deps.data.findPreviewContent();
  if (!preview) throw new LearningContextUnavailableError("no_review_snapshot");
  const cfg = configOf(preview.studyConfig);
  const fixed = cfg.exposure.mode === "fixed_time" && cfg.exposure.minutes !== undefined;
  const learningTime: LearningTimeBudget = {
    mode: cfg.exposure.mode,
    budgetSeconds: fixed ? cfg.exposure.minutes! * 60 : null,
    allowEarlyFinish: cfg.exposure.allowEarlyFinish,
    startedAt: null,
    endsAt: null,
    endedAt: null,
    serverNow: deps.now?.() ?? new Date().toISOString(),
    persisted: false,
  };
  return {
    mode: access.kind === "demo" ? "demo" : "preview",
    condition: access.condition,
    contentVersion: preview.snapshotLabel,
    sessionId: null,
    telemetrySessionId: nonStudyTelemetrySessionId(access.kind === "demo" ? "demo" : "preview", access.kind === "demo" ? access.demoId : access.userId),
    learningTime,
    guidance: doorGuidanceOf(cfg, learningTime),
    contentUnderReview: preview.includesUnverified,
    appBuild: deps.appBuild,
  };
}
