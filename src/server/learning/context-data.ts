/**
 * Pure resolution of the learning context, plus its database port. Not `server-only`, so the
 * integration tests can run it; pages call `getLearningContext()` in ./context.ts.
 */
import type { Pool, PoolClient } from "pg";

import { studyConfigSchema } from "@/features/study/contracts";
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
  /** The immutable snapshot every knowledge read must use (read-model functions take it). */
  snapshotId: string;
  /** Snapshot version label: send as telemetry `contentVersion`. */
  contentVersion: string;
  /** Spatial manifest for the immersive condition, or null (2D-only study, or none compiled yet). */
  manifestId: string | null;
  /** study_sessions.id in study mode; null for demo and preview. */
  sessionId: string | null;
  /** Pseudonymous participant code (never a name or email); null outside study mode. */
  participantPseudonym: string | null;
  studyId: string | null;
  /** True for demo and preview, and for sessions of a demo / non-experimental study. */
  nonExperimental: boolean;
  /** True when the snapshot holds content no curator has verified: pages must say so. */
  unverifiedContent: boolean;
  /** Tradition slugs the learner should see (study config; for demo/preview the demo study's). */
  traditionSlugs: string[];
  features: { search: boolean };
  /**
   * Session id for the telemetry client: the study session id in study mode; otherwise a
   * stable name-based uuid per demo cookie / staff user (the server never stores those events).
   */
  telemetrySessionId: string;
  /** Build stamp for telemetry (`appBuild`). */
  appBuild: string;
  /**
   * The learning-phase time budget, identical for both conditions (study config exposure). In
   * study mode the server stamps the start on first resolution (set once) and owns start/end;
   * use `useLearningTimeBudget(ctx.learningTime)` on the client. Not a learning outcome.
   */
  learningTime: LearningTimeBudget;
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
  participantCode: string;
  studyId: string;
  studyIsDemo: boolean;
  studyConfig: unknown;
  snapshotId: string | null;
  snapshotLabel: string | null;
  includesUnverified: boolean;
  manifestId: string | null;
}

export interface PreviewContentRow {
  snapshotId: string;
  snapshotLabel: string;
  manifestId: string | null;
  traditionSlugs: string[];
  studyConfig: unknown;
}

export interface LearningClockRow {
  startedAt: string | null;
  budgetSeconds: number | null;
  endsAt: string | null;
  endedAt: string | null;
  serverNow: string;
}

export interface LearningContextData {
  /** Stamps learning_started_at once (no-op afterwards) and returns the clock with the DB time. */
  startLearningClock(sessionId: string): Promise<LearningClockRow>;
  findStudySession(sessionId: string): Promise<StudySessionContextRow | null>;
  /** Newest real review snapshot, with the manifest and traditions of the demo study pinned to it (if any). */
  findPreviewContent(): Promise<PreviewContentRow | null>;
}

