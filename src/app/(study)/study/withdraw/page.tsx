import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { GateFallback } from "@/components/shell/gate-fallback";
import { PageHeader } from "@/components/shell/page-header";
import { WithdrawForm } from "@/components/study/withdraw-form";
import { titleCase } from "@/lib/text/title-case";
import { requireWithdrawalSession } from "@/server/auth/learning-access";
import { getPool } from "@/server/db/client";
import { loadSessionState } from "@/server/study/engine";

export const metadata: Metadata = { title: titleCase("Withdraw from the study") };

async function Withdraw() {
  const participant = await requireWithdrawalSession();
  const state = await loadSessionState(getPool(), participant.sessionId);
  if (!state) redirect("/study/exit?reason=invalid-session");
  const days = state.study.protocol.config.retentionDays;
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <p className="t-b max-w-[34rem] text-lime">You can stop taking part at any time without giving a reason. Your session will end now.</p>
        <p className="t-b max-w-[34rem] text-lime">
          Your answers and records from this session up to now are kept as described in the information you agreed to
          {days ? `, for ${days} days after your participation ends, after which the research team removes them` : ""}. If you want them removed sooner, tell the facilitator your participant code{" "}
          <span className="t-table font-semibold wrap-anywhere whitespace-nowrap text-lime">{state.participantCode}</span>: the research team then deletes your answers, maps and activity
          records.
        </p>
        <p className="t-b max-w-[34rem] text-lime">
          Your participant code, your consent decisions and the group you were assigned to are kept, without your name, as the record that the study was run
          correctly.
        </p>
      </div>
      <WithdrawForm />
    </div>
  );
}

export const instant = false;

export default function Page() {
  return (
    <>
      <PageHeader title="Withdraw from the study" />
      <Suspense fallback={<GateFallback label="Loading your session…" />}>
        <Withdraw />
      </Suspense>
    </>
  );
}
