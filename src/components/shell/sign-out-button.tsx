"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import { authClient } from "./auth-client";

export function SignOutButton({ variant = "ghost" }: { variant?: "ghost" | "outline" | "default" }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <Button
      type="button"
      variant={variant}
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await authClient.signOut();
        router.replace("/sign-in");
        router.refresh();
      }}
    >
      <LogOut aria-hidden="true" />
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
