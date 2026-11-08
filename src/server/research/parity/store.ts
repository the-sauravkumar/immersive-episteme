import { conceptPhotosOf, createKnowledgeView, type ConceptPhoto } from "@/features/knowledge/read/view";
import { withStudyPhotos } from "@/features/process/domain/stage-template";
import { studyConfigSchema } from "@/features/study/contracts";
import { listSnapshotPhotoLinks } from "@/server/cms/media/service";
import { loadSnapshotPayload } from "@/server/knowledge/snapshot-store";
import { loadStageTemplates } from "@/server/study/stage-templates";

import { buildDoorViews, hashDoorFiles } from "./door-views";
import { runParityChecks, type ParityInput, type ParityReport } from "./engine";
import { audit, queryAll, ResearchActionError, type Actor, type Q } from "../db";

async function studyPhotosOf(q: Q, snapshotId: string | null, config: unknown): Promise<ConceptPhoto[]> {
  const settings = studyConfigSchema.safeParse(config ?? {});
  if (!snapshotId || (settings.success && !settings.data.figures.photos)) return [];
  return conceptPhotosOf(createKnowledgeView(await loadSnapshotPayload(q, snapshotId)), await listSnapshotPhotoLinks(q, snapshotId));
}

export async function loadParityInput(q: Q, studyId: string): Promise<ParityInput> {
  const s = await q.query<{
    id: string;
    slug: string;
    protocol_version: string;
    design: string;
    is_demo: boolean;
    config: unknown;
    snapshot_id: string | null;
    manifest_id: string | null;
  }>("SELECT id, slug, protocol_version, design, is_demo, config, snapshot_id, manifest_id FROM studies WHERE id = $1", [studyId]);
  const study = s.rows[0];
  if (!study) throw new ResearchActionError("Study not found");
  const [conditions, battery, snapshot, budgets] = await queryAll(q, [
    () => q.query<{ id: string; code: string; label: string; interface: string; config: Record<string, unknown> }>(
      "SELECT id, code, label, interface::text, config FROM study_conditions WHERE study_id = $1 ORDER BY position, code",
      [studyId],
    ),
    () => q.query<{ assessmentId: string; code: string; version: number; kind: string; phase: string; position: number; status: string; required: boolean }>(
      `SELECT sa.assessment_id AS "assessmentId", a.code, a.version, a.kind::text AS kind, sa.phase::text AS phase, sa.position, a.status::text AS status, sa.required
         FROM study_assessments sa JOIN assessments a ON a.id = sa.assessment_id
        WHERE sa.study_id = $1 ORDER BY sa.phase, sa.position`,
      [studyId],
    ),
    () => study.snapshot_id
      ? q.query<{ id: string; versionLabel: string; status: string; kind: string; isDemo: boolean }>(
          `SELECT id, version_label AS "versionLabel", status::text AS status, kind, is_demo AS "isDemo" FROM content_snapshots WHERE id = $1`,
          [study.snapshot_id],
        )
      : null,
    () => q.query<{ interface: string; learningBudgetSeconds: number | null }>(
      `SELECT DISTINCT sc.interface::text AS interface, ss.learning_budget_seconds AS "learningBudgetSeconds"
         FROM study_sessions ss JOIN study_conditions sc ON sc.id = ss.condition_id
        WHERE ss.study_id = $1 AND ss.learning_started_at IS NOT NULL`,
      [studyId],
    ),
  ]);
  const photos = await studyPhotosOf(q, study.snapshot_id, study.config);
  const templates = withStudyPhotos(await loadStageTemplates(), photos);
  const doors = buildDoorViews(templates);
  return {
    study: {
      id: study.id,
      slug: study.slug,
      protocolVersion: study.protocol_version,
      design: study.design,
      isDemo: study.is_demo,
      config: study.config,
      snapshotId: study.snapshot_id,
      manifestId: study.manifest_id,
      conditions: conditions.rows,
      battery: battery.rows,
    },
    snapshot: snapshot?.rows[0] ?? null,
    templates,
    doors,
    fileHashes: await hashDoorFiles(doors, Object.fromEntries(photos.map((photo) => [photo.src, photo.sha256]))),
    sessionBudgets: budgets.rows,
  };
}

export async function generateParityReport(q: Q, studyId: string): Promise<ParityReport> {
  return runParityChecks(await loadParityInput(q, studyId));
}

export interface StoredParityReport {
  id: string;
  createdAt: string;
  reportSha256: string;
  report: ParityReport;
}

export async function runAndStoreParityReport(q: Q, studyId: string, actor: Actor | null): Promise<{ id: string | null; report: ParityReport; reportSha256: string | null }> {
  const report = await generateParityReport(q, studyId);
  if (!report.snapshotId) return { id: null, report, reportSha256: null };
  const isDemo = await q.query<{ is_demo: boolean }>("SELECT is_demo FROM content_snapshots WHERE id = $1", [report.snapshotId]);
  const r = await q.query<{ id: string; report_sha256: string }>(
    `INSERT INTO parity_reports (snapshot_id, spatial_manifest_id, generator_version, passed, checks, report, is_demo, created_by)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8) RETURNING id, report_sha256`,
    [
      report.snapshotId,
      report.manifestId,
      report.generatorVersion,
      report.passed,
      JSON.stringify(report.checks.map((c) => ({ id: c.id, label: c.label, passed: c.passed, details: { severity: c.severity, issues: c.issues.length } }))),
      JSON.stringify(report),
      isDemo.rows[0]?.is_demo ?? false,
      actor?.userId ?? null,
    ],
  );
  const row = r.rows[0]!;
  await audit(q, actor, "parity.run", "study", studyId, { after: { parityReportId: row.id, passed: report.passed, criticalFailures: report.criticalFailures, inputSha256: report.inputSha256 } });
  return { id: row.id, report, reportSha256: row.report_sha256 };
}

export async function listParityReports(q: Q, studyId: string, limit = 20): Promise<StoredParityReport[]> {
  const r = await q.query<StoredParityReport>(
    `SELECT id, to_json(created_at)#>>'{}' AS "createdAt", report_sha256 AS "reportSha256", report
       FROM parity_reports WHERE report->>'studyId' = $1 ORDER BY created_at DESC, id DESC LIMIT $2`,
    [studyId, limit],
  );
  return r.rows;
}

export async function getParityReport(q: Q, id: string): Promise<StoredParityReport | null> {
  const r = await q.query<StoredParityReport>(
    `SELECT id, to_json(created_at)#>>'{}' AS "createdAt", report_sha256 AS "reportSha256", report FROM parity_reports WHERE id = $1`,
    [id],
  );
  return r.rows[0] ?? null;
}
