import type { Metadata } from "next";
import { Suspense } from "react";

import { GateFallback } from "@/components/shell/gate-fallback";
import { AssessmentStep } from "@/components/study/assessment-step";
import { getPool } from "@/server/db/client";
import { delayedTestStatus } from "@/server/study/engine";
import { requireStep } from "@/server/study/session";

export const metadata: Metadata = { title: "Delayed Test" };

export const instant = false;

const dateText = (date: Date) => date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

async function Delayed() {
  const { state } = await requireStep("delayed_test");
  const { schedule, availability } = await delayedTestStatus(getPool(), state);
  if (availability === "open") return <AssessmentStep step="delayed_test" route="/study/delayed-test" />;
  const link = `/study/return?study=${encodeURIComponent(state.study.slug)}&code=${encodeURIComponent(state.participantCode)}`;
  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-[clamp(38px,6vw,64px)] leading-none">Come Back In About A Week</h1>
      <p className="max-w-[65ch] text-[22px] leading-[1.4]">
        You are done for today. One short set of questions is left, online, on or after {dateText(schedule.dueAt)}. It closes on {dateText(schedule.closesAt)}.
      </p>
      <p className="text-[18px]">
        Your code is <strong className="walking-heading tabular-nums">{state.participantCode}</strong>. Keep it. It is the only way back to your answers.
      </p>
      <p className="text-[18px]">
        Return link: <a className="underline" href={link}>{link}</a>
      </p>
    </section>
  );
}

export default function DelayedTestPage() {
  return (
    <Suspense fallback={<GateFallback label="Loading your session…" />}>
      <Delayed />
    </Suspense>
  );
}
