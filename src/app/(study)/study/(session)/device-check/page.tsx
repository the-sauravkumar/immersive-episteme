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

/** May block: access is verified against the participant session on the server for every navigation (Next 16 `instant`, "Disabling instant"). */
export const instant = false;

/**
 * First page after allocation, identical for both conditions (the component takes no condition
 * input). It shows the High contrast accommodation chosen once on the consent page, before the
 * pre-test (DR-019; read-only here), then checks the browser. Results, with that display choice,
 * go to study_sessions.device.
 */
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
