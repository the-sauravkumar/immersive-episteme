"""Two-group comparison with effect sizes and confidence intervals (exploratory).

- Welch's t-test (unequal variances) and its CI for the mean difference (b - a).
- Hedges' g (bias-corrected standardised mean difference, pooled SD) with an approximate CI
  from the large-sample variance of d (Hedges & Olkin), exact noncentral-t inversion when
  `exact_ci=True`.
- Mann-Whitney U with the rank-biserial correlation as a distribution-free alternative.
- Percentile bootstrap CI for the mean difference (fixed seed, reproducible).
"""

from __future__ import annotations

import math

import numpy as np
from scipy import optimize, stats


def hedges_g(a: list[float], b: list[float]) -> tuple[float, float]:
    """(g, approximate variance of g) for b minus a."""
    n1, n2 = len(a), len(b)
    s1, s2 = np.var(a, ddof=1), np.var(b, ddof=1)
    sp = math.sqrt(((n1 - 1) * s1 + (n2 - 1) * s2) / (n1 + n2 - 2))
    d = (float(np.mean(b)) - float(np.mean(a))) / sp
    j = 1 - 3 / (4 * (n1 + n2) - 9)
    g = j * d
    var = (n1 + n2) / (n1 * n2) + g**2 / (2 * (n1 + n2))
    return g, var


def d_ci_exact(t: float, n1: int, n2: int, level: float = 0.95) -> tuple[float, float]:
    """CI for Cohen's d by inverting the noncentral t distribution of the pooled t statistic."""
    df = n1 + n2 - 2
    scale = math.sqrt(1 / n1 + 1 / n2)
    lo_p, hi_p = (1 + level) / 2, (1 - level) / 2

    def solve(p: float) -> float:
        f = lambda nc: stats.nct.cdf(t, df, nc) - p  # noqa: E731
        return optimize.brentq(f, t - 50, t + 50) * scale

    return solve(lo_p), solve(hi_p)


def compare_groups(a: list[float], b: list[float], *, level: float = 0.95, n_boot: int = 5000, seed: int = 20261014) -> dict[str, float | int | str | None]:
    """Comparison of group b against group a (differences are b minus a)."""
    n1, n2 = len(a), len(b)
    out: dict[str, float | int | str | None] = {"n_a": n1, "n_b": n2}
    if n1 < 2 or n2 < 2:
        out["note"] = "each group needs at least two observations"
        return out
    xa, xb = np.asarray(a, float), np.asarray(b, float)
    diff = float(xb.mean() - xa.mean())
    welch = stats.ttest_ind(xb, xa, equal_var=False)
    va, vb = xa.var(ddof=1) / n1, xb.var(ddof=1) / n2
    se = math.sqrt(va + vb)
    dfw = (va + vb) ** 2 / (va**2 / (n1 - 1) + vb**2 / (n2 - 1)) if se > 0 else float("nan")
    tcrit = float(stats.t.ppf((1 + level) / 2, dfw)) if se > 0 else float("nan")
    g, var_g = hedges_g(a, b)
    z = float(stats.norm.ppf((1 + level) / 2))
    pooled_t = stats.ttest_ind(xb, xa, equal_var=True).statistic
    d_lo, d_hi = d_ci_exact(float(pooled_t), n1, n2, level)
    j = 1 - 3 / (4 * (n1 + n2) - 9)
    mw = stats.mannwhitneyu(xb, xa, alternative="two-sided")
    rng = np.random.default_rng(seed)
    boots = np.array([rng.choice(xb, n2).mean() - rng.choice(xa, n1).mean() for _ in range(n_boot)])
    out.update(
        {
            "mean_difference": diff,
            "welch_t": float(welch.statistic),
            "welch_df": dfw,
            "welch_p": float(welch.pvalue),
            "difference_ci_low": diff - tcrit * se,
            "difference_ci_high": diff + tcrit * se,
            "hedges_g": g,
            "hedges_g_ci_low_approx": g - z * math.sqrt(var_g),
            "hedges_g_ci_high_approx": g + z * math.sqrt(var_g),
            "hedges_g_ci_low_exact": j * d_lo,
            "hedges_g_ci_high_exact": j * d_hi,
            "mann_whitney_u": float(mw.statistic),
            "mann_whitney_p": float(mw.pvalue),
            "rank_biserial": float(2 * mw.statistic / (n1 * n2) - 1),
            "bootstrap_ci_low": float(np.quantile(boots, (1 - level) / 2)),
            "bootstrap_ci_high": float(np.quantile(boots, (1 + level) / 2)),
            "bootstrap_seed": seed,
            "bootstrap_resamples": n_boot,
        }
    )
    return out
