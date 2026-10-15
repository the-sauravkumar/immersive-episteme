"use client";

import { CircleAlert, CircleCheck } from "lucide-react";
import { useActionState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";

import { IDLE, type ActionState } from "./action-state";

/**
 * A form bound to a Server Action; shows the action's outcome in a live region. Outcomes carry
 * an icon and a word ("Done", "Error"), never colour alone (DESIGN.md 9.5, R-A4). Buttons are the
 * 44 px primitives; `destructive` is the outlined danger button (the filled one is reserved for
 * confirm dialogs, DESIGN.md 9.1). While the action runs the button is aria-disabled, not disabled,
 * so a keyboard user's focus stays on it (a natively disabled focused button drops focus to <body>),
 * and the form refuses a second submission.
 */
export function ActionForm({
  action,
  submitLabel,
  children,
  variant = "default",
  className,
}: {
  action: (prev: ActionState, data: FormData) => Promise<ActionState>;
  submitLabel: string;
  children?: ReactNode;
  variant?: "default" | "outline" | "destructive";
  className?: string;
}) {
  const [state, run, pending] = useActionState(action, IDLE);
  return (
    <form action={run} onSubmit={(e) => (pending ? e.preventDefault() : undefined)} className={className ?? "flex flex-col gap-4"}>
      {children}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button type="submit" variant={variant} aria-disabled={pending || undefined}>
          {pending ? "Working…" : submitLabel}
        </Button>
        <div role={state.status === "error" ? "alert" : "status"} aria-live="polite" className="font-sans text-[0.9375rem] leading-5">
          {state.status === "ok" ? (
            <span className="inline-flex items-center gap-1.5 text-ink">
              <CircleCheck aria-hidden="true" className="size-4 shrink-0 stroke-[1.75] text-ok" />
              <span>
                <span className="font-semibold">Done:</span> {state.message}
              </span>
            </span>
          ) : null}
          {state.status === "error" ? (
            <span className="inline-flex items-center gap-1.5 text-danger">
              <CircleAlert aria-hidden="true" className="size-4 shrink-0 stroke-[1.75]" />
              <span>
                <span className="font-semibold">Error:</span> {state.message}
              </span>
            </span>
          ) : null}
        </div>
      </div>
      {state.details?.length ? (
        <ul className="list-disc pl-5 font-sans text-[0.9375rem] leading-6 text-danger">
          {state.details.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}
