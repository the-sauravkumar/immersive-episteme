import { Suspense } from "react";

import { ConsoleShell } from "@/components/shell/console-shell";
import { GateFallback } from "@/components/shell/gate-fallback";
import { StaffAreaGate } from "@/components/shell/gates";

/** /cms/*: signed-in staff only; each page then enforces its own permission. */
export default function Layout({ children }: LayoutProps<"/cms">) {
  return (
    <ConsoleShell area="cms">
      <Suspense fallback={<GateFallback />}>
        <StaffAreaGate area="cms">{children}</StaffAreaGate>
      </Suspense>
    </ConsoleShell>
  );
}
