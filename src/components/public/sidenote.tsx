import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function Sidenote({ label = "Note", children, className }: { label?: string; children: ReactNode; className?: string }) {
  return (
    <aside data-slot="sidenote" aria-label={label} className={cn("t-s text-lime-dim border-t border-line pt-2 lg:border-t-0 lg:pt-1", className)}>
      <p className="t-label mb-1">{label}</p>
      <div className="flex flex-col gap-2">{children}</div>
    </aside>
  );
}
