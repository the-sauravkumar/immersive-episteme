/**
 * The rule system (DESIGN.md 7.5), for every area including study:
 *
 *  - `running-head`: 2 px `--ink`, under the public header, the console top bar and the StudyBar
 *    (identical in both conditions).
 *  - `hairline`: 1 px `--rule`, between claims and list rows.
 *  - `booktabs`: 1.5 px `--ink`, the top and bottom rules of a booktabs table or figure block.
 *
 * The 2 px madder rule above public section heads is NOT here: madder is public-only and the
 * section 15 lint keeps every madder utility inside `src/app/(public)` and `src/components/public`.
 *
 * Rules are drawn with `border`, never a background fill, so they survive forced colours. They
 * are decorative (`aria-hidden`), not thematic breaks.
 */
import { cn } from "@/lib/utils";

const RULE = {
  "running-head": "border-t-2 border-ink",
  hairline: "border-t border-rule",
  booktabs: "border-t-[1.5px] border-ink",
} as const;

export type RuleKind = keyof typeof RULE;

export function Rule({ kind, className }: { kind: RuleKind; className?: string }) {
  return <div aria-hidden="true" data-slot="rule" data-rule={kind} className={cn("h-0 w-full", RULE[kind], className)} />;
}
