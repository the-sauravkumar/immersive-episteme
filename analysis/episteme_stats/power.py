"""A-priori power for the preregistered model and for a two-sample t-test (noncentral t).

Planned model (study decision D4, docs/research/study-decisions.md): a two-group ANCOVA of the
post-test adjusted for the pre-test. With one covariate correlated rho with the outcome the
residual SD is sigma * sqrt(1 - rho^2) (Borm, Fransen & Lemmens 2007, cited in Clifton, Birks &
Clifton 2019), so

    power_ancova(d, n, rho) = P(|T| > t_crit),  T ~ noncentral t(df = 2n - 3, nc = d / sqrt(1 - rho^2) * sqrt(n / 2)).

This is the same computation as docs/research/tools/ancova_power.py, which produced D4's table.
D4 plans 51 analysable participants per group (recruit 56) for d = 0.45 at rho = 0.6.

For comparison only, the concept note's plan (~20 per group, two-sample t-test):

    power_two_sample(d, n) = P(|T| > t_crit),  T ~ noncentral t(df = 2n - 2, nc = d * sqrt(n / 2)).

PLANNED_SAMPLE_FACTS reproduces docs/research/technical-requirements.md §4 (t-test at n = 20);
D4_FACTS reproduces D4. The test suite asserts both (final review scoring-10: the report's power
reference used to show only the superseded t-test plan).
"""

from __future__ import annotations

import math

from scipy import stats

# D4: ANCOVA, rho = 0.6, 51 analysable per group (56 recruited for ~10% exclusions).
PLANNED_N_PER_GROUP = 51
RECRUIT_N_PER_GROUP = 56
PLANNED_RHO = 0.6
PLAN_LABEL = "D4: ANCOVA (post adjusted for pre), rho = 0.6, 51 analysable per group (recruit 56), alpha = .05 two-sided"
# The concept note's ~20 per group (CN §8, P94); kept as a labelled comparison.
CONCEPT_NOTE_N_PER_GROUP = 20

# (d, source in technical-requirements.md §4, t-test power at n = 20, t-test n per group for 80% power)
PLANNED_SAMPLE_FACTS = (
    (0.45, "Zhou et al. pooled achievement effect", 0.284, 79),
    (0.60, "medium effect", 0.456, 45),
    (0.64, "Lu et al. largest effect", 0.505, 40),
    (0.84, "Yang et al. recall effect", 0.735, 24),
)

# D4 table (rho = 0.6): (d, ANCOVA n per group for 80% power)
D4_FACTS = ((0.45, 51), (0.60, 29), (0.80, 17))
# D4: ANCOVA power at 20 per group for d = 0.45, and the minimum detectable d at 20 per group (rho = 0.6).
D4_POWER_AT_20_D045 = 0.410
D4_MDE_AT_20 = 0.73


def _two_sided_nct_power(df: float, nc: float, alpha: float) -> float:
    tc = stats.t.ppf(1 - alpha / 2, df)
    return float(stats.nct.sf(tc, df, nc) + stats.nct.cdf(-tc, df, nc))


def power_two_sample(d: float, n_per_group: int, alpha: float = 0.05) -> float:
    return _two_sided_nct_power(2 * n_per_group - 2, d * math.sqrt(n_per_group / 2), alpha)


def power_ancova(d: float, n_per_group: int, rho: float = PLANNED_RHO, alpha: float = 0.05) -> float:
    return _two_sided_nct_power(2 * n_per_group - 3, d / math.sqrt(1 - rho**2) * math.sqrt(n_per_group / 2), alpha)


def n_for_power(d: float, power: float = 0.80, alpha: float = 0.05, n_max: int = 100_000) -> int:
    """Smallest n per group whose t-test power reaches `power`."""
    n = 2
    while power_two_sample(d, n, alpha) < power:
        n += 1
        if n > n_max:
            raise ValueError("required n exceeds n_max")
    return n


def n_for_power_ancova(d: float, power: float = 0.80, rho: float = PLANNED_RHO, alpha: float = 0.05, n_max: int = 100_000) -> int:
    """Smallest n per group whose ANCOVA power reaches `power` (df = 2n - 3 needs n >= 2)."""
    n = 2
    while power_ancova(d, n, rho, alpha) < power:
        n += 1
        if n > n_max:
            raise ValueError("required n exceeds n_max")
    return n


def minimum_detectable_d(n_per_group: int, power: float = 0.80, rho: float = PLANNED_RHO, alpha: float = 0.05) -> float:
    """Smallest d the ANCOVA detects with `power` at `n_per_group` (bisection)."""
    lo, hi = 0.0, 5.0
    for _ in range(60):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if power_ancova(mid, n_per_group, rho, alpha) < power else (lo, mid)
    return hi


def planned_sample_table(alpha: float = 0.05) -> dict[str, object]:
    """The preregistered (D4) power plan, with the concept note's t-test as a labelled comparison."""
    return {
        "plan": PLAN_LABEL,
        "rows": [
            {
                "d": d,
                "source": src,
                "ancova_power_at_planned_n": round(power_ancova(d, PLANNED_N_PER_GROUP, PLANNED_RHO, alpha), 3),
                "ancova_n_per_group_for_80": n_for_power_ancova(d, 0.80, PLANNED_RHO, alpha),
                "ancova_power_at_n20": round(power_ancova(d, CONCEPT_NOTE_N_PER_GROUP, PLANNED_RHO, alpha), 3),
                "comparison_concept_note_ttest_power_at_n20": round(power_two_sample(d, CONCEPT_NOTE_N_PER_GROUP, alpha), 3),
                "comparison_ttest_n_per_group_for_80": n_for_power(d, 0.80, alpha),
            }
            for d, src, _, _ in PLANNED_SAMPLE_FACTS
        ],
        "minimum_detectable_d_at_n20": round(minimum_detectable_d(CONCEPT_NOTE_N_PER_GROUP, 0.80, PLANNED_RHO, alpha), 2),
        "note": "If recruitment is capped at the concept note's ~40, D4 makes the study an estimation study powered only for the minimum detectable d at 20 per group.",
    }
