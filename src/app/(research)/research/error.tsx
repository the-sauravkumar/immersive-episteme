"use client";

import { ErrorState, type ErrorBoundaryProps } from "@/components/shell/error-state";

export default function Error(props: ErrorBoundaryProps) {
  return <ErrorState {...props} homeHref="/research" homeLabel="Go to the research console" />;
}
