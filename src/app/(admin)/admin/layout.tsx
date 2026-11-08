import { Suspense } from "react";

import { ConsoleShell } from "@/components/shell/console-shell";
import { GateFallback } from "@/components/shell/gate-fallback";
import { StaffAreaGate } from "@/components/shell/gates";

export const instant = false;

export default function Layout({ children }: LayoutProps<"/admin">) {
  return (
    <ConsoleShell area="admin">
      <Suspense fallback={<GateFallback />}>
        <StaffAreaGate area="admin">{children}</StaffAreaGate>
      </Suspense>
    </ConsoleShell>
  );
}
