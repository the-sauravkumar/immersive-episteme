"use client";

/**
 * Small client helpers for research-console server actions: a form bound with useActionState,
 * and a one-click action button with an optional confirmation. Results are announced politely,
 * with an icon and a word, never colour alone (DESIGN.md 9.5, R-A4).
 *
 * `fieldClass` is the 9.5 input style for native inputs, selects and textareas: at least 44 px
 * tall, 1 px --rule-strong border, 3 px radius, --surface fill, Inter 16 px (no iOS zoom).
 */
import { CircleAlert, CircleCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/server/assessment/research-actions";

export const fieldClass =
  "min-h-11 w-full min-w-0 rounded-control border border-rule-strong bg-surface px-3 py-[9px] font-sans text-base leading-6 text-ink placeholder:text-ink-3 disabled:cursor-not-allowed disabled:border-rule disabled:bg-sunk disabled:text-ink-3 aria-invalid:border-danger";

/** A full-row 44 px label around a 20 px checkbox or radio (DESIGN.md 9.5). */
export const checkRowClass = "flex min-h-11 cursor-pointer items-center gap-3 font-sans text-[0.9375rem] leading-5 text-ink";
export const checkBoxClass = "size-5 shrink-0 accent-indigo";

function Outcome({ result }: { result: ActionResult | null }) {
  return (
    <p role="status" aria-live="polite" className="font-sans text-[0.9375rem] leading-5">
      {result ? (
        result.ok ? (
          <span className="inline-flex items-center gap-1.5 text-ink">
            <CircleCheck aria-hidden="true" className="size-4 shrink-0 stroke-[1.75] text-ok" />
            <span>
              <span className="font-semibold">Done:</span> {result.message ?? "Saved."}
            </span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-danger">
            <CircleAlert aria-hidden="true" className="size-4 shrink-0 stroke-[1.75]" />
            <span>
              <span className="font-semibold">Error:</span> {result.error}
            </span>
          </span>
        )
      ) : null}
    </p>
  );
}

export function ActionForm({
  action,
  submitLabel,
  children,
  redirectTo,
  className,
  resetOnSuccess = false,
}: {
  action: (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;
  submitLabel: string;
  children: ReactNode;
  /** Navigate after success; `{id}` is replaced with the returned id. */
  redirectTo?: string;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const router = useRouter();
  const [formKey, setFormKey] = useState(0);
  const [result, run, pending] = useActionState(async (prev: ActionResult | null, fd: FormData) => {
    const r = await action(prev, fd);
    if (r.ok && redirectTo) router.push(redirectTo.replace("{id}", r.id ?? ""));
    else if (r.ok && resetOnSuccess) setFormKey((k) => k + 1);
    return r;
  }, null);
  return (
    <form key={formKey} action={run} onSubmit={(e) => (pending ? e.preventDefault() : undefined)} className={className ?? "flex flex-col gap-4"}>
      {children}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {/* aria-disabled, not disabled: focus stays on the button while the action runs. */}
        <Button type="submit" aria-disabled={pending || undefined}>
          {pending ? "Working…" : submitLabel}
        </Button>
        <Outcome result={result} />
      </div>
    </form>
  );
}

export function ActionButton({
  action,
  label,
  confirm,
  variant = "outline",
  redirectTo,
}: {
  action: () => Promise<ActionResult>;
  label: string;
  confirm?: string;
  variant?: "default" | "outline" | "destructive";
  redirectTo?: string;
}) {
  const router = useRouter();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <Button
        type="button"
        variant={variant}
        disabled={pending}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          start(async () => {
            const r = await action();
            setResult(r);
            if (r.ok && redirectTo) router.push(redirectTo.replace("{id}", r.id ?? ""));
          });
        }}
      >
        {pending ? "Working…" : label}
      </Button>
      <Outcome result={result} />
    </div>
  );
}

/** Label above (Inter 14/500), the control, then help text in `text-credit` (DESIGN.md 9.5). */
export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={["flex min-w-0 flex-col gap-1.5", className].filter(Boolean).join(" ")}>
      <span className="font-sans text-[0.875rem] leading-5 font-medium text-ink">{label}</span>
      {children}
      {hint ? <span className="text-credit">{hint}</span> : null}
    </label>
  );
}
