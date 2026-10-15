"""Analysis tables from a verified export bundle.

Unit of analysis: one analysable session (between-subjects: one per participant). A session is
analysable when it is not excluded, not withdrawn and not from a demo / non-experimental
study. Excluded sessions are counted, never silently dropped.

Score phase: a derived score belongs to the phase of its concept map (pre/post) when it scores
one, otherwise to the phase of its assessment in the study battery.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class SessionRow:
    session_id: str
    participant_code: str
    condition: str
    status: str
    outcomes: dict[str, float | None] = field(default_factory=dict)


@dataclass
class AnalysisTable:
    rows: list[SessionRow]
    conditions: list[str]
    excluded: dict[str, int]
    metric: str
    baseline_metric: str | None


def _latest(rows: list[dict[str, Any]]) -> dict[str, Any]:
    return max(rows, key=lambda r: (r.get("computed_at") or "", r.get("pipeline_version") or ""))


def build_table(bundle: dict[str, Any], metric: str, *, source: str = "derived_scores", phase: str | None = "post", baseline_phase: str | None = "pre", metric_version: str | None = None) -> AnalysisTable:
    """Outcome `metric` (and its baseline in `baseline_phase`) for every analysable session.

    source: "derived_scores" (assessment outcomes) or "derived_metrics" (behavioural, no phase).
    """
    t = bundle["tables"]
    cond_code = {c["condition_id"]: c["code"] for c in t["conditions"]}
    battery_phase = {b["assessment_id"]: b["phase"] for b in bundle["study"].get("battery", [])}
    map_phase = {m["concept_map_id"]: m["phase"] for m in t.get("concept_maps", [])}
    excluded = {"excluded": 0, "withdrawn": 0, "non_experimental": 0}
    rows: dict[str, SessionRow] = {}
    for s in t["sessions"]:
        if s["non_experimental"]:
            excluded["non_experimental"] += 1
        elif s["withdrawn"]:
            excluded["withdrawn"] += 1
        elif s["excluded"]:
            excluded["excluded"] += 1
        else:
            rows[s["session_id"]] = SessionRow(s["session_id"], s["participant_code"], cond_code[s["condition_id"]], s["status"])

    def phase_of(r: dict[str, Any]) -> str | None:
        if r.get("concept_map_id"):
            return map_phase.get(r["concept_map_id"])
        return battery_phase.get(r.get("assessment_id"))

    by_key: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for r in t[source]:
        if r["metric_name"] != metric or r["session_id"] not in rows:
            continue
        if metric_version and r["metric_version"] != metric_version:
            continue
        p = phase_of(r) if source == "derived_scores" else None
        slot = "outcome" if source == "derived_metrics" or p == phase else ("baseline" if p == baseline_phase else None)
        if slot:
            by_key.setdefault((r["session_id"], slot), []).append(r)
    for (sid, slot), rs in by_key.items():
        v = _latest(rs)["value"]
        rows[sid].outcomes[slot] = None if v is None else float(v)
    conditions = sorted({r.condition for r in rows.values()})
    has_baseline = source == "derived_scores" and baseline_phase is not None
    return AnalysisTable(list(rows.values()), conditions, excluded, metric, metric if has_baseline else None)


def values(table: AnalysisTable, condition: str, slot: str = "outcome") -> list[float]:
    return [r.outcomes[slot] for r in table.rows if r.condition == condition and r.outcomes.get(slot) is not None]  # type: ignore[misc]
