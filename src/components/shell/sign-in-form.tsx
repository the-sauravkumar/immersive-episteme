"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useId, useRef, useState, type FormEvent } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { STAFF_HOME } from "@/lib/permissions/console-routes";
import { safeNextPath } from "@/lib/permissions/safe-redirect";

import { authClient } from "./auth-client";

function messageFor(status: number | undefined, fallback: string | undefined): string {
  if (status === 429) return "Too many sign-in attempts. Wait a minute and try again.";
  if (status === 401 || status === 403) return "That email and password do not match an active staff account.";
  return fallback ?? "Sign-in failed. Try again.";
}

export function SignInForm() {
  const router = useRouter();
  const search = useSearchParams();
  // No explicit target: /console picks the first page this account's roles can open.
  const next = safeNextPath(search.get("next"), STAFF_HOME);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const emailId = useId();
  const passwordId = useId();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    const { error: err } = await authClient.signIn.email({
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    });
    if (err) {
      setPending(false);
      setError(messageFor(err.status, err.message));
      // Move focus to the error so screen-reader and keyboard users hear it.
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate={false}>
      {error ? (
        <Alert variant="destructive" ref={errorRef} tabIndex={-1}>
          <AlertTitle>Could not sign in</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor={emailId}>Email</Label>
        <Input id={emailId} name="email" type="email" autoComplete="username" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={passwordId}>Password</Label>
        <Input id={passwordId} name="password" type="password" autoComplete="current-password" required />
      </div>
      <Button type="submit" size="lg" disabled={pending} className="min-h-11">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
