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
    dropped_values: dict[str, int] = field(default_factory=dict)
    metric_version: str | None = None


def _latest(rows: list[dict[str, Any]]) -> dict[str, Any]:
    return max(rows, key=lambda r: (r.get("computed_at") or "", r.get("pipeline_version") or ""))


def analysis_references(bundle: dict[str, Any]) -> dict[str, str] | None:
    refs = bundle.get("study", {}).get("analysisReferenceMaps")
    if refs is None:
        return None
    return {r["assessmentId"]: r["referenceMapId"] for r in refs}


def current_metric_version(bundle: dict[str, Any], metric: str) -> str | None:
    versions: dict[str, str] = bundle.get("reproducibility", {}).get("scoringMetricVersions") or {}
    fam = max((k for k in versions if metric == k or metric.startswith(k + ".")), key=len, default=None)
    return versions[fam] if fam else None


def build_table(bundle: dict[str, Any], metric: str, *, source: str = "derived_scores", phase: str | None = "post", baseline_phase: str | None = "pre", metric_version: str | None = None, covariate_metric: str | None = None) -> AnalysisTable:
    t = bundle["tables"]
    cond_code = {c["condition_id"]: c["code"] for c in t["conditions"]}
    battery_phase = {b["assessment_id"]: b["phase"] for b in bundle["study"].get("battery", [])}
    map_phase = {m["concept_map_id"]: m["phase"] for m in t.get("concept_maps", [])}
    excluded = {"excluded": 0, "withdrawn": 0, "non_experimental": 0, "unallocated": 0, "superseded_sessions": 0}
    dropped: dict[str, int] = {}

    sessions_of: dict[str, list[dict[str, Any]]] = {}
    for s in t["sessions"]:
        sessions_of.setdefault(s["participant_code"], []).append(s)
    rows: dict[str, SessionRow] = {}
    analysed_session: dict[str, str] = {}
    owner: dict[str, str] = {}
    for code, ss in sessions_of.items():
        allocated = [s for s in ss if s["condition_id"] is not None]
        if any(s["non_experimental"] for s in ss):
            excluded["non_experimental"] += 1
        elif any(s["withdrawn"] for s in ss):
            excluded["withdrawn"] += 1
        elif not allocated:
            excluded["unallocated"] += 1
        else:
            a = max(allocated, key=lambda s: s.get("period") or 0)
            if any(s["excluded"] for s in ss):
                excluded["excluded"] += 1
                continue
            excluded["superseded_sessions"] += len(ss) - 1
            rows[code] = SessionRow(a["session_id"], code, cond_code[a["condition_id"]], a["status"])
            analysed_session[code] = a["session_id"]
            for s in ss:
                owner[s["session_id"]] = code

    def phase_of(r: dict[str, Any]) -> str | None:
        if r.get("concept_map_id"):
            return map_phase.get(r["concept_map_id"])
        return battery_phase.get(r.get("assessment_id"))

    baseline_name = covariate_metric or metric
    candidates = [r for r in t[source] if r["metric_name"] == metric and r["session_id"] in owner]
    if covariate_metric and source == "derived_scores":
        for r in t[source]:
            if r["metric_name"] == covariate_metric and r["session_id"] in owner and phase_of(r) == baseline_phase:
                code = owner[r["session_id"]]
                value = r["value"]
                rows[code].outcomes["baseline"] = None if value is None else float(value)
    version = metric_version or (current_metric_version(bundle, metric) if source == "derived_scores" else None)
    if version is None:
        found = {r["metric_version"] for r in candidates}
        if len(found) > 1:
            raise ValueError(f"{metric} is stored in several versions ({', '.join(sorted(found))}); pass --metric-version")
        version = next(iter(found), None)
    refs = analysis_references(bundle) if source == "derived_scores" else None

    by_key: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for r in candidates:
        if version is not None and r["metric_version"] != version:
            continue
        if refs is not None and r.get("reference_map_id") is not None and refs.get(r.get("assessment_id")) != r["reference_map_id"]:
            continue
        code = owner[r["session_id"]]
        on_analysed = r["session_id"] == analysed_session[code]
        p = phase_of(r) if source == "derived_scores" else None
        if source == "derived_metrics" or p == phase:
            slot = "outcome" if on_analysed else None
        elif p == baseline_phase and baseline_name == metric:
            slot = "baseline"
        else:
            slot = None
        if slot:
            by_key.setdefault((code, slot), []).append(r)
    chosen: dict[tuple[str, str], dict[str, Any]] = {k: _latest(rs) for k, rs in by_key.items()}
    for (code, slot), r in chosen.items():
        if slot == "baseline":
            out = chosen.get((code, "outcome"))
            if out is not None and out.get("reference_map_id") != r.get("reference_map_id"):
                dropped["baseline_reference_mismatch"] = dropped.get("baseline_reference_mismatch", 0) + 1
                continue
        v = r["value"]
        rows[code].outcomes[slot] = None if v is None else float(v)
    conditions = sorted({r.condition for r in rows.values()})
    has_baseline = source == "derived_scores" and baseline_phase is not None
    return AnalysisTable(list(rows.values()), conditions, excluded, metric, baseline_name if has_baseline else None, dropped, version)


def values(table: AnalysisTable, condition: str, slot: str = "outcome") -> list[float]:
    return [r.outcomes[slot] for r in table.rows if r.condition == condition and r.outcomes.get(slot) is not None]  # type: ignore[misc]
