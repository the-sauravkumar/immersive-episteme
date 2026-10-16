/**
 * The study's analysis reference map: ONE reference map per reconstruction assessment of a study,
 * the only one whose concept-map scores the dashboard, the Analytics page and the Python analysis
 * read (final review scoring-04).
 *
 * Why: derived_scores keeps a map's scores against every reference it was scored with
 * (derived_scores_uq includes reference_map_id), allocation scores the pre map against one
 * reference, and the scoring console can score against any finalised one. Taking "the latest
 * computed_at" per map could therefore pair a pre-test recall over one expected-edge set with a
 * post-test recall over another, which breaks D2's rule of one denominator for every participant
 * and occasion and invalidates the ANCOVA.
 *
 * The rule, the same for both conditions and every participant:
 *  1. the map activation pinned for stratification (`allocation.stratifyBy.referenceMapId`,
 *     DR-031), when it belongs to this assessment; allocation already scores against it;
 *  2. otherwise the newest LOCKED map of the assessment (bound to no snapshot or the study's);
 *  3. otherwise, before any map is locked, the newest finalised (adjudicated) map, labelled
 *     "provisional" so a report says the reference may still change.
 * Scores are also read at the scoring library's current metric version only, so a rescore after a
 * definition change never mixes with the old values.
 */
import type { Q } from "./db";

export type AnalysisReferenceBasis = "pinned" | "locked" | "provisional";

export interface AnalysisReference {
  assessmentId: string;
  referenceMapId: string;
  version: number;
  basis: AnalysisReferenceBasis;
}

/**
 * SQL for the analysis references of study `$1`, one row per reconstruction assessment of its
 * battery: (assessment_id, reference_map_id, version, basis). Use as a CTE and LEFT JOIN it on
 * the score's assessment_id, then require `ds.reference_map_id IS NOT DISTINCT FROM ar.reference_map_id`.
 */
export const ANALYSIS_REFERENCES_SQL = `
  SELECT DISTINCT ON (a.id) a.id AS assessment_id, rm.id AS reference_map_id, rm.version,
         CASE WHEN rm.id::text = st.config #>> '{allocation,stratifyBy,referenceMapId}' THEN 'pinned'
              WHEN rm.status = 'locked' THEN 'locked' ELSE 'provisional' END AS basis
    FROM studies st
    JOIN study_assessments sa ON sa.study_id = st.id
    JOIN assessments a ON a.id = sa.assessment_id AND a.kind = 'reconstruction'
    JOIN reference_maps rm ON rm.assessment_id = a.id AND rm.adjudicated_at IS NOT NULL
   WHERE st.id = $1
     AND (rm.snapshot_id IS NULL OR rm.snapshot_id = st.snapshot_id OR rm.id::text = st.config #>> '{allocation,stratifyBy,referenceMapId}')
   ORDER BY a.id, (rm.id::text = coalesce(st.config #>> '{allocation,stratifyBy,referenceMapId}', '')) DESC, (rm.status = 'locked') DESC, rm.version DESC`;

export async function analysisReferences(q: Q, studyId: string): Promise<AnalysisReference[]> {
  const r = await q.query<{ assessment_id: string; reference_map_id: string; version: number; basis: AnalysisReferenceBasis }>(ANALYSIS_REFERENCES_SQL, [studyId]);
  return r.rows.map((x) => ({ assessmentId: x.assessment_id, referenceMapId: x.reference_map_id, version: Number(x.version), basis: x.basis }));
}
