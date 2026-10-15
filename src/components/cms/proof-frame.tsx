"use client";

/**
 * The concept editor's Proof (DESIGN.md 11.10): the REAL shared `KnowledgeSheet`, as learners in
 * both conditions get it, in a 1 px --rule-strong mount on the --field plane (no ticks, DR-022).
 *
 * "Preview as: 2D column | 3D panel" (a Segmented control on native radios, DESIGN.md 9.3) is a
 * standing parity demonstration. It changes ONLY the
 * container around the sheet, never the sheet: the 2D column lets the sheet run in the page flow on
 * `--ground`; the 3D panel is the docked panel's box (opaque `--ground`, a 1 px `--rule-strong` left
 * border, internal scroll), so the sheet's reading-progress bar measures the panel as it does in the
 * museum. The sheet element passed in is the same in both, so its DOM is identical
 * (tests/unit/cms/proof-frame.test.tsx compares them). The reserved 44 x 44 action slot stays empty
 * in both previews (it holds Close only in the museum), so titles wrap identically.
 *
 * The sheet is rendered with `autoFocusTitle={false}`: opening the editor must not move focus into
 * the proof. Telemetry is off: the console mounts no telemetry provider.
 */
import { useId, useState, type ReactNode } from "react";

import { Segmented } from "@/components/ui/segmented";
import { titleCase } from "@/lib/text/title-case";
import { cn } from "@/lib/utils";

export type ProofPlacement = "page" | "panel";

export const PROOF_PLACEMENTS: readonly { value: ProofPlacement; label: string }[] = [
  { value: "page", label: "2D column" },
  { value: "panel", label: "3D panel" },
];

export function ProofFrame({ sheet, note, className }: { sheet: ReactNode; note?: ReactNode; className?: string }) {
  const [placement, setPlacement] = useState<ProofPlacement>("page");
  const id = useId();
  return (
    <section aria-labelledby={`${id}-title`} data-slot="proof-frame" className={cn("flex min-w-0 flex-col gap-4", className)}>
      <header className="flex flex-col gap-1">
        <h2 id={`${id}-title`} className="text-h3 text-ink">
          {titleCase("Proof")}
        </h2>
        {note ? <div className="text-credit max-w-[40rem]">{note}</div> : null}
      </header>
      <Segmented
        legend="Preview as"
        name={`${id}-placement`}
        options={PROOF_PLACEMENTS}
        value={placement}
        onValueChange={(v) => setPlacement(v as ProofPlacement)}
      />
      <div className="border border-rule-strong bg-field p-3 xs:p-4">
        <div
          key={placement}
          data-slot="proof-viewport"
          data-placement={placement}
          className={cn(
            "bg-ground",
            placement === "page" ? "py-2" : "h-[min(70dvh,44rem)] overflow-y-auto overscroll-contain border-l border-rule-strong",
          )}
          // The panel scrolls inside itself, as the docked museum panel does: keyboard users can scroll it.
          {...(placement === "panel" ? { tabIndex: 0, role: "region", "aria-label": "3D panel preview (scrolls)" } : {})}
        >
          {sheet}
        </div>
      </div>
    </section>
  );
}
