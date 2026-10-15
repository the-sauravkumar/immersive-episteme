"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import { authClient } from "./auth-client";

/** Signs the staff member out through Better Auth, then returns to the sign-in page. */
export function useSignOut() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function signOut() {
    setPending(true);
    await authClient.signOut();
    router.replace("/sign-in");
    router.refresh();
  }
  return { pending, signOut };
}

export function SignOutButton({ variant = "ghost" }: { variant?: "ghost" | "outline" | "default" }) {
  const { pending, signOut } = useSignOut();
  return (
    <Button type="button" variant={variant} disabled={pending} onClick={() => void signOut()}>
      <LogOut aria-hidden="true" />
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
