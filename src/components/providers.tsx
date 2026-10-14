"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState, type ReactNode } from "react";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Server-rendered data is fresh on arrival; avoid an immediate client refetch.
        staleTime: 60_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });
}

/**
 * App-wide client providers.
 * Theme: light by default and NOT following the OS, so both experimental conditions render
 * identically unless a participant explicitly opts into an accessibility setting.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(makeQueryClient);
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={350}>
          {children}
          <Toaster position="bottom-right" />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
