import type { Metadata } from "next";
import { Suspense } from "react";

import { GateFallback } from "@/components/shell/gate-fallback";
import { PageHeader } from "@/components/shell/page-header";
import { WithdrawForm } from "@/components/study/withdraw-form";
import { titleCase } from "@/lib/text/title-case";
import { getCurrentSession } from "@/server/study/session";

export const metadata: Metadata = { title: titleCase("Withdraw from the study") };

/** Withdrawal at any point of a session. Data already given is kept per the study's retention policy. */
async function Withdraw() {
  const { state } = await getCurrentSession();
  const days = state.study.protocol.config.retentionDays;
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <p className="text-reading max-w-[34rem] text-ink">You can stop taking part at any time without giving a reason. Your session will end now.</p>
        <p className="text-reading max-w-[34rem] text-ink">
          Answers and records from this session up to now are not deleted automatically: they are kept as described in the information you agreed to
          {days ? ` (retention period: ${days} days)` : ""}. If you want them removed, tell the facilitator your participant code{" "}
          <span className="font-mono text-mono whitespace-nowrap text-ink">{state.participantCode}</span>.
        </p>
      </div>
      <WithdrawForm />
    </div>
  );
}

/** May block: access is verified against the participant session on the server for every navigation (Next 16 `instant`, "Disabling instant"). */
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
