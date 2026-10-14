import { Suspense } from "react";

import { ConsoleShell } from "@/components/shell/console-shell";
import { GateFallback } from "@/components/shell/gate-fallback";
import { StaffAreaGate } from "@/components/shell/gates";

/** /admin/*: signed-in staff only; each page then enforces its own permission. */
export default function Layout({ children }: LayoutProps<"/admin">) {
  return (
    <ConsoleShell area="admin">
      <Suspense fallback={<GateFallback />}>
        <StaffAreaGate area="admin">{children}</StaffAreaGate>
      </Suspense>
    </ConsoleShell>
  );
}
