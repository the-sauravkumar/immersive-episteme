"use client";

import { ErrorState, type ErrorBoundaryProps } from "@/components/shell/error-state";

export default function Error(props: ErrorBoundaryProps) {
  return <ErrorState {...props} homeHref="/" homeLabel="Go to the home page" />;
}
