/**
 * Progress through a study session (DESIGN.md 11.7): "Step n of N" in tabular figures and a 2 px
 * `--ink`-on-`--rule` line (the Progress primitive, no transition). No percentages, badges or
 * celebration. Rendered at the top of every in-session step page, identically for both
 * conditions: the count comes from the protocol's step list, which is the same for every
 * participant of a study.
 *
 * Positions outside the protocol's step list (allocation, the device check, the final
 * confirmation) show no count: they are not numbered steps of the protocol.
 */
import { countOf } from "@/components/brand/numbering";
import { Progress } from "@/components/ui/progress";
import type { StudyStep } from "@/server/study/config";
import type { Position } from "@/server/study/engine";

export interface StepCount {
  current: number;
  total: number;
}

/** Pure: the 1-based step number of the current position, or null when it is not a protocol step. */
export function stepCountOf(steps: readonly StudyStep[], position: Position): StepCount | null {
  if (position.kind !== "step") return null;
  const index = steps.indexOf(position.step);
  if (index < 0 || steps.length === 0) return null;
  return { current: index + 1, total: steps.length };
}

export function StepProgress({ count }: { count: StepCount | null }) {
  if (!count) return null;
  const text = countOf("Step", count.current, count.total);
  return (
    <div data-slot="study-progress" className="mb-8 flex flex-col gap-2">
      <p className="text-timer text-ink-2" aria-hidden="true">
        {text}
      </p>
      {/* High contrast turns --rule into --ink, so a 2 px ink bar on an ink track would read as one
          solid rule. There the track becomes an 8 px ink-outlined --sunk channel that the ink
          indicator fills, so the line still shows how far along the participant is. */}
      <Progress
        value={(count.current / count.total) * 100}
        aria-label="Study progress"
        aria-valuetext={text}
        className="hc:h-2 hc:border hc:border-ink hc:bg-sunk"
      />
    </div>
  );
}