export function pgLearningContextData(q: Q): LearningContextData {
  return {
    async findStudySession(sessionId) {
      const r = await q.query<{
        session_id: string; code: string; study_id: string; is_demo: boolean; config: unknown; snapshot_id: string | null;
        version_label: string | null; includes_unverified: boolean | null; manifest_id: string | null;
      }>(
        `SELECT ss.id AS session_id, p.code, st.id AS study_id, st.is_demo, st.config, ss.snapshot_id, cs.version_label,
                cs.includes_unverified, ss.manifest_id
           FROM study_sessions ss
           JOIN participants p ON p.id = ss.participant_id
           JOIN studies st ON st.id = ss.study_id
           LEFT JOIN content_snapshots cs ON cs.id = ss.snapshot_id
          WHERE ss.id = $1`,
        [sessionId],
      );
      const row = r.rows[0];
      if (!row) return null;
      return {
        sessionId: row.session_id,
        participantCode: row.code,
        studyId: row.study_id,
        studyIsDemo: row.is_demo,
        studyConfig: row.config,
        snapshotId: row.snapshot_id,
        snapshotLabel: row.version_label,
        includesUnverified: row.includes_unverified ?? false,
        manifestId: row.manifest_id,
      };
    },
    async startLearningClock(sessionId) {
      await q.query("UPDATE study_sessions SET learning_started_at = now() WHERE id = $1 AND learning_started_at IS NULL", [sessionId]);
      return readClock(q, sessionId);
    },
    async findPreviewContent() {
      const r = await q.query<{ id: string; version_label: string; manifest_id: string | null; config: unknown; traditions: string[] | null }>(
        `SELECT s.id, s.version_label, st.manifest_id, st.config,
                (SELECT m.traditions FROM spatial_manifests m WHERE m.id = st.manifest_id) AS traditions
           FROM content_snapshots s
           LEFT JOIN LATERAL (
             SELECT manifest_id, config FROM studies
              WHERE is_demo AND snapshot_id = s.id
              ORDER BY created_at DESC, id DESC LIMIT 1
           ) st ON true
          WHERE s.kind = 'review' AND NOT s.is_demo
          ORDER BY s.created_at DESC, s.id DESC
          LIMIT 1`,
      );
      const row = r.rows[0];
      if (!row) return null;
      let manifestId = row.manifest_id;
      let traditions = row.traditions ?? [];
      if (!manifestId) {
        // No demo study yet: the newest valid manifest compiled from this snapshot, if any.
        const m = await q.query<{ id: string; traditions: string[] }>(
          "SELECT id, traditions FROM spatial_manifests WHERE snapshot_id = $1 AND status IN ('valid', 'published') ORDER BY created_at DESC, id DESC LIMIT 1",
          [row.id],
        );
        manifestId = m.rows[0]?.id ?? null;
        traditions = m.rows[0]?.traditions ?? [];
      }
      return { snapshotId: row.id, snapshotLabel: row.version_label, manifestId, traditionSlugs: traditions, studyConfig: row.config ?? {} };
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

/**
 * Records the end of the learning phase (set once; server time). Refused before the budget runs
 * out unless the study config allows an early finish. For the study engine (server action).
 */
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
    await q.query("UPDATE study_sessions SET learning_ended_at = now() WHERE id = $1 AND learning_ended_at IS NULL AND learning_started_at IS NOT NULL", [sessionId]);
  }
  return readClock(q, sessionId);
}

/** Stable uuid for non-study telemetry (demo cookie id or staff user id); never stored. */
export function nonStudyTelemetrySessionId(kind: "demo" | "preview", id: string): string {
  return nameBasedUuid(nodeSha256, "telemetry-session", kind, id);
}

/**
 * Builds the learning context for an access decision that the learning guard already allowed.
 * Study mode reads the session's pinned snapshot and manifest (which the database forces to equal
 * the study's); demo and preview read the newest review snapshot and are always non-experimental.
 */
export async function resolveLearningContext(
  access: LearningAccess,
  deps: { data: LearningContextData; appBuild: string; now?: () => string },
): Promise<LearningContext> {
  if (access.kind === "participant") {
    const s = await deps.data.findStudySession(access.sessionId);
    if (!s) throw new LearningContextUnavailableError("session_not_found");
    if (!s.snapshotId || !s.snapshotLabel) throw new LearningContextUnavailableError("study_has_no_snapshot");
    const config = studyConfigSchema.safeParse(s.studyConfig);
    const cfg = config.success ? config.data : studyConfigSchema.parse({});
    return {
      mode: "study",
      condition: access.condition,
      snapshotId: s.snapshotId,
      contentVersion: s.snapshotLabel,
      manifestId: s.manifestId,
      sessionId: s.sessionId,
      participantPseudonym: s.participantCode,
      studyId: s.studyId,
      nonExperimental: s.studyIsDemo || cfg.nonExperimental,
      unverifiedContent: s.includesUnverified,
      traditionSlugs: cfg.traditionSlugs,
      features: { search: cfg.searchEnabled },
      telemetrySessionId: s.sessionId,
      learningTime: await (async () => {
        const clock = await deps.data.startLearningClock(s.sessionId);
        return {
          mode: cfg.exposure.mode,
          budgetSeconds: clock.budgetSeconds,
          allowEarlyFinish: cfg.exposure.allowEarlyFinish,
          startedAt: clock.startedAt,
          endsAt: clock.endsAt,
          endedAt: clock.endedAt,
          serverNow: clock.serverNow,
          persisted: true,
        };
      })(),
      appBuild: deps.appBuild,
    };
  }

  const preview = await deps.data.findPreviewContent();
  if (!preview) throw new LearningContextUnavailableError("no_review_snapshot");
  const cfg = studyConfigSchema.safeParse(preview.studyConfig);
  return {
    mode: access.kind === "demo" ? "demo" : "preview",
    condition: access.condition,
    snapshotId: preview.snapshotId,
    contentVersion: preview.snapshotLabel,
    manifestId: preview.manifestId,
    sessionId: null,
    participantPseudonym: null,
    studyId: null,
    nonExperimental: true,
    // Review snapshots are by definition not curator-verified.
    unverifiedContent: true,
    traditionSlugs: cfg.success && cfg.data.traditionSlugs.length > 0 ? cfg.data.traditionSlugs : preview.traditionSlugs,
    // Demo and preview show every affordance a study could enable.
    features: { search: true },
    telemetrySessionId: nonStudyTelemetrySessionId(access.kind === "demo" ? "demo" : "preview", access.kind === "demo" ? access.demoId : access.userId),
    // Same budget rule as a study (demo study config), but nothing is stored: the client counts
    // from serverNow.
    learningTime: (() => {
      const exposure = cfg.success ? cfg.data.exposure : { mode: "self_paced" as const, minutes: undefined, allowEarlyFinish: false };
      const fixed = exposure.mode === "fixed_time" && exposure.minutes !== undefined;
      return {
        mode: exposure.mode,
        budgetSeconds: fixed ? exposure.minutes! * 60 : null,
        allowEarlyFinish: exposure.allowEarlyFinish,
        startedAt: null,
        endsAt: null,
        endedAt: null,
        serverNow: deps.now?.() ?? new Date().toISOString(),
        persisted: false,
      };
    })(),
    appBuild: deps.appBuild,
  };
}
