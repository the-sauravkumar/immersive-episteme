"""Tests for analysis/episteme_stats (stdlib unittest).

Run from the analysis directory:
    cd analysis && python -B -m unittest discover -s tests
"""

from __future__ import annotations

import json
import math
import unittest
from pathlib import Path

import numpy as np
from scipy import stats

from episteme_stats.adjust import ancova
from episteme_stats.bundle import canonical_hash, canonical_json, js_number, verify_bundle
from episteme_stats.compare import compare_groups, hedges_g
from episteme_stats.data import AnalysisTable, SessionRow, build_table, values
from episteme_stats.describe import describe
from episteme_stats.power import PLANNED_SAMPLE_FACTS, n_for_power, power_two_sample

FIXTURES = Path(__file__).parent / "fixtures"


class PowerTests(unittest.TestCase):
    def test_reproduces_the_planned_sample_facts(self) -> None:
        # docs/research/technical-requirements.md §4: power at 20 per group and n for 80%.
        for d, _src, power20, n80 in PLANNED_SAMPLE_FACTS:
            self.assertAlmostEqual(round(power_two_sample(d, 20), 3), power20, places=3, msg=f"d={d}")
            self.assertEqual(n_for_power(d, 0.80), n80, msg=f"d={d}")

    def test_power_is_alpha_under_the_null(self) -> None:
        self.assertAlmostEqual(power_two_sample(0.0, 30), 0.05, places=6)


class CanonicalJsonTests(unittest.TestCase):
    def test_matches_the_server_canonical_form_and_hash(self) -> None:
        cases = json.loads((FIXTURES / "canonical.json").read_text(encoding="utf-8"))
        for c in cases:
            self.assertEqual(canonical_json(c["value"]), c["json"])
            self.assertEqual(canonical_hash(c["value"]), c["sha256"])

    def test_javascript_number_formatting(self) -> None:
        for x, s in [(0.1, "0.1"), (1e-7, "1e-7"), (1e-6, "0.000001"), (1e21, "1e+21"), (1e20, "100000000000000000000"), (-2.5, "-2.5"), (7000, "7000"), (0.0, "0")]:
            self.assertEqual(js_number(x), s)


class CompareTests(unittest.TestCase):
    a = [3.0, 4.0, 5.0, 4.5, 3.5, 4.2, 3.9, 4.8]
    b = [4.1, 5.2, 5.9, 5.0, 4.6, 5.5, 4.9, 6.1]

    def test_welch_and_effect_size_agree_with_reference_formulas(self) -> None:
        r = compare_groups(self.a, self.b)
        ref = stats.ttest_ind(self.b, self.a, equal_var=False)
        self.assertAlmostEqual(r["welch_t"], float(ref.statistic), places=10)
        self.assertAlmostEqual(r["welch_p"], float(ref.pvalue), places=10)
        sp = math.sqrt((np.var(self.a, ddof=1) * 7 + np.var(self.b, ddof=1) * 7) / 14)
        d = (np.mean(self.b) - np.mean(self.a)) / sp
        self.assertAlmostEqual(r["hedges_g"], d * (1 - 3 / (4 * 16 - 9)), places=10)
        self.assertLess(r["hedges_g_ci_low_exact"], r["hedges_g"])
        self.assertGreater(r["hedges_g_ci_high_exact"], r["hedges_g"])
        self.assertLess(r["difference_ci_low"], r["mean_difference"])
        self.assertEqual(r, compare_groups(self.a, self.b))  # seeded bootstrap: reproducible

    def test_too_small_groups_are_reported_not_computed(self) -> None:
        self.assertIn("note", compare_groups([1.0], [2.0, 3.0]))

    def test_hedges_g_sign(self) -> None:
        self.assertLess(hedges_g(self.b, self.a)[0], 0)


class AncovaTests(unittest.TestCase):
    def test_recovers_a_known_adjusted_difference(self) -> None:
        rng = np.random.default_rng(1)
        rows = []
        for i in range(60):
            cond = "conventional" if i % 2 == 0 else "immersive"
            pre = float(rng.normal(10, 2))
            post = 2.0 + 0.8 * pre + (1.5 if cond == "immersive" else 0.0) + float(rng.normal(0, 0.5))
            rows.append(SessionRow(f"s{i}", f"P{i}", cond, "completed", {"outcome": post, "baseline": pre}))
        t = AnalysisTable(rows, ["conventional", "immersive"], {}, "m", "m")
        r = ancova(t, "conventional", "immersive")
        self.assertAlmostEqual(r["adjusted_difference"], 1.5, delta=0.35)
        self.assertLess(r["ci_low"], 1.5)
        self.assertGreater(r["ci_high"], 1.5)
        self.assertAlmostEqual(r["baseline_slope"], 0.8, delta=0.1)


