"""Derived power analysis for a two-group ANCOVA (post-test adjusted for pre-test).
Exact power via the noncentral t distribution. With one covariate, the residual SD is
sigma*sqrt(1-rho^2) (Borm, Fransen & Lemmens 2007; Clifton, Birks & Clifton 2019), so
the noncentrality is delta = d/sqrt(1-rho^2) * sqrt(n/2), df = 2n - 3.
d = standardised mean difference on the post-test in raw (unadjusted) SD units."""
import math
from scipy import stats, __version__ as sv

ALPHA, TARGET = 0.05, 0.80

def power_ancova(n, d, rho, alpha=ALPHA):
    df = 2 * n - 3
    ncp = d / math.sqrt(1 - rho ** 2) * math.sqrt(n / 2)
    tc = stats.t.ppf(1 - alpha / 2, df)
    return stats.nct.sf(tc, df, ncp) + stats.nct.cdf(-tc, df, ncp)

def power_ttest(n, d, alpha=ALPHA):
    df = 2 * n - 2
    ncp = d * math.sqrt(n / 2)
    tc = stats.t.ppf(1 - alpha / 2, df)
    return stats.nct.sf(tc, df, ncp) + stats.nct.cdf(-tc, df, ncp)

def n_needed(f, *a):
    n = 4
    while f(n, *a) < TARGET:
        n += 1
    return n

def mde(n, rho):  # minimum detectable d at 80% power
    lo, hi = 0.01, 3.0
    for _ in range(60):
        mid = (lo + hi) / 2
        (lo, hi) = (mid, hi) if power_ancova(n, mid, rho) < TARGET else (lo, mid)
    return hi

print(f"scipy {sv}; alpha={ALPHA} two-sided; target power={TARGET}")
for d in (0.40, 0.45, 0.50, 0.60, 0.80):
    nt = n_needed(power_ttest, d)
    row = [f"d={d:.2f}: t-test n/group={nt}"]
    for rho in (0.5, 0.6, 0.7):
        na = n_needed(power_ancova, d, rho)
        row.append(f"rho={rho}: ANCOVA n/group={na} (Borm approx (1-rho^2)*n_t={math.ceil((1-rho**2)*nt)})")
    print("; ".join(row))
print("Power at n=20/group:")
for d in (0.45, 0.60, 0.80):
    print(f"  d={d:.2f}: t-test {power_ttest(20,d):.3f}; " + "; ".join(f"ANCOVA rho={r} {power_ancova(20,d,r):.3f}" for r in (0.5,0.6,0.7)))
print("Minimum detectable d (80% power) at n=20/group: " + "; ".join(f"rho={r}: {mde(20,r):.2f}" for r in (0.5,0.6,0.7)))

# For decision (1): power of a counterbalanced within-participant comparison of N=40,
# paired t-test, assuming NO carry-over; r = correlation between a person's scores in the two conditions.
def power_paired(n, d, r, alpha=ALPHA):
    dz = d / math.sqrt(2 * (1 - r)); df = n - 1; ncp = dz * math.sqrt(n)
    tc = stats.t.ppf(1 - alpha / 2, df)
    return stats.nct.sf(tc, df, ncp) + stats.nct.cdf(-tc, df, ncp)
print("Within-participant N=40 (no carry-over assumed): " + "; ".join(
    f"d={d}, r={r}: {power_paired(40,d,r):.3f}" for d in (0.45, 0.60) for r in (0.3, 0.5)))
