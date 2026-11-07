"use client";

import Link from "next/link";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

import { StatePage } from "./state-page";

export type ErrorBoundaryProps = { error: unknown; retry: () => void };

export function errorReference(error: unknown): string | null {
  if (error instanceof Error && "digest" in error && typeof error.digest === "string" && error.digest) return error.digest;
  return null;
}

export function ErrorState({ error, retry, homeHref, homeLabel }: ErrorBoundaryProps & { homeHref: string; homeLabel: string }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const reference = errorReference(error);
  return (
    <StatePage
      title="Something went wrong"
      actions={
        <>
          <Button type="button" onClick={() => retry()}>
            Try again
          </Button>
          <Button asChild variant="outline">
            <Link href={homeHref}>{homeLabel}</Link>
          </Button>
        </>
      }
    >
      <p className="t-b text-lime">This page could not be shown because of an error on the server. Try again; if it keeps happening, tell the research team.</p>
      {reference ? <p className="t-s text-lime-dim">Reference for the research team: {reference}</p> : null}
    </StatePage>
  );
}
