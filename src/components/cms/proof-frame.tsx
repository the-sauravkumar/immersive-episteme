"use client";

/**
 * The concept editor's Proof (DESIGN.md 11.10): the REAL shared `KnowledgeSheet`, as learners in
 * both conditions get it, inside a frame with registration ticks (7.3: the CMS proof frame is one
 * of the three places ticks are allowed).
 *
 * "Preview as: 2D column | 3D panel" is a standing parity demonstration. It changes ONLY the
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

import { TickedFrame } from "@/components/brand/registration-ticks";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  const viewport = (p: ProofPlacement) => (
    <div
      data-slot="proof-viewport"
      data-placement={p}
      className={cn(
        "bg-ground",
        p === "page" ? "py-2" : "h-[min(70dvh,44rem)] overflow-y-auto overscroll-contain border-l border-rule-strong",
      )}
      // The panel scrolls inside itself, as the docked museum panel does: keyboard users can scroll it.
      {...(p === "panel" ? { tabIndex: 0, role: "region", "aria-label": "3D panel preview (scrolls)" } : {})}
    >
      {sheet}
    </div>
  );
  return (
    <section aria-labelledby={`${id}-title`} data-slot="proof-frame" className={cn("flex min-w-0 flex-col gap-4", className)}>
      <header className="flex flex-col gap-1">
        <h2 id={`${id}-title`} className="text-h3 text-ink">
          {titleCase("Proof")}
        </h2>
        {note ? <div className="text-credit max-w-[40rem]">{note}</div> : null}
      </header>
      <Tabs value={placement} onValueChange={(v) => setPlacement(v as ProofPlacement)} className="gap-4">
        <div className="flex flex-wrap items-end gap-x-3">
          <span id={`${id}-as`} className="text-dl-label pb-3">
            Preview as
          </span>
          <TabsList aria-labelledby={`${id}-as`} className="w-auto flex-1">
            {PROOF_PLACEMENTS.map((p) => (
              <TabsTrigger key={p.value} value={p.value}>
                {p.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {PROOF_PLACEMENTS.map((p) => (
          <TabsContent key={p.value} value={p.value} className="min-w-0">
            {/* The ticks sit 6 px outside the frame; the margin keeps them inside the column. */}
            <TickedFrame className="m-1.5 border border-rule">{viewport(p.value)}</TickedFrame>
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}
