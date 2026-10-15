"use client";

/**
 * When a layer holds several concepts, one is shown at a time (exposure is per concept): the
 * chooser rows above the shown concept, ONE copy for both conditions (DESIGN.md 12.1 rule 1).
 * 44 px rows, `aria-pressed`, a check icon and the word "Selected" for the chosen one.
 */
import { Check } from "lucide-react";

import { LAYER_TEXT } from "@/features/learning/strings";
import { titleCase } from "@/lib/text/title-case";
import { cn } from "@/lib/utils";

export function ConceptChooser({ entries, selected, onSelect }: { entries: readonly { conceptId: string; title: string }[]; selected: string; onSelect(conceptId: string): void }) {
  return (
    <ul role="group" aria-label={LAYER_TEXT.chooserLabel} data-slot="panel-concept-chooser" className="mb-6 border-y border-rule">
      {entries.map((e) => {
        const on = e.conceptId === selected;
        return (
          <li key={e.conceptId} className="border-t border-rule first:border-t-0">
            <button
              type="button"
              aria-pressed={on}
              onClick={() => onSelect(e.conceptId)}
              className={cn(
                "text-ui flex min-h-11 w-full items-center gap-2 py-2 text-left",
                on ? "font-semibold text-ink" : "text-indigo underline decoration-1 underline-offset-[0.2em] hover:text-indigo-hover hover:decoration-2",
              )}
            >
              <span className="flex size-5 shrink-0 items-center justify-center" aria-hidden="true">
                {on ? <Check strokeWidth={1.75} className="size-5" /> : null}
              </span>
              <span className="min-w-0">{titleCase(e.title)}</span>
              {on ? <span className="sr-only"> ({LAYER_TEXT.selected})</span> : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
