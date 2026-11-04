from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy import optimize, stats


@dataclass(frozen=True)
class Observation:
    participant: str
    condition: float
    delayed: float
    score: float
    pre: float


def _profile(lam: float, y: np.ndarray, X: np.ndarray, groups: np.ndarray) -> tuple[float, np.ndarray, np.ndarray, float]:
    n, p = X.shape
    xtvx = np.zeros((p, p))
    xtvy = np.zeros(p)
    logdet = 0.0
    for g in np.unique(groups):
        idx = groups == g
        xg, yg = X[idx], y[idx]
        m = int(idx.sum())
        shrink = lam / (1.0 + m * lam)
        logdet += float(np.log1p(m * lam))
        xs, ys = xg.sum(axis=0), yg.sum()
        xtvx += xg.T @ xg - shrink * np.outer(xs, xs)
        xtvy += xg.T @ yg - shrink * xs * ys
    inv = np.linalg.pinv(xtvx)
    beta = inv @ xtvy
    resid = y - X @ beta
    quad = 0.0
    for g in np.unique(groups):
        idx = groups == g
        r = resid[idx]
        quad += float(r @ r - (lam / (1.0 + int(idx.sum()) * lam)) * r.sum() ** 2)
    df = n - p
    sigma2 = quad / df
    sign, xtvx_logdet = np.linalg.slogdet(xtvx)
    objective = df * np.log(sigma2) + logdet + (xtvx_logdet if sign > 0 else 0.0)
    return float(objective), beta, inv, sigma2


def fit_time_by_condition(rows: list[Observation], level: float = 0.95) -> dict[str, float | int | str | None]:
    out: dict[str, float | int | str | None] = {"model": "score ~ condition * delayed + pre_centred + (1 | participant)", "n_observations": len(rows), "n_participants": len({r.participant for r in rows})}
    delayed_count = sum(1 for r in rows if r.delayed == 1.0)
    conditions = {r.condition for r in rows}
    if len(rows) < 8 or delayed_count < 2 or len(conditions) < 2:
        out["note"] = "too few observations for a mixed model"
        return out
    y = np.array([r.score for r in rows], float)
    pre = np.array([r.pre for r in rows], float)
    cond = np.array([r.condition for r in rows], float)
    delayed = np.array([r.delayed for r in rows], float)
    groups = np.array([r.participant for r in rows])
    X = np.column_stack([np.ones(len(rows)), cond, delayed, cond * delayed, pre - pre.mean()])
    fit = optimize.minimize_scalar(lambda log_lam: _profile(float(np.exp(log_lam)), y, X, groups)[0], bounds=(-12.0, 8.0), method="bounded")
    lam = float(np.exp(fit.x))
    _, beta, inv, sigma2 = _profile(lam, y, X, groups)
    se = np.sqrt(np.diag(inv) * sigma2)
    df = len(rows) - X.shape[1]
    tcrit = float(stats.t.ppf((1 + level) / 2, df))
    tval = float(beta[3] / se[3])
    out.update(
        {
            "time_by_condition": float(beta[3]),
            "ci_low": float(beta[3] - tcrit * se[3]),
            "ci_high": float(beta[3] + tcrit * se[3]),
            "t": tval,
            "df_residual_approximation": df,
            "p": float(2 * stats.t.sf(abs(tval), df)),
            "condition_at_immediate": float(beta[1]),
            "delayed_change_reference": float(beta[2]),
            "pre_slope": float(beta[4]),
            "sigma2_residual": float(sigma2),
            "sigma2_participant": float(lam * sigma2),
        }
    )
    return out


def correlation(xs: list[float], ys: list[float]) -> dict[str, float | int | None]:
    n = len(xs)
    if n < 4 or len(set(xs)) < 2 or len(set(ys)) < 2:
        return {"n": n, "spearman": None, "p": None}
    result = stats.spearmanr(xs, ys)
    return {"n": n, "spearman": float(result.statistic), "p": float(result.pvalue)}