def _bundle() -> dict:
    tables = {
        "conditions": [{"condition_id": "c1", "code": "conventional", "interface": "conventional_2d", "allocation_weight": 1}, {"condition_id": "c2", "code": "immersive", "interface": "immersive_3d", "allocation_weight": 1}],
        "participants": [{"participant_code": "P1"}, {"participant_code": "P2"}, {"participant_code": "P3"}],
        "sessions": [
            {"session_id": "s1", "participant_code": "P1", "condition_id": "c1", "status": "completed", "excluded": False, "withdrawn": False, "non_experimental": False, "open_sequence_gaps": 0, "quarantined_events": 0},
            {"session_id": "s2", "participant_code": "P2", "condition_id": "c2", "status": "completed", "excluded": False, "withdrawn": False, "non_experimental": False, "open_sequence_gaps": 1, "quarantined_events": 0},
            {"session_id": "s3", "participant_code": "P3", "condition_id": "c2", "status": "completed", "excluded": True, "withdrawn": False, "non_experimental": False, "open_sequence_gaps": 0, "quarantined_events": 0},
        ],
        "events": [{"event_id": "e1", "session_id": "s1", "participant_code": "P1", "condition_id": "c1", "concept_id": "k1"}],
        "derived_scores": [
            {"session_id": "s1", "assessment_id": "a", "concept_map_id": "m1", "metric_name": "map.score", "metric_version": "1", "value": 3, "computed_at": "1", "pipeline_version": "p"},
            {"session_id": "s1", "assessment_id": "a", "concept_map_id": "m0", "metric_name": "map.score", "metric_version": "1", "value": 1, "computed_at": "1", "pipeline_version": "p"},
            {"session_id": "s2", "assessment_id": "a", "concept_map_id": "m2", "metric_name": "map.score", "metric_version": "1", "value": 5, "computed_at": "1", "pipeline_version": "p"},
            {"session_id": "s3", "assessment_id": "a", "concept_map_id": "m3", "metric_name": "map.score", "metric_version": "1", "value": 9, "computed_at": "1", "pipeline_version": "p"},
        ],
        "derived_metrics": [],
        "responses": [],
        "concept_maps": [
            {"concept_map_id": "m0", "session_id": "s1", "phase": "pre"},
            {"concept_map_id": "m1", "session_id": "s1", "phase": "post"},
            {"concept_map_id": "m2", "session_id": "s2", "phase": "post"},
            {"concept_map_id": "m3", "session_id": "s3", "phase": "post"},
        ],
    }
    return {
        "format": "immersive-episteme-research-export",
        "exportSchemaVersion": 1,
        "scope": "pseudonymised",
        "study": {"battery": [{"assessment_id": "a", "phase": "post"}]},
        "contentManifest": {"concepts": [{"id": "k1"}]},
        "tables": tables,
        "checksums": {k: canonical_hash(v) for k, v in tables.items()},
    }


class BundleAndTableTests(unittest.TestCase):
    def test_verifies_checksums_and_joins(self) -> None:
        b = _bundle()
        self.assertEqual(verify_bundle(b), [])
        b["tables"]["events"][0]["session_id"] = "nope"
        errs = verify_bundle(b)
        self.assertTrue(any("checksum" in e for e in errs))
        self.assertTrue(any("unknown session" in e for e in errs))

    def test_builds_outcome_and_baseline_and_sets_aside_exclusions(self) -> None:
        t = build_table(_bundle(), "map.score")
        self.assertEqual(t.excluded, {"excluded": 1, "withdrawn": 0, "non_experimental": 0})
        self.assertEqual(values(t, "conventional"), [3.0])
        self.assertEqual(values(t, "conventional", "baseline"), [1.0])
        self.assertEqual(values(t, "immersive"), [5.0])

    def test_describe(self) -> None:
        d = describe([1.0, 2.0, 3.0, 4.0])
        self.assertEqual(d["n"], 4)
        self.assertAlmostEqual(d["mean"], 2.5)
        self.assertAlmostEqual(d["median"], 2.5)
        self.assertEqual(describe([])["mean"], None)


if __name__ == "__main__":
    unittest.main()
