"""Exploratory statistics over Immersive Episteme research exports.

EXPLORATORY ONLY. Nothing produced by this package is a confirmatory result until the
researchers approve the analysis plan (hypotheses, primary outcome, model, alpha, handling of
missing data and exclusions). Every report states this.

Modules:
    bundle       load an export bundle, verify checksums and joins (mirrors the server validator)
    data         analysis tables: one row per analysable session with outcomes and baselines
    describe     descriptive statistics per condition
    compare      two-group comparison with effect sizes and confidence intervals
    adjust       baseline (pre-test) adjusted comparison (ANCOVA by least squares)
    missing      missing-data report
    roles        preregistration role of a metric (primary cmap.recall.dl post, pre covariate; D2)
    power        a-priori power and sample size for a two-sample t-test (noncentral t)
    __main__     command line: ``python -m episteme_stats report <bundle.json> --metric <name>``
"""

EXPLORATORY_NOTICE = (
    "EXPLORATORY: not a confirmatory analysis. The analysis plan has not been approved by the "
    "researchers; effect sizes and intervals are descriptive of this sample only and support no "
    "causal claim about the conditions."
)

__all__ = ["EXPLORATORY_NOTICE"]
