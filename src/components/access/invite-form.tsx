"use client";

import { CircleAlert } from "lucide-react";
import { useActionState, useEffect, useId, useRef } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { redeemInviteAction } from "@/server/access/actions";

/**
 * The /invite form (S11): one 44 px field and one primary button. A refusal moves focus to the
 * alert (or back to the field for a malformed code), so keyboard and screen-reader users hear it.
 */
export function InviteForm({ next, refused }: { next: string; refused: boolean }) {
  const [state, action, pending] = useActionState(redeemInviteAction, null);
  const id = useId();
  const errorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const error = state?.error ?? (state === null && refused ? "That invite link did not work. It may have expired, been withdrawn or been used up." : undefined);

  useEffect(() => {
    if (state?.fieldError) inputRef.current?.focus();
    else if (state?.error) errorRef.current?.focus();
  }, [state]);

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {error ? (
        <Alert variant="destructive" ref={errorRef} tabIndex={-1}>
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Code not accepted</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <input type="hidden" name="next" value={next} />
      <div className="flex flex-col gap-2">
        <Label htmlFor={id}>Invite code</Label>
        <Input
          ref={inputRef}
          id={id}
          name="code"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          required
          aria-invalid={state?.fieldError ? true : undefined}
          aria-describedby={state?.fieldError ? `${id}-hint ${id}-error` : `${id}-hint`}
          className="text-id"
        />
        <p id={`${id}-hint`} className="text-credit">
          Twenty letters and digits, for example ABCD-EFGH-JKMN-PQRS-TVWX. Case and dashes do not matter.
        </p>
        {state?.fieldError ? (
          <p id={`${id}-error`} className="flex items-start gap-2 font-sans text-[0.9375rem] leading-5 font-semibold text-danger">
            <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 stroke-2" />
            <span className="min-w-0">{state.fieldError}</span>
          </p>
        ) : null}
      </div>
      <div>
        <Button type="submit" aria-disabled={pending ? true : undefined} onClick={pending ? (e) => e.preventDefault() : undefined}>
          {pending ? "Checking…" : "Continue"}
        </Button>
      </div>
    </form>
  );
}
