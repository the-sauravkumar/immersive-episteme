import type { Metadata } from "next";
import { Suspense } from "react";

import { GateFallback } from "@/components/shell/gate-fallback";
import { ReturnForm } from "@/components/study/return-form";

export const metadata: Metadata = { title: "Return To The Study" };

export const instant = false;

async function Return({ searchParams }: { searchParams: Promise<{ study?: string; code?: string }> }) {
  const { study, code } = await searchParams;
  return <ReturnForm study={study ?? ""} code={code ?? ""} />;
}

export default function ReturnPage({ searchParams }: { searchParams: Promise<{ study?: string; code?: string }> }) {
  return (
    <Suspense fallback={<GateFallback label="Loading…" />}>
      <Return searchParams={searchParams} />
    </Suspense>
  );
}
