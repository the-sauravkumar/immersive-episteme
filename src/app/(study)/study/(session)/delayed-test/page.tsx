import type { Metadata } from "next";
import { Suspense } from "react";

import { GateFallback } from "@/components/shell/gate-fallback";
import { PageHeader } from "@/components/shell/page-header";
import { AssessmentStep } from "@/components/study/assessment-step";
import { STUDY_LINK_CLASS, StepFooter } from "@/components/study/step-footer";
import { serverEnv } from "@/lib/env";
import { titleCase } from "@/lib/text/title-case";
import { getPool } from "@/server/db/client";
import { delayedReturnLink, delayedTestStatus } from "@/server/study/engine";
import { requireStep } from "@/server/study/session";

export const metadata: Metadata = { title: titleCase("Delayed test") };

export const instant = false;

const dateText = (date: Date) => date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

async function Delayed() {
  const { state } = await requireStep("delayed_test");
  const { schedule, availability } = await delayedTestStatus(getPool(), state);
  if (availability === "open") {
    return (
      <>
        <PageHeader title="Delayed test" description="The last set of questions, about a week after your first session." />
        <AssessmentStep step="delayed_test" route="/study/delayed-test" />
      </>
    );
  }
  const link = delayedReturnLink(serverEnv().BETTER_AUTH_URL, state.study.slug, state.participantCode);
  return (
    <>
      <PageHeader title="Come back in about a week" description="You are done for today." />
      <section aria-labelledby="return-heading" className="flex flex-col gap-4">
        <h2 id="return-heading" className="t-h4 text-lime">
          {titleCase("When and how to come back")}
        </h2>
        <p className="t-b max-w-[34rem] text-lime">
          One short set of questions is left, online, on or after {dateText(schedule.dueAt)}. It closes on {dateText(schedule.closesAt)}.
        </p>
        <p className="t-b max-w-[34rem] text-lime">
          Your code is <span className="t-table font-semibold wrap-anywhere whitespace-nowrap text-lime">{state.participantCode}</span>. Keep it with the study code{" "}
          <span className="t-table font-semibold wrap-anywhere whitespace-nowrap text-lime">{state.study.slug}</span>. Together they are the only way back to your answers.
        </p>
        <p className="t-b max-w-[34rem] break-all text-lime">
          Return link:{" "}
          <a className={STUDY_LINK_CLASS} href={link}>
            {link}
          </a>
        </p>
        <p className="t-b max-w-[34rem] text-lime">
          On another device or browser, the site first asks for its invite code. The facilitator can give it to you again.
        </p>
      </section>
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
