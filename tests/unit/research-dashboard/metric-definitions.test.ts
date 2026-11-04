/**
 * The dashboard's definitions table: every citation is verbatim in docs/research/study-decisions.md
 * (whitespace-normalised), every metric shown has a definition, versions match the computing code.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { HYPOTHESES, METRIC_DEFINITIONS, metricDefinition, metricRole, PRE_TEST_COVARIATE, PRIMARY_OUTCOME, PRIMARY_OUTCOMES, SECONDARY_OUTCOMES } from "../../../src/features/research/metric-definitions";
import { SCALES } from "../../../src/features/research/scale-scores";
import { RUBRIC_METRIC } from "../../../src/server/assessment/scoring";
import { MAP_METRIC, SECONDARY_METRICS } from "../../../src/server/research/dashboard";
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
    for (const k of [MAP_METRIC, `${MAP_METRIC}.change`, ...SECONDARY_METRICS, ...SCALES.map((s) => s.name), "assessment.key_match_total", "rubric.rating.mean"]) {
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

  it("follows H1 to H3: sequence and association primary, the rest of section 8 secondary, the pre-test the covariate", () => {
    expect(PRIMARY_OUTCOME).toMatchObject({ metric: "test.sequence", phase: "post", delayedPhase: "follow_up", covariate: { metric: "test.pre_test", phase: "pre" }, model: "ANCOVA" });
    expect([...PRIMARY_OUTCOMES]).toEqual(["test.sequence", "test.stage_placement"]);
    for (const m of PRIMARY_OUTCOMES) expect(metricRole(m)).toBe("primary");
    for (const m of SECONDARY_OUTCOMES) expect(metricRole(m)).toBe("secondary");
    expect(HYPOTHESES.map((h) => h.id)).toEqual(["H1", "H2", "H3"]);
    expect(HYPOTHESES[1]!.metrics).toEqual(["test.identification"]);
    expect(HYPOTHESES[2]!.metrics).toEqual(["common.mental_effort", "common.navigation_effort"]);
    for (const key of [...PRIMARY_OUTCOMES, ...SECONDARY_OUTCOMES, "test.pre_test"]) expect(metricDefinition(key).key).toBe(key);
    for (const m of ["cmap.recall.dl.change", "cmap.jaccard.dl", "nav.path_length", "time.exposure_total_ms", "sus.score", "test.pre_test", "walk.wrong_turns"]) expect(metricRole(m), m).toBe("exploratory");
    for (const d of METRIC_DEFINITIONS) expect(d.role, d.key).toBe(metricRole(d.key));
  });

  it("puts the roles in the export data dictionary, primary first, from the one shared table", () => {
    const roles = exportMetricRoles(["cmap.jaccard.dl", "cmap.recall.dl", "nav.path_length"]);
    expect(roles.primaryOutcome.metric).toBe("test.sequence");
    expect(roles.hypotheses).toBe(HYPOTHESES);
    expect(roles.roles.slice(0, PRIMARY_OUTCOMES.length + SECONDARY_OUTCOMES.length).map((r) => r.metric)).toEqual([...PRIMARY_OUTCOMES, ...SECONDARY_OUTCOMES]);
    expect(roles.roles.find((r) => r.metric === "cmap.jaccard.dl")?.role).toBe("exploratory");
    expect(roles.roles.find((r) => r.metric === "nav.path_length")?.role).toBe("exploratory");
  });

  it("analysis/episteme_stats falls back to the same rule", () => {
    const py = readFileSync(new URL("../../../analysis/episteme_stats/roles.py", import.meta.url), "utf8");
    const listed = (name: string) => new RegExp(`${name} = \\(([^)]*)\\)`).exec(py)![1]!.match(/"([^"]+)"/g)!.map((x) => x.slice(1, -1));
    expect(listed("SECONDARY_OUTCOMES")).toEqual([...SECONDARY_OUTCOMES]);
    expect(listed("PRIMARY_OUTCOMES")).toEqual([...PRIMARY_OUTCOMES]);
    expect(py).toContain(`PRE_TEST_COVARIATE = {"metric": "${PRE_TEST_COVARIATE.metric}", "phase": "${PRE_TEST_COVARIATE.phase}"}`);
  });
});
