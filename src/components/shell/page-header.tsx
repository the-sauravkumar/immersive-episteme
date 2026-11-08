import type { ReactNode } from "react";

import { titleCase } from "@/lib/text/title-case";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header data-slot="page-header" className={cn("mb-8", className)}>
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between md:gap-8">
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="t-h3 text-lime">{titleCase(title)}</h1>
          {description ? <div className="t-b max-w-[40rem] text-lime-dim">{description}</div> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-3 md:justify-end">{actions}</div> : null}
      </div>
    </header>
  );
}
