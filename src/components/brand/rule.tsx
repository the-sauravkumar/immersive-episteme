import { cn } from "@/lib/utils";

const RULE = {
  "running-head": "border-t border-lime-dim",
  hairline: "border-t border-line",
  booktabs: "border-t-[1.5px] border-lime",
} as const;

export type RuleKind = keyof typeof RULE;

export function Rule({ kind, className }: { kind: RuleKind; className?: string }) {
  return <div aria-hidden="true" data-slot="rule" data-rule={kind} className={cn("h-0 w-full", RULE[kind], className)} />;
}
