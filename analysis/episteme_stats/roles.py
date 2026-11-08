from __future__ import annotations

from typing import Any

PRIMARY_OUTCOMES = ("test.sequence", "test.stage_placement")
PRE_TEST_COVARIATE = {"metric": "test.pre_test", "phase": "pre"}
PRIMARY_OUTCOME = {"metric": PRIMARY_OUTCOMES[0], "metrics": list(PRIMARY_OUTCOMES), "phase": "post", "delayedPhase": "follow_up", "covariate": PRE_TEST_COVARIATE, "model": "ANCOVA", "delayedModel": "Mixed model, time by condition", "decision": "Concept Note rev2, H1"}
SECONDARY_OUTCOMES = ("test.identification", "test.cloth_state", "test.attribution", "test.transfer", "cmap.recall.dl", "common.mental_effort", "common.navigation_effort", "common.comfort", "common.engagement", "stage.total_ms")


def primary_outcome(bundle: dict[str, Any]) -> dict[str, Any]:
    return (bundle.get("metricRoles") or {}).get("primaryOutcome") or PRIMARY_OUTCOME


def metric_role(bundle: dict[str, Any], metric: str) -> str:
    roles = (bundle.get("metricRoles") or {}).get("roles")
    if roles is not None:
        return next((r["role"] for r in roles if r["metric"] == metric), "exploratory")
    if metric in PRIMARY_OUTCOMES:
        return "primary"
    return "secondary" if metric in SECONDARY_OUTCOMES else "exploratory"


def role_report(bundle: dict[str, Any], metric: str, phase: str, baseline_phase: str | None) -> dict[str, Any]:
    p = primary_outcome(bundle)
    role = metric_role(bundle, metric)
    is_primary_analysis = role == "primary" and phase == p["phase"] and baseline_phase == p["covariate"]["phase"]
    return {"metric_role": role, "primary_outcome": p, "is_preregistered_primary_analysis": is_primary_analysis}
