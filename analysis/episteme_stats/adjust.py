"""Baseline-adjusted comparison: ANCOVA by ordinary least squares (exploratory).

Model: post = b0 + b1 * condition_b + b2 * (pre - mean(pre)) + e, complete cases only.
b1 is the baseline-adjusted difference (condition b minus a); its CI uses the t distribution
with n - 3 df. The homogeneity-of-slopes assumption is reported by fitting the interaction
term condition_b * pre_centred and giving its estimate and p-value.
"""

from __future__ import annotations

import numpy as np
from scipy import stats

from .data import AnalysisTable


def _ols(X: np.ndarray, y: np.ndarray) -> tuple[np.ndarray, np.ndarray, int]:
    beta, *_ = np.linalg.lstsq(X, y, rcond=None)
    resid = y - X @ beta
    df = X.shape[0] - X.shape[1]
    sigma2 = float(resid @ resid) / df
    cov = sigma2 * np.linalg.inv(X.T @ X)
    return beta, np.sqrt(np.diag(cov)), df


def ancova(table: AnalysisTable, a: str, b: str, level: float = 0.95) -> dict[str, float | int | str | None]:
    rows = [r for r in table.rows if r.condition in (a, b) and r.outcomes.get("outcome") is not None and r.outcomes.get("baseline") is not None]
    n = len(rows)
    out: dict[str, float | int | str | None] = {"n_complete": n, "model": "post ~ condition + pre_centred"}
    if n < 5 or len({r.condition for r in rows}) < 2:
        out["note"] = "too few complete cases for a baseline-adjusted model"
        return out
    y = np.array([r.outcomes["outcome"] for r in rows], float)
    pre = np.array([r.outcomes["baseline"] for r in rows], float)
    g = np.array([1.0 if r.condition == b else 0.0 for r in rows])
    pc = pre - pre.mean()
    X = np.column_stack([np.ones(n), g, pc])
    beta, se, df = _ols(X, y)
    tcrit = float(stats.t.ppf((1 + level) / 2, df))
    tval = beta[1] / se[1]
    out.update(
        {
            "adjusted_difference": float(beta[1]),
            "ci_low": float(beta[1] - tcrit * se[1]),
            "ci_high": float(beta[1] + tcrit * se[1]),
            "t": float(tval),
            "df": df,
            "p": float(2 * stats.t.sf(abs(tval), df)),
            "baseline_slope": float(beta[2]),
        }
    )
    if n >= 6:
        Xi = np.column_stack([X, g * pc])
        bi, sei, dfi = _ols(Xi, y)
        ti = bi[3] / sei[3]
        out["slope_interaction"] = float(bi[3])
        out["slope_interaction_p"] = float(2 * stats.t.sf(abs(ti), dfi))
    return out
