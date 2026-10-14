import { Suspense } from "react";

import { ConsoleShell } from "@/components/shell/console-shell";
import { GateFallback } from "@/components/shell/gate-fallback";
import { StaffAreaGate } from "@/components/shell/gates";

/** /research/*: signed-in staff only; each page then enforces its own permission. */
export default function Layout({ children }: LayoutProps<"/research">) {
  return (
    <ConsoleShell area="research">
      <Suspense fallback={<GateFallback />}>
        <StaffAreaGate area="research">{children}</StaffAreaGate>
      </Suspense>
    </ConsoleShell>
  );
}
