"use client";

import { ErrorState, type ErrorBoundaryProps } from "@/components/shell/error-state";

import "./globals.css";

export default function GlobalError(props: ErrorBoundaryProps) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-ground">
        <title>Something Went Wrong | Immersive Episteme</title>
        <main id="main" tabIndex={-1} className="mx-auto flex w-full max-w-[80rem] flex-col px-4 py-12 outline-none xs:px-6 lg:px-8">
          <ErrorState {...props} homeHref="/" homeLabel="Go to the home page" />
        </main>
      </body>
    </html>
  );
}
