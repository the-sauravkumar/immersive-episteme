"""Descriptive statistics per condition."""

from __future__ import annotations

import numpy as np

from .data import AnalysisTable, values


def describe(xs: list[float]) -> dict[str, float | int | None]:
    a = np.asarray(xs, dtype=float)
    n = int(a.size)
    if n == 0:
        return {"n": 0, "mean": None, "sd": None, "median": None, "q1": None, "q3": None, "min": None, "max": None}
    q1, med, q3 = (float(v) for v in np.quantile(a, [0.25, 0.5, 0.75]))
    return {
        "n": n,
        "mean": float(a.mean()),
        "sd": float(a.std(ddof=1)) if n > 1 else None,
        "median": med,
        "q1": q1,
        "q3": q3,
        "min": float(a.min()),
        "max": float(a.max()),
    }


def describe_table(table: AnalysisTable, slot: str = "outcome") -> dict[str, dict[str, float | int | None]]:
    return {c: describe(values(table, c, slot)) for c in table.conditions}
