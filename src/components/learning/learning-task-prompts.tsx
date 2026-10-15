"use client";

/**
 * Learning-task prompts, SHARED by both conditions so the prompts look and behave identically
 * (master spec §7.4 / §9.2: identical learning prompts in both conditions).
 *
 * The prompts come verbatim from the study protocol (`learningPrompts`, read through the learning
 * context as `ctx.settings.learningPrompts`); this component never supplies text of its
 * own and renders nothing when the protocol defines no prompts. A collapsible, non-modal panel:
 * opening or closing it is logged as an information layer (`layerId: "task-prompts"`), and it
 * never pauses or ends content exposure.
 */
import { ChevronDown, ChevronRight } from "lucide-react";
import { useId, useRef, useState } from "react";

import type { LearningPrompt } from "@/features/learning/settings";
import { TASK_TEXT } from "@/features/learning/strings";
import { useOptionalTelemetry } from "@/features/telemetry/client/provider";
import { titleCase } from "@/lib/text/title-case";
import { cn } from "@/lib/utils";

export function LearningTaskPrompts({ prompts, defaultOpen = true, className }: { prompts: readonly LearningPrompt[]; defaultOpen?: boolean; className?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  const openedAt = useRef<number | null>(defaultOpen ? 0 : null);
  const telemetry = useOptionalTelemetry();
  if (prompts.length === 0) return null;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (!telemetry) return;
    if (next) {
      openedAt.current = performance.now();
      void telemetry.informationLayerOpened({ metadata: { layerId: "task-prompts" } });
    } else {
      const since = openedAt.current;
      openedAt.current = null;
      const openMs = since ? Math.max(0, Math.floor(performance.now() - since)) : undefined;
      void telemetry.informationLayerClosed({ metadata: { layerId: "task-prompts", ...(openMs === undefined ? {} : { openMs }) } });
    }
  };

  // DESIGN.md 9.17 card styling: --surface, 1 px --rule-strong border, 2 px radius, no shadow.
  return (
    <aside aria-label={TASK_TEXT.label} className={cn("rounded-card border border-rule-strong bg-ground text-ink", className)} data-slot="learning-task-prompts">
      <h2 className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={toggle}
          className="text-ui flex min-h-11 w-full items-center gap-2 px-4 py-2 text-left text-ink hover:bg-sunk"
        >
          {open ? <ChevronDown aria-hidden="true" strokeWidth={1.75} className="size-4 shrink-0" /> : <ChevronRight aria-hidden="true" strokeWidth={1.75} className="size-4 shrink-0" />}
          {titleCase(TASK_TEXT.heading)}
        </button>
      </h2>
      <div id={panelId} hidden={!open} className="px-4 pb-4">
        <ol className="text-reading list-decimal space-y-2 pl-5">
          {prompts.map((p) => (
            <li key={p.id}>{p.text}</li>
          ))}
        </ol>
      </div>
    </aside>
  );
}
