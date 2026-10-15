/**
 * Which sessions count as analysable experimental data: not excluded, not withdrawn, and not
 * from a demo / non-experimental study. Every analytics view states this filter.
 */
export interface AnalysableFlags {
  excluded: boolean;
  withdrawn: boolean;
  nonExperimental: boolean;
}

export function isAnalysable(s: AnalysableFlags): boolean {
  return !s.excluded && !s.withdrawn && !s.nonExperimental;
}

export function analysable<T extends AnalysableFlags>(rows: readonly T[]): T[] {
  return rows.filter(isAnalysable);
}

export const ANALYSIS_SCOPE_NOTE =
  "Counts exclude sessions flagged excluded or withdrawn. Sessions of demo or non-experimental studies are never experimental data.";
