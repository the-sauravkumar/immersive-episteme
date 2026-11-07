"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useId, useRef, useState, type FormEvent } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { googleStartErrorMessage, signInErrorMessage } from "@/lib/access/sign-in-errors";
import { AWAITING_ACCESS_PATH, STAFF_HOME } from "@/lib/permissions/console-routes";
import { safeNextPath } from "@/lib/permissions/safe-redirect";

import { authClient } from "./auth-client";
import { GoogleButton } from "./google-button";
import { googleSignInErrorMessage } from "./google-sign-in-errors";

const SIGN_IN_PATH = "/sign-in";

function errorPathFor(next: string): string {
  return next === STAFF_HOME ? SIGN_IN_PATH : `${SIGN_IN_PATH}?next=${encodeURIComponent(next)}`;
}

export function SignInForm({ google }: { google: boolean }) {
  const router = useRouter();
  const search = useSearchParams();
  const next = safeNextPath(search.get("next"), STAFF_HOME);
  const [error, setError] = useState<string | null>(() => (google ? googleSignInErrorMessage(search.get("error")) : null));
  const [pending, setPending] = useState<"email" | "google" | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const emailId = useId();
  const passwordId = useId();

  function showError(message: string) {
    setPending(null);
    setError(message);
    requestAnimationFrame(() => errorRef.current?.focus());
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending("email");
    setError(null);
    const { error: err } = await authClient.signIn.email({
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    });
    if (err) {
      showError(signInErrorMessage(err));
      return;
    }
    router.replace(next);
    router.refresh();
  }

  async function onGoogle() {
    setPending("google");
    setError(null);
    const { error: err } = await authClient.signIn.social({
      provider: "google",
      callbackURL: next,
      newUserCallbackURL: AWAITING_ACCESS_PATH,
      errorCallbackURL: errorPathFor(next),
    });
    if (err) showError(googleStartErrorMessage(err.status));
  }

  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <Alert variant="destructive" ref={errorRef} tabIndex={-1}>
          <AlertTitle>Could not sign in</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate={false}>
        <div className="flex flex-col gap-2">
          <Label htmlFor={emailId}>Email</Label>
          <Input id={emailId} name="email" type="email" autoComplete="username" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={passwordId}>Password</Label>
          <Input id={passwordId} name="password" type="password" autoComplete="current-password" required />
        </div>
        <Button type="submit" disabled={pending !== null}>
          {pending === "email" ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      {google ? (
        <div className="flex flex-col gap-3 border-t border-line pt-6">
          <p className="t-b text-lime-dim">Or use your Google account.</p>
          <GoogleButton disabled={pending !== null} opening={pending === "google"} onClick={() => void onGoogle()} />
        </div>
      ) : null}
    </div>
  );
}
