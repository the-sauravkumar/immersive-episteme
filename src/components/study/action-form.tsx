"use client";

/**
 * A form bound to a study server action through useActionState: shows the action's error in an
 * alert (announced to screen readers) and ignores a second submit while the first is pending, so a
 * double click cannot submit twice. The submit button is never natively disabled (useStudyFormGuard).
 *
 * The action row follows DESIGN.md 11.7: 44 px buttons, the primary action on the right and last
 * in DOM and tab order; an optional `back` control (outline) sits on the left.
 */
import { CircleAlert } from "lucide-react";
import { useActionState, useEffect, useRef, type FormEvent, type ReactNode } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import type { FormState } from "@/server/study/actions";

export type StudyAction = (prev: FormState, formData: FormData) => Promise<FormState>;

/**
 * The action row: `back` on the left, the primary action on the right (last in DOM order). Under
 * 520 px the buttons stack at full width in DOM order, so neither is left dangling on a second line.
 */
export function StudyActions({ back, children }: { back?: ReactNode; children: ReactNode }) {
  return (
    <div
      data-slot="study-actions"
      className="flex flex-col items-stretch gap-3 xs:flex-row xs:flex-wrap xs:items-center xs:justify-between [&_[data-slot=button]]:max-xs:w-full"
    >
      {back ?? <span aria-hidden="true" className="max-xs:hidden" />}
      <div className="flex flex-col gap-3 xs:ml-auto xs:flex-row xs:flex-wrap xs:justify-end">{children}</div>
    </div>
  );
}

/** An action's refusal: the word "Error", an icon and the message (never colour alone, R-A4). */
export function FormErrorAlert({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <Alert variant="destructive" role="alert">
      <CircleAlert aria-hidden="true" />
      <AlertTitle>Error</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

/**
 * Keyboard focus for a study form (WCAG 2.4.3; DESIGN.md 9.1 "aria-disabled and focusable").
 *
 *  - While the action runs, the submit button keeps focus: it carries `aria-disabled`, never the
 *    native `disabled` attribute, which drops a focused button's focus to <body> (the next Tab then
 *    started from the end of the page). `onSubmit` ignores a second submit while the first is
 *    pending: React does not run a form action whose submit event was default-prevented.
 *  - After a refusal with a field error, focus moves to the first invalid control (the study code,
 *    the consent or withdrawal confirmation), which names its error through aria-describedby. A
 *    form-level error leaves focus on the button the participant pressed; its alert is announced.
 *  - Nothing the participant entered is lost on a refusal. React 19 resets a form after every
 *    completed form action, refusals included, by calling form.reset(); its `reset` event is
 *    cancelable, so `onReset` cancels it. Without this a refused entry wiped the typed code and a
 *    refused withdrawal silently put the chosen reason back to "I prefer not to say". A study
 *    form has no reset button, and a successful action navigates away.
 */
/** Cancels React's automatic form reset after a form action (see useStudyFormGuard). */
export function keepEnteredValues(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
}

export function useStudyFormGuard(state: FormState, pending: boolean) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!state.fieldErrors || Object.keys(state.fieldErrors).length === 0) return;
    ref.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (pending) event.preventDefault();
  };
  return { ref, onSubmit, onReset: keepEnteredValues };
}

export function ActionForm({
  action,
  submitLabel,
  pendingLabel = "Please wait…",
  variant = "default",
  children,
  hidden = {},
  className,
  back,
}: {
  action: StudyAction;
  submitLabel: string;
  pendingLabel?: string;
  variant?: "default" | "outline" | "destructive";
  children?: ReactNode;
  hidden?: Record<string, string>;
  className?: string;
  back?: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const guard = useStudyFormGuard(state, pending);
  return (
    <form action={formAction} {...guard} className={className ?? "flex flex-col gap-6"} noValidate>
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children}
      <FormErrorAlert message={state.error} />
      <StudyActions back={back}>
        <Button type="submit" variant={variant} aria-disabled={pending}>
          {pending ? pendingLabel : submitLabel}
        </Button>
      </StudyActions>
    </form>
  );
}

/** Field error text linked from the control through aria-describedby: an icon and the words (DESIGN.md 9.5). */
export function FieldErrorText({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return <FieldError id={id}>{message}</FieldError>;
}
