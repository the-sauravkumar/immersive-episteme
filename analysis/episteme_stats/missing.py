"""Missing-data report: what is absent, per condition, and why (never imputed here)."""

from __future__ import annotations

from typing import Any

from .data import AnalysisTable


def missing_report(bundle: dict[str, Any], table: AnalysisTable) -> dict[str, Any]:
    t = bundle["tables"]
    per: dict[str, dict[str, int]] = {}
    for r in table.rows:
        p = per.setdefault(r.condition, {"sessions": 0, "outcome_missing": 0, "baseline_missing": 0, "not_completed": 0})
        p["sessions"] += 1
        if r.outcomes.get("outcome") is None:
            p["outcome_missing"] += 1
        if table.baseline_metric and r.outcomes.get("baseline") is None:
            p["baseline_missing"] += 1
        if r.status != "completed":
            p["not_completed"] += 1
    sessions = t["sessions"]
    responses = t.get("responses", [])
    return {
        "set_aside_before_analysis": table.excluded,
        "per_condition": per,
        "telemetry": {
            "sessions_with_open_sequence_gaps": sum(1 for s in sessions if s["open_sequence_gaps"]),
            "sessions_with_quarantined_events": sum(1 for s in sessions if s["quarantined_events"]),
            "sessions_without_events": len({s["session_id"] for s in sessions} - {e["session_id"] for e in t.get("events", [])}),
        },
        "responses": {
            "skipped": sum(1 for r in responses if r["status"] == "skipped"),
            "timed_out": sum(1 for r in responses if r["status"] == "timed_out"),
            "answered": sum(1 for r in responses if r["status"] == "answered"),
        },
        "policy": "Complete-case analysis in this exploratory package; no imputation. The missing-data strategy is part of the analysis plan awaiting approval.",
    }
