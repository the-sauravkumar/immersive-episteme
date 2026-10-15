"""Preregistration roles of the metrics in an export bundle (stdlib only).

The bundle carries ``metricRoles`` (src/server/research/exports/dictionary.ts, from the shared
definitions table src/features/research/metric-definitions.ts): the primary outcome of study
decision D2 (``cmap.recall.dl`` on the post-learning map, ANCOVA with the pre-test score as
covariate) and a role per metric. A metric the bundle does not list is exploratory. Older
bundles without ``metricRoles`` fall back to the same D2 rule, stated here once.
"""

from __future__ import annotations

from typing import Any

PRIMARY_OUTCOME = {"metric": "cmap.recall.dl", "phase": "post", "covariate": {"metric": "cmap.recall.dl", "phase": "pre"}, "model": "ANCOVA", "decision": "D2"}
SECONDARY_OUTCOMES = ("cmap.recall.du", "cmap.precision.dl", "cmap.edges_drawn", "cmap.incorrect_relationships", "cmap.f1.dl", "cmap.cross_category.valid_normalised", "cmap.valid_relationships")


def primary_outcome(bundle: dict[str, Any]) -> dict[str, Any]:
    return (bundle.get("metricRoles") or {}).get("primaryOutcome") or PRIMARY_OUTCOME


def metric_role(bundle: dict[str, Any], metric: str) -> str:
    """primary | secondary | exploratory."""
    roles = (bundle.get("metricRoles") or {}).get("roles")
    if roles is not None:
        return next((r["role"] for r in roles if r["metric"] == metric), "exploratory")
    if metric == PRIMARY_OUTCOME["metric"]:
        return "primary"
    return "secondary" if metric in SECONDARY_OUTCOMES else "exploratory"


def role_report(bundle: dict[str, Any], metric: str, phase: str, baseline_phase: str | None) -> dict[str, Any]:
    """The role of a requested analysis, and whether it is the preregistered primary analysis."""
    p = primary_outcome(bundle)
    role = metric_role(bundle, metric)
    is_primary_analysis = role == "primary" and phase == p["phase"] and baseline_phase == p["covariate"]["phase"]
    return {"metric_role": role, "primary_outcome": p, "is_preregistered_primary_analysis": is_primary_analysis}
