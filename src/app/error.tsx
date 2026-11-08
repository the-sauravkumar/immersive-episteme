"use client";

import { ErrorState, type ErrorBoundaryProps } from "@/components/shell/error-state";

export default function Error(props: ErrorBoundaryProps) {
  return (
    <main id="main" tabIndex={-1} className="mx-auto flex min-h-dvh w-full max-w-[82.5rem] flex-col bg-vat px-4 py-12 outline-none xs:px-6 lg:px-8">
      <ErrorState {...props} homeHref="/" homeLabel="Go to the home page" />
    </main>
  );
}
