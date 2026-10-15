"""Preregistration roles (stdlib only): cd analysis && python -B -m unittest tests.test_roles"""

from __future__ import annotations

import unittest

from episteme_stats.roles import metric_role, primary_outcome, role_report


class RoleTests(unittest.TestCase):
    bundle = {
        "metricRoles": {
            "primaryOutcome": {"metric": "cmap.recall.dl", "phase": "post", "covariate": {"metric": "cmap.recall.dl", "phase": "pre"}, "model": "ANCOVA", "decision": "D2"},
            "roles": [{"metric": "cmap.recall.dl", "role": "primary"}, {"metric": "cmap.f1.dl", "role": "secondary"}, {"metric": "cmap.jaccard.dl", "role": "exploratory"}],
        }
    }

    def test_reads_the_roles_from_the_bundle(self) -> None:
        self.assertEqual(metric_role(self.bundle, "cmap.recall.dl"), "primary")
        self.assertEqual(metric_role(self.bundle, "cmap.f1.dl"), "secondary")
        self.assertEqual(metric_role(self.bundle, "nav.path_length"), "exploratory")
        self.assertEqual(primary_outcome(self.bundle)["metric"], "cmap.recall.dl")

    def test_marks_only_post_with_pre_covariate_as_the_primary_analysis(self) -> None:
        self.assertTrue(role_report(self.bundle, "cmap.recall.dl", "post", "pre")["is_preregistered_primary_analysis"])
        self.assertFalse(role_report(self.bundle, "cmap.recall.dl", "post", None)["is_preregistered_primary_analysis"])
        self.assertFalse(role_report(self.bundle, "cmap.f1.dl", "post", "pre")["is_preregistered_primary_analysis"])

    def test_older_bundles_fall_back_to_the_d2_rule(self) -> None:
        self.assertEqual(metric_role({}, "cmap.recall.dl"), "primary")
        self.assertEqual(metric_role({}, "cmap.valid_relationships"), "secondary")
        self.assertEqual(metric_role({}, "cmap.incorrect_relationships"), "secondary")
        self.assertEqual(metric_role({}, "cmap.jaccard.dl"), "exploratory")


if __name__ == "__main__":
    unittest.main()
