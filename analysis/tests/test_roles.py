from __future__ import annotations

import unittest

from episteme_stats.roles import metric_role, primary_outcome, role_report


class RoleTests(unittest.TestCase):
    bundle = {
        "metricRoles": {
            "primaryOutcome": {"metric": "test.sequence", "phase": "post", "covariate": {"metric": "test.pre_test", "phase": "pre"}, "model": "ANCOVA", "decision": "Concept Note rev2, H1"},
            "roles": [{"metric": "test.sequence", "role": "primary"}, {"metric": "test.identification", "role": "secondary"}, {"metric": "cmap.jaccard.dl", "role": "exploratory"}],
        }
    }

    def test_reads_the_roles_from_the_bundle(self) -> None:
        self.assertEqual(metric_role(self.bundle, "test.sequence"), "primary")
        self.assertEqual(metric_role(self.bundle, "test.identification"), "secondary")
        self.assertEqual(metric_role(self.bundle, "nav.path_length"), "exploratory")
        self.assertEqual(primary_outcome(self.bundle)["metric"], "test.sequence")

    def test_marks_only_post_with_pre_covariate_as_the_primary_analysis(self) -> None:
        self.assertTrue(role_report(self.bundle, "test.sequence", "post", "pre")["is_preregistered_primary_analysis"])
        self.assertFalse(role_report(self.bundle, "test.sequence", "post", None)["is_preregistered_primary_analysis"])
        self.assertFalse(role_report(self.bundle, "test.identification", "post", "pre")["is_preregistered_primary_analysis"])

    def test_a_bundle_without_roles_falls_back_to_the_note(self) -> None:
        self.assertEqual(metric_role({}, "test.sequence"), "primary")
        self.assertEqual(metric_role({}, "test.stage_placement"), "primary")
        self.assertEqual(metric_role({}, "cmap.recall.dl"), "secondary")
        self.assertEqual(metric_role({}, "common.navigation_effort"), "secondary")
        self.assertEqual(metric_role({}, "cmap.jaccard.dl"), "exploratory")


if __name__ == "__main__":
    unittest.main()
