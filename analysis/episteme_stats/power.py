"""A-priori power for a two-sided, two-sample t-test with equal group sizes (noncentral t).

power(d, n) = P(|T| > t_crit) where T ~ noncentral t(df = 2n - 2, nc = d * sqrt(n / 2)).

PLANNED_SAMPLE_FACTS reproduces docs/research/technical-requirements.md §4 ("Sample size
(derived; not a statement by any paper)"): with the concept note's ~20 participants per group,
exact power at alpha = .05 and the per-group n for 80% power, for the effect sizes cited there.
The test suite asserts these values.
"""

from __future__ import annotations

import math

from scipy import stats

PLANNED_N_PER_GROUP = 20

# (d, source in technical-requirements.md §4, power at n = 20, n per group for 80% power)
PLANNED_SAMPLE_FACTS = (
    (0.45, "Zhou et al. pooled achievement effect", 0.284, 79),
    (0.60, "medium effect", 0.456, 45),
    (0.64, "Lu et al. largest effect", 0.505, 40),
    (0.84, "Yang et al. recall effect", 0.735, 24),
)


def power_two_sample(d: float, n_per_group: int, alpha: float = 0.05) -> float:
    df = 2 * n_per_group - 2
    nc = d * math.sqrt(n_per_group / 2)
    tc = stats.t.ppf(1 - alpha / 2, df)
    return float(stats.nct.sf(tc, df, nc) + stats.nct.cdf(-tc, df, nc))


def n_for_power(d: float, power: float = 0.80, alpha: float = 0.05, n_max: int = 100_000) -> int:
    """Smallest n per group whose power reaches `power`."""
    n = 2
    while power_two_sample(d, n, alpha) < power:
        n += 1
        if n > n_max:
            raise ValueError("required n exceeds n_max")
    return n


def planned_sample_table(alpha: float = 0.05) -> list[dict[str, float | int | str]]:
    return [
        {
            "d": d,
            "source": src,
            "power_at_n20": round(power_two_sample(d, PLANNED_N_PER_GROUP, alpha), 3),
            "n_per_group_for_80": n_for_power(d, 0.80, alpha),
        }
        for d, src, _, _ in PLANNED_SAMPLE_FACTS
    ]
