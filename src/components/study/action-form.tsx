"use client";

import { CircleAlert } from "lucide-react";
import { useActionState, useEffect, useRef, type FormEvent, type ReactNode } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import type { FormState } from "@/server/study/actions";

export type StudyAction = (prev: FormState, formData: FormData) => Promise<FormState>;

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

export function FieldErrorText({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return <FieldError id={id}>{message}</FieldError>;
}
