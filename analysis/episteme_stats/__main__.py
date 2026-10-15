"""Command line.

    python -m episteme_stats validate <bundle.json>
    python -m episteme_stats report <bundle.json> --metric <name> [--source derived_scores|derived_metrics]
                                     [--phase post] [--baseline-phase pre] [--a conventional] [--b immersive]
    python -m episteme_stats power [--d 0.5 ...] [--alpha 0.05]

Run from the analysis/ directory (or with analysis/ on PYTHONPATH). Output is JSON on stdout,
always carrying the exploratory notice.
"""

from __future__ import annotations

import argparse
import json
import sys

from . import EXPLORATORY_NOTICE
from .adjust import ancova
from .bundle import load_bundle, verify_bundle
from .compare import compare_groups
from .data import build_table, values
from .describe import describe_table
from .missing import missing_report
from .roles import role_report
from .power import PLANNED_N_PER_GROUP, n_for_power, planned_sample_table, power_two_sample


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="episteme_stats")
    sub = p.add_subparsers(dest="cmd", required=True)
    v = sub.add_parser("validate")
    v.add_argument("bundle")
    r = sub.add_parser("report")
    r.add_argument("bundle")
    r.add_argument("--metric", required=True)
    r.add_argument("--source", choices=["derived_scores", "derived_metrics"], default="derived_scores")
    r.add_argument("--phase", default="post")
    r.add_argument("--baseline-phase", default="pre")
    r.add_argument("--a", default="conventional")
    r.add_argument("--b", default="immersive")
    w = sub.add_parser("power")
    w.add_argument("--d", type=float, nargs="*")
    w.add_argument("--alpha", type=float, default=0.05)
    args = p.parse_args(argv)

    if args.cmd == "power":
        out: dict = {"notice": EXPLORATORY_NOTICE, "planned_sample": planned_sample_table(args.alpha)}
        if args.d:
            out["requested"] = [{"d": d, "power_at_n20": round(power_two_sample(d, PLANNED_N_PER_GROUP, args.alpha), 3), "n_per_group_for_80": n_for_power(d, 0.8, args.alpha)} for d in args.d]
        print(json.dumps(out, indent=2))
        return 0

    bundle = load_bundle(args.bundle)
    errors = verify_bundle(bundle)
    if args.cmd == "validate":
        print(json.dumps({"valid": not errors, "errors": errors[:200]}, indent=2))
        return 0 if not errors else 1
    if errors:
        print(json.dumps({"error": "bundle failed verification", "errors": errors[:50]}, indent=2))
        return 1
    table = build_table(bundle, args.metric, source=args.source, phase=args.phase, baseline_phase=args.baseline_phase)
    report = {
        "notice": EXPLORATORY_NOTICE,
        "study": {k: bundle["study"][k] for k in ("slug", "protocolVersion", "status")},
        "export": {"scope": bundle["scope"], "generatedAt": bundle["generatedAt"], "appBuild": bundle["reproducibility"]["appBuild"]},
        "metric": args.metric,
        **role_report(bundle, args.metric, args.phase, args.baseline_phase),
        "source": args.source,
        "conditions": table.conditions,
        "descriptives": describe_table(table),
        "baseline_descriptives": describe_table(table, "baseline") if table.baseline_metric else None,
        "comparison": compare_groups(values(table, args.a), values(table, args.b)),
        "baseline_adjusted": ancova(table, args.a, args.b) if table.baseline_metric else None,
        "missing": missing_report(bundle, table),
        "power_reference": planned_sample_table(),
    }
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
