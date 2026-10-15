/**
 * Sidenote (DESIGN.md 6, 11.2): a marginal note or citation beside its paragraph in the 15rem
 * margin column of the editorial frame, and an inline note directly after the paragraph under
 * 1024 px (R-T12). `text-credit`, `--ink-3`, with a 1 px rule above when it runs inline.
 */
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function Sidenote({ label = "Note", children, className }: { label?: string; children: ReactNode; className?: string }) {
  return (
    <aside data-slot="sidenote" aria-label={label} className={cn("text-credit border-t border-rule pt-2 lg:border-t-0 lg:pt-1", className)}>
      <p className="text-label mb-1">{label}</p>
      <div className="flex flex-col gap-2">{children}</div>
    </aside>
  );
}
