from __future__ import annotations

import unittest

from episteme_stats.data import build_table
from episteme_stats.hypotheses import hypothesis_report, long_rows, rating_values
from episteme_stats.mixed import Observation, correlation, fit_time_by_condition

GAIN = {"a": -0.1, "b": 0.2}


def bundle() -> dict:
    conditions = [{"condition_id": "ca", "code": "a"}, {"condition_id": "cb", "code": "b"}]
    sessions, scores, metrics, targets, responses = [], [], [], [], []
    battery = [{"assessment_id": "pre", "phase": "pre"}, {"assessment_id": "seq", "phase": "post"}, {"assessment_id": "seq-d", "phase": "follow_up"}, {"assessment_id": "place", "phase": "post"}, {"assessment_id": "place-d", "phase": "follow_up"}, {"assessment_id": "ident", "phase": "post"}, {"assessment_id": "common", "phase": "post"}]
    targets.append({"assessment_id": "ident", "item_key": "id.1", "object_key": "block"})
    for i in range(24):
        cond = "ca" if i % 2 == 0 else "cb"
        name = "a" if i % 2 == 0 else "b"
        sid, code = f"s{i}", f"P{i}"
        sessions.append({"session_id": sid, "participant_code": code, "condition_id": cond, "status": "completed", "period": 1, "non_experimental": False, "withdrawn": False, "excluded": False})
        pre = (i % 6) / 10
        base = 0.4 + 0.5 * pre + (i % 4) * 0.02
        row = lambda metric, assessment, value, version="1.0.0", details=None: {"session_id": sid, "assessment_id": assessment, "metric_name": metric, "metric_version": version, "value": value, "details": details or {}, "computed_at": "t", "pipeline_version": "p", "concept_map_id": None, "reference_map_id": None}
        scores.append(row("test.pre_test", "pre", pre))
        scores.append(row("test.sequence", "seq", base))
        scores.append(row("test.stage_placement", "place", base))
        scores.append(row("test.identification", "ident", base))
        scores.append(row("item.key_match", "ident", float(i % 3 == 0), details={"itemKey": "id.1"}))
        responses.append({"session_id": sid, "item_key": "common.mental_effort", "status": "answered", "raw": {"value": 3 + (i % 2) + (i % 3)}})
        responses.append({"session_id": sid, "item_key": "common.navigation_effort", "status": "answered", "raw": {"value": 2 + (i % 2) + (i % 3)}})
        if i < 22:
            scores.append(row("test.sequence", "seq-d", base + GAIN[name]))
            scores.append(row("test.stage_placement", "place-d", base + GAIN[name]))
        metrics.append({"session_id": sid, "metric_name": "walk.object_dwell_ms", "metric_version": "1", "value": 1.0, "details": {"byObject": {"block": 100.0 * (i % 3 == 0) + i}}, "computed_at": "t", "pipeline_version": "p"})
    return {"study": {"battery": battery}, "reproducibility": {}, "tables": {"conditions": conditions, "sessions": sessions, "derived_scores": scores, "derived_metrics": metrics, "test_item_targets": targets, "responses": responses}}


class MixedModelTests(unittest.TestCase):
    def test_recovers_the_time_by_condition_term_on_balanced_data(self) -> None:
        rows = []
        for i in range(30):
            cond = float(i % 2)
            pre = (i % 5) / 10
            person = ((i * 7) % 11 - 5) / 50
            noise = ((i * 3) % 7 - 3) / 200
            rows.append(Observation(f"p{i}", cond, 0.0, 0.5 + 0.1 * cond + 0.4 * pre + person + noise, pre))
            rows.append(Observation(f"p{i}", cond, 1.0, 0.5 + 0.1 * cond - 0.05 + 0.25 * cond + 0.4 * pre + person - noise, pre))
        fit = fit_time_by_condition(rows)
        self.assertAlmostEqual(fit["time_by_condition"], 0.25, delta=0.03)
        self.assertLess(fit["ci_low"], 0.25)
        self.assertGreater(fit["ci_high"], 0.25)
        self.assertLess(fit["p"], 0.001)
        self.assertGreater(fit["sigma2_participant"], fit["sigma2_residual"])

    def test_keeps_a_participant_who_missed_the_delayed_test(self) -> None:
        rows = [Observation(f"p{i}", float(i % 2), 0.0, 0.5 + i * 0.01, 0.1) for i in range(10)] + [Observation(f"p{i}", float(i % 2), 1.0, 0.4 + i * 0.01, 0.1) for i in range(6)]
        fit = fit_time_by_condition(rows)
        self.assertEqual((fit["n_observations"], fit["n_participants"]), (16, 10))

    def test_reports_too_few_observations(self) -> None:
        self.assertIn("note", fit_time_by_condition([Observation("p", 0.0, 0.0, 1.0, 0.0)]))


class PlanTests(unittest.TestCase):
    def test_a_test_score_takes_the_pre_test_as_its_covariate(self) -> None:
        table = build_table(bundle(), "test.sequence", phase="post", baseline_phase="pre", covariate_metric="test.pre_test")
        self.assertEqual(table.baseline_metric, "test.pre_test")
        self.assertEqual(len([r for r in table.rows if r.outcomes.get("baseline") is not None and r.outcomes.get("outcome") is not None]), 24)

    def test_builds_long_rows_with_every_score(self) -> None:
        rows = long_rows(bundle(), "test.sequence", "a", "b")
        self.assertEqual(len(rows), 46)
        self.assertEqual(len({r.participant for r in rows}), 24)

    def test_reports_each_hypothesis(self) -> None:
        report = hypothesis_report(bundle(), "a", "b")
        self.assertEqual([h["metric"] for h in report["H1"]], ["test.sequence", "test.stage_placement"])
        self.assertAlmostEqual(report["H1"][0]["immediate_vs_delayed"]["time_by_condition"], 0.3, delta=0.001)
        self.assertEqual(report["H2"]["metric"], "test.identification")
        self.assertEqual([h["metric"] for h in report["H3"]], ["common.mental_effort", "common.navigation_effort"])
        self.assertEqual(rating_values(bundle(), "common.mental_effort", "a")[:2], [3.0, 3.0 + 2])
        self.assertEqual(report["RQ3"]["dwell_vs_recall"]["n"], 24)
        self.assertGreater(report["RQ3"]["dwell_vs_recall"]["spearman"], 0.5)

    def test_correlation_needs_variation(self) -> None:
        self.assertIsNone(correlation([1.0, 1.0, 1.0, 1.0], [1.0, 2.0, 3.0, 4.0])["spearman"])


if __name__ == "__main__":
    unittest.main()
