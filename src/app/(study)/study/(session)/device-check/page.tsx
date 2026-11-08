import type { Metadata } from "next";
import { Suspense } from "react";

import { GateFallback } from "@/components/shell/gate-fallback";
import { PageHeader } from "@/components/shell/page-header";
import { DeviceCheck } from "@/components/study/device-check";
import { StepFooter } from "@/components/study/step-footer";
import { titleCase } from "@/lib/text/title-case";
import { requireStep } from "@/server/study/session";

export const metadata: Metadata = { title: titleCase("Display and browser check") };

async function Check() {
  await requireStep("device_check");
  return (
    <>
      <DeviceCheck />
      <StepFooter />
    </>
  );
}

export const instant = false;

export default function Page() {
  return (
    <>
      <PageHeader title="Display and browser check" description="Check that this browser and window can show the study." />
      <Suspense fallback={<GateFallback label="Loading your session…" />}>
        <Check />
      </Suspense>
    </>
  );
}
