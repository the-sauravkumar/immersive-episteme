"use client";

import { CircleAlert, CircleCheck } from "lucide-react";
import { useActionState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";

import { IDLE, type ActionState } from "./action-state";

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
        <div role={state.status === "error" ? "alert" : "status"} aria-live="polite" className="font-sans t-s">
          {state.status === "ok" ? (
            <span className="inline-flex items-center gap-1.5 text-lime">
              <CircleCheck aria-hidden="true" className="size-4 shrink-0 stroke-[1.75] text-ok" />
              <span>
                <span className="font-semibold">Done:</span> {state.message}
              </span>
            </span>
          ) : null}
          {state.status === "error" ? (
            <span className="inline-flex items-center gap-1.5 text-madder-text">
              <CircleAlert aria-hidden="true" className="size-4 shrink-0 stroke-[1.75]" />
              <span>
                <span className="font-semibold">Error:</span> {state.message}
              </span>
            </span>
          ) : null}
        </div>
      </div>
      {state.details?.length ? (
        <ul className="list-disc pl-5 font-sans t-s text-madder-text">
          {state.details.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}
