"use client";

import { CircleAlert, CircleCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/server/assessment/research-actions";

export const fieldClass =
  "min-h-11 w-full min-w-0 border border-lime-dim bg-vat px-3 py-[9px] t-b text-lime placeholder:text-lime-dim disabled:cursor-not-allowed disabled:border-line disabled:bg-vat-2 disabled:text-lime-dim aria-invalid:border-madder-text";

export const checkRowClass = "flex min-h-11 cursor-pointer items-center gap-3 font-sans t-s text-lime";
export const checkBoxClass = "ie-check";

function Outcome({ result }: { result: ActionResult | null }) {
  return (
    <p role="status" aria-live="polite" className="font-sans t-s">
      {result ? (
        result.ok ? (
          <span className="inline-flex items-center gap-1.5 text-lime">
            <CircleCheck aria-hidden="true" className="size-4 shrink-0 stroke-[1.75] text-ok" />
            <span>
              <span className="font-semibold">Done:</span> {result.message ?? "Saved."}
            </span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-madder-text">
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

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={["flex min-w-0 flex-col gap-1.5", className].filter(Boolean).join(" ")}>
      <span className="t-label text-lime">{label}</span>
      {children}
      {hint ? <span className="t-s text-lime-dim">{hint}</span> : null}
    </label>
  );
}
