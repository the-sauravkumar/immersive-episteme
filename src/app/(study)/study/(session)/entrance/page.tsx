import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { GateFallback } from "@/components/shell/gate-fallback";
import { EntranceScene } from "@/components/study/entrance-scene";
import { requireStep } from "@/server/study/session";

export const metadata: Metadata = { title: "Entrance" };

export const instant = false;

async function Entrance() {
  const { state } = await requireStep("entrance");
  if (!state.condition) redirect("/study/session");
  return <EntranceScene door={state.condition === "2d" ? 1 : 2} />;
}

export default function EntrancePage() {
  return (
    <Suspense fallback={<GateFallback label="Loading your session…" />}>
      <Entrance />
    </Suspense>
  );
}
