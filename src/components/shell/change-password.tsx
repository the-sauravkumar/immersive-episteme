"use client";

import { CircleAlert } from "lucide-react";
import { useId, useRef, useState, type FormEvent } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changePasswordErrorMessage, changePasswordProblem, type ChangePasswordFields } from "@/lib/access/change-password";

import { authClient } from "./auth-client";

type Outcome = { ok: true } | { ok: false; field?: keyof ChangePasswordFields; message: string } | null;

export function ChangePasswordDialog({ open, onOpenChange, minPasswordLength }: { open: boolean; onOpenChange: (open: boolean) => void; minPasswordLength: number }) {
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [pending, setPending] = useState(false);
  const alertRef = useRef<HTMLDivElement>(null);
  const base = useId();
  const ids = { currentPassword: `${base}-current`, newPassword: `${base}-new`, repeatPassword: `${base}-repeat`, hint: `${base}-hint` };

  function fail(message: string, field?: keyof ChangePasswordFields) {
    setOutcome({ ok: false, field, message });
    requestAnimationFrame(() => alertRef.current?.focus());
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const fields: ChangePasswordFields = {
      currentPassword: String(form.get("currentPassword") ?? ""),
      newPassword: String(form.get("newPassword") ?? ""),
      repeatPassword: String(form.get("repeatPassword") ?? ""),
    };
    const problem = changePasswordProblem(fields, minPasswordLength);
    if (problem) return fail(problem.message, problem.field);
    setPending(true);
    try {
      const { error } = await authClient.changePassword({ currentPassword: fields.currentPassword, newPassword: fields.newPassword, revokeOtherSessions: true });
      if (error) return fail(changePasswordErrorMessage(error));
      setOutcome({ ok: true });
      requestAnimationFrame(() => alertRef.current?.focus());
    } catch {
      fail("The password could not be changed because the connection failed. Nothing was changed; try again.");
    } finally {
      setPending(false);
    }
  }

  function field(name: keyof ChangePasswordFields, label: string, autoComplete: string, describedBy?: string) {
    const invalid = outcome && !outcome.ok && outcome.field === name;
    return (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={ids[name]}>{label}</Label>
        <Input id={ids[name]} name={name} type="password" autoComplete={autoComplete} required aria-invalid={invalid ? true : undefined} aria-describedby={describedBy} />
      </div>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setOutcome(null);
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change Password</DialogTitle>
          <DialogDescription>Your other signed-in sessions end when the password changes. This browser stays signed in.</DialogDescription>
        </DialogHeader>
        {outcome?.ok ? (
          <div className="flex flex-col gap-4">
            <Alert variant="info" ref={alertRef} tabIndex={-1}>
              <AlertTitle>Password changed</AlertTitle>
              <AlertDescription>Use the new password the next time you sign in.</AlertDescription>
            </Alert>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button">Close</Button>
              </DialogClose>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4" noValidate>
            {outcome && !outcome.ok ? (
              <Alert variant="destructive" ref={alertRef} tabIndex={-1}>
                <CircleAlert aria-hidden="true" />
                <AlertTitle>Error: not changed</AlertTitle>
                <AlertDescription>{outcome.message}</AlertDescription>
              </Alert>
            ) : null}
            {field("currentPassword", "Current password", "current-password")}
            {field("newPassword", "New password", "new-password", ids.hint)}
            <p id={ids.hint} className="t-s text-lime-dim">
              At least {minPasswordLength} characters.
            </p>
            {field("repeatPassword", "Repeat the new password", "new-password")}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={pending}>
                {pending ? "Changing…" : "Change password"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
