import { useId, type ReactNode } from "react";

import { titleCase } from "@/lib/text/title-case";
import { cn } from "@/lib/utils";

export function ProofFrame({ sheet, note, className }: { sheet: ReactNode; note?: ReactNode; className?: string }) {
  const id = useId();
  return (
    <section aria-labelledby={`${id}-title`} data-slot="proof-frame" className={cn("flex min-w-0 flex-col gap-4", className)}>
      <header className="flex flex-col gap-1">
        <h2 id={`${id}-title`} className="t-label text-lime">
          {titleCase("Record preview")}
        </h2>
        {note ? <div className="t-s text-lime-dim max-w-[40rem]">{note}</div> : null}
      </header>
      <div className="border border-lime-dim bg-vat p-3 xs:p-4">
        <div data-slot="proof-viewport" className="bg-vat py-2">
          {sheet}
        </div>
      </div>
    </section>
  );
}
