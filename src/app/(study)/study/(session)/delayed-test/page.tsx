import type { Metadata } from "next";
import { Suspense } from "react";

import { GateFallback } from "@/components/shell/gate-fallback";
import { PageHeader } from "@/components/shell/page-header";
import { AssessmentStep } from "@/components/study/assessment-step";
import { ReturnDetails } from "@/components/study/return-details";
import { StepFooter } from "@/components/study/step-footer";
import { serverEnv } from "@/lib/env";
import { titleCase } from "@/lib/text/title-case";
import { getPool } from "@/server/db/client";
import { delayedTestStatus } from "@/server/study/engine";
import { requireStep } from "@/server/study/session";

export const metadata: Metadata = { title: titleCase("Delayed test") };

export const instant = false;

const daysText = (days: number) => (days === 1 ? "1 day" : `${days} days`);

const dateText = (date: Date) => date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

async function Delayed() {
  const { state } = await requireStep("delayed_test");
  const { schedule, availability } = await delayedTestStatus(getPool(), state);
  const after = daysText(state.study.protocol.config.delayedTest.dueAfterDays);
  if (availability === "open") {
    return (
      <>
        <PageHeader title="Delayed test" description={`The last set of questions, ${after} after your first session.`} />
        <AssessmentStep step="delayed_test" route="/study/delayed-test" />
      </>
    );
  }
  return (
    <>
      <PageHeader title={`Come back in ${after}`} description="You are done for today." />
      <ReturnDetails
        origin={serverEnv().BETTER_AUTH_URL}
        studySlug={state.study.slug}
        participantCode={state.participantCode}
        title="When and how to come back"
        lead={`One short set of questions is left, online, on or after ${dateText(schedule.dueAt)}. It closes on ${dateText(schedule.closesAt)}. The return link works on any device or browser.`}
      />
      <StepFooter />
    </>
  );
}

export default function DelayedTestPage() {
  return (
    <Suspense fallback={<GateFallback label="Loading your session…" />}>
      <Delayed />
    </Suspense>
  );
}
