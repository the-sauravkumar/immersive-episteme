/**
 * The rule system (DESIGN.md 7.5, DR-022). Rules remain only where they carry structure:
 *
 *  - `running-head`: 1 px `--rule-strong`, the one line under the public header, the console top
 *    bar and the StudyBar (identical in both conditions). It is a docked pane edge (3.55:1 or
 *    more against the field), never a 2 px ink band.
 *  - `hairline`: 1 px `--rule`, long console rows and the booktabs midrule only; claims are
 *    separated by space, not rules.
 *  - `booktabs`: 1.5 px `--ink`, the top and bottom rules of a booktabs table or figure block.
 *
 * Rules are drawn with `border`, never a background fill, so they survive forced colours. They
 * are decorative (`aria-hidden`), not thematic breaks.
 */
import { cn } from "@/lib/utils";

const RULE = {
  "running-head": "border-t border-rule-strong",
  hairline: "border-t border-rule",
  booktabs: "border-t-[1.5px] border-ink",
} as const;

export type RuleKind = keyof typeof RULE;

export function Rule({ kind, className }: { kind: RuleKind; className?: string }) {
  return <div aria-hidden="true" data-slot="rule" data-rule={kind} className={cn("h-0 w-full", RULE[kind], className)} />;
}
