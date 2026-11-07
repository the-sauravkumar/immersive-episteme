import { queryAll, type Q } from "../db";
import { listParityReports } from "./store";

export interface ContentParityRow {
  studyId: string;
  title: string;
  slug: string;
  status: string;
  isDemo: boolean;
  latest: {
    id: string;
    createdAt: string;
    passed: boolean;
    criticalFailures: number;
    warnings: number;
    checks: number;
    passedChecks: number;
    snapshotLabel: string | null;
  } | null;
}

export async function contentParityRows(q: Q, studies: readonly { id: string; title: string; slug: string; status: string; isDemo: boolean }[]): Promise<ContentParityRow[]> {
  return queryAll(
    q,
    studies.map((s) => async (): Promise<ContentParityRow> => {
      const [r] = await listParityReports(q, s.id, 1);
      return {
        studyId: s.id,
        title: s.title,
        slug: s.slug,
        status: s.status,
        isDemo: s.isDemo,
        latest: r
          ? {
              id: r.id,
              createdAt: r.createdAt,
              passed: r.report.passed,
              criticalFailures: r.report.criticalFailures,
              warnings: r.report.warnings,
              checks: r.report.checks.length,
              passedChecks: r.report.checks.filter((c) => c.passed).length,
              snapshotLabel: r.report.snapshotLabel,
            }
          : null,
      };
    }),
  );
}
