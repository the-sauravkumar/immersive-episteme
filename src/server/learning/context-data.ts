import type { Pool, PoolClient } from "pg";

import type { DoorGuidance } from "@/features/process/domain/guidance";
import { studyConfigSchema, type StudyConfig } from "@/features/study/contracts";
import type { LearningCondition } from "@/lib/permissions/learning";
import type { LearningAccess } from "@/server/auth/learning-decision";
import { nameBasedUuid } from "@/features/knowledge/graph/hash";
import { nodeSha256 } from "@/features/knowledge/graph/hash-node";
import { stageTemplateSha256 } from "@/server/study/stage-templates";

type Q = Pick<Pool | PoolClient, "query">;

type LearningMode = "study" | "demo" | "preview";

export interface LearningContext {
  mode: LearningMode;
  condition: LearningCondition;
  contentVersion: string;
  sessionId: string | null;
  telemetrySessionId: string;
  appBuild: string;
  guidance: DoorGuidance;
  verifiedStageConcepts: readonly string[];
  snapshotId: string;
  photosShown: boolean;
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

interface StudySessionContextRow {
  sessionId: string;
  studyConfig: unknown;
  snapshotId: string | null;
  snapshotLabel: string | null;
  verifiedStageConcepts: string[];
}

interface PreviewContentRow {
  snapshotId: string;
  snapshotLabel: string;
  studyConfig: unknown;
  verifiedStageConcepts: string[];
}

export interface LearningClockRow {
  startedAt: string | null;
  budgetSeconds: number | null;
  endsAt: string | null;
  endedAt: string | null;
  serverNow: string;
}

export interface LearningContextData {
  startLearningClock(sessionId: string): Promise<void>;
  findStudySession(sessionId: string): Promise<StudySessionContextRow | null>;
  findPreviewContent(): Promise<PreviewContentRow | null>;
}

export function pgLearningContextData(q: Q): LearningContextData {
  return {
    async findStudySession(sessionId) {
      const r = await q.query<{ session_id: string; config: unknown; snapshot_id: string | null; version_label: string | null; verified_stages: string[] }>(
        `SELECT ss.id AS session_id, st.config, ss.snapshot_id, cs.version_label,
                (SELECT coalesce(array_agg(c->>'key' ORDER BY c->>'key'), '{}') FROM jsonb_array_elements(cs.payload->'concepts') c
                     WHERE c->>'type' = 'process_stage' AND c->>'verificationState' IN ('verified', 'published')) AS verified_stages
           FROM study_sessions ss
           JOIN studies st ON st.id = ss.study_id
           LEFT JOIN content_snapshots cs ON cs.id = ss.snapshot_id
          WHERE ss.id = $1`,
        [sessionId],
      );
      const row = r.rows[0];
      return row ? { sessionId: row.session_id, studyConfig: row.config, snapshotId: row.snapshot_id, snapshotLabel: row.version_label, verifiedStageConcepts: row.verified_stages } : null;
    },
    async startLearningClock(sessionId) {
      await q.query("UPDATE study_sessions SET learning_started_at = now(), template_sha256 = $2 WHERE id = $1 AND learning_started_at IS NULL", [sessionId, await stageTemplateSha256()]);
    },
    async findPreviewContent() {
      const r = await q.query<{ id: string; version_label: string; config: unknown; verified_stages: string[] }>(
        `SELECT s.id, s.version_label, st.config,
                (SELECT coalesce(array_agg(c->>'key' ORDER BY c->>'key'), '{}') FROM jsonb_array_elements(s.payload->'concepts') c
                     WHERE c->>'type' = 'process_stage' AND c->>'verificationState' IN ('verified', 'published')) AS verified_stages
           FROM content_snapshots s
           LEFT JOIN LATERAL (SELECT config FROM studies WHERE is_demo AND snapshot_id = s.id ORDER BY created_at DESC, id DESC LIMIT 1) st ON true
          WHERE s.kind = 'review' AND NOT s.is_demo
          ORDER BY (st.config IS NOT NULL) DESC, s.created_at DESC, s.id DESC
          LIMIT 1`,
      );
      const row = r.rows[0];
      return row ? { snapshotId: row.id, snapshotLabel: row.version_label, studyConfig: row.config ?? {}, verifiedStageConcepts: row.verified_stages } : null;
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

export async function recordLearningEnded(q: Q, sessionId: string): Promise<LearningClockRow> {
  const r = await q.query<{ ended: boolean }>("SELECT learning_ended_at IS NOT NULL AS ended FROM study_sessions WHERE id = $1", [sessionId]);
  const row = r.rows[0];
  if (!row) throw new LearningContextUnavailableError("session_not_found");
  if (!row.ended) {
    await q.query("UPDATE study_sessions SET learning_ended_at = LEAST(now(), learning_ends_at) WHERE id = $1 AND learning_ended_at IS NULL AND learning_started_at IS NOT NULL", [sessionId]);
  }
  return readClock(q, sessionId);
}

function nonStudyTelemetrySessionId(kind: "demo" | "preview", id: string): string {
  return nameBasedUuid(nodeSha256, "telemetry-session", kind, id);
}

function configOf(raw: unknown): StudyConfig {
  const parsed = studyConfigSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : studyConfigSchema.parse({});
}

export function doorGuidanceOf(config: StudyConfig): DoorGuidance {
  const hint = config.guidance.cueEnabled ? (config.guidance.hintText ?? null) : null;
  return {
    time: { limitMinutes: config.exposure.minutes ?? null },
    hint,
    stallSeconds: hint === null ? null : config.guidance.stallSeconds,
  };
}

export async function resolveLearningContext(
  access: LearningAccess,
  deps: { data: LearningContextData; appBuild: string },
): Promise<LearningContext> {
  if (access.kind === "participant") {
    const s = await deps.data.findStudySession(access.sessionId);
    if (!s) throw new LearningContextUnavailableError("session_not_found");
    if (!s.snapshotId || !s.snapshotLabel) throw new LearningContextUnavailableError("study_has_no_snapshot");
    const cfg = configOf(s.studyConfig);
    await deps.data.startLearningClock(s.sessionId);
    return {
      mode: "study",
      condition: access.condition,
      contentVersion: s.snapshotLabel,
      sessionId: s.sessionId,
      telemetrySessionId: s.sessionId,
      guidance: doorGuidanceOf(cfg),
      verifiedStageConcepts: s.verifiedStageConcepts,
      snapshotId: s.snapshotId,
      photosShown: cfg.figures.photos,
      appBuild: deps.appBuild,
    };
  }

  const preview = await deps.data.findPreviewContent();
  if (!preview) throw new LearningContextUnavailableError("no_review_snapshot");
  const cfg = configOf(preview.studyConfig);
  return {
    mode: access.kind === "demo" ? "demo" : "preview",
    condition: access.condition,
    contentVersion: preview.snapshotLabel,
    sessionId: null,
    telemetrySessionId: nonStudyTelemetrySessionId(access.kind === "demo" ? "demo" : "preview", access.kind === "demo" ? access.demoId : access.userId),
    guidance: doorGuidanceOf(cfg),
    verifiedStageConcepts: preview.verifiedStageConcepts,
    snapshotId: preview.snapshotId,
    photosShown: cfg.figures.photos,
    appBuild: deps.appBuild,
  };
}
