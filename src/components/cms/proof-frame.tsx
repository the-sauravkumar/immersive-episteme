"use client";

import { useId, useState, type ReactNode } from "react";

import { Segmented } from "@/components/ui/segmented";
import { titleCase } from "@/lib/text/title-case";
import { cn } from "@/lib/utils";

export type ProofPlacement = "page" | "panel";

const PROOF_PLACEMENTS: readonly { value: ProofPlacement; label: string }[] = [
  { value: "page", label: "2D column" },
  { value: "panel", label: "3D panel" },
];

export function ProofFrame({ sheet, note, className }: { sheet: ReactNode; note?: ReactNode; className?: string }) {
  const [placement, setPlacement] = useState<ProofPlacement>("page");
  const id = useId();
  return (
    <section aria-labelledby={`${id}-title`} data-slot="proof-frame" className={cn("flex min-w-0 flex-col gap-4", className)}>
      <header className="flex flex-col gap-1">
        <h2 id={`${id}-title`} className="t-label text-lime">
          {titleCase("Proof")}
        </h2>
        {note ? <div className="t-s text-lime-dim max-w-[40rem]">{note}</div> : null}
      </header>
      <Segmented
        legend="Preview as"
        name={`${id}-placement`}
        options={PROOF_PLACEMENTS}
        value={placement}
        onValueChange={(v) => setPlacement(v as ProofPlacement)}
      />
      <div className="border border-lime-dim bg-vat p-3 xs:p-4">
        <div
          key={placement}
          data-slot="proof-viewport"
          data-placement={placement}
          className={cn(
            "bg-vat",
            placement === "page" ? "py-2" : "h-[min(70dvh,44rem)] overflow-y-auto overscroll-contain border-l border-lime-dim",
          )}
          {...(placement === "panel" ? { tabIndex: 0, role: "region", "aria-label": "3D panel preview (scrolls)" } : {})}
        >
          {sheet}
        </div>
      </div>
    </section>
  );
}
