"use client";

/**
 * Form bound to a server action through useActionState. Shows the refusal in an alert that takes
 * focus (keyboard and screen-reader users hear it) and the success message in a polite live
 * region. Field errors are exposed to children through `FieldMessage`.
 */
import { CircleAlert } from "lucide-react";
import Link from "next/link";
import { createContext, useActionState, useContext, useEffect, useId, useRef, type ReactNode } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { ActionState } from "./action-state";

export type FormAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

const StateContext = createContext<ActionState>(null);

export function ActionForm({
  action,
  children,
  submitLabel,
  pendingLabel = "Saving…",
  submitVariant = "default",
  className,
  onDone,
  resetOnSuccess = false,
  submitBlocked,
}: {
  action: FormAction;
  children?: ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  submitVariant?: "default" | "outline" | "secondary" | "destructive" | "ghost";
  className?: string;
  onDone?: (state: NonNullable<ActionState>) => void;
  resetOnSuccess?: boolean;
  /**
   * Why the form cannot be submitted yet (for example "Choose a decision first."). The button stays
   * focusable with `aria-disabled` and this note as its description (9.1), and a click or Enter does
   * nothing, so a slip never records a decision nobody chose.
   */
  submitBlocked?: string | null;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const blockedId = useId();
  const errorRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state) return;
    if (!state.ok) errorRef.current?.focus();
    if (state.ok && resetOnSuccess) formRef.current?.reset();
    onDone?.(state);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per new state
  }, [state]);

  return (
    <StateContext value={state}>
      <form ref={formRef} action={formAction} onSubmit={(e) => (pending ? e.preventDefault() : undefined)} className={cn("flex flex-col gap-4", className)}>
        {state && !state.ok ? (
          <Alert variant="destructive" ref={errorRef} tabIndex={-1}>
            <CircleAlert aria-hidden="true" />
            <AlertTitle>Error: not saved</AlertTitle>
            <AlertDescription>
              {state.error}
              {Array.isArray((state.data as { details?: unknown } | undefined)?.details) ? (
                <ul className="mt-1 list-disc pl-5">
                  {((state.data as { details: { code?: string; message?: string }[] }).details).slice(0, 20).map((d, i) => (
                    <li key={i}>
                      {d.code ? <code className="text-id mr-1">{d.code}</code> : null}
                      {d.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}
        {children}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button
            type="submit"
            variant={submitVariant === "secondary" ? "outline" : submitVariant}
            aria-disabled={pending || submitBlocked ? true : undefined}
            aria-describedby={submitBlocked ? blockedId : undefined}
            onClick={submitBlocked ? (e) => e.preventDefault() : undefined}
          >
            {pending ? pendingLabel : submitLabel}
          </Button>
          {submitBlocked ? (
            <p id={blockedId} className="text-body text-ink-2">
              {submitBlocked}
            </p>
          ) : null}
          <p role="status" aria-live="polite" className="text-body text-ink-2 empty:hidden">
            {state?.ok ? state.message : ""}
            {state?.ok && typeof state.data?.href === "string" ? (
              <>
                {" "}
                <Link className="inline-flex min-h-11 items-center text-indigo underline decoration-1 underline-offset-[0.2em] hover:decoration-2" href={state.data.href}>
                  {typeof state.data.hrefLabel === "string" ? state.data.hrefLabel : "Open"}
                </Link>
              </>
            ) : null}
          </p>
        </div>
      </form>
    </StateContext>
  );
}

/** Validation messages for one field (`name` = form field name / dotted path). */
export function FieldMessage({ name, id }: { name: string; id?: string }) {
  const state = useContext(StateContext);
  const msgs = state?.fieldErrors?.[name];
  if (!msgs?.length) return null;
  return (
    <p id={id} className="flex items-start gap-2 font-sans text-[0.9375rem] leading-5 font-semibold text-danger">
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 stroke-2" />
      <span className="min-w-0">{msgs.join(" ")}</span>
    </p>
  );
}

/** The current action state (for custom rendering inside an ActionForm). */
export function useFormState(): ActionState {
  return useContext(StateContext);
}

/** Every validation message whose field path starts with `prefix` (nested lists such as sources.0.locator). */
export function PrefixErrors({ prefix, describe }: { prefix: string; describe?: (path: string) => string }) {
  const state = useContext(StateContext);
  const msgs = Object.entries(state?.fieldErrors ?? {}).filter(([k]) => k === prefix || k.startsWith(`${prefix}.`));
  if (!msgs.length) return null;
  return (
    <ul className="list-disc pl-5 font-sans text-[0.9375rem] leading-5 font-semibold text-danger">
      {msgs.map(([k, m]) => (
        <li key={k}>
          {describe ? describe(k) : k}: {m.join(" ")}
        </li>
      ))}
    </ul>
  );
}
