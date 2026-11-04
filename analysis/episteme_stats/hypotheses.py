from __future__ import annotations

from statistics import fmean
from typing import Any

from .adjust import ancova
from .compare import compare_groups
from .data import build_table
from .mixed import Observation, correlation, fit_time_by_condition
from .roles import PRE_TEST_COVARIATE, PRIMARY_OUTCOMES

TEST_SCORES = ("test.sequence", "test.stage_placement", "test.identification", "test.cloth_state", "test.attribution", "test.transfer")
RATINGS = ("common.mental_effort", "common.navigation_effort")


def _ancova_for(bundle: dict[str, Any], metric: str, a: str, b: str) -> dict[str, Any]:
    table = build_table(bundle, metric, phase="post", baseline_phase=PRE_TEST_COVARIATE["phase"], covariate_metric=PRE_TEST_COVARIATE["metric"])
    return {"metric": metric, "conditions": table.conditions, "adjusted": ancova(table, a, b)}


def long_rows(bundle: dict[str, Any], metric: str, a: str, b: str) -> list[Observation]:
    rows: list[Observation] = []
    immediate = build_table(bundle, metric, phase="post", baseline_phase=PRE_TEST_COVARIATE["phase"], covariate_metric=PRE_TEST_COVARIATE["metric"])
    delayed = build_table(bundle, metric, phase="follow_up", baseline_phase=PRE_TEST_COVARIATE["phase"], covariate_metric=PRE_TEST_COVARIATE["metric"])
    for time, table in ((0.0, immediate), (1.0, delayed)):
        for r in table.rows:
            score, pre = r.outcomes.get("outcome"), r.outcomes.get("baseline")
            if score is None or pre is None or r.condition not in (a, b):
                continue
            rows.append(Observation(r.participant_code, 1.0 if r.condition == b else 0.0, time, score, pre))
    return rows


def recall_against_behaviour(bundle: dict[str, Any]) -> dict[str, Any]:
    t = bundle["tables"]
    target_of = {(r["assessment_id"], r["item_key"]): r for r in t.get("test_item_targets", [])}
    recall: dict[tuple[str, str], list[float]] = {}
    for r in t.get("derived_scores", []):
        details = r.get("details") or {}
        if r["metric_name"] != "item.key_match" or r.get("value") is None:
            continue
        target = target_of.get((r["assessment_id"], details.get("itemKey")))
        if target and target.get("object_key"):
            recall.setdefault((r["session_id"], target["object_key"]), []).append(float(r["value"]))
    dwell: dict[tuple[str, str], float] = {}
    approach: dict[tuple[str, str], float] = {}
    for r in t.get("derived_metrics", []):
        by_object = (r.get("details") or {}).get("byObject") or {}
        target = dwell if r["metric_name"] == "walk.object_dwell_ms" else approach if r["metric_name"] == "walk.approach_distance_m" else None
        if target is not None:
            for key, value in by_object.items():
                target[(r["session_id"], key)] = float(value)
    keys = [k for k in recall if k in dwell]
    near = [k for k in recall if k in approach]
    return {
        "dwell_vs_recall": correlation([dwell[k] for k in keys], [fmean(recall[k]) for k in keys]),
        "approach_vs_recall": correlation([approach[k] for k in near], [fmean(recall[k]) for k in near]),
    }


def rating_values(bundle: dict[str, Any], item_key: str, condition: str) -> list[float]:
    t = bundle["tables"]
    code_of = {c["condition_id"]: c["code"] for c in t["conditions"]}
    sessions = {s["session_id"] for s in t["sessions"] if code_of.get(s.get("condition_id")) == condition and not (s["non_experimental"] or s["withdrawn"] or s["excluded"])}
    out: list[float] = []
    for r in t.get("responses", []):
        raw = r.get("raw") or {}
        if r["session_id"] in sessions and r["item_key"] == item_key and r["status"] == "answered" and isinstance(raw.get("value"), (int, float)):
            out.append(float(raw["value"]))
    return out


def hypothesis_report(bundle: dict[str, Any], a: str, b: str) -> dict[str, Any]:
    h1 = [{**_ancova_for(bundle, metric, a, b), "immediate_vs_delayed": fit_time_by_condition(long_rows(bundle, metric, a, b))} for metric in PRIMARY_OUTCOMES]
    h3 = [{"metric": metric, "comparison": compare_groups(rating_values(bundle, metric, a), rating_values(bundle, metric, b))} for metric in RATINGS]
    return {
        "H1": h1,
        "H2": _ancova_for(bundle, "test.identification", a, b),
        "H3": h3,
        "RQ2": [_ancova_for(bundle, metric, a, b) for metric in TEST_SCORES if metric not in PRIMARY_OUTCOMES and metric != "test.identification"],
        "RQ3": recall_against_behaviour(bundle),
    }
