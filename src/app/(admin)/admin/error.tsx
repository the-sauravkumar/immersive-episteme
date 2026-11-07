"use client";

import { ErrorState, type ErrorBoundaryProps } from "@/components/shell/error-state";

export default function Error(props: ErrorBoundaryProps) {
  return <ErrorState {...props} homeHref="/admin" homeLabel="Go to the admin console" />;
}
