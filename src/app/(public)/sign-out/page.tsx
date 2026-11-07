import type { Metadata } from "next";

import { SignOutButton } from "@/components/shell/sign-out-button";
import { titleCase } from "@/lib/text/title-case";

export const metadata: Metadata = { title: "Sign Out" };

export default function SignOutPage() {
  return (
    <section aria-labelledby="sign-out-title" className="flex w-full max-w-[40rem] flex-col items-start gap-4 py-4">
      <h1 id="sign-out-title" className="t-h3 text-lime">
        {titleCase("Sign out")}
      </h1>
      <p className="t-b text-lime">End your staff session on this device.</p>
      <SignOutButton variant="default" />
    </section>
  );
}
