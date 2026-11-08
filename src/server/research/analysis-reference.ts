import type { Q } from "./db";

export type AnalysisReferenceBasis = "locked" | "provisional";

export interface AnalysisReference {
  assessmentId: string;
  referenceMapId: string;
  version: number;
  basis: AnalysisReferenceBasis;
}

export const ANALYSIS_REFERENCES_SQL = `
  SELECT DISTINCT ON (a.id) a.id AS assessment_id, rm.id AS reference_map_id, rm.version,
         CASE WHEN rm.status = 'locked' THEN 'locked' ELSE 'provisional' END AS basis
    FROM studies st
    JOIN study_assessments sa ON sa.study_id = st.id
    JOIN assessments a ON a.id = sa.assessment_id AND a.kind = 'reconstruction'
    JOIN reference_maps rm ON rm.assessment_id = a.id AND rm.adjudicated_at IS NOT NULL
   WHERE st.id = $1
     AND (rm.snapshot_id IS NULL OR rm.snapshot_id = st.snapshot_id)
   ORDER BY a.id, (rm.status = 'locked') DESC, rm.version DESC`;

export async function analysisReferences(q: Q, studyId: string): Promise<AnalysisReference[]> {
  const r = await q.query<{ assessment_id: string; reference_map_id: string; version: number; basis: AnalysisReferenceBasis }>(ANALYSIS_REFERENCES_SQL, [studyId]);
  return r.rows.map((x) => ({ assessmentId: x.assessment_id, referenceMapId: x.reference_map_id, version: Number(x.version), basis: x.basis }));
}
