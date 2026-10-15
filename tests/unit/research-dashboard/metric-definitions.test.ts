/**
 * The dashboard's definitions table: every citation is verbatim in docs/research/study-decisions.md
 * (whitespace-normalised), every metric shown has a definition, versions match the computing code.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { METRIC_DEFINITIONS, metricDefinition, metricRole, PRIMARY_OUTCOME, SECONDARY_OUTCOMES } from "../../../src/features/research/metric-definitions";
import { SCALES } from "../../../src/features/research/scale-scores";
import { RUBRIC_METRIC } from "../../../src/server/assessment/scoring";
import { PRIMARY_METRIC, SECONDARY_METRICS } from "../../../src/server/research/dashboard";
import { DASHBOARD_TABLE_NAMES, DASHBOARD_TABLES, exportMetricRoles } from "../../../src/server/research/exports/dictionary";
import { KEY_MATCH_TOTAL_METRIC } from "../../../src/server/study/engine";

const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const decisions = norm(readFileSync(new URL("../../../docs/research/study-decisions.md", import.meta.url), "utf8"));

describe("metric definitions", () => {
  it("quotes every citation verbatim from study-decisions.md, with its locator", () => {
    const cited = METRIC_DEFINITIONS.filter((d) => d.citation);
    expect(cited.length).toBeGreaterThan(5);
    for (const d of cited) {
      expect(decisions, `${d.key} quote`).toContain(norm(d.citation!.quote));
      expect(decisions, `${d.key} locator`).toContain(norm(d.citation!.locator));
    }
  });

  it("says Project definition where there is no citation", () => {
    for (const d of METRIC_DEFINITIONS.filter((x) => !x.citation)) expect(d.note, d.key).toBe("Project definition.");
  });

  it("covers every metric the dashboard shows, with unique keys", () => {
    const keys = METRIC_DEFINITIONS.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of [PRIMARY_METRIC, `${PRIMARY_METRIC}.change`, ...SECONDARY_METRICS, ...SCALES.map((s) => s.name), "assessment.key_match_total", "rubric.rating.mean"]) {
      expect(() => metricDefinition(k)).not.toThrow();
    }
  });

  it("pins the versions of server-side metrics", () => {
    expect(metricDefinition("assessment.key_match_total").version).toBe(KEY_MATCH_TOTAL_METRIC.version);
    expect(metricDefinition("rubric.rating.mean").version).toBe(RUBRIC_METRIC.version);
  });

  it("documents every dashboard CSV table in the data dictionary", () => {
    expect(DASHBOARD_TABLES.map((t) => t.name).sort()).toEqual([...DASHBOARD_TABLE_NAMES].sort());
  });

  it("marks the preregistered primary outcome, the D2 secondary outcomes in order, and everything else exploratory", () => {
    expect(PRIMARY_OUTCOME).toMatchObject({ metric: "cmap.recall.dl", phase: "post", covariate: { metric: "cmap.recall.dl", phase: "pre" } });
    expect([...SECONDARY_OUTCOMES]).toEqual(["cmap.recall.du", "cmap.precision.dl", "cmap.edges_drawn", "cmap.incorrect_relationships", "cmap.f1.dl", "cmap.cross_category.valid_normalised", "cmap.valid_relationships"]);
    expect(metricRole("cmap.recall.dl")).toBe("primary");
    for (const m of SECONDARY_OUTCOMES) expect(metricRole(m)).toBe("secondary");
    for (const m of ["cmap.recall.dl.change", "cmap.jaccard.dl", "cmap.causal_chain_depth", "nav.path_length", "time.exposure_total_ms", "sus.score"]) expect(metricRole(m), m).toBe("exploratory");
    for (const d of METRIC_DEFINITIONS) expect(d.role, d.key).toBe(metricRole(d.key));
  });

  it("puts the roles in the export data dictionary, primary first, from the one shared table", () => {
    const roles = exportMetricRoles(["cmap.jaccard.dl", "cmap.recall.dl", "nav.path_length"]);
    expect(roles.primaryOutcome.metric).toBe("cmap.recall.dl");
    expect(roles.roles.slice(0, 1 + SECONDARY_OUTCOMES.length).map((r) => r.metric)).toEqual(["cmap.recall.dl", ...SECONDARY_OUTCOMES]);
    expect(roles.roles.find((r) => r.metric === "cmap.jaccard.dl")?.role).toBe("exploratory");
    expect(roles.roles.find((r) => r.metric === "nav.path_length")?.role).toBe("exploratory");
  });

  it("analysis/episteme_stats falls back to the same D2 rule", () => {
    const py = readFileSync(new URL("../../../analysis/episteme_stats/roles.py", import.meta.url), "utf8");
    const secondary = /SECONDARY_OUTCOMES = \(([^)]*)\)/.exec(py)![1]!.match(/"([^"]+)"/g)!.map((x) => x.slice(1, -1));
    expect(secondary).toEqual([...SECONDARY_OUTCOMES]);
    expect(py).toContain(`"metric": "${PRIMARY_OUTCOME.metric}", "phase": "${PRIMARY_OUTCOME.phase}"`);
  });
});
