import type { Metadata } from "next";
import { LogOut } from "lucide-react";

import { SignOutButton } from "@/components/shell/sign-out-button";
import { titleCase } from "@/lib/text/title-case";

export const metadata: Metadata = { title: "Sign Out" };

/** Sign-out (DESIGN.md 11.4): the state-message layout in the public chrome. */
export default function SignOutPage() {
  return (
    <section aria-labelledby="sign-out-title" className="mx-auto flex w-full max-w-[40rem] flex-col items-start gap-4 py-4">
      <LogOut aria-hidden="true" strokeWidth={1.5} className="size-8 text-ink" />
      <h1 id="sign-out-title" className="text-title text-ink">
        {titleCase("Sign out")}
      </h1>
      <p className="text-reading text-ink">End your staff session on this device.</p>
      <SignOutButton variant="default" />
    </section>
  );
}
