import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function TraditionName({
  children,
  traditionKey,
  className,
}: {
  children: ReactNode;
  traditionKey?: string;
  className?: string;
}) {
  return (
    <span data-slot="tradition-name" data-tradition-key={traditionKey} className={cn("inline", className)}>
      {children}
    </span>
  );
}
