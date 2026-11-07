import { countOf } from "@/components/brand/numbering";
import { clothStripPath } from "@/features/process/domain/asset-catalogue";
import { cn } from "@/lib/utils";
import type { StudyStep } from "@/server/study/config";
import type { Position } from "@/server/study/engine";

export interface StepCount {
  current: number;
  total: number;
}

const STEP_CLOTH = clothStripPath("ajrakh-raw");

export function stepCountOf(steps: readonly StudyStep[], position: Position): StepCount | null {
  if (position.kind !== "step") return null;
  const index = steps.indexOf(position.step);
  if (index < 0 || steps.length === 0) return null;
  return { current: index + 1, total: steps.length };
}

function stateOf(index: number, current: number): "done" | "current" | "ahead" {
  if (index + 1 < current) return "done";
  return index + 1 === current ? "current" : "ahead";
}

export function StepProgress({ count }: { count: StepCount | null }) {
  if (!count) return null;
  const text = countOf("Step", count.current, count.total);
  return (
    <div data-slot="study-progress" className="mb-8 flex flex-col gap-2">
      <p className="t-label tabular-nums text-lime-dim" aria-hidden="true">
        {text}
      </p>
      <div
        role="progressbar"
        aria-label="Study progress"
        aria-valuemin={0}
        aria-valuemax={count.total}
        aria-valuenow={count.current}
        aria-valuetext={text}
        className="grid auto-cols-fr grid-flow-col gap-px"
      >
        {Array.from({ length: count.total }, (_, index) => {
          const state = stateOf(index, count.current);
          return (
            <span
              key={index}
              data-state={state}
              className={cn(
                "block h-3 bg-vat bg-cover bg-center",
                state === "current" && "outline-3 -outline-offset-1 outline-turmeric",
                state === "ahead" && "bg-[repeating-linear-gradient(0deg,var(--thread)_0_1px,transparent_1px_5px)]",
              )}
              style={state === "ahead" ? undefined : { backgroundImage: `url("${STEP_CLOTH}")` }}
            />
          );
        })}
      </div>
    </div>
  );
}
