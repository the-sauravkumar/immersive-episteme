"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import { authClient } from "./auth-client";

export const SIGN_OUT_FAILED = "Sign-out failed: you are still signed in on this device. Check your connection and try again.";

async function endSession(): Promise<boolean> {
  try {
    const { error } = await authClient.signOut();
    return !error;
  } catch {
    return false;
  }
}

export function useSignOut() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  async function signOut() {
    setPending(true);
    setFailed(false);
    if (!(await endSession())) {
      setPending(false);
      setFailed(true);
      return;
    }
    router.replace("/sign-in");
    router.refresh();
  }
  return { pending, failed, signOut, dismiss: () => setFailed(false) };
}

export function SignOutButton({ variant = "ghost" }: { variant?: "ghost" | "outline" | "default" }) {
  const { pending, failed, signOut } = useSignOut();
  return (
    <div className="flex flex-col items-start gap-2">
      <Button type="button" variant={variant} disabled={pending} onClick={() => void signOut()}>
        <LogOut aria-hidden="true" />
        {pending ? "Signing out…" : "Sign out"}
      </Button>
      <p role="alert" className="t-b font-semibold text-madder-text empty:hidden">
        {failed ? SIGN_OUT_FAILED : ""}
      </p>
    </div>
  );
}
